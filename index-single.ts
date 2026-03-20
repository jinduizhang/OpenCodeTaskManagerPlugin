import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"

/**
 * OpenCode Task Manager Plugin
 */

export const TaskManagerPlugin: Plugin = async ({ client, directory, project }) => {
  // 使用 toast 显示加载信息
  await client.tui.showToast({
    body: { message: "Task Manager Plugin 加载完成", variant: "info" }
  })

  return {
    tool: {
      "task-run": tool({
        description: "创建并执行任务（新Session），显示在右侧任务栏",
        args: {
          prompt: tool.schema.string().describe("任务内容"),
        },
        async execute(args, context) {
          // 显示 toast 确认工具被调用
          await client.tui.showToast({
            body: { message: "正在创建任务...", variant: "info" }
          })

          // 创建 Session
          const session = await client.session.create()
          
          if (!session.data) {
            await client.tui.showToast({
              body: { message: "创建 Session 失败", variant: "error" }
            })
            return "❌ 创建失败"
          }

          const sid = session.data.id

          // 发送 prompt
          await client.session.prompt({
            path: { id: sid },
            body: {
              parts: [{ type: "text", text: args.prompt }],
            },
          })

          // 打开 session 选择器
          await client.tui.openSessions()

          return `✅ 任务已创建

Session ID: ${sid}

已打开 Session 选择器，请查看右侧任务栏`
        },
      }),

      "sessions": tool({
        description: "打开 Session 选择器（右侧任务栏）",
        args: {},
        async execute() {
          await client.tui.openSessions()
          return "已打开 Session 选择器"
        },
      }),

      "new-session": tool({
        description: "创建新的空 Session",
        args: {},
        async execute() {
          const session = await client.session.create()
          
          if (!session.data) {
            return "❌ 创建失败"
          }

          // 打开选择器让用户看到
          await client.tui.openSessions()

          return `✅ 新 Session: ${session.data.id}\n\n已打开 Session 选择器`
        },
      }),
    },
  }
}

export default TaskManagerPlugin