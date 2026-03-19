import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import * as fs from "fs"
import * as path from "path"

// ==================== 任务存储 ====================
interface Task {
  id: string
  title: string
  agent: string
  prompt: string
  priority: "high" | "medium" | "low"
  status: "pending" | "running" | "success" | "failed"
  retryCount: number
  createdAt: number
}

interface QueueState {
  isRunning: boolean
  tasks: Task[]
}

// 内存存储
let queueState: QueueState = {
  isRunning: false,
  tasks: []
}

// 文件存储路径
function getStorageDir(baseDir: string): string {
  return path.join(baseDir, ".opencode", "task-manager")
}

function getTasksFile(baseDir: string): string {
  return path.join(getStorageDir(baseDir), "tasks.json")
}

function loadTasks(baseDir: string): void {
  const file = getTasksFile(baseDir)
  try {
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, "utf-8"))
      queueState.tasks = data.tasks || []
      queueState.isRunning = data.isRunning || false
    }
  } catch (e) {
    console.error("[task-manager] Failed to load tasks:", e)
  }
}

function saveTasks(baseDir: string): void {
  const dir = getStorageDir(baseDir)
  const file = getTasksFile(baseDir)
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(file, JSON.stringify(queueState, null, 2))
  } catch (e) {
    console.error("[task-manager] Failed to save tasks:", e)
  }
}

function generateId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// ==================== 插件定义 ====================
export const TaskManagerPlugin: Plugin = async ({ client, directory }) => {
  loadTasks(directory)
  console.log(`[task-manager] Loaded ${queueState.tasks.length} tasks`)

  return {
    tool: {
      "task-add": tool({
        description: "添加任务到队列",
        args: {
          title: tool.schema.string().optional().describe("任务标题（可选）"),
          agent: tool.schema.string().describe("Agent名称"),
          prompt: tool.schema.string().describe("任务描述"),
          priority: tool.schema.enum(["high", "medium", "low"]).optional().default("medium").describe("优先级"),
          retryCount: tool.schema.number().optional().default(0).describe("重试次数"),
        },
        async execute(args, context) {
          const task: Task = {
            id: generateId(),
            title: args.title || `任务: ${args.agent}`,
            agent: args.agent,
            prompt: args.prompt,
            priority: args.priority || "medium",
            status: "pending",
            retryCount: args.retryCount || 0,
            createdAt: Date.now()
          }
          queueState.tasks.push(task)
          saveTasks(context.directory)
          const pending = queueState.tasks.filter(t => t.status === "pending").length
          return `✅ 任务已添加\nID: ${task.id}\n标题: ${task.title}\nAgent: ${task.agent}\n待执行: ${pending}`
        },
      }),

      "task-list": tool({
        description: "列出所有任务",
        args: {
          status: tool.schema.enum(["pending", "running", "success", "failed", "all"]).optional().default("all").describe("筛选状态"),
        },
        async execute(args, context) {
          loadTasks(context.directory)
          let tasks = queueState.tasks
          if (args.status && args.status !== "all") {
            tasks = tasks.filter(t => t.status === args.status)
          }
          if (tasks.length === 0) {
            return "📭 当前没有任务"
          }
          const stats = {
            total: queueState.tasks.length,
            pending: queueState.tasks.filter(t => t.status === "pending").length,
            running: queueState.tasks.filter(t => t.status === "running").length,
            success: queueState.tasks.filter(t => t.status === "success").length,
            failed: queueState.tasks.filter(t => t.status === "failed").length,
          }
          let result = `📋 任务列表 (共 ${stats.total} 个)\n待执行=${stats.pending} 执行中=${stats.running} 成功=${stats.success} 失败=${stats.failed}\n\n`
          tasks.forEach((t, i) => {
            const icon = { pending: "⏳", running: "🔄", success: "✅", failed: "❌" }[t.status]
            result += `${i + 1}. ${icon} [${t.id}] ${t.title}\n   Agent: ${t.agent}\n`
          })
          return result
        },
      }),

      "task-status": tool({
        description: "查询任务状态",
        args: { taskId: tool.schema.string().describe("任务ID") },
        async execute(args, context) {
          loadTasks(context.directory)
          const task = queueState.tasks.find(t => t.id === args.taskId)
          if (!task) return `❌ 任务 ${args.taskId} 不存在`
          return `📋 任务详情\nID: ${task.id}\n标题: ${task.title}\n状态: ${task.status}\nAgent: ${task.agent}\n创建: ${new Date(task.createdAt).toLocaleString()}\n\nPrompt:\n${task.prompt}`
        },
      }),

      "task-cancel": tool({
        description: "取消任务",
        args: { taskId: tool.schema.string().describe("任务ID") },
        async execute(args, context) {
          loadTasks(context.directory)
          const task = queueState.tasks.find(t => t.id === args.taskId)
          if (!task) return `❌ 任务 ${args.taskId} 不存在`
          if (task.status !== "pending") return `❌ 只能取消 pending 状态的任务，当前: ${task.status}`
          task.status = "failed"
          saveTasks(context.directory)
          return `✅ 任务 ${args.taskId} 已取消`
        },
      }),

      "task-retry": tool({
        description: "重试任务",
        args: { taskId: tool.schema.string().describe("任务ID") },
        async execute(args, context) {
          loadTasks(context.directory)
          const task = queueState.tasks.find(t => t.id === args.taskId)
          if (!task) return `❌ 任务 ${args.taskId} 不存在`
          if (task.status !== "failed") return `❌ 只能重试 failed 状态的任务，当前: ${task.status}`
          task.status = "pending"
          saveTasks(context.directory)
          return `✅ 任务 ${args.taskId} 已重新加入队列`
        },
      }),

      "queue-status": tool({
        description: "查看队列状态",
        args: {},
        async execute(args, context) {
          loadTasks(context.directory)
          const stats = {
            total: queueState.tasks.length,
            pending: queueState.tasks.filter(t => t.status === "pending").length,
            running: queueState.tasks.filter(t => t.status === "running").length,
            success: queueState.tasks.filter(t => t.status === "success").length,
            failed: queueState.tasks.filter(t => t.status === "failed").length,
          }
          return `📊 队列状态\n运行中: ${queueState.isRunning ? "✅" : "⏸️"}\n总计: ${stats.total}\n待执行: ${stats.pending}\n执行中: ${stats.running}\n成功: ${stats.success}\n失败: ${stats.failed}`
        },
      }),

      "queue-start": tool({
        description: "启动队列",
        args: {},
        async execute(args, context) {
          loadTasks(context.directory)
          queueState.isRunning = true
          saveTasks(context.directory)
          const pending = queueState.tasks.filter(t => t.status === "pending").length
          return `✅ 队列已启动\n待执行任务: ${pending}`
        },
      }),

      "queue-stop": tool({
        description: "停止队列",
        args: {},
        async execute(args, context) {
          loadTasks(context.directory)
          queueState.isRunning = false
          saveTasks(context.directory)
          return `⏸️ 队列已停止`
        },
      }),
    },
  }
}

export default TaskManagerPlugin