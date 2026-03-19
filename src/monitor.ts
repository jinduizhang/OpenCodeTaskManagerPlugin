/**
 * OpenCode Task Manager Plugin - 状态监控
 * 
 * 监听任务状态变化，处理 OpenCode 事件
 */

import type { Task, OpenCodeClient, Session } from "./types";
import { EventBus } from "./events";
import { FileStorage } from "./storage";
import { TaskExecutor } from "./executor";
import { QueueManager } from "./queue";

/**
 * 状态监控选项
 */
export interface TaskMonitorOptions {
  /** OpenCode SDK 客户端 */
  client: OpenCodeClient;
  /** 事件总线 */
  eventBus: EventBus;
  /** 文件存储 */
  storage: FileStorage;
  /** 任务执行器 */
  executor: TaskExecutor;
  /** 队列管理器 */
  queueManager: QueueManager;
}

/**
 * 状态监控
 * 
 * 负责：
 * - 监听 OpenCode 事件（session.idle, session.error 等）
 * - 更新任务状态
 * - 触发相应的回调
 */
export class TaskMonitor {
  private client: OpenCodeClient;
  private eventBus: EventBus;
  private storage: FileStorage;
  private executor: TaskExecutor;
  private queueManager: QueueManager;
  
  // 状态变化监听器
  private statusListeners: Set<(task: Task) => void> = new Set();

  /**
   * 创建状态监控实例
   */
  constructor(options: TaskMonitorOptions) {
    this.client = options.client;
    this.eventBus = options.eventBus;
    this.storage = options.storage;
    this.executor = options.executor;
    this.queueManager = options.queueManager;

    // 订阅事件总线事件
    this.subscribeToEvents();
  }

  // ==================== OpenCode 事件处理 ====================

  /**
   * 处理 Session 空闲事件（任务完成）
   */
  async onSessionIdle(sessionId: string): Promise<void> {
    try {
      // 获取 session 详情
      const session = await this.client.session.get(sessionId);
      
      // 交给执行器处理
      await this.executor.handleSessionComplete(sessionId, session);

      // 记录系统日志
      await this.storage.appendSystemLog("info", `Session idle: ${sessionId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.storage.appendSystemLog("error", `Error handling session.idle: ${errorMessage}`);
    }
  }

  /**
   * 处理 Session 错误事件
   */
  async onSessionError(sessionId: string, error: string): Promise<void> {
    try {
      // 交给执行器处理
      await this.executor.handleSessionError(sessionId, error);

      // 记录系统日志
      await this.storage.appendSystemLog("error", `Session error: ${sessionId} - ${error}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.storage.appendSystemLog("error", `Error handling session.error: ${errorMessage}`);
    }
  }

  /**
   * 处理 Session 创建事件
   */
  async onSessionCreated(sessionId: string, session?: Session): Promise<void> {
    // 检查是否是我们的任务 session
    if (session?.data?.taskManager) {
      await this.storage.appendSystemLog("info", `Task session created: ${sessionId}`);
    }
  }

  /**
   * 处理 Session 状态变化事件
   */
  async onSessionStatus(sessionId: string, status: string, previousStatus?: string): Promise<void> {
    // 获取 session 详情
    try {
      const session = await this.client.session.get(sessionId);
      
      // 如果是我们的任务 session
      if (session?.data?.taskManager) {
        const taskId = session.data.taskId as string;
        const task = await this.storage.getTask(taskId);
        
        if (task) {
          // 通知状态变化
          this.notifyStatusChange(task);
        }
      }
    } catch {
      // 忽略获取失败
    }
  }

  // ==================== 事件总线订阅 ====================

  /**
   * 订阅事件总线事件
   */
  private subscribeToEvents(): void {
    // 任务创建事件
    this.eventBus.on("task.created", async (event) => {
      const payload = event.payload as Task;
      await this.storage.appendSystemLog("info", `Task created: ${payload.title}`);
    });

    // 任务开始事件
    this.eventBus.on("task.started", async (event) => {
      const task = event.payload as Task;
      this.notifyStatusChange(task);
    });

    // 任务完成事件
    this.eventBus.on("task.completed", async (event) => {
      const payload = event.payload as { taskId: string; result: { success: boolean } };
      const task = await this.storage.getTask(payload.taskId);
      if (task) {
        this.notifyStatusChange(task);
      }
    });

    // 任务失败事件
    this.eventBus.on("task.failed", async (event) => {
      const payload = event.payload as { taskId: string; error: string };
      const task = await this.storage.getTask(payload.taskId);
      if (task) {
        this.notifyStatusChange(task);
      }
    });

    // 任务重试事件
    this.eventBus.on("task.retrying", async (event) => {
      const payload = event.payload as { taskId: string; attempt: number };
      const task = await this.storage.getTask(payload.taskId);
      if (task) {
        this.notifyStatusChange(task);
      }
    });

    // 任务取消事件
    this.eventBus.on("task.cancelled", async (event) => {
      const payload = event.payload as { taskId: string };
      const task = await this.storage.getTask(payload.taskId);
      if (task) {
        this.notifyStatusChange(task);
      }
    });

    // 队列启动事件
    this.eventBus.on("queue.started", async () => {
      await this.storage.appendSystemLog("info", "Queue started");
    });

    // 队列空闲事件
    this.eventBus.on("queue.idle", async () => {
      await this.storage.appendSystemLog("info", "Queue idle - all tasks completed");
    });
  }

  // ==================== 状态变化通知 ====================

  /**
   * 添加状态变化监听器
   */
  addStatusListener(listener: (task: Task) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  /**
   * 移除状态变化监听器
   */
  removeStatusListener(listener: (task: Task) => void): void {
    this.statusListeners.delete(listener);
  }

  /**
   * 通知状态变化
   */
  private notifyStatusChange(task: Task): void {
    for (const listener of this.statusListeners) {
      try {
        listener(task);
      } catch (error) {
        console.error("Status listener error:", error);
      }
    }
  }

  // ==================== 任务状态查询 ====================

  /**
   * 获取任务状态
   */
  async getTaskStatus(taskId: string): Promise<Task | undefined> {
    return this.storage.getTask(taskId);
  }

  /**
   * 获取所有任务状态
   */
  async getAllTaskStatuses(): Promise<Task[]> {
    return this.storage.loadTasks();
  }

  /**
   * 检查是否有运行中的任务
   */
  hasRunningTasks(): boolean {
    return this.queueManager.getCurrentTask() !== null;
  }

  /**
   * 获取当前运行的任务
   */
  getCurrentTask(): Task | null {
    return this.queueManager.getCurrentTask();
  }
}