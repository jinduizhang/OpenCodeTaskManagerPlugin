/**
 * OpenCode Task Manager Plugin - 核心类型定义
 * 
 * 这个文件定义了插件中使用的所有核心数据类型和接口
 */

// ==================== 任务状态 ====================

/**
 * 任务状态枚举
 * - pending: 等待执行
 * - running: 执行中
 * - success: 执行成功
 * - failed: 执行失败（重试次数用尽）
 * - cancelled: 已取消
 */
export type TaskStatus = "pending" | "running" | "success" | "failed" | "cancelled";

/**
 * 任务优先级
 */
export type TaskPriority = "high" | "medium" | "low";

/**
 * 任务来源
 */
export type TaskSource = "manual" | "config" | "agent";

// ==================== 任务数据结构 ====================

/**
 * 任务执行结果
 */
export interface TaskResult {
  /** 执行是否成功 */
  success: boolean;
  /** 执行输出 */
  output?: string;
  /** 修改的文件列表 */
  filesChanged?: string[];
  /** 结果摘要 */
  summary?: string;
}

/**
 * 任务实体
 */
export interface Task {
  // ========== 基础信息 ==========
  /** 唯一标识（UUID） */
  id: string;
  /** 任务标题 */
  title: string;
  /** 任务描述 */
  description?: string;

  // ========== 执行配置 ==========
  /** 要调用的 agent 名称（如 "explore", "oracle"） */
  agent: string;
  /** 可选的 skill 名称 */
  skill?: string;
  /** 传递给 agent 的 prompt */
  prompt: string;
  /** 额外参数 */
  parameters?: Record<string, unknown>;

  // ========== 调度配置 ==========
  /** 优先级 */
  priority: TaskPriority;
  /** 重试次数（用户指定，默认0） */
  retryCount: number;
  /** 当前重试次数 */
  currentRetry: number;

  // ========== 状态信息 ==========
  /** 任务状态 */
  status: TaskStatus;
  /** 关联的 session ID */
  sessionId?: string;
  /** 执行结果 */
  result?: TaskResult;
  /** 错误信息 */
  error?: string;

  // ========== 时间戳 ==========
  /** 创建时间 */
  createdAt: number;
  /** 开始时间 */
  startedAt?: number;
  /** 完成时间 */
  completedAt?: number;
  /** 更新时间 */
  updatedAt: number;

  // ========== 来源信息 ==========
  /** 任务来源 */
  source: TaskSource;
}

/**
 * 创建任务的输入参数
 */
export interface CreateTaskInput {
  /** 任务标题 */
  title: string;
  /** 任务描述 */
  description?: string;
  /** 要调用的 agent 名称 */
  agent: string;
  /** 可选的 skill 名称 */
  skill?: string;
  /** 传递给 agent 的 prompt */
  prompt: string;
  /** 额外参数 */
  parameters?: Record<string, unknown>;
  /** 优先级 */
  priority?: TaskPriority;
  /** 重试次数 */
  retryCount?: number;
  /** 任务来源 */
  source?: TaskSource;
}

// ==================== 队列状态 ====================

/**
 * 队列统计信息
 */
export interface QueueStatistics {
  /** 总任务数 */
  total: number;
  /** 等待执行数 */
  pending: number;
  /** 执行中数 */
  running: number;
  /** 成功数 */
  success: number;
  /** 失败数 */
  failed: number;
  /** 已取消数 */
  cancelled: number;
}

/**
 * 队列状态
 */
export interface QueueState {
  /** 所有任务列表 */
  tasks: Task[];
  /** 当前执行的任务 */
  currentTask?: Task;
  /** 队列是否在运行 */
  isRunning: boolean;
  /** 统计信息 */
  statistics: QueueStatistics;
}

// ==================== 配置相关 ====================

/**
 * 任务配置项（YAML 中的任务定义）
 */
export interface TaskConfig {
  /** 任务名称 */
  name: string;
  /** 任务描述 */
  description?: string;
  /** 要调用的 agent 名称 */
  agent?: string;
  /** skill 名称 */
  skill?: string;
  /** 传递给 agent 的 prompt */
  prompt: string;
  /** 额外参数 */
  parameters?: Record<string, unknown>;
  /** 优先级 */
  priority?: TaskPriority;
  /** 重试次数 */
  retryCount?: number;
}

/**
 * 插件设置
 */
export interface TaskManagerSettings {
  /** OpenCode 启动时自动开始执行队列 */
  autoStart?: boolean;
  /** 最大并发数（串行=1） */
  maxConcurrent?: number;
  /** 日志级别 */
  logLevel?: "debug" | "info" | "warn" | "error";
}

/**
 * 完整的任务管理器配置
 */
export interface TaskManagerConfig {
  /** 版本号 */
  version?: string;
  /** 插件设置 */
  settings?: TaskManagerSettings;
  /** 任务列表 */
  tasks?: TaskConfig[];
}

// ==================== 事件相关 ====================

/**
 * 任务事件类型
 */
export type TaskEventType =
  | "task.created"
  | "task.started"
  | "task.progress"
  | "task.completed"
  | "task.failed"
  | "task.retrying"
  | "task.cancelled"
  | "queue.started"
  | "queue.idle";

/**
 * 任务事件
 */
export type TaskEvent =
  | { type: "task.created"; payload: Task }
  | { type: "task.started"; payload: Task }
  | { type: "task.progress"; payload: { taskId: string; progress: number } }
  | { type: "task.completed"; payload: { taskId: string; result: TaskResult } }
  | { type: "task.failed"; payload: { taskId: string; error: string } }
  | { type: "task.retrying"; payload: { taskId: string; attempt: number } }
  | { type: "task.cancelled"; payload: { taskId: string } }
  | { type: "queue.started"; payload: {} }
  | { type: "queue.idle"; payload: {} };

/**
 * 事件监听器
 */
export type EventListener<T = TaskEvent> = (event: T) => void | Promise<void>;

// ==================== OpenCode 集成相关 ====================

/**
 * TaskManager Session Data
 */
export interface TaskManagerSessionData {
  taskId?: string;
  taskManager?: boolean;
  agent?: string;
  skill?: string;
  source?: string;
}

/**
 * OpenCode Session 对象
 */
export interface Session {
  id: string;
  title?: string;
  status?: string;
  data?: TaskManagerSessionData;
  summary?: string;
}

/**
 * Session 创建选项
 */
export interface SessionCreateOptions {
  parentID?: string;
  title?: string;
  data?: Record<string, unknown>;
}

/**
 * Prompt 部分
 */
export interface PromptPart {
  type: "text" | "image";
  text?: string;
  image?: string;
}

/**
 * 日志选项
 */
export interface LogOptions {
  service: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * OpenCode SDK Client
 */
export interface OpenCodeClient {
  session: {
    list: () => Promise<Session[]>;
    get: (id: string) => Promise<Session>;
    create: (options: SessionCreateOptions) => Promise<Session>;
    prompt: (sessionId: string, parts: PromptPart[]) => Promise<void>;
    delete: (id: string) => Promise<void>;
  };
  app: {
    log: (options: LogOptions) => Promise<void>;
  };
}

/**
 * 项目信息
 */
export interface ProjectInfo {
  id: string;
  worktree: string;
  vcs?: "git";
}

/**
 * Bun Shell 类型（简化）
 */
export type BunShell = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}>;

/**
 * OpenCode 插件上下文
 */
export interface PluginContext {
  /** OpenCode SDK Client */
  client: OpenCodeClient;
  /** 项目信息 */
  project: ProjectInfo;
  /** 当前工作目录 */
  directory: string;
  /** Git worktree 根目录 */
  worktree: string;
  /** Bun Shell */
  $: BunShell;
}

/**
 * 工具定义参数 Schema
 */
export interface ToolSchema {
  string: () => { type: "string" };
  number: () => { type: "number" };
  boolean: () => { type: "boolean" };
  enum: <T extends string>(values: T[]) => { type: "enum"; values: T[] };
  optional: <T>(schema: T) => T & { optional: true };
  default: <T>(schema: T, defaultValue: unknown) => T & { default: unknown };
}

/**
 * 工具执行上下文
 */
export interface ToolExecutionContext {
  directory: string;
  worktree: string;
  sessionID?: string;
}

/**
 * 工具定义
 */
export interface ToolDefinition {
  description: string;
  args: Record<string, unknown>;
  execute: (args: Record<string, unknown>, context: ToolExecutionContext) => Promise<unknown>;
}

/**
 * 插件定义
 */
export interface Plugin {
  name: string;
  version: string;
  setup: (ctx: PluginContext) => Promise<PluginReturn>;
}

/**
 * 插件返回值
 */
export interface PluginReturn {
  /** 自定义工具 */
  tool?: Record<string, ToolDefinition>;
  /** 通用事件监听 */
  event?: (data: { event: TaskEvent }) => void | Promise<void>;
  /** Session 空闲事件 */
  "session.idle"?: (input: { sessionID: string }, output: unknown) => void | Promise<void>;
  /** Session 错误事件 */
  "session.error"?: (input: { sessionID: string }, output: { error: string }) => void | Promise<void>;
  /** Session 创建事件 */
  "session.created"?: (input: { sessionID: string; session?: Session }, output: unknown) => void | Promise<void>;
  /** Session 状态变化事件 */
  "session.status"?: (input: { sessionID: string; status: string }, output: { previousStatus?: string }) => void | Promise<void>;
  /** Shell 环境注入 */
  "shell.env"?: (input: unknown, output: { env: Record<string, string> }) => void | Promise<void>;
}

// ==================== 存储相关 ====================

/**
 * 存储接口
 */
export interface Storage {
  /** 加载所有任务 */
  loadTasks(): Promise<Task[]>;
  /** 保存所有任务 */
  saveTasks(tasks: Task[]): Promise<void>;
  /** 获取单个任务 */
  getTask(id: string): Promise<Task | undefined>;
  /** 更新任务 */
  updateTask(id: string, updates: Partial<Task>): Promise<void>;
  /** 加载队列状态 */
  loadQueueState(): Promise<QueueState>;
  /** 保存队列状态 */
  saveQueueState(state: QueueState): Promise<void>;
  /** 追加日志 */
  appendLog(taskId: string, level: string, message: string): Promise<void>;
}

/**
 * 任务数据文件结构
 */
export interface TasksFile {
  version: string;
  updatedAt: number;
  tasks: Task[];
}

/**
 * 队列状态文件结构
 */
export interface QueueFile {
  version: string;
  updatedAt: number;
  isRunning: boolean;
  currentTaskId?: string;
  statistics: QueueStatistics;
}