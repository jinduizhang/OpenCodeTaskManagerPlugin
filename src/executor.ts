/**
 * OpenCode Task Manager Plugin - 任务执行器
 * 
 * 负责执行任务，创建隔离的 session 并调用 agent
 */

import type {
  Task,
  TaskResult,
  OpenCodeClient,
  Session,
  SessionCreateOptions,
  PromptPart,
  PluginContext,
} from "./types";
import { EventBus } from "./events";
import { FileStorage } from "./storage";
import { QueueManager } from "./queue";

/**
 * 任务执行器选项
 */
export interface TaskExecutorOptions {
  /** OpenCode SDK 客户端 */
  client: OpenCodeClient;
  /** 事件总线 */
  eventBus: EventBus;
  /** 文件存储 */
  storage: FileStorage;
  /** 队列管理器 */
  queueManager: QueueManager;
  /** 父 Session ID */
  parentSessionId?: string;
}

/**
 * 任务执行器
 * 
 * 负责：
 * - 创建隔离的 child session
 * - 调用指定的 agent/skill
 * - 发送 prompt
 * - 处理执行结果
 */
export class TaskExecutor {
  private client: OpenCodeClient;
  private eventBus: EventBus;
  private storage: FileStorage;
  private queueManager: QueueManager;
  private parentSessionId?: string;
  
  // 活跃的 session 映射
  private activeSessions: Map<string, string> = new Map(); // taskId -> sessionId

  /**
   * 创建任务执行器实例
   */
  constructor(options: TaskExecutorOptions) {
    this.client = options.client;
    this.eventBus = options.eventBus;
    this.storage = options.storage;
    this.queueManager = options.queueManager;
    this.parentSessionId = options.parentSessionId;
  }

  /**
   * 设置父 Session ID
   */
  setParentSessionId(sessionId: string | undefined): void {
    this.parentSessionId = sessionId;
  }

  /**
   * 执行任务
   */
  async execute(task: Task): Promise<void> {
    try {
      await this.storage.appendLog(task.id, "info", `Starting execution for task: ${task.title}`);

      // 1. 创建隔离的 child session
      const session = await this.createIsolatedSession(task);
      
      // 保存 session 关联
      this.activeSessions.set(task.id, session.id);
      
      // 更新任务的 sessionId
      await this.storage.updateTask(task.id, {
        sessionId: session.id,
      });

      await this.storage.appendLog(task.id, "info", `Created session: ${session.id}`);

      // 2. 构建 prompt
      const prompt = this.buildPrompt(task);

      // 3. 发送 prompt 到 session
      await this.sendPrompt(session.id, prompt);

      await this.storage.appendLog(task.id, "info", `Prompt sent to session`);

      // 注意：执行结果通过 session.idle / session.error hook 回调处理
      // 详见 Monitor 类
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.storage.appendLog(task.id, "error", `Execution error: ${errorMessage}`);
      
      // 通知队列管理器任务失败
      await this.queueManager.onTaskComplete(task.id, {
        success: false,
        output: errorMessage,
      });

      // 清理 session 映射
      this.activeSessions.delete(task.id);
    }
  }

  /**
   * 创建隔离的 child session
   */
  private async createIsolatedSession(task: Task): Promise<Session> {
    const options: SessionCreateOptions = {
      parentID: this.parentSessionId,
      title: `[TaskManager] ${task.title}`,
      data: {
        taskId: task.id,
        taskManager: true,
        agent: task.agent,
        skill: task.skill,
        source: "task-manager-plugin",
      },
    };

    const session = await this.client.session.create(options);
    return session;
  }

  /**
   * 构建 prompt
   */
  private buildPrompt(task: Task): string {
    const parts: string[] = [];

    // 如果指定了 skill，添加 skill 加载指令
    if (task.skill) {
      parts.push(`[首先加载 skill: ${task.skill}]`);
      parts.push("");
    }

    // 如果指定了 agent，添加 agent 指令
    if (task.agent) {
      parts.push(`[使用 ${task.agent} agent 执行以下任务]`);
      parts.push("");
    }

    // 添加主要 prompt
    parts.push(task.prompt);

    // 如果有额外参数，添加参数信息
    if (task.parameters && Object.keys(task.parameters).length > 0) {
      parts.push("");
      parts.push("[参数]");
      for (const [key, value] of Object.entries(task.parameters)) {
        parts.push(`- ${key}: ${JSON.stringify(value)}`);
      }
    }

    return parts.join("\n");
  }

  /**
   * 发送 prompt 到 session
   */
  private async sendPrompt(sessionId: string, prompt: string): Promise<void> {
    const parts: PromptPart[] = [
      { type: "text", text: prompt },
    ];

    await this.client.session.prompt(sessionId, parts);
  }

  /**
   * 处理 session 完成事件
   */
  async handleSessionComplete(sessionId: string, session: Session): Promise<void> {
    // 查找对应的任务
    const task = await this.storage.findTaskBySessionId(sessionId);
    
    if (!task) {
      // 不是我们的任务 session，忽略
      return;
    }

    await this.storage.appendLog(task.id, "info", `Session completed: ${sessionId}`);

    // 获取执行结果
    const result = await this.extractResult(session);

    // 通知队列管理器
    await this.queueManager.onTaskComplete(task.id, result);

    // 清理 session 映射
    this.activeSessions.delete(task.id);
  }

  /**
   * 处理 session 错误事件
   */
  async handleSessionError(sessionId: string, error: string): Promise<void> {
    // 查找对应的任务
    const task = await this.storage.findTaskBySessionId(sessionId);
    
    if (!task) {
      return;
    }

    await this.storage.appendLog(task.id, "error", `Session error: ${error}`);

    // 通知队列管理器
    await this.queueManager.onTaskComplete(task.id, {
      success: false,
      output: error,
    });

    // 清理 session 映射
    this.activeSessions.delete(task.id);
  }

  /**
   * 从 session 提取执行结果
   */
  private async extractResult(session: Session): Promise<TaskResult> {
    return {
      success: true,
      summary: session.summary || "执行完成",
    };
  }

  /**
   * 取消任务执行
   */
  async cancelExecution(taskId: string): Promise<boolean> {
    const sessionId = this.activeSessions.get(taskId);
    
    if (!sessionId) {
      return false;
    }

    try {
      // 删除 session
      await this.client.session.delete(sessionId);
      
      // 清理映射
      this.activeSessions.delete(taskId);
      
      await this.storage.appendLog(taskId, "info", `Session cancelled: ${sessionId}`);
      
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取活跃的 session 数量
   */
  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  /**
   * 获取任务对应的 session ID
   */
  getSessionId(taskId: string): string | undefined {
    return this.activeSessions.get(taskId);
  }
}