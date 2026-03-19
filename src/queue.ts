/**
 * OpenCode Task Manager Plugin - 任务队列管理
 * 
 * 管理任务队列，支持优先级排序和串行执行
 */

import { v4 as uuidv4 } from "uuid";
import type {
  Task,
  CreateTaskInput,
  QueueState,
  QueueStatistics,
  TaskPriority,
  TaskStatus,
  TaskManagerConfig,
} from "./types";
import { EventBus } from "./events";
import { FileStorage } from "./storage";

/**
 * 队列管理器选项
 */
export interface QueueManagerOptions {
  /** 文件存储 */
  storage: FileStorage;
  /** 事件总线 */
  eventBus: EventBus;
  /** 配置 */
  config?: TaskManagerConfig;
  /** 任务执行回调 */
  onExecute?: (task: Task) => Promise<void>;
}

/**
 * 队列管理器
 * 
 * 负责管理任务队列，支持：
 * - 任务入队/出队
 * - 优先级排序
 * - 状态管理
 * - 队列持久化
 */
export class QueueManager {
  private storage: FileStorage;
  private eventBus: EventBus;
  private config?: TaskManagerConfig;
  private onExecute?: (task: Task) => Promise<void>;
  
  private tasks: Task[] = [];
  private currentTask: Task | null = null;
  private isRunning = false;
  private isProcessing = false;

  /**
   * 创建队列管理器实例
   */
  constructor(options: QueueManagerOptions) {
    this.storage = options.storage;
    this.eventBus = options.eventBus;
    this.config = options.config;
    this.onExecute = options.onExecute;
  }

  // ==================== 初始化 ====================

  /**
   * 初始化队列（从存储恢复）
   */
  async initialize(): Promise<void> {
    await this.storage.initialize();
    await this.restore();
  }

  /**
   * 从存储恢复队列状态
   */
  async restore(): Promise<void> {
    const state = await this.storage.loadQueueState();
    this.tasks = state.tasks;
    this.currentTask = state.currentTask || null;
    this.isRunning = state.isRunning;

    // 检查是否有 running 状态的任务（可能是上次中断）
    if (this.currentTask && this.currentTask.status === "running") {
      // 将中断的任务标记为失败
      await this.updateTaskStatus(this.currentTask.id, "failed");
      this.currentTask = null;
    }

    // 如果有配置中的 autoStart，自动开始
    if (this.config?.settings?.autoStart && this.getPendingCount() > 0) {
      this.start();
    }
  }

  // ==================== 队列控制 ====================

  /**
   * 启动队列处理
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.eventBus.emitSync({ type: "queue.started", payload: {} });
    this.processNext();
  }

  /**
   * 停止队列处理
   */
  stop(): void {
    this.isRunning = false;
  }

  /**
   * 处理下一个任务
   */
  async processNext(): Promise<void> {
    // 检查是否可以处理
    if (!this.isRunning || this.isProcessing || this.currentTask) {
      return;
    }

    // 获取下一个待执行任务
    const task = this.dequeue();
    if (!task) {
      // 队列为空
      this.eventBus.emitSync({ type: "queue.idle", payload: {} });
      return;
    }

    this.isProcessing = true;
    this.currentTask = task;

    try {
      // 更新状态为 running
      await this.updateTaskStatus(task.id, "running", {
        startedAt: Date.now(),
      });

      // 发送任务开始事件
      await this.eventBus.emit({ type: "task.started", payload: task });

      // 记录日志
      await this.storage.appendLog(task.id, "info", `Task started: ${task.title}`);

      // 执行任务
      if (this.onExecute) {
        await this.onExecute(task);
      }
    } catch (error) {
      // 执行出错
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.storage.appendLog(task.id, "error", `Task execution error: ${errorMessage}`);
      await this.handleTaskFailure(task, errorMessage);
    } finally {
      // 清理状态并处理下一个任务
      this.isProcessing = false;
      if (this.isRunning) {
        this.processNext();
      }
    }
  }

  /**
   * 任务执行完成回调
   */
  async onTaskComplete(taskId: string, result: { success: boolean; output?: string; summary?: string }): Promise<void> {
    const task = await this.storage.getTask(taskId);
    if (!task) {
      return;
    }

    if (result.success) {
      // 任务成功
      await this.updateTaskStatus(taskId, "success", {
        completedAt: Date.now(),
        result: {
          success: true,
          output: result.output,
          summary: result.summary,
        },
      });

      await this.storage.appendLog(taskId, "info", `Task completed successfully`);
      await this.eventBus.emit({
        type: "task.completed",
        payload: { taskId, result: { success: true, output: result.output, summary: result.summary } },
      });
    } else {
      // 任务失败
      await this.handleTaskFailure(task, result.output || "Unknown error");
    }

    // 清理当前任务，处理下一个
    this.currentTask = null;
    this.isProcessing = false;

    if (this.isRunning) {
      this.processNext();
    }
  }

  /**
   * 处理任务失败
   */
  private async handleTaskFailure(task: Task, error: string): Promise<void> {
    await this.storage.appendLog(task.id, "error", `Task failed: ${error}`);

    // 检查是否可以重试
    if (task.currentRetry < task.retryCount) {
      // 重试
      const newRetry = task.currentRetry + 1;
      await this.updateTaskStatus(task.id, "pending", {
        currentRetry: newRetry,
        error,
      });

      await this.eventBus.emit({
        type: "task.retrying",
        payload: { taskId: task.id, attempt: newRetry },
      });

      await this.storage.appendLog(task.id, "info", `Retrying task (${newRetry}/${task.retryCount})`);
    } else {
      // 最终失败
      await this.updateTaskStatus(task.id, "failed", {
        completedAt: Date.now(),
        error,
      });

      await this.eventBus.emit({
        type: "task.failed",
        payload: { taskId: task.id, error },
      });
    }
  }

  // ==================== 任务操作 ====================

  /**
   * 添加任务到队列
   */
  async addTask(input: CreateTaskInput): Promise<Task> {
    const now = Date.now();
    
    const task: Task = {
      id: uuidv4(),
      title: input.title,
      description: input.description,
      agent: input.agent,
      skill: input.skill,
      prompt: input.prompt,
      parameters: input.parameters,
      priority: input.priority || "medium",
      retryCount: input.retryCount || 0,
      currentRetry: 0,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      source: input.source || "manual",
    };

    // 添加到任务列表
    this.tasks.push(task);
    
    // 按优先级排序
    this.sortTasks();

    // 持久化
    await this.storage.addTask(task);
    await this.saveQueueState();

    // 发送事件
    await this.eventBus.emit({ type: "task.created", payload: task });

    // 记录日志
    await this.storage.appendLog(task.id, "info", `Task created: ${task.title}`);

    // 如果队列正在运行，尝试处理
    if (this.isRunning && !this.isProcessing && !this.currentTask) {
      this.processNext();
    }

    return task;
  }

  /**
   * 从队列取出下一个任务
   */
  dequeue(): Task | null {
    // 找到最高优先级的 pending 任务
    const task = this.tasks.find((t) => t.status === "pending");
    return task || null;
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId: string): Promise<boolean> {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) {
      return false;
    }

    // 只能取消 pending 状态的任务
    if (task.status !== "pending") {
      return false;
    }

    await this.updateTaskStatus(taskId, "cancelled");
    await this.eventBus.emit({ type: "task.cancelled", payload: { taskId } });

    return true;
  }

  /**
   * 重试失败的任务
   */
  async retryTask(taskId: string): Promise<boolean> {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task || task.status !== "failed") {
      return false;
    }

    // 重置重试计数
    await this.updateTaskStatus(taskId, "pending", {
      currentRetry: 0,
      error: undefined,
    });

    // 如果队列正在运行，尝试处理
    if (this.isRunning && !this.isProcessing && !this.currentTask) {
      this.processNext();
    }

    return true;
  }

  /**
   * 删除任务记录
   */
  async deleteTask(taskId: string): Promise<boolean> {
    const index = this.tasks.findIndex((t) => t.id === taskId);
    if (index === -1) {
      return false;
    }

    const task = this.tasks[index];

    // 不能删除正在运行的任务
    if (task.status === "running") {
      return false;
    }

    this.tasks.splice(index, 1);
    await this.storage.deleteTask(taskId);
    await this.saveQueueState();

    return true;
  }

  // ==================== 查询操作 ====================

  /**
   * 获取所有任务
   */
  getTasks(): Task[] {
    return [...this.tasks];
  }

  /**
   * 获取任务
   */
  getTask(id: string): Task | undefined {
    return this.tasks.find((t) => t.id === id);
  }

  /**
   * 获取队列状态
   */
  getQueueState(): QueueState {
    return {
      tasks: this.tasks,
      currentTask: this.currentTask || undefined,
      isRunning: this.isRunning,
      statistics: this.calculateStatistics(),
    };
  }

  /**
   * 获取待执行任务数量
   */
  getPendingCount(): number {
    return this.tasks.filter((t) => t.status === "pending").length;
  }

  /**
   * 获取当前任务
   */
  getCurrentTask(): Task | null {
    return this.currentTask;
  }

  /**
   * 是否正在运行
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  // ==================== 私有方法 ====================

  /**
   * 更新任务状态
   */
  private async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    updates?: Partial<Task>
  ): Promise<void> {
    const index = this.tasks.findIndex((t) => t.id === taskId);
    if (index === -1) {
      return;
    }

    this.tasks[index] = {
      ...this.tasks[index],
      ...updates,
      status,
      updatedAt: Date.now(),
    };

    await this.storage.updateTask(taskId, {
      status,
      ...updates,
      updatedAt: Date.now(),
    });

    await this.saveQueueState();
  }

  /**
   * 按优先级排序任务
   */
  private sortTasks(): void {
    const priorityOrder: Record<TaskPriority, number> = {
      high: 0,
      medium: 1,
      low: 2,
    };

    this.tasks.sort((a, b) => {
      // 先按状态排序：pending 优先
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (a.status !== "pending" && b.status === "pending") return 1;

      // 同状态按优先级排序
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;

      // 同优先级按创建时间排序（FIFO）
      return a.createdAt - b.createdAt;
    });
  }

  /**
   * 计算统计数据
   */
  private calculateStatistics(): QueueStatistics {
    return {
      total: this.tasks.length,
      pending: this.tasks.filter((t) => t.status === "pending").length,
      running: this.tasks.filter((t) => t.status === "running").length,
      success: this.tasks.filter((t) => t.status === "success").length,
      failed: this.tasks.filter((t) => t.status === "failed").length,
      cancelled: this.tasks.filter((t) => t.status === "cancelled").length,
    };
  }

  /**
   * 保存队列状态
   */
  private async saveQueueState(): Promise<void> {
    await this.storage.saveQueueState(this.getQueueState());
  }
}