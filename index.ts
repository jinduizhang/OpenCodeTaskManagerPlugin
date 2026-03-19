/**
 * OpenCode Task Manager Plugin - 插件入口
 * 
 * 这是插件的主入口文件，负责：
 * - 初始化核心组件
 * - 注册自定义工具
 * - 注册事件监听 Hooks
 * - 与 OpenCode 集成
 */

import type {
  Plugin,
  PluginContext,
  PluginReturn,
  ToolDefinition,
  CreateTaskInput,
} from "./src/types";
import { EventBus } from "./src/events";
import { FileStorage } from "./src/storage";
import { ConfigParser } from "./src/config";
import { QueueManager } from "./src/queue";
import { TaskExecutor } from "./src/executor";
import { TaskMonitor } from "./src/monitor";
import { RetryManager } from "./src/retry";

// 插件元信息
const PLUGIN_NAME = "task-manager";
const PLUGIN_VERSION = "1.0.0";

/**
 * 创建工具定义
 */
function createToolDefinitions(
  queueManager: QueueManager,
  storage: FileStorage
): Record<string, ToolDefinition> {
  // task-add 工具
  const taskAddTool: ToolDefinition = {
    description:
      "向任务管理器添加一个新任务。任务会在独立的 session 中串行执行。",
    args: {
      title: { type: "string", description: "任务标题，简短描述任务内容" },
      agent: { type: "string", description: "要调用的 agent 名称，如: explore, oracle, build" },
      prompt: { type: "string", description: "传递给 agent 的详细任务描述" },
      priority: {
        type: "enum",
        values: ["high", "medium", "low"],
        optional: true,
        default: "medium",
        description: "任务优先级",
      },
      retryCount: {
        type: "number",
        optional: true,
        default: 0,
        description: "失败后重试次数",
      },
      skill: {
        type: "string",
        optional: true,
        description: "可选的 skill 名称，任务执行前会加载此 skill",
      },
    },
    async execute(args, context) {
      const task = await queueManager.addTask({
        title: args.title as string,
        agent: args.agent as string,
        prompt: args.prompt as string,
        priority: args.priority as TaskPriority,
        retryCount: args.retryCount as number,
        skill: args.skill as string,
        source: "agent",
      });

      return {
        success: true,
        taskId: task.id,
        message: `任务已添加到队列。当前队列中有 ${queueManager.getPendingCount()} 个待执行任务。`,
      };
    },
  };

  // task-list 工具
  const taskListTool: ToolDefinition = {
    description: "列出任务管理器中的所有任务及其状态",
    args: {
      status: {
        type: "enum",
        values: ["pending", "running", "success", "failed", "all"],
        optional: true,
        default: "all",
        description: "筛选条件，只显示指定状态的任务",
      },
    },
    async execute(args) {
      let tasks = queueManager.getTasks();

      if (args.status && args.status !== "all") {
        tasks = tasks.filter((t) => t.status === args.status);
      }

      const state = queueManager.getQueueState();

      return {
        total: tasks.length,
        statistics: state.statistics,
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          agent: t.agent,
          status: t.status,
          priority: t.priority,
          createdAt: new Date(t.createdAt).toISOString(),
          sessionId: t.sessionId,
        })),
      };
    },
  };

  // task-status 工具
  const taskStatusTool: ToolDefinition = {
    description: "查询指定任务的详细状态和执行结果",
    args: {
      taskId: { type: "string", description: "任务 ID" },
    },
    async execute(args) {
      const task = queueManager.getTask(args.taskId as string);

      if (!task) {
        return {
          success: false,
          error: `任务 ${args.taskId as string} 不存在`,
        };
      }

      return {
        success: true,
        task: {
          id: task.id,
          title: task.title,
          status: task.status,
          agent: task.agent,
          skill: task.skill,
          priority: task.priority,
          currentRetry: task.currentRetry,
          result: task.result,
          error: task.error,
          createdAt: new Date(task.createdAt).toISOString(),
          startedAt: task.startedAt ? new Date(task.startedAt).toISOString() : null,
          completedAt: task.completedAt ? new Date(task.completedAt).toISOString() : null,
          sessionId: task.sessionId,
        },
      };
    },
  };

  // task-cancel 工具
  const taskCancelTool: ToolDefinition = {
    description: "取消一个待执行的任务",
    args: {
      taskId: { type: "string", description: "要取消的任务 ID" },
    },
    async execute(args) {
      const task = queueManager.getTask(args.taskId as string);

      if (!task) {
        return { success: false, error: "任务不存在" };
      }

      if (task.status !== "pending") {
        return {
          success: false,
          error: `只能取消 pending 状态的任务，当前状态: ${task.status}`,
        };
      }

      const success = await queueManager.cancelTask(args.taskId as string);
      return {
        success,
        message: success ? `任务 ${args.taskId as string} 已取消` : "取消失败",
      };
    },
  };

  // task-retry 工具
  const taskRetryTool: ToolDefinition = {
    description: "重试一个失败的任务",
    args: {
      taskId: { type: "string", description: "要重试的任务 ID" },
    },
    async execute(args) {
      const task = queueManager.getTask(args.taskId as string);

      if (!task) {
        return { success: false, error: "任务不存在" };
      }

      if (task.status !== "failed") {
        return {
          success: false,
          error: `只能重试 failed 状态的任务，当前状态: ${task.status}`,
        };
      }

      const success = await queueManager.retryTask(args.taskId as string);
      return {
        success,
        message: success ? `任务 ${args.taskId as string} 已重新加入队列` : "重试失败",
      };
    },
  };

  // task-tui 工具
  const taskTuiTool: ToolDefinition = {
    description: "启动任务管理器 TUI 界面",
    args: {},
    async execute(args, context) {
      // TUI 启动逻辑（需要通过 subprocess 启动）
      return {
        success: true,
        message: "TUI 启动命令：bun run src/tui/cli.ts",
        hint: "在终端中运行上述命令启动 TUI 界面",
      };
    },
  };

  // queue-status 工具
  const queueStatusTool: ToolDefinition = {
    description: "获取任务队列的当前状态",
    args: {},
    async execute() {
      const state = queueManager.getQueueState();

      return {
        isRunning: state.isRunning,
        currentTask: state.currentTask
          ? {
              id: state.currentTask.id,
              title: state.currentTask.title,
              status: state.currentTask.status,
            }
          : null,
        statistics: state.statistics,
      };
    },
  };

  // queue-start 工具
  const queueStartTool: ToolDefinition = {
    description: "启动任务队列处理",
    args: {},
    async execute() {
      queueManager.start();
      return {
        success: true,
        message: "队列已启动",
      };
    },
  };

  // queue-stop 工具
  const queueStopTool: ToolDefinition = {
    description: "停止任务队列处理",
    args: {},
    async execute() {
      queueManager.stop();
      return {
        success: true,
        message: "队列已停止",
      };
    },
  };

  return {
    "task-add": taskAddTool,
    "task-list": taskListTool,
    "task-status": taskStatusTool,
    "task-cancel": taskCancelTool,
    "task-retry": taskRetryTool,
    "task-tui": taskTuiTool,
    "queue-status": queueStatusTool,
    "queue-start": queueStartTool,
    "queue-stop": queueStopTool,
  };
}

/**
 * Task Manager 插件
 */
export const TaskManagerPlugin: Plugin = {
  name: PLUGIN_NAME,
  version: PLUGIN_VERSION,

  async setup(ctx: PluginContext): Promise<PluginReturn> {
    // 记录插件加载
    await ctx.client.app.log({
      service: PLUGIN_NAME,
      level: "info",
      message: `${PLUGIN_NAME} v${PLUGIN_VERSION} 插件加载中...`,
    });

    // ========== 1. 初始化核心组件 ==========

    // 事件总线
    const eventBus = new EventBus();

    // 文件存储
    const storage = new FileStorage({ directory: ctx.directory });
    await storage.initialize();

    // 配置解析器
    const configParser = new ConfigParser({ directory: ctx.directory });
    const config = await configParser.load();

    // 创建一个延迟执行的回调容器
    let executorRef: TaskExecutor | null = null;
    const onExecuteCallback = async (task: Parameters<NonNullable<QueueManagerOptions["onExecute"]>>[0]) => {
      if (executorRef) {
        await executorRef.execute(task);
      }
    };

    // 队列管理器
    const queueManager = new QueueManager({
      storage,
      eventBus,
      config,
      onExecute: onExecuteCallback,
    });

    // 任务执行器
    const executor = new TaskExecutor({
      client: ctx.client,
      eventBus,
      storage,
      queueManager,
    });

    // 设置执行器引用
    executorRef = executor;

    // 状态监控
    const monitor = new TaskMonitor({
      client: ctx.client,
      eventBus,
      storage,
      executor,
      queueManager,
    });

    // 重试管理器
    const retryManager = new RetryManager({
      eventBus,
      storage,
      queueManager,
    });

    // ========== 2. 初始化队列 ==========

    await queueManager.initialize();

    // ========== 3. 注册工具 ==========

    const tools = createToolDefinitions(queueManager, storage);

    // ========== 4. 记录加载完成 ==========

    await ctx.client.app.log({
      service: PLUGIN_NAME,
      level: "info",
      message: `${PLUGIN_NAME} v${PLUGIN_VERSION} 插件加载完成`,
      metadata: {
        tasksCount: queueManager.getTasks().length,
        pendingCount: queueManager.getPendingCount(),
      },
    });

    // ========== 5. 返回插件定义 ==========

    return {
      // 注册工具
      tool: tools,

      // Session 空闲事件
      "session.idle": async (input) => {
        await monitor.onSessionIdle(input.sessionID);
      },

      // Session 错误事件
      "session.error": async (input, output) => {
        await monitor.onSessionError(input.sessionID, output.error);
      },

      // Session 创建事件
      "session.created": async (input, output) => {
        await monitor.onSessionCreated(input.sessionID, input.session);
      },

      // Shell 环境注入
      "shell.env": async (input, output) => {
        output.env.TASK_MANAGER_PLUGIN = "1";
        output.env.TASK_MANAGER_VERSION = PLUGIN_VERSION;
      },
    };
  },
};

// 默认导出
export default TaskManagerPlugin;