/**
 * OpenCode Task Manager Plugin
 * 
 * 任务编排插件，支持批量任务执行、优先级队列和 Agent 协调
 */

import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { EventBus } from "./src/events";
import { FileStorage } from "./src/storage";
import { ConfigParser } from "./src/config";
import { QueueManager } from "./src/queue";
import { TaskExecutor } from "./src/executor";
import { TaskMonitor } from "./src/monitor";
import { RetryManager } from "./src/retry";
import type { TaskPriority } from "./src/types";

const PLUGIN_NAME = "task-manager";
const PLUGIN_VERSION = "1.0.0";

/**
 * Task Manager Plugin
 */
export const TaskManagerPlugin: Plugin = async ({ client, directory }) => {
  // 初始化核心组件
  const eventBus = new EventBus();
  const storage = new FileStorage({ directory });
  await storage.initialize();

  const configParser = new ConfigParser({ directory });
  const config = await configParser.load();

  // 延迟引用解决循环依赖
  let executorRef: TaskExecutor | null = null;
  const onExecuteCallback = async (task: any) => {
    if (executorRef) {
      await executorRef.execute(task);
    }
  };

  const queueManager = new QueueManager({
    storage,
    eventBus,
    config,
    onExecute: onExecuteCallback,
  });

  const executor = new TaskExecutor({
    client,
    eventBus,
    storage,
    queueManager,
  });

  executorRef = executor;

  const monitor = new TaskMonitor({
    client,
    eventBus,
    storage,
    executor,
    queueManager,
  });

  const retryManager = new RetryManager({
    eventBus,
    storage,
    queueManager,
  });

  await queueManager.initialize();

  // 返回 hooks
  return {
    // 注册自定义工具
    tool: {
      "task-add": tool({
        description: "向任务管理器添加一个新任务。任务会在独立的 session 中串行执行。",
        args: {
          title: tool.schema.string().describe("任务标题"),
          agent: tool.schema.string().describe("要调用的 agent 名称，如: explore, oracle, build"),
          prompt: tool.schema.string().describe("传递给 agent 的详细任务描述"),
          priority: tool.schema.enum(["high", "medium", "low"]).optional().default("medium").describe("任务优先级"),
          retryCount: tool.schema.number().optional().default(0).describe("失败后重试次数"),
          skill: tool.schema.string().optional().describe("可选的 skill 名称"),
        },
        async execute(args, context) {
          const task = await queueManager.addTask({
            title: args.title,
            agent: args.agent,
            prompt: args.prompt,
            priority: args.priority as TaskPriority,
            retryCount: args.retryCount,
            skill: args.skill,
            source: "agent",
          });

          return {
            success: true,
            taskId: task.id,
            message: `任务已添加到队列。当前队列中有 ${queueManager.getPendingCount()} 个待执行任务。`,
          };
        },
      }),

      "task-list": tool({
        description: "列出任务管理器中的所有任务及其状态",
        args: {
          status: tool.schema.enum(["pending", "running", "success", "failed", "all"]).optional().default("all").describe("筛选条件"),
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
            })),
          };
        },
      }),

      "task-status": tool({
        description: "查询指定任务的详细状态和执行结果",
        args: {
          taskId: tool.schema.string().describe("任务 ID"),
        },
        async execute(args) {
          const task = queueManager.getTask(args.taskId);
          if (!task) {
            return { success: false, error: `任务 ${args.taskId} 不存在` };
          }
          return {
            success: true,
            task: {
              id: task.id,
              title: task.title,
              status: task.status,
              agent: task.agent,
              priority: task.priority,
              result: task.result,
              error: task.error,
              createdAt: new Date(task.createdAt).toISOString(),
            },
          };
        },
      }),

      "task-cancel": tool({
        description: "取消一个待执行的任务",
        args: {
          taskId: tool.schema.string().describe("要取消的任务 ID"),
        },
        async execute(args) {
          const task = queueManager.getTask(args.taskId);
          if (!task) {
            return { success: false, error: "任务不存在" };
          }
          if (task.status !== "pending") {
            return { success: false, error: `只能取消 pending 状态的任务，当前状态: ${task.status}` };
          }
          const success = await queueManager.cancelTask(args.taskId);
          return { success, message: success ? `任务 ${args.taskId} 已取消` : "取消失败" };
        },
      }),

      "task-retry": tool({
        description: "重试一个失败的任务",
        args: {
          taskId: tool.schema.string().describe("要重试的任务 ID"),
        },
        async execute(args) {
          const task = queueManager.getTask(args.taskId);
          if (!task) {
            return { success: false, error: "任务不存在" };
          }
          if (task.status !== "failed") {
            return { success: false, error: `只能重试 failed 状态的任务，当前状态: ${task.status}` };
          }
          const success = await queueManager.retryTask(args.taskId);
          return { success, message: success ? `任务 ${args.taskId} 已重新加入队列` : "重试失败" };
        },
      }),

      "queue-status": tool({
        description: "获取任务队列的当前状态",
        args: {},
        async execute() {
          const state = queueManager.getQueueState();
          return {
            isRunning: state.isRunning,
            currentTask: state.currentTask ? { id: state.currentTask.id, title: state.currentTask.title } : null,
            statistics: state.statistics,
          };
        },
      }),

      "queue-start": tool({
        description: "启动任务队列处理",
        args: {},
        async execute() {
          queueManager.start();
          return { success: true, message: "队列已启动" };
        },
      }),

      "queue-stop": tool({
        description: "停止任务队列处理",
        args: {},
        async execute() {
          queueManager.stop();
          return { success: true, message: "队列已停止" };
        },
      }),
    },

    // Session 空闲事件
    "session.idle": async (input) => {
      await monitor.onSessionIdle(input.sessionID);
    },

    // Session 错误事件
    "session.error": async (input, output) => {
      await monitor.onSessionError(input.sessionID, output.error);
    },

    // Shell 环境注入
    "shell.env": async (input, output) => {
      output.env.TASK_MANAGER_PLUGIN = "1";
      output.env.TASK_MANAGER_VERSION = PLUGIN_VERSION;
    },
  };
};

export default TaskManagerPlugin;