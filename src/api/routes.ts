/**
 * OpenCode Task Manager Plugin - 查询 API
 * 
 * 提供状态查询接口
 */

import type {
  Task,
  QueueState,
  QueueStatistics,
  TaskStatus,
  CreateTaskInput,
} from "../types";
import { FileStorage } from "../storage";
import { QueueManager } from "../queue";

/**
 * API 响应包装
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 任务列表响应
 */
export interface TaskListResponse {
  tasks: Task[];
  statistics: QueueStatistics;
}

/**
 * 任务详情响应
 */
export interface TaskDetailResponse {
  task: Task;
  log?: string;
}

/**
 * 查询 API 选项
 */
export interface QueryApiOptions {
  storage: FileStorage;
  queueManager: QueueManager;
}

/**
 * 查询 API
 * 
 * 提供任务和队列状态的查询接口
 */
export class QueryApi {
  private storage: FileStorage;
  private queueManager: QueueManager;

  constructor(options: QueryApiOptions) {
    this.storage = options.storage;
    this.queueManager = options.queueManager;
  }

  // ==================== 任务 API ====================

  /**
   * 获取所有任务列表
   * GET /api/task-manager/tasks
   */
  async getTasks(status?: TaskStatus | "all"): Promise<ApiResponse<TaskListResponse>> {
    try {
      let tasks = this.queueManager.getTasks();

      // 按状态过滤
      if (status && status !== "all") {
        tasks = tasks.filter((t) => t.status === status);
      }

      const state = this.queueManager.getQueueState();

      return {
        success: true,
        data: {
          tasks,
          statistics: state.statistics,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 获取单个任务详情
   * GET /api/task-manager/tasks/:id
   */
  async getTask(taskId: string): Promise<ApiResponse<TaskDetailResponse>> {
    try {
      const task = this.queueManager.getTask(taskId);

      if (!task) {
        return {
          success: false,
          error: `Task ${taskId} not found`,
        };
      }

      // 获取任务日志
      const log = await this.storage.readTaskLog(taskId);

      return {
        success: true,
        data: {
          task,
          log: log || undefined,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 创建新任务
   * POST /api/task-manager/tasks
   */
  async createTask(input: CreateTaskInput): Promise<ApiResponse<{ task: Task }>> {
    try {
      const task = await this.queueManager.addTask(input);

      return {
        success: true,
        data: { task },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 取消任务
   * POST /api/task-manager/tasks/:id/cancel
   */
  async cancelTask(taskId: string): Promise<ApiResponse<{}>> {
    try {
      const success = await this.queueManager.cancelTask(taskId);

      if (!success) {
        return {
          success: false,
          error: "Cannot cancel task. Task not found or not in pending status.",
        };
      }

      return { success: true, data: {} };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 重试任务
   * POST /api/task-manager/tasks/:id/retry
   */
  async retryTask(taskId: string): Promise<ApiResponse<{}>> {
    try {
      const success = await this.queueManager.retryTask(taskId);

      if (!success) {
        return {
          success: false,
          error: "Cannot retry task. Task not found or not in failed status.",
        };
      }

      return { success: true, data: {} };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 删除任务
   * DELETE /api/task-manager/tasks/:id
   */
  async deleteTask(taskId: string): Promise<ApiResponse<{}>> {
    try {
      const success = await this.queueManager.deleteTask(taskId);

      if (!success) {
        return {
          success: false,
          error: "Cannot delete task. Task not found or currently running.",
        };
      }

      return { success: true, data: {} };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 获取任务日志
   * GET /api/task-manager/tasks/:id/logs
   */
  async getTaskLogs(taskId: string): Promise<ApiResponse<{ log: string }>> {
    try {
      const task = this.queueManager.getTask(taskId);

      if (!task) {
        return {
          success: false,
          error: `Task ${taskId} not found`,
        };
      }

      const log = await this.storage.readTaskLog(taskId);

      return {
        success: true,
        data: { log: log || "" },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ==================== 队列 API ====================

  /**
   * 获取队列状态
   * GET /api/task-manager/queue
   */
  async getQueueState(): Promise<ApiResponse<QueueState>> {
    try {
      const state = this.queueManager.getQueueState();

      return {
        success: true,
        data: state,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 启动队列
   * POST /api/task-manager/queue/start
   */
  async startQueue(): Promise<ApiResponse<{}>> {
    try {
      this.queueManager.start();

      return { success: true, data: {} };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 停止队列
   * POST /api/task-manager/queue/stop
   */
  async stopQueue(): Promise<ApiResponse<{}>> {
    try {
      this.queueManager.stop();

      return { success: true, data: {} };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ==================== 统计 API ====================

  /**
   * 获取统计数据
   * GET /api/task-manager/statistics
   */
  async getStatistics(): Promise<ApiResponse<QueueStatistics>> {
    try {
      const state = this.queueManager.getQueueState();

      return {
        success: true,
        data: state.statistics,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * 创建查询 API 实例
 */
export function createQueryApi(options: QueryApiOptions): QueryApi {
  return new QueryApi(options);
}