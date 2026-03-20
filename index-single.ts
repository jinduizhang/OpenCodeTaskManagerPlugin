import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import * as fs from "fs"
import * as path from "path"

/**
 * OpenCode Task Manager Plugin
 * 
 * 串行任务队列：按目录文件依次创建 Session 执行任务
 * 通过 session.idle hook 监听任务完成，自动执行下一个
 */

// 队列状态
interface TaskResult {
  filename: string
  sessionId: string
  status: "pending" | "running" | "success" | "failed"
  summary?: string
  error?: string
}

interface QueueState {
  files: string[]
  prompt: string
  currentIndex: number
  results: TaskResult[]
  running: boolean
  currentSessionId?: string
}

let queue: QueueState = {
  files: [],
  prompt: "",
  currentIndex: 0,
  results: [],
  running: false,
}

export const TaskManagerPlugin: Plugin = async ({ client, directory }) => {
  
  // 创建并启动一个任务
  async function startTask(filename: string): Promise<string | null> {
    const prompt = queue.prompt.replace(/{filename}/g, filename)
    
    // 创建 Session
    const session = await client.session.create()
    if (!session.data) {
      return null
    }
    
    const sessionId = session.data.id
    queue.currentSessionId = sessionId
    
    // 记录任务
    queue.results.push({
      filename,
      sessionId,
      status: "running",
    })
    
    // 发送 prompt（不等待，让 event hook 处理完成）
    client.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [{ type: "text", text: prompt }],
      },
    }).catch(e => {
      // 错误处理
      const task = queue.results.find(t => t.sessionId === sessionId)
      if (task) {
        task.status = "failed"
        task.error = String(e)
      }
      // 启动下一个
      runNextTask()
    })
    
    return sessionId
  }
  
  // 执行下一个任务
  async function runNextTask(): Promise<void> {
    if (!queue.running) return
    if (queue.currentIndex >= queue.files.length) {
      queue.running = false
      queue.currentSessionId = undefined
      return
    }
    
    const filename = queue.files[queue.currentIndex]
    queue.currentIndex++
    
    await startTask(filename)
  }
  
  // 获取 Session 结果摘要
  async function getSessionSummary(sessionId: string): Promise<string> {
    try {
      const messages = await client.session.messages({ path: { id: sessionId } })
      if (!messages.data || messages.data.length === 0) {
        return "无结果"
      }
      
      // 获取最后一条消息的文本内容
      const lastMessage = messages.data[messages.data.length - 1]
      const parts = (lastMessage as any).parts || []
      const textParts = parts
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("\n")
      
      // 截取前 500 字符作为摘要
      return textParts.slice(0, 500) + (textParts.length > 500 ? "..." : "")
    } catch (e) {
      return `获取结果失败: ${e}`
    }
  }

  return {
    tool: {
      "queue-create": tool({
        description: "创建任务队列：扫描目录，为每个文件创建一个 Session 任务",
        args: {
          dir: tool.schema.string().describe("目录路径"),
          pattern: tool.schema.string().optional().default("*.ts").describe("文件匹配正则，如 .*\\.ts$"),
          prompt: tool.schema.string().describe("任务提示词，{filename} 代表当前文件名"),
        },
        async execute(args) {
          const dirPath = path.resolve(directory, args.dir)
          
          if (!fs.existsSync(dirPath)) {
            return `❌ 目录不存在: ${dirPath}`
          }

          // 使用正则匹配文件
          const regex = new RegExp(args.pattern || ".*\\.ts$")
          const files = fs.readdirSync(dirPath)
            .filter(f => regex.test(f))
            .filter(f => fs.statSync(path.join(dirPath, f)).isFile())

          if (files.length === 0) {
            return `❌ 没有匹配 "${args.pattern}" 的文件\n目录: ${dirPath}`
          }

          // 初始化队列
          queue = {
            files,
            prompt: args.prompt,
            currentIndex: 0,
            results: [],
            running: false,
          }

          let result = `✅ 队列已创建\n\n`
          result += `目录: ${dirPath}\n`
          result += `匹配: ${args.pattern}\n`
          result += `文件数: ${files.length}\n\n`
          result += `文件列表:\n`
          files.forEach((f, i) => {
            result += `  ${i + 1}. ${f}\n`
          })
          result += `\n📌 运行 queue-start 开始执行`

          return result
        },
      }),

      "queue-start": tool({
        description: "启动队列执行",
        args: {},
        async execute() {
          if (queue.files.length === 0) {
            return "❌ 队列为空，请先运行 queue-create"
          }

          if (queue.running) {
            return `❌ 队列正在执行中\n当前: ${queue.currentIndex}/${queue.files.length}`
          }

          queue.running = true
          queue.currentIndex = 0
          queue.results = []

          // 启动第一个任务
          await runNextTask()

          return `✅ 队列已启动\n\n总任务: ${queue.files.length}\n提示词: ${queue.prompt}\n\n📌 任务会串行执行，每个 Session 会显示在右侧任务栏`
        },
      }),

      "queue-status": tool({
        description: "查看队列执行状态",
        args: {},
        async execute() {
          if (queue.files.length === 0) {
            return "📭 队列为空"
          }

          const completed = queue.results.filter(t => t.status === "success" || t.status === "failed").length
          const running = queue.results.filter(t => t.status === "running").length
          const remaining = queue.files.length - queue.currentIndex

          let result = `📊 队列状态\n\n`
          result += `运行中: ${queue.running ? "✅" : "⏸️"}\n`
          result += `总计: ${queue.files.length}\n`
          result += `已完成: ${completed}\n`
          result += `执行中: ${running}\n`
          result += `待执行: ${remaining}\n`

          if (queue.currentSessionId) {
            result += `\n当前 Session: ${queue.currentSessionId.slice(0, 12)}...`
          }

          // 显示已完成任务摘要
          const completedTasks = queue.results.filter(t => t.status !== "pending" && t.status !== "running")
          if (completedTasks.length > 0) {
            result += `\n\n已完成任务:\n`
            completedTasks.slice(-5).forEach(t => {
              const icon = t.status === "success" ? "✅" : "❌"
              result += `  ${icon} ${t.filename}\n`
            })
          }

          return result
        },
      }),

      "queue-stop": tool({
        description: "停止队列执行",
        args: {},
        async execute() {
          queue.running = false
          return `⏸️ 队列已停止\n\n已完成: ${queue.currentIndex}/${queue.files.length}`
        },
      }),

      "queue-summary": tool({
        description: "汇总所有任务结果",
        args: {},
        async execute() {
          if (queue.results.length === 0) {
            return "📭 暂无执行结果"
          }

          const success = queue.results.filter(t => t.status === "success")
          const failed = queue.results.filter(t => t.status === "failed")

          let result = `📊 任务队列汇总\n\n`
          result += `总计: ${queue.results.length}\n`
          result += `成功: ${success.length}\n`
          result += `失败: ${failed.length}\n`
          result += `${"─".repeat(50)}\n\n`

          // 获取每个任务的结果摘要
          for (const task of queue.results) {
            const icon = task.status === "success" ? "✅" : task.status === "failed" ? "❌" : "⏳"
            result += `${icon} ${task.filename}\n`
            
            if (task.summary) {
              result += `   摘要: ${task.summary.slice(0, 100)}${task.summary.length > 100 ? "..." : ""}\n`
            }
            if (task.error) {
              result += `   错误: ${task.error}\n`
            }
            result += `\n`
          }

          return result
        },
      }),
    },

    // 监听 Session 完成事件
    "session.idle": async (input) => {
      const sessionId = input.sessionID
      
      // 检查是否是当前队列的 Session
      if (!queue.running || sessionId !== queue.currentSessionId) {
        return
      }

      // 获取结果
      const task = queue.results.find(t => t.sessionId === sessionId)
      if (task) {
        task.status = "success"
        task.summary = await getSessionSummary(sessionId)
      }

      // 启动下一个任务
      await runNextTask()
    },

    // 监听 Session 错误事件
    "session.error": async (input, output) => {
      const sessionId = input.sessionID
      
      // 检查是否是当前队列的 Session
      if (!queue.running || sessionId !== queue.currentSessionId) {
        return
      }

      // 记录错误
      const task = queue.results.find(t => t.sessionId === sessionId)
      if (task) {
        task.status = "failed"
        task.error = output.error || "未知错误"
      }

      // 启动下一个任务
      await runNextTask()
    },
  }
}

export default TaskManagerPlugin