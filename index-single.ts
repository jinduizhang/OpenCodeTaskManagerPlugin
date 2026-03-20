import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"

/**
 * OpenCode Task Manager Plugin
 * 
 * 每个任务创建独立的 Session，显示在右侧任务栏
 */

export const TaskManagerPlugin: Plugin = async ({ client, directory }) => {
  console.log("[task-manager] Plugin loaded")

  return {
    tool: {
      "task-add": tool({
        description: "创建任务（独立Session），显示在右侧任务栏",
        args: {
          title: tool.schema.string().optional().describe("任务标题"),
          agent: tool.schema.string().describe("Agent名称: explore, oracle, build, quick"),
          prompt: tool.schema.string().describe("任务描述"),
        },
        async execute(args, context) {
          const taskTitle = args.title || `任务: ${args.agent}`
          
          // 创建独立的 Session（会显示在右侧任务栏）
          const session = await client.session.create({
            body: {
              title: `📋 ${taskTitle}`,
            },
          })

          if (!session.data) {
            return `❌ 创建 Session 失败`
          }

          const sessionId = session.data.id

          // 发送 prompt 到 Session
          await client.session.prompt({
            path: { id: sessionId },
            body: {
              agent: args.agent,
              parts: [{ type: "text", text: args.prompt }],
            },
          })

          return `✅ 任务已创建

Session ID: ${sessionId}
标题: ${taskTitle}
Agent: ${args.agent}

📌 任务显示在右侧任务栏，点击可查看详情和执行进度`
        },
      }),

      "task-list": tool({
        description: "列出所有任务（Session列表）",
        args: {
          limit: tool.schema.number().optional().default(10).describe("显示数量"),
        },
        async execute(args, context) {
          // 获取所有 Session
          const sessions = await client.session.list()

          if (!sessions.data) {
            return "📭 当前没有任务（Session）"
          }

          const list = sessions.data
          
          if (list.length === 0) {
            return "📭 当前没有任务（Session）"
          }

          const limit = args.limit || 10
          const display = list.slice(0, limit)

          let result = `📋 任务列表 (共 ${list.length} 个 Session)\n\n`

          display.forEach((s: any, i: number) => {
            result += `${i + 1}. [${s.id.slice(0, 8)}] ${s.title || "无标题"}\n`
          })

          if (list.length > limit) {
            result += `\n... 还有 ${list.length - limit} 个任务`
          }

          result += `\n\n💡 点击右侧任务栏切换 Session`

          return result
        },
      }),

      "task-status": tool({
        description: "查看任务详情",
        args: {
          sessionId: tool.schema.string().describe("Session ID"),
        },
        async execute(args, context) {
          const session = await client.session.get({
            path: { id: args.sessionId },
          })

          if (!session.data) {
            return `❌ Session ${args.sessionId} 不存在`
          }

          const s = session.data as any
          let result = `📋 任务详情\n\n`
          result += `ID: ${s.id}\n`
          result += `标题: ${s.title || "无标题"}\n`
          if (s.status) result += `状态: ${s.status}\n`
          if (s.created_at) result += `创建: ${new Date(s.created_at).toLocaleString()}\n`

          return result
        },
      }),

      "queue-status": tool({
        description: "查看任务统计",
        args: {},
        async execute(args, context) {
          const sessions = await client.session.list()

          if (!sessions.data) {
            return "📭 当前没有任务"
          }

          const list = sessions.data

          return `📊 任务统计

总计: ${list.length} 个 Session

💡 任务显示在右侧任务栏，点击可切换`
        },
      }),

      "task-new": tool({
        description: "快速创建新任务（新Session）",
        args: {
          prompt: tool.schema.string().describe("任务描述"),
          agent: tool.schema.string().optional().default("explore").describe("Agent名称"),
        },
        async execute(args, context) {
          // 创建 Session
          const session = await client.session.create({
            body: {
              title: args.prompt.slice(0, 50) + (args.prompt.length > 50 ? "..." : ""),
            },
          })

          if (!session.data) {
            return `❌ 创建失败`
          }

          // 发送 prompt
          await client.session.prompt({
            path: { id: session.data.id },
            body: {
              agent: args.agent || "explore",
              parts: [{ type: "text", text: args.prompt }],
            },
          })

          return `✅ 任务已创建并开始执行

Session: ${session.data.id}
Agent: ${args.agent || "explore"}

📌 查看右侧任务栏获取执行进度`
        },
      }),

      "task-open": tool({
        description: "打开 Session 选择器（右侧任务栏）",
        args: {},
        async execute(args, context) {
          await client.tui.openSessions()
          return "📌 已打开 Session 选择器\n\n请在右侧任务栏选择要切换的 Session"
        },
      }),
    },
  }
}

export default TaskManagerPlugin