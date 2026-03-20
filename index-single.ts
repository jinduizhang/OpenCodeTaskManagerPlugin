import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"

/**
 * OpenCode Task Manager Plugin
 * 
 * 每个任务创建独立的 Session，显示在右侧任务栏
 */

export const TaskManagerPlugin: Plugin = async ({ client, directory }) => {
  console.log("[task-manager] Plugin loaded, directory:", directory)

  return {
    tool: {
      "task-add": tool({
        description: "创建新任务（独立Session），显示在右侧任务栏",
        args: {
          prompt: tool.schema.string().describe("任务描述"),
          agent: tool.schema.string().optional().default("explore").describe("Agent名称"),
        },
        async execute(args, context) {
          console.log("[task-manager] Creating session...")
          
          try {
            // 创建新 Session
            const sessionResult = await client.session.create()
            
            console.log("[task-manager] Session result:", JSON.stringify(sessionResult, null, 2))
            
            if (!sessionResult.data) {
              return `❌ 创建 Session 失败: ${JSON.stringify(sessionResult.error)}`
            }

            const sessionId = sessionResult.data.id
            console.log("[task-manager] Session created:", sessionId)

            // 发送任务到 Session
            const promptResult = await client.session.prompt({
              path: { id: sessionId },
              body: {
                agent: args.agent || "explore",
                parts: [{ type: "text", text: args.prompt }],
              },
            })

            console.log("[task-manager] Prompt result:", JSON.stringify(promptResult, null, 2))

            return `✅ 任务已创建

Session ID: ${sessionId}
Agent: ${args.agent || "explore"}
Prompt: ${args.prompt.slice(0, 100)}${args.prompt.length > 100 ? "..." : ""}

📌 查看右侧任务栏，应该能看到新创建的 Session
💡 如果看不到，请尝试刷新或重启 OpenCode`
          } catch (e) {
            console.error("[task-manager] Error:", e)
            return `❌ 错误: ${e}`
          }
        },
      }),

      "task-list": tool({
        description: "列出所有 Session",
        args: {},
        async execute(args, context) {
          try {
            const result = await client.session.list()
            console.log("[task-manager] Session list:", JSON.stringify(result, null, 2))
            
            if (!result.data || result.data.length === 0) {
              return "📭 当前没有 Session"
            }

            const sessions = result.data
            let output = `📋 Session 列表 (${sessions.length} 个)\n\n`
            
            sessions.forEach((s: any, i: number) => {
              output += `${i + 1}. [${s.id?.slice(0, 8) || "?"}] ${s.title || "无标题"}\n`
            })

            return output
          } catch (e) {
            console.error("[task-manager] Error:", e)
            return `❌ 错误: ${e}`
          }
        },
      }),

      "session-new": tool({
        description: "创建一个新的空 Session",
        args: {
          title: tool.schema.string().optional().describe("Session 标题"),
        },
        async execute(args, context) {
          try {
            const result = await client.session.create({
              body: args.title ? { title: args.title } : undefined,
            })
            
            if (!result.data) {
              return `❌ 创建失败`
            }

            // 打开 Session 选择器让用户看到
            await client.tui.openSessions()

            return `✅ 新 Session 已创建

ID: ${result.data.id}
标题: ${args.title || "无标题"}

📌 已打开 Session 选择器，请查看右侧任务栏`
          } catch (e) {
            return `❌ 错误: ${e}`
          }
        },
      }),

      "sessions-open": tool({
        description: "打开 Session 选择器（右侧任务栏）",
        args: {},
        async execute(args, context) {
          await client.tui.openSessions()
          return "📌 已打开 Session 选择器\n请查看右侧任务栏"
        },
      }),
    },
  }
}

export default TaskManagerPlugin