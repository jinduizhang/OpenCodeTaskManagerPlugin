/**
 * OpenCode Task Manager Plugin - 重试管理
 * 
 * 处理失败任务的重试逻辑
 */

import type { Task } from "./types";
import { EventBus } from "./events";
import { FileStorage } from "./storage";
import { QueueManager } from "./queue";

/**
 * 重试策略
 */
export interface RetryStrategy {
  /** 是否启用重试 */
  enabled: boolean;
  /** 最大重试次数 */
  maxRetries: number;
  /** 重试延迟（毫秒） */
  delay: number;
  /** 是否使用指数退避 */
  exponentialBackoff: boolean;
  /** 最大延迟（毫秒） */
  maxDelay: number;
}

/**
 * 默认重试策略
 */
const DEFAULT_RETRY_STRATEGY: RetryStrategy = {
  enabled: true,
  maxRetries: 3,
  delay: 1000,
  exponentialBackoff: true,
  maxDelay: 30000,
};

/**
 * 重试管理器选项
 */
export interface RetryManagerOptions {
  /** 事件总线 */
  eventBus: EventBus;
  /** 文件存储 */
  storage: FileStorage;
  /** 队列管理器 */
  queueManager: QueueManager;
  /** 重试策略 */
  strategy?: Partial<RetryStrategy>;
}

/**
 * 待重试的任务
 */
interface PendingRetry {
  taskId: string;
  scheduledAt: number;
  attempt: number;
  delay: number;
  timeoutId?: ReturnType<typeof setTimeout>;
}

/**
 * 重试管理器
 * 
 * 负责：
 * - 处理失败任务的重试逻辑
 * - 重试策略管理
 * - 延迟重试调度
 */
export class RetryManager {
  private eventBus: EventBus;
  private storage: FileStorage;
  private queueManager: QueueManager;
  private strategy: RetryStrategy;

  // 待重试队列
  private pendingRetries: Map<string, PendingRetry> = new Map();

  /**
   * 创建重试管理器实例
   */
  constructor(options: RetryManagerOptions) {
    this.eventBus = options.eventBus;
    this.storage = options.storage;
    this.queueManager = options.queueManager;
    this.strategy = { ...DEFAULT_RETRY_STRATEGY, ...options.strategy };

    // 订阅任务失败事件
    this.subscribeToEvents();
  }

  // ==================== 公共方法 ====================

  /**
   * 检查任务是否可以重试
   */
  canRetry(task: Task): boolean {
    if (!this.strategy.enabled) {
      return false;
    }

    if (task.status !== "failed") {
      return false;
    }

    // 检查是否还有重试次数
    return task.currentRetry < task.retryCount;
  }

  /**
   * 手动触发重试
   */
  async retryNow(taskId: string): Promise<boolean> {
    const task = await this.storage.getTask(taskId);
    if (!task || !this.canRetry(task)) {
      return false;
    }

    // 取消待重试（如果有的话）
    this.cancelPendingRetry(taskId);

    // 立即执行重试
    await this.executeRetry(task);

    return true;
  }

  /**
   * 调度延迟重试
   */
  async scheduleRetry(task: Task): Promise<void> {
    if (!this.canRetry(task)) {
      return;
    }

    const attempt = task.currentRetry + 1;
    const delay = this.calculateDelay(attempt);
    const scheduledAt = Date.now() + delay;

    // 取消之前的待重试（如果有的话）
    this.cancelPendingRetry(task.id);

    // 创建待重试记录
    const pendingRetry: PendingRetry = {
      taskId: task.id,
      scheduledAt,
      attempt,
      delay,
    };

    // 设置定时器
    pendingRetry.timeoutId = setTimeout(async () => {
      await this.executeRetry(task);
      this.pendingRetries.delete(task.id);
    }, delay);

    this.pendingRetries.set(task.id, pendingRetry);

    // 记录日志
    await this.storage.appendLog(task.id, "info", `Retry scheduled in ${delay}ms (attempt ${attempt}/${task.retryCount})`);
  }

  /**
   * 取消待重试
   */
  cancelPendingRetry(taskId: string): boolean {
    const pending = this.pendingRetries.get(taskId);
    if (pending) {
      if (pending.timeoutId) {
        clearTimeout(pending.timeoutId);
      }
      this.pendingRetries.delete(taskId);
      return true;
    }
    return false;
  }

  /**
   * 获取待重试数量
   */
  getPendingRetryCount(): number {
    return this.pendingRetries.size;
  }

  /**
   * 获取待重试列表
   */
  getPendingRetries(): PendingRetry[] {
    return Array.from(this.pendingRetries.values());
  }

  /**
   * 更新重试策略
   */
  updateStrategy(strategy: Partial<RetryStrategy>): void {
    this.strategy = { ...this.strategy, ...strategy };
  }

  /**
   * 获取当前重试策略
   */
  getStrategy(): RetryStrategy {
    return { ...this.strategy };
  }

  // ==================== 私有方法 ====================

  /**
   * 订阅事件
   */
  private subscribeToEvents(): void {
    // 监听任务失败事件
    this.eventBus.on("task.failed", async (event) => {
      const payload = event.payload as { taskId: string; error: string };
      const task = await this.storage.getTask(payload.taskId);
      if (task && this.canRetry(task)) {
        await this.scheduleRetry(task);
      }
    });
  }

  /**
   * 执行重试
   */
  private async executeRetry(task: Task): Promise<void> {
    const attempt = task.currentRetry + 1;

    // 重置任务状态
    await this.storage.updateTask(task.id, {
      status: "pending",
      currentRetry: attempt,
      error: undefined,
      startedAt: undefined,
      completedAt: undefined,
    });

    // 发送重试事件
    await this.eventBus.emit({
      type: "task.retrying",
      payload: { taskId: task.id, attempt },
    });

    // 记录日志
    await this.storage.appendLog(task.id, "info", `Retry attempt ${attempt}/${task.retryCount} started`);

    // 通知队列管理器处理下一个任务
    // 注意：这里不需要直接执行，队列管理器会自动处理 pending 任务
  }

  /**
   * 计算重试延迟
   */
  private calculateDelay(attempt: number): number {
    if (!this.strategy.exponentialBackoff) {
      return this.strategy.delay;
    }

    // 指数退避：delay * 2^(attempt-1)
    const exponentialDelay = this.strategy.delay * Math.pow(2, attempt - 1);
    
    // 限制最大延迟
    return Math.min(exponentialDelay, this.strategy.maxDelay);
  }

  /**
   * 清理所有待重试
   */
  clearAll(): void {
    for (const pending of this.pendingRetries.values()) {
      if (pending.timeoutId) {
        clearTimeout(pending.timeoutId);
      }
    }
    this.pendingRetries.clear();
  }
}

/**
 * 创建重试管理器实例
 */
export function createRetryManager(options: RetryManagerOptions): RetryManager {
  return new RetryManager(options);
}