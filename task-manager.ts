import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import * as fs from "fs"
import * as path from "path"

/**
 * OpenCode Task Manager Plugin
 * 
 * 串行任务队列：自动执行下一个任务
 * 按项目目录隔离队列状态
 */

interface TaskResult {
  filename: string
  sessionId: string
  status: "pending" | "running" | "success" | "failed"
  summary?: string
  error?: string
}

interface QueueState {
  dirPath: string
  files: string[]
  prompt: string
  currentIndex: number
  results: TaskResult[]
  running: boolean
  currentSessionId?: string
  batchSize: number  // 每次执行的任务数量
}

// 按项目目录存储队列，避免不同项目/session之间的冲突
const queueMap = new Map<string, QueueState>()

// 获取或创建队列
function getQueue(directory: string): QueueState {
  if (!queueMap.has(directory)) {
    queueMap.set(directory, {
      dirPath: "",
      files: [],
      prompt: "",
      currentIndex: 0,
      results: [],
      running: false,
      batchSize: 1,
    })
  }
  return queueMap.get(directory)!
}

export const TaskManagerPlugin: Plugin = async ({ client, directory }) => {
  
  // 获取当前项目的队列
  const queue = getQueue(directory)
  
  // 获取 Session 结果摘要
  async function getSessionSummary(sessionId: string): Promise<string> {
    try {
      const messages = await client.session.messages({ path: { id: sessionId } })
      if (!messages.data || messages.data.length === 0) {
        return "无结果"
      }
      const lastMessage = messages.data[messages.data.length - 1]
      const parts = (lastMessage as any).parts || []
      const textParts = parts
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("\n")
      return textParts.slice(0, 500) + (textParts.length > 500 ? "..." : "")
    } catch {
      return "获取结果失败"
    }
  }

  // 等待 Session 完成（轮询）
  async function waitForSessionComplete(sessionId: string): Promise<boolean> {
    for (let i = 0; i < 1800; i++) { // 最多等1小时 (1800 * 2秒 = 3600秒)
      try {
        const result = await client.session.get({ path: { id: sessionId } })
        const session = result.data as any
        if (session?.status === "idle") {
          return true
        }
        if (session?.status === "error") {
          return false
        }
      } catch {
        // 忽略错误，继续轮询
      }
      // 等待2秒后再检查
      await new Promise(r => setTimeout(r, 2000))
    }
    return false
  }

  // 执行单个任务
  async function executeTask(filename: string): Promise<{ success: boolean; summary?: string; error?: string }> {
    // 提取纯文件名（不含路径）
    const baseName = path.basename(filename)
    // 文件绝对路径
    const absolutePath = path.resolve(queue.dirPath, filename)
    
    // 替换 prompt 中的 {filename}
    const userPrompt = queue.prompt.replace(/{filename}/g, filename)
    // 实际发送的 prompt：文件绝对路径 + 用户提示词
    const fullPrompt = `【文件路径：${absolutePath}】\n\n${userPrompt}`
    
    // Session 标题：文件名
    const title = baseName
    
    // 创建 Session
    const session = await client.session.create({
      body: { title }
    })
    if (!session.data) {
      return { success: false, error: "创建 Session 失败" }
    }
    
    const sessionId = session.data.id
    queue.currentSessionId = sessionId
    
    // 记录任务
    queue.results.push({
      filename,
      sessionId,
      status: "running",
    })
    
    // 发送 prompt 并等待完成
    try {
      await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text: fullPrompt }],
        },
      })
      
      // 获取结果
      const summary = await getSessionSummary(sessionId)
      return { success: true, summary }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  }

  // 执行所有任务（支持批量并行）
  async function executeAllTasks(): Promise<void> {
    while (queue.running && queue.currentIndex < queue.files.length) {
      // 计算本次要执行的任务数量
      const batchSize = queue.batchSize
      const endIndex = Math.min(queue.currentIndex + batchSize, queue.files.length)
      const batchFiles = queue.files.slice(queue.currentIndex, endIndex)
      
      // 并行执行一批任务
      const promises = batchFiles.map(filename => executeTask(filename))
      const results = await Promise.all(promises)
      
      // 更新任务状态
      for (let i = 0; i < batchFiles.length; i++) {
        const filename = batchFiles[i]
        const result = results[i]
        const task = queue.results.find(t => t.filename === filename && t.status === "running")
        if (task) {
          task.status = result.success ? "success" : "failed"
          task.summary = result.summary
          task.error = result.error
        }
      }
      
      queue.currentIndex = endIndex
    }
    
    queue.running = false
    queue.currentSessionId = undefined
  }

  return {
    tool: {
      "task-create": tool({
        description: "创建任务队列",
        args: {
          dir: tool.schema.string().describe("目录路径（支持相对路径或绝对路径）"),
          ext: tool.schema.string().optional().default("java").describe("文件后缀，如 java、ts、tsx"),
          recursive: tool.schema.boolean().optional().default(false).describe("递归扫描子目录"),
          prompt: tool.schema.string().describe("任务提示词，{filename} 代表文件名"),
          batchSize: tool.schema.number().optional().default(1).describe("每次并行执行的任务数量，默认1（串行）"),
        },
        async execute(args) {
          // 支持绝对路径和相对路径
          const dirPath = path.isAbsolute(args.dir) 
            ? args.dir 
            : path.resolve(directory, args.dir)
          
          if (!fs.existsSync(dirPath)) {
            return `❌ 目录不存在: ${dirPath}`
          }

          // 将文件后缀转换为正则
          // 支持 "java"、".java"、"ts"、".ts" 等格式
          let ext = args.ext || "java"
          if (!ext.startsWith(".")) {
            ext = "." + ext
          }
          const regex = new RegExp(`\\${ext}$`)

          // 递归扫描，返回相对于 baseDir 的路径
          function scanDirectory(baseDir: string, currentDir: string, regex: RegExp): string[] {
            const results: string[] = []
            const items = fs.readdirSync(currentDir)
            
            for (const item of items) {
              const fullPath = path.join(currentDir, item)
              const stat = fs.statSync(fullPath)
              
              if (stat.isDirectory()) {
                // 递归扫描子目录
                const subFiles = scanDirectory(baseDir, fullPath, regex)
                results.push(...subFiles)
              } else if (stat.isFile() && regex.test(item)) {
                // 计算相对于 baseDir 的路径
                const relativePath = path.relative(baseDir, fullPath)
                results.push(relativePath)
              }
            }
            return results
          }

          const files = args.recursive 
            ? scanDirectory(dirPath, dirPath, regex)
            : fs.readdirSync(dirPath).filter(f => regex.test(f) && fs.statSync(path.join(dirPath, f)).isFile())

          if (files.length === 0) {
            return `❌ 没有匹配 ".${ext}" 的文件\n目录: ${dirPath}`
          }

          // 更新队列属性（而不是替换整个对象）
          queue.dirPath = dirPath
          queue.files = files
          queue.prompt = args.prompt
          queue.currentIndex = 0
          queue.results = []
          queue.running = false
          queue.batchSize = args.batchSize || 1

          const batchInfo = queue.batchSize > 1 
            ? `\n并行数: ${queue.batchSize} 个任务/批次` 
            : ""
          let result = `✅ 队列已创建\n\n文件数: ${files.length}${batchInfo}\n\n`
          files.slice(0, 20).forEach((f, i) => result += `  ${i + 1}. ${f}\n`)
          if (files.length > 20) result += `  ... 还有 ${files.length - 20} 个\n`

          return result
        },
      }),

      "task-start": tool({
        description: "启动队列（自动执行所有任务）",
        args: {},
        async execute() {
          if (queue.files.length === 0) {
            return "❌ 队列为空，请先运行 task-create"
          }

          if (queue.running) {
            return `❌ 队列正在执行中\n当前: ${queue.currentIndex}/${queue.files.length}`
          }

          queue.running = true
          queue.currentIndex = 0
          queue.results = []

          // 打开 Session 选择器
          await client.tui.openSessions()

          // 启动执行（后台运行，不阻塞）
          executeAllTasks()

          return `✅ 队列已启动\n\n总任务: ${queue.files.length}\n并行数: ${queue.batchSize}\n\n📌 任务会自动执行（${queue.batchSize > 1 ? '并行' : '串行'}）\n📌 每个 Session 会显示在右侧任务栏\n\n运行 task-status 查看进度`
        },
      }),

      "task-status": tool({
        description: "查看队列状态",
        args: {},
        async execute() {
          if (queue.files.length === 0) {
            return "📭 队列为空"
          }

          const success = queue.results.filter(t => t.status === "success").length
          const failed = queue.results.filter(t => t.status === "failed").length
          const remaining = queue.files.length - queue.currentIndex

          let result = `📊 队列状态\n\n`
          result += `运行中: ${queue.running ? "✅" : "⏸️"}\n`
          result += `总计: ${queue.files.length}\n`
          result += `成功: ${success}\n`
          result += `失败: ${failed}\n`
          result += `待执行: ${remaining}\n`

          if (queue.currentSessionId) {
            const currentTask = queue.results.find(t => t.sessionId === queue.currentSessionId)
            if (currentTask) {
              result += `\n🔄 正在执行: ${currentTask.filename}`
            }
          } else if (!queue.running && queue.currentIndex >= queue.files.length && queue.files.length > 0) {
            result += `\n\n✅ 所有任务已完成`
          }

          return result
        },
      }),

      "task-stop": tool({
        description: "停止队列",
        args: {},
        async execute() {
          queue.running = false
          return `⏸️ 队列已停止\n\n已完成: ${queue.currentIndex}/${queue.files.length}`
        },
      }),

      "task-summary": tool({
        description: "汇总结果",
        args: {},
        async execute() {
          if (queue.results.length === 0) {
            return "📭 暂无结果，请先运行 task-start"
          }

          const success = queue.results.filter(t => t.status === "success")
          const failed = queue.results.filter(t => t.status === "failed")

          let result = `📊 任务汇总\n\n`
          result += `总计: ${queue.results.length}\n`
          result += `成功: ${success.length}\n`
          result += `失败: ${failed.length}\n`
          result += `${"─".repeat(40)}\n\n`

          for (const task of queue.results) {
            const icon = task.status === "success" ? "✅" : "❌"
            result += `${icon} ${task.filename}\n`
            if (task.summary) {
              result += `   ${task.summary.slice(0, 100)}${task.summary.length > 100 ? "..." : ""}\n`
            }
            if (task.error) {
              result += `   错误: ${task.error}\n`
            }
            result += `\n`
          }

          return result
        },
      }),

      "sessions": tool({
        description: "打开 Session 选择器",
        args: {},
        async execute() {
          await client.tui.openSessions()
          return "✅ 已打开 Session 选择器"
        },
      }),
    },
  }
}

export default TaskManagerPlugin