/**
 * OpenCode Task Manager Plugin - 文件存储实现
 * 
 * 使用 JSON 文件进行数据持久化
 * 兼容 Node.js 和 Bun 运行时
 */

import { join, dirname } from "path";
import * as fs from "fs";
import type {
  Storage,
  Task,
  QueueState,
  QueueStatistics,
  TasksFile,
  QueueFile,
} from "../types";
import { FileLock } from "./lock";

/**
 * 文件存储配置
 */
export interface FileStorageOptions {
  /** 工作目录 */
  directory: string;
  /** 存储目录名 */
  storageDirName?: string;
}

/**
 * 文件存储实现
 * 
 * 使用 JSON 文件存储任务数据和队列状态
 */
export class FileStorage implements Storage {
  private storageDir: string;
  private tasksFile: string;
  private queueFile: string;
  private logsDir: string;
  private archiveDir: string;
  private lock: FileLock;

  /**
   * 创建文件存储实例
   */
  constructor(options: FileStorageOptions) {
    const { directory, storageDirName = ".opencode/task-manager" } = options;
    
    this.storageDir = join(directory, storageDirName);
    this.tasksFile = join(this.storageDir, "tasks.json");
    this.queueFile = join(this.storageDir, "queue.json");
    this.logsDir = join(this.storageDir, "logs");
    this.archiveDir = join(this.storageDir, "archive");
    
    this.lock = new FileLock(this.storageDir);
  }

  /**
   * 初始化存储目录
   */
  async initialize(): Promise<void> {
    // 创建必要的目录
    this.ensureDirSync(this.storageDir);
    this.ensureDirSync(this.logsDir);
    this.ensureDirSync(this.archiveDir);

    // 初始化文件（如果不存在）
    if (!this.fileExistsSync(this.tasksFile)) {
      await this.saveTasks([]);
    }

    if (!this.fileExistsSync(this.queueFile)) {
      await this.saveQueueState(this.createEmptyQueueState());
    }
  }

  // ==================== 任务存储 ====================

  /**
   * 加载所有任务
   */
  async loadTasks(): Promise<Task[]> {
    try {
      if (!fs.existsSync(this.tasksFile)) {
        return [];
      }
      const content = fs.readFileSync(this.tasksFile, "utf-8");
      const data: TasksFile = JSON.parse(content);
      return data.tasks || [];
    } catch {
      // 文件不存在或解析失败，返回空数组
      return [];
    }
  }

  /**
   * 保存所有任务
   */
  async saveTasks(tasks: Task[]): Promise<void> {
    await this.lock.acquire();
    try {
      const data: TasksFile = {
        version: "1.0.0",
        updatedAt: Date.now(),
        tasks,
      };
      fs.writeFileSync(this.tasksFile, JSON.stringify(data, null, 2));
    } finally {
      await this.lock.release();
    }
  }

  /**
   * 获取单个任务
   */
  async getTask(id: string): Promise<Task | undefined> {
    const tasks = await this.loadTasks();
    return tasks.find((t) => t.id === id);
  }

  /**
   * 更新任务
   */
  async updateTask(id: string, updates: Partial<Task>): Promise<void> {
    await this.lock.acquire();
    try {
      const tasks = await this.loadTasks();
      const index = tasks.findIndex((t) => t.id === id);

      if (index !== -1) {
        tasks[index] = {
          ...tasks[index],
          ...updates,
          updatedAt: Date.now(),
        };
        await this.saveTasks(tasks);
      }
    } finally {
      await this.lock.release();
    }
  }

  /**
   * 添加任务
   */
  async addTask(task: Task): Promise<void> {
    await this.lock.acquire();
    try {
      const tasks = await this.loadTasks();
      tasks.push(task);
      await this.saveTasks(tasks);
    } finally {
      await this.lock.release();
    }
  }

  /**
   * 删除任务
   */
  async deleteTask(id: string): Promise<void> {
    await this.lock.acquire();
    try {
      const tasks = await this.loadTasks();
      const filtered = tasks.filter((t) => t.id !== id);
      await this.saveTasks(filtered);
    } finally {
      await this.lock.release();
    }
  }

  /**
   * 根据 Session ID 查找任务
   */
  async findTaskBySessionId(sessionId: string): Promise<Task | undefined> {
    const tasks = await this.loadTasks();
    return tasks.find((t) => t.sessionId === sessionId);
  }

  // ==================== 队列状态 ====================

  /**
   * 加载队列状态
   */
  async loadQueueState(): Promise<QueueState> {
    try {
      if (!fs.existsSync(this.queueFile)) {
        return this.createEmptyQueueState();
      }
      const content = fs.readFileSync(this.queueFile, "utf-8");
      const data: QueueFile = JSON.parse(content);

      // 重建完整的队列状态
      const tasks = await this.loadTasks();
      const currentTask = data.currentTaskId
        ? tasks.find((t) => t.id === data.currentTaskId)
        : undefined;

      return {
        tasks,
        currentTask,
        isRunning: data.isRunning,
        statistics: this.calculateStatistics(tasks),
      };
    } catch {
      // 文件不存在或解析失败，返回空状态
      return this.createEmptyQueueState();
    }
  }

  /**
   * 保存队列状态
   */
  async saveQueueState(state: QueueState): Promise<void> {
    await this.lock.acquire();
    try {
      const data: QueueFile = {
        version: "1.0.0",
        updatedAt: Date.now(),
        isRunning: state.isRunning,
        currentTaskId: state.currentTask?.id,
        statistics: state.statistics,
      };
      fs.writeFileSync(this.queueFile, JSON.stringify(data, null, 2));
    } finally {
      await this.lock.release();
    }
  }

  // ==================== 日志管理 ====================

  /**
   * 追加日志
   */
  async appendLog(taskId: string, level: string, message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
    const logFile = join(this.logsDir, `task-${taskId}.log`);

    try {
      // 确保目录存在
      this.ensureDirSync(this.logsDir);
      
      // 追加写入日志
      let existing = "";
      try {
        existing = fs.readFileSync(logFile, "utf-8");
      } catch {
        // 文件不存在，使用空字符串
      }
      fs.writeFileSync(logFile, existing + logLine);
    } catch (error) {
      console.error(`Failed to write log for task ${taskId}:`, error);
    }
  }

  /**
   * 读取任务日志
   */
  async readTaskLog(taskId: string): Promise<string> {
    const logFile = join(this.logsDir, `task-${taskId}.log`);
    try {
      return fs.readFileSync(logFile, "utf-8");
    } catch {
      return "";
    }
  }

  /**
   * 写入系统日志
   */
  async appendSystemLog(level: string, message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
    const logFile = join(this.logsDir, "system.log");

    try {
      this.ensureDirSync(this.logsDir);
      let existing = "";
      try {
        existing = fs.readFileSync(logFile, "utf-8");
      } catch {
        // 文件不存在
      }
      fs.writeFileSync(logFile, existing + logLine);
    } catch (error) {
      console.error("Failed to write system log:", error);
    }
  }

  // ==================== 归档管理 ====================

  /**
   * 归档任务
   */
  async archiveTask(task: Task): Promise<void> {
    const date = new Date().toISOString().split("T")[0];
    const archiveFile = join(this.archiveDir, `tasks-${date}.json`);

    await this.lock.acquire();
    try {
      this.ensureDirSync(this.archiveDir);
      
      // 读取现有归档
      let archivedTasks: Task[] = [];
      try {
        const content = fs.readFileSync(archiveFile, "utf-8");
        const data = JSON.parse(content);
        archivedTasks = data.tasks || [];
      } catch {
        // 文件不存在
      }

      // 添加任务到归档
      archivedTasks.push(task);

      // 保存归档
      fs.writeFileSync(archiveFile, JSON.stringify({
        version: "1.0.0",
        archivedAt: Date.now(),
        tasks: archivedTasks,
      }, null, 2));

      // 从活动任务中删除
      await this.deleteTask(task.id);
    } finally {
      await this.lock.release();
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * 确保目录存在（同步）
   */
  private ensureDirSync(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * 检查文件是否存在（同步）
   */
  private fileExistsSync(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  /**
   * 计算统计数据
   */
  private calculateStatistics(tasks: Task[]): QueueStatistics {
    return {
      total: tasks.length,
      pending: tasks.filter((t) => t.status === "pending").length,
      running: tasks.filter((t) => t.status === "running").length,
      success: tasks.filter((t) => t.status === "success").length,
      failed: tasks.filter((t) => t.status === "failed").length,
      cancelled: tasks.filter((t) => t.status === "cancelled").length,
    };
  }

  /**
   * 创建空队列状态
   */
  private createEmptyQueueState(): QueueState {
    return {
      tasks: [],
      isRunning: false,
      statistics: {
        total: 0,
        pending: 0,
        running: 0,
        success: 0,
        failed: 0,
        cancelled: 0,
      },
    };
  }
}