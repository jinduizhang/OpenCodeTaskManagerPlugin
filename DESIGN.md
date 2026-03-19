# OpenCode Task Manager 插件 - 功能设计说明书

## 一、项目概述

### 1.1 项目名称
OpenCode Task Manager Plugin（任务管理插件）

### 1.2 项目目标
为 OpenCode 构建一个任务编排插件，能够：
- 调起子 agent/skill 执行智能体任务
- 管理任务队列（支持优先级）
- 监听任务执行状态
- 串行执行任务，每个任务隔离（独立 session）
- 提供 TUI 界面进行交互

### 1.3 目标用户
- 需要批量执行自动化任务的开发者
- 需要编排多个 agent 协作的团队
- 需要监控和管理长时间运行任务的用户

---

## 二、功能架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        Task Manager Plugin                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   TUI 层     │◄──►│   API 层     │◄──►│  存储层      │       │
│  │  (Ink TUI)   │    │  (Query API) │  │  (JSON Files) │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│         │                   │                   ▲               │
│         ▼                   ▼                   │               │
│  ┌──────────────────────────────────────────────────────┐       │
│  │                    核心逻辑层                          │       │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐      │       │
│  │  │ 任务队列   │  │ 任务执行器  │  │ 状态监控   │      │       │
│  │  │ (Priority) │  │ (Executor) │  │ (Monitor)  │      │       │
│  │  └────────────┘  └────────────┘  └────────────┘      │       │
│  └──────────────────────────────────────────────────────┘       │
│         │                   │                                    │
│         ▼                   ▼                                    │
│  ┌──────────────┐    ┌──────────────┐                          │
│  │  配置解析器   │    │  事件系统    │                          │
│  │  (YAML)      │    │  (Event Bus) │                          │
│  └──────────────┘    └──────────────┘                          │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                      OpenCode Integration Layer                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                │
│  │ Plugin SDK │  │ Session API│  │ Agent Tools│                │
│  └────────────┘  └────────────┘  └────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 核心模块划分

| 模块名称 | 职责 | 关键文件 |
|---------|------|---------|
| **任务队列** | 管理任务入队、出队、优先级排序 | `queue.ts` |
| **任务执行器** | 执行任务、创建隔离 session、调用 agent | `executor.ts` |
| **状态监控** | 监听任务状态变化、触发事件 | `monitor.ts` |
| **重试管理** | 处理失败任务的重试逻辑 | `retry.ts` |
| **TUI 界面** | 终端 UI 展示和交互 | `tui/` |
| **存储层** | 数据持久化（JSON 文件） | `storage/` |
| **配置解析** | 解析 YAML 任务配置 | `config/` |
| **查询 API** | 提供状态查询接口 | `api/` |
| **事件系统** | 事件发布/订阅 | `events.ts` |

---

## 三、数据模型设计

### 3.1 任务（Task）数据结构

```typescript
interface Task {
  // 基础信息
  id: string;                    // 唯一标识（UUID）
  title: string;                 // 任务标题
  description?: string;          // 任务描述
  
  // 执行配置
  agent: string;                 // 要调用的 agent 名称（如 "explore", "oracle"）
  skill?: string;                // 可选的 skill 名称
  prompt: string;                // 传递给 agent 的 prompt
  parameters?: Record<string, any>; // 额外参数
  
  // 调度配置
  priority: "high" | "medium" | "low";  // 优先级
  retryCount: number;            // 重试次数（用户指定，默认0）
  currentRetry: number;          // 当前重试次数
  
  // 状态信息
  status: TaskStatus;            // 任务状态
  sessionId?: string;            // 关联的 session ID
  result?: TaskResult;           // 执行结果
  error?: string;                // 错误信息
  
  // 时间戳
  createdAt: number;             // 创建时间
  startedAt?: number;            // 开始时间
  completedAt?: number;          // 完成时间
  updatedAt: number;             // 更新时间
  
  // 来源信息
  source: "manual" | "config" | "agent"; // 任务来源
}

type TaskStatus = 
  | "pending"      // 等待执行
  | "running"      // 执行中
  | "success"      // 执行成功
  | "failed"       // 执行失败（重试次数用尽）
  | "cancelled";   // 已取消

interface TaskResult {
  success: boolean;
  output?: string;               // 执行输出
  filesChanged?: string[];       // 修改的文件列表
  summary?: string;              // 结果摘要
}
```

### 3.2 任务队列状态

```typescript
interface QueueState {
  tasks: Task[];                 // 所有任务列表
  currentTask?: Task;            // 当前执行的任务
  isRunning: boolean;            // 队列是否在运行
  statistics: {
    total: number;
    pending: number;
    running: number;
    success: number;
    failed: number;
    cancelled: number;
  };
}
```

### 3.3 JSON 文件存储结构

```
.opencode/task-manager/
├── tasks.json          # 所有任务数据
├── queue.json          # 队列状态
├── logs/
│   ├── task-{id}.log   # 每个任务的执行日志
│   └── system.log      # 系统日志
└── archive/
    └── tasks-{date}.json  # 归档的历史任务
```

#### tasks.json 结构
```json
{
  "version": "1.0.0",
  "updatedAt": 1705312200000,
  "tasks": [
    {
      "id": "task-abc123",
      "title": "代码结构分析",
      "description": "分析项目代码结构",
      "agent": "explore",
      "skill": null,
      "prompt": "分析 src/ 目录的代码结构...",
      "parameters": {},
      "priority": "high",
      "retryCount": 2,
      "currentRetry": 0,
      "status": "running",
      "sessionId": "ses_xxx",
      "result": null,
      "error": null,
      "createdAt": 1705312200000,
      "startedAt": 1705312300000,
      "completedAt": null,
      "updatedAt": 1705312350000,
      "source": "config"
    }
  ]
}
```

#### queue.json 结构
```json
{
  "version": "1.0.0",
  "updatedAt": 1705312350000,
  "isRunning": true,
  "currentTaskId": "task-abc123",
  "statistics": {
    "total": 10,
    "pending": 5,
    "running": 1,
    "success": 3,
    "failed": 1,
    "cancelled": 0
  }
}
```

#### 任务日志文件结构 (logs/task-{id}.log)
```
[2024-01-15 10:30:00] [INFO] Task created
[2024-01-15 10:30:05] [INFO] Task started, session: ses_xxx
[2024-01-15 10:30:10] [DEBUG] Agent called: explore
[2024-01-15 10:32:45] [INFO] Task completed successfully
[2024-01-15 10:32:45] [INFO] Duration: 2m 40s
```

---

## 四、核心功能设计

### 4.1 任务队列管理

#### 4.1.1 入队操作
```
输入: Task 对象
处理:
  1. 验证任务参数完整性
  2. 生成唯一 ID
  3. 设置初始状态为 pending
  4. 根据 priority 插入队列对应位置
  5. 持久化到 tasks.json 文件
  6. 发送 task.created 事件
输出: Task ID
```

#### 4.1.2 出队操作
```
处理:
  1. 检查是否有正在执行的任务
  2. 如果有，返回 null
  3. 按 priority 排序获取最高优先级 pending 任务
  4. 同优先级按 createdAt 排序（FIFO）
  5. 更新状态为 running
  6. 返回任务
输出: Task 对象或 null
```

#### 4.1.3 优先级队列规则
```
优先级排序规则:
  1. high > medium > low
  2. 同优先级内按创建时间排序（先进先出）
  3. 高优先级任务可以"插队"到低优先级之前
```

### 4.2 任务执行器

#### 4.2.1 执行流程
```
输入: Task 对象
处理:
  1. 创建隔离的 child session
     - 调用 Session.create({ parentID: 当前sessionID })
     - 设置 session 标题和描述
  
  2. 注入任务上下文
     - 调用 session.prompt() 传递 prompt
  
  3. 调用指定的 agent/skill
     - 如果指定 skill: 调用 skill({ name: skillName })
     - 使用 delegate_task() 或 task() 工具
  
  4. 监听执行状态
     - 监听 session.idle 事件（完成）
     - 监听 session.error 事件（失败）
  
  5. 处理执行结果
     - 获取 session 输出
     - 提取修改的文件列表
     - 更新任务状态
  
输出: TaskResult 对象
```

#### 4.2.2 Session 隔离机制
```
每个任务创建独立的 child session:
  
  主 Session (parentID: null)
       │
       ├── Task 1 Session (parentID: 主sessionID)
       │        │
       │        └── 独立的上下文、消息、工具状态
       │
       ├── Task 2 Session (parentID: 主sessionID)
       │        │
       │        └── 独立的上下文、消息、工具状态
       │
       └── ...

隔离保证:
  - 每个任务无法访问其他任务的上下文
  - 任务之间不共享任何状态
  - 任务失败不影响其他任务
```

### 4.3 状态监控

#### 4.3.1 监控的事件源
```typescript
// OpenCode Plugin Hooks
const monitoredEvents = {
  // Session 事件
  "session.idle": "任务完成",
  "session.error": "任务失败",
  "session.status": "状态变化",
  
  // Tool 事件
  "tool.execute.before": "工具调用前",
  "tool.execute.after": "工具调用后",
  
  // 自定义事件
  "task.created": "任务创建",
  "task.started": "任务开始",
  "task.completed": "任务完成",
  "task.failed": "任务失败",
  "task.retrying": "任务重试中",
};
```

#### 4.3.2 状态流转图
```
         ┌─────────┐
         │ pending │
         └────┬────┘
              │ start
              ▼
         ┌─────────┐
         │ running │◄──────┐
         └────┬────┘       │
              │            │
    ┌─────────┼─────────┐  │
    │         │         │  │
    ▼         ▼         ▼  │
success   failed   cancelled
              │            │
              │ retry?     │
              └────────────┘
              │
              │ no more retries
              ▼
           failed (final)
```

### 4.4 重试机制

#### 4.4.1 重试策略
```
重试触发条件:
  - 任务执行失败（session.error 或返回错误）
  - 当前重试次数 < 配置的重试次数

重试流程:
  1. 捕获任务失败
  2. 检查 currentRetry < retryCount
  3. 如果可以重试:
     - currentRetry++
     - 状态恢复为 pending
     - 重新加入队列
     - 发送 task.retrying 事件
  4. 如果不能重试:
     - 标记为 failed (final)
     - 发送 task.failed 事件
```

#### 4.4.2 重试配置示例
```yaml
# YAML 配置中的重试设置
tasks:
  - name: "数据分析任务"
    agent: "explore"
    prompt: "分析 src/ 目录的代码结构"
    priority: "high"
    retryCount: 3  # 失败后重试3次
```

### 4.5 TUI 界面设计

#### 4.5.1 界面布局
```
┌─────────────────────────────────────────────────────────────┐
│ Task Manager                              [R]刷新 [A]添加 [Q]退出 │
├─────────────────────────────────────────────────────────────┤
│ 队列状态: ● 运行中  │ 待执行: 5  │ 成功: 12  │ 失败: 2        │
├─────────────────────────────────────────────────────────────┤
│ ┌─ 任务列表 ─────────────────────────────────────────────┐ │
│ │ ○ [HIGH] 分析代码结构           pending    2024-01-15   │ │
│ │ ● [MED ] 生成文档              running    00:02:35      │ │
│ │ ✓ [LOW ] 清理日志文件          success    2024-01-15    │ │
│ │ ✗ [MED ] 部署测试环境          failed     2024-01-15    │ │
│ │   └─ 重试 1/3                                           │ │
│ │ ○ [HIGH] 代码审查               pending    2024-01-15   │ │
│ └────────────────────────────────────────────────────────┘ │
│ ┌─ 任务详情 ─────────────────────────────────────────────┐ │
│ │ ID: task-abc123                                         │ │
│ │ Agent: explore                                          │ │
│ │ 状态: running                                           │ │
│ │ 开始时间: 2024-01-15 10:30:00                           │ │
│ │ 执行时长: 00:02:35                                      │ │
│ │ Prompt: 分析 src/ 目录的代码结构...                      │ │
│ │                                                         │ │
│ │ [Enter]查看日志 [C]取消 [R]重试                         │ │
│ └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

#### 4.5.2 交互操作
| 快捷键 | 功能 | 说明 |
|--------|------|------|
| `↑/↓` | 选择任务 | 在任务列表中移动 |
| `Enter` | 查看详情 | 显示任务详细信息和日志 |
| `A` | 添加任务 | 打开添加任务对话框 |
| `C` | 取消任务 | 取消选中的待执行任务 |
| `R` | 重试任务 | 重试失败的任务 |
| `F` | 刷新 | 刷新任务状态 |
| `Q/Esc` | 退出 | 退出 TUI 界面 |

#### 4.5.3 添加任务对话框
```
┌─ 添加新任务 ────────────────────────────────────────────┐
│                                                         │
│ 标题: [分析代码结构____________________]                │
│                                                         │
│ Agent: [explore ▼]  Skill: [无 ▼]                      │
│                                                         │
│ Prompt:                                                 │
│ ┌─────────────────────────────────────────────────────┐│
│ │分析 src/ 目录的代码结构，找出主要模块和依赖关系      ││
│ │_____________________________________________________││
│ └─────────────────────────────────────────────────────┘│
│                                                         │
│ 优先级: ○ High  ● Medium  ○ Low                        │
│                                                         │
│ 重试次数: [3___]                                        │
│                                                         │
│            [确定]  [取消]                               │
└─────────────────────────────────────────────────────────┘
```

### 4.6 配置文件设计

#### 4.6.1 YAML 配置格式
```yaml
# .opencode/task-manager/tasks.yaml

# 任务队列配置
settings:
  autoStart: true        # OpenCode 启动时自动开始执行队列
  maxConcurrent: 1       # 最大并发数（串行=1）
  logLevel: "info"       # 日志级别: debug, info, warn, error

# 任务列表
tasks:
  # 示例1：代码分析任务
  - name: "代码结构分析"
    description: "分析项目代码结构"
    agent: "explore"
    prompt: |
      分析 src/ 目录的代码结构：
      1. 列出主要模块
      2. 分析模块间的依赖关系
      3. 生成架构图描述
    priority: "high"
    retryCount: 2
    
  # 示例2：使用 skill 的任务
  - name: "Git 发布"
    description: "创建新的 release"
    skill: "git-release"
    parameters:
      version: "1.0.0"
      branch: "main"
    priority: "medium"
    retryCount: 1
    
  # 示例3：低优先级清理任务
  - name: "清理临时文件"
    agent: "build"
    prompt: "删除 tmp/ 目录下所有超过7天的文件"
    priority: "low"
    retryCount: 0
```

#### 4.6.2 配置加载逻辑
```
启动时:
  1. 读取 .opencode/task-manager/tasks.yaml
  2. 验证配置格式
  3. 如果 autoStart=true，将所有任务加入队列
  4. 读取 tasks.json 和 queue.json，恢复未完成的任务

运行时:
  - 监听配置文件变化
  - 检测到变化时重新加载
  - 新任务自动加入队列（pending 状态）
```

### 4.7 查询 API 设计

#### 4.7.1 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/task-manager/tasks` | 获取所有任务列表 |
| GET | `/api/task-manager/tasks/:id` | 获取单个任务详情 |
| GET | `/api/task-manager/queue` | 获取队列状态 |
| GET | `/api/task-manager/tasks/:id/logs` | 获取任务日志 |
| POST | `/api/task-manager/tasks` | 创建新任务 |
| POST | `/api/task-manager/tasks/:id/cancel` | 取消任务 |
| POST | `/api/task-manager/tasks/:id/retry` | 重试任务 |
| DELETE | `/api/task-manager/tasks/:id` | 删除任务记录 |

#### 4.7.2 响应示例
```json
// GET /api/task-manager/tasks
{
  "tasks": [
    {
      "id": "task-abc123",
      "title": "代码结构分析",
      "agent": "explore",
      "status": "running",
      "priority": "high",
      "progress": 45,
      "startedAt": 1705312200000,
      "duration": 155000
    }
  ],
  "statistics": {
    "total": 10,
    "pending": 5,
    "running": 1,
    "success": 3,
    "failed": 1
  }
}
```

### 4.8 事件系统设计

#### 4.8.1 事件类型定义
```typescript
type TaskEvent = 
  | { type: "task.created"; payload: Task }
  | { type: "task.started"; payload: Task }
  | { type: "task.progress"; payload: { taskId: string; progress: number } }
  | { type: "task.completed"; payload: { taskId: string; result: TaskResult } }
  | { type: "task.failed"; payload: { taskId: string; error: string } }
  | { type: "task.retrying"; payload: { taskId: string; attempt: number } }
  | { type: "task.cancelled"; payload: { taskId: string } }
  | { type: "queue.started"; payload: {} }
  | { type: "queue.idle"; payload: {} };  // 所有任务完成
```

#### 4.8.2 事件监听者
```
事件发布者: 任务执行器、状态监控器

事件订阅者:
  - TUI 界面：更新显示
  - 日志系统：记录日志
  - 通知系统：发送通知（可选）
  - API 层：推送 WebSocket 消息（可选）
```

---

## 五、OpenCode 集成方案（核心）

> **这是整个设计最关键的部分，决定了插件能否正常工作。**

### 5.1 OpenCode 插件机制概述

OpenCode 支持两种插件加载方式：

| 加载方式 | 路径 | 说明 |
|---------|------|------|
| **项目级插件** | `.opencode/plugins/` | 随项目配置，仅当前项目可用 |
| **全局级插件** | `~/.config/opencode/plugins/` | 所有项目共享 |
| **npm 包** | `opencode.json` 中配置 | 从 npm 安装 |

**插件加载顺序**：
```
1. 内置插件（OpenCode 核心）
2. 项目级插件目录 (.opencode/plugins/)
3. 全局级插件目录 (~/.config/opencode/plugins/)
4. opencode.json 中配置的 npm 插件
```

### 5.2 插件注册方式

#### 方式一：项目级插件（推荐）

```
your-project/
├── .opencode/
│   ├── plugins/
│   │   └── task-manager/
│   │       ├── index.ts        # 插件入口（必须）
│   │       └── package.json    # 依赖配置
│   └── task-manager/           # 任务管理数据目录
│       ├── tasks.yaml
│       └── tasks.json
└── opencode.json               # 项目配置（可选）
```

#### 方式二：全局插件

```
~/.config/opencode/
├── plugins/
│   └── task-manager/
│       ├── index.ts
│       └── package.json
└── opencode.json
```

#### 方式三：npm 包发布

```json
// opencode.json
{
  "plugin": ["opencode-task-manager"]
}
```

### 5.3 插件入口文件结构

```typescript
// .opencode/plugins/task-manager/index.ts

import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"

// 导出插件（必须默认导出）
export default {
  name: "task-manager",
  version: "1.0.0",
  
  // 插件主函数
  async setup(ctx) {
    // ctx 是 OpenCode 注入的插件上下文
    // 初始化存储、队列、执行器等
    
    return {
      // 返回 hooks 和 tools
    }
  }
} satisfies Plugin

// 或者使用函数式导出
export const TaskManagerPlugin: Plugin = async (ctx) => {
  // 初始化逻辑
  return {
    // hooks 和 tools
  }
}
```

### 5.4 Plugin Context (ctx) API

OpenCode 注入给插件的上下文对象：

```typescript
interface PluginContext {
  // OpenCode SDK Client
  client: {
    session: {
      list: () => Promise<Session[]>
      get: (id: string) => Promise<Session>
      create: (options: SessionCreateOptions) => Promise<Session>
      prompt: (sessionId: string, parts: Part[]) => Promise<void>
      delete: (id: string) => Promise<void>
    },
    app: {
      log: (options: LogOptions) => Promise<void>
    }
  }
  
  // 项目信息
  project: {
    id: string           // 项目唯一标识
    worktree: string     // Git worktree 路径
    vcs: "git" | undefined
  }
  
  // 当前工作目录
  directory: string
  
  // Git worktree 根目录
  worktree: string
  
  // Bun Shell（执行命令）
  $: BunShell
  
  // 工具注册函数
  tool: {
    register: (name: string, definition: ToolDefinition) => void
  }
}
```

### 5.4.1 与 OpenCode 交互的四种方式

```
┌─────────────────────────────────────────────────────────────────┐
│                    与 OpenCode 交互方式                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  方式1: SDK Client API ──────────────────────────────────────►  │
│  │   ctx.client.session.create()                               │
│  │   ctx.client.session.prompt()                               │
│  │   ctx.client.app.log()                                      │
│  │                                                              │
│  方式2: Plugin Hooks ─────────────────────────────────────────► │
│  │   return { "session.idle": handler }                        │
│  │   return { "tool.execute.before": handler }                 │
│  │                                                              │
│  方式3: 自定义工具 ───────────────────────────────────────────► │
│  │   return { tool: { "task-add": toolDef } }                  │
│  │   供 agent 通过 tool 调用                                    │
│  │                                                              │
│  方式4: 直接调用 task() ──────────────────────────────────────► │
│      在插件内部调用 OpenCode 的 task 工具                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.5 与 OpenCode 交互详解

#### 方式一：通过 SDK Client API 交互

这是最直接的交互方式，OpenCode 通过 `ctx.client` 暴露 SDK 客户端：

```typescript
// 在插件中使用 SDK Client

export const TaskManagerPlugin: Plugin = async (ctx) => {
  const { client } = ctx
  
  // ========== 1. Session 操作 ==========
  
  // 创建新的 session
  const newSession = await client.session.create({
    parentID: "ses_parent123",     // 可选，父 session ID
    title: "任务执行 Session",
    data: {                         // 可选，自定义数据
      taskId: "task-001",
      source: "task-manager"
    }
  })
  console.log("新 Session ID:", newSession.id)
  
  // 获取 session 列表
  const sessions = await client.session.list()
  sessions.forEach(s => {
    console.log(`Session: ${s.id}, Title: ${s.title}`)
  })
  
  // 获取特定 session
  const session = await client.session.get("ses_xxx")
  console.log("Session 状态:", session.status)
  
  // 向 session 发送 prompt（触发 agent 执行）
  await client.session.prompt("ses_xxx", [
    { type: "text", text: "分析 src/ 目录的代码结构" }
  ])
  
  // 删除 session
  await client.session.session.delete("ses_xxx")
  
  // ========== 2. 日志操作 ==========
  
  // 记录日志到 OpenCode
  await client.app.log({
    service: "task-manager",
    level: "info",
    message: "任务创建成功",
    metadata: {
      taskId: "task-001",
      priority: "high"
    }
  })
  
  // 错误日志
  await client.app.log({
    service: "task-manager",
    level: "error",
    message: "任务执行失败",
    metadata: {
      taskId: "task-001",
      error: "Agent not found"
    }
  })
  
  // ========== 3. 获取当前 session 信息 ==========
  
  // 注意：当前 session ID 需要通过其他方式获取
  // 方法1: 从 project 信息推断
  const projectSessions = await client.session.list()
  const currentSession = projectSessions.find(s => /* 条件 */)
  
  // 方法2: 通过 hook 参数获取（见下方）
}
```

#### 方式二：通过 Plugin Hooks 交互

OpenCode 提供了丰富的事件钩子，插件可以监听这些事件：

```typescript
export const TaskManagerPlugin: Plugin = async (ctx) => {
  
  return {
    // ========== 1. Session 生命周期 Hooks ==========
    
    // Session 创建时触发
    "session.created": async (input, output) => {
      // input.sessionID - 新创建的 session ID
      // input.session - session 对象
      console.log("新 Session 创建:", input.sessionID)
      
      // 检查是否是我们的任务 session
      if (input.session?.data?.taskManager) {
        await onTaskSessionCreated(input.sessionID)
      }
    },
    
    // Session 变为空闲状态（执行完成）时触发
    "session.idle": async (input, output) => {
      // input.sessionID - 完成的 session ID
      console.log("Session 完成:", input.sessionID)
      
      // 查找对应的任务，更新状态
      const task = await findTaskBySessionId(input.sessionID)
      if (task) {
        await updateTaskStatus(task.id, "success")
        await startNextTask()  // 执行下一个任务
      }
    },
    
    // Session 出错时触发
    "session.error": async (input, output) => {
      // input.sessionID - 出错的 session ID
      // output.error - 错误信息
      console.error("Session 错误:", input.sessionID, output.error)
      
      // 查找对应的任务，处理失败
      const task = await findTaskBySessionId(input.sessionID)
      if (task) {
        await handleTaskFailure(task, output.error)
      }
    },
    
    // Session 状态变化时触发
    "session.status": async (input, output) => {
      // input.sessionID - session ID
      // input.status - 新状态
      // output.previousStatus - 之前的状态
      console.log(`Session ${input.sessionID}: ${output.previousStatus} -> ${input.status}`)
    },
    
    // Session 更新时触发
    "session.updated": async (input, output) => {
      // 可以用于监听 session 数据变化
    },
    
    // Session 删除时触发
    "session.deleted": async (input, output) => {
      // 清理关联的任务数据
      await cleanupTaskSession(input.sessionID)
    },
    
    // ========== 2. Tool 执行 Hooks ==========
    
    // 工具执行前触发（可以拦截或修改）
    "tool.execute.before": async (input, output) => {
      // input.tool - 工具名称
      // input.args - 工具参数
      console.log(`工具即将执行: ${input.tool}`)
      
      // 可以阻止某些工具执行
      if (input.tool === "read" && input.args.filePath.includes(".env")) {
        throw new Error("禁止读取 .env 文件")
      }
      
      // 可以修改参数
      // output.args = { ...input.args, modified: true }
    },
    
    // 工具执行后触发
    "tool.execute.after": async (input, output) => {
      // input.tool - 工具名称
      // input.args - 工具参数
      // output.result - 执行结果
      console.log(`工具执行完成: ${input.tool}, 成功: ${output.success}`)
      
      // 监听 task 工具的调用
      if (input.tool === "task") {
        await onSubagentInvoked(input.args)
      }
    },
    
    // ========== 3. 文件操作 Hooks ==========
    
    // 文件编辑时触发
    "file.edited": async (input, output) => {
      // input.path - 文件路径
      // input.content - 新内容
      console.log("文件被编辑:", input.path)
      
      // 可以用于跟踪任务修改的文件
      await trackFileChange(input.path)
    },
    
    // ========== 4. Shell 环境 Hook ==========
    
    // 注入环境变量到所有 shell 执行
    "shell.env": async (input, output) => {
      output.env.TASK_MANAGER_ACTIVE = "1"
      output.env.TASK_MANAGER_VERSION = "1.0.0"
    },
    
    // ========== 5. TUI 相关 Hooks ==========
    
    // 向 TUI 提示框追加内容
    "tui.prompt.append": async (input, output) => {
      // 可以在用户输入框显示提示信息
      output.content = "提示: 当前有 3 个待执行任务"
    },
    
    // 显示 toast 通知
    "tui.toast.show": async (input, output) => {
      // 可以触发 toast 显示
    },
    
    // ========== 6. 通用事件监听 ==========
    
    // 监听所有事件
    event: async ({ event }) => {
      console.log(`事件: ${event.type}`, event)
      
      switch (event.type) {
        case "session.idle":
          await handleSessionIdle(event.sessionId)
          break
        case "session.error":
          await handleSessionError(event.sessionId, event.error)
          break
        // ... 其他事件
      }
    }
  }
}
```

#### 方式三：通过自定义工具交互

插件可以注册自定义工具，让 agent 通过调用工具与插件交互：

```typescript
import { tool } from "@opencode-ai/plugin"

export const TaskManagerPlugin: Plugin = async (ctx) => {
  
  // 注册 "task-add" 工具
  const taskAddTool = tool({
    // 工具描述（agent 会看到这个描述）
    description: "向任务管理器添加一个新任务。任务会在独立的 session 中串行执行。",
    
    // 参数定义（使用 Zod schema）
    args: {
      title: tool.schema.string()
        .describe("任务标题，简短描述任务内容"),
        
      agent: tool.schema.string()
        .describe("要调用的 agent 名称，如: explore, oracle, build"),
        
      prompt: tool.schema.string()
        .describe("传递给 agent 的详细任务描述"),
        
      priority: tool.schema.enum(["high", "medium", "low"])
        .optional()
        .default("medium")
        .describe("任务优先级"),
        
      retryCount: tool.schema.number()
        .optional()
        .default(0)
        .describe("失败后重试次数"),
        
      skill: tool.schema.string()
        .optional()
        .describe("可选的 skill 名称，任务执行前会加载此 skill"),
    },
    
    // 执行函数
    async execute(args, context) {
      // context 包含:
      // - context.directory - 工作目录
      // - context.worktree - git worktree
      // - context.sessionID - 当前 session ID（如果可用）
      
      console.log("收到 task-add 调用:", args)
      
      // 创建任务
      const task = await queueManager.addTask({
        title: args.title,
        agent: args.agent,
        prompt: args.prompt,
        priority: args.priority,
        retryCount: args.retryCount,
        skill: args.skill,
        source: "agent",  // 标记来源是 agent 调用
        parentSessionId: context.sessionID  // 关联调用者的 session
      })
      
      // 返回结果给 agent
      return {
        success: true,
        taskId: task.id,
        message: `任务已添加到队列。当前队列中有 ${queueManager.getPendingCount()} 个待执行任务。`,
        estimatedWait: `${queueManager.getEstimatedWaitTime()} 分钟`
      }
    }
  })
  
  // 注册 "task-list" 工具
  const taskListTool = tool({
    description: "列出任务管理器中的所有任务及其状态",
    args: {
      status: tool.schema.enum(["pending", "running", "success", "failed", "all"])
        .optional()
        .default("all")
        .describe("筛选条件，只显示指定状态的任务")
    },
    async execute(args, context) {
      const tasks = await storage.loadTasks()
      const filtered = args.status === "all" 
        ? tasks 
        : tasks.filter(t => t.status === args.status)
      
      return {
        total: filtered.length,
        tasks: filtered.map(t => ({
          id: t.id,
          title: t.title,
          agent: t.agent,
          status: t.status,
          priority: t.priority,
          createdAt: new Date(t.createdAt).toISOString(),
          sessionId: t.sessionId
        }))
      }
    }
  })
  
  // 注册 "task-status" 工具
  const taskStatusTool = tool({
    description: "查询指定任务的详细状态和执行结果",
    args: {
      taskId: tool.schema.string().describe("任务 ID")
    },
    async execute(args, context) {
      const task = await storage.getTask(args.taskId)
      if (!task) {
        return {
          success: false,
          error: `任务 ${args.taskId} 不存在`
        }
      }
      
      return {
        success: true,
        task: {
          id: task.id,
          title: task.title,
          status: task.status,
          agent: task.agent,
          priority: task.priority,
          currentRetry: task.currentRetry,
          result: task.result,
          error: task.error,
          createdAt: new Date(task.createdAt).toISOString(),
          startedAt: task.startedAt ? new Date(task.startedAt).toISOString() : null,
          completedAt: task.completedAt ? new Date(task.completedAt).toISOString() : null,
          sessionId: task.sessionId
        }
      }
    }
  })
  
  // 注册 "task-cancel" 工具
  const taskCancelTool = tool({
    description: "取消一个待执行的任务",
    args: {
      taskId: tool.schema.string().describe("要取消的任务 ID")
    },
    async execute(args, context) {
      const task = await storage.getTask(args.taskId)
      if (!task) {
        return { success: false, error: "任务不存在" }
      }
      if (task.status !== "pending") {
        return { success: false, error: `只能取消 pending 状态的任务，当前状态: ${task.status}` }
      }
      
      await queueManager.cancelTask(args.taskId)
      return { success: true, message: `任务 ${args.taskId} 已取消` }
    }
  })
  
  // 返回所有工具
  return {
    tool: {
      "task-add": taskAddTool,
      "task-list": taskListTool,
      "task-status": taskStatusTool,
      "task-cancel": taskCancelTool
    }
  }
}
```

**Agent 调用示例**：

用户说："帮我添加一个代码分析任务"

Agent 会这样调用：
```json
{
  "tool": "task-add",
  "args": {
    "title": "代码结构分析",
    "agent": "explore",
    "prompt": "分析 src/ 目录的代码结构，找出主要模块和依赖关系",
    "priority": "high",
    "retryCount": 2
  }
}
```

插件返回：
```json
{
  "success": true,
  "taskId": "task-abc123",
  "message": "任务已添加到队列。当前队列中有 3 个待执行任务。",
  "estimatedWait": "5 分钟"
}
```

#### 方式四：在插件内部调用 task() 工具

插件内部可以直接调用 OpenCode 的 task 工具来创建子 agent：

```typescript
// src/executor.ts

export class TaskExecutor {
  
  /**
   * 方案A: 通过 SDK Client 创建 session 并调用 agent
   */
  async executeViaSDK(task: Task): Promise<void> {
    const { client } = this.ctx
    
    // 1. 创建 child session
    const session = await client.session.create({
      parentID: this.getParentSessionId(),
      title: `[TaskManager] ${task.title}`,
      data: {
        taskId: task.id,
        taskManager: true
      }
    })
    
    // 2. 保存 session 关联
    await this.storage.updateTask(task.id, {
      sessionId: session.id,
      status: "running",
      startedAt: Date.now()
    })
    
    // 3. 构建 prompt
    let promptText = task.prompt
    
    // 如果指定了 agent，添加指令
    if (task.agent) {
      promptText = `[使用 ${task.agent} agent 执行以下任务]\n\n${promptText}`
    }
    
    // 如果指定了 skill，添加 skill 加载指令
    if (task.skill) {
      promptText = `[首先加载 skill: ${task.skill}]\n\n${promptText}`
    }
    
    // 4. 发送 prompt 到 session（触发 agent 响应）
    await client.session.prompt(session.id, [
      { type: "text", text: promptText }
    ])
    
    // 5. 等待完成（通过 session.idle hook 处理）
    // 不需要在这里等待，hook 会异步处理
  }
  
  /**
   * 方案B: 直接调用 OpenCode 的 task 工具（如果插件环境支持）
   */
  async executeViaTaskTool(task: Task): Promise<void> {
    // 注意：这需要插件能够访问 task 工具
    // 可能需要通过某种方式调用
    
    // OpenCode 内部的 task 工具签名：
    // task(subagent_type, category, prompt, description, run_in_background, load_skills, session_id)
    
    const result = await this.invokeTool("task", {
      subagent_type: task.agent,     // agent 类型
      prompt: task.prompt,            // 任务描述
      description: task.title,        // 简短描述
      run_in_background: false,       // 串行执行，同步等待
      load_skills: task.skill ? [task.skill] : []
    })
    
    // 处理结果...
  }
  
  /**
   * 获取父 session ID
   */
  private getParentSessionId(): string | undefined {
    // 从插件上下文或全局状态获取
    // 可能需要扩展 PluginContext 接口
    return this.currentSessionId
  }
}
```

### 5.6 完整交互流程示例

```typescript
// 完整的交互流程代码示例

export const TaskManagerPlugin: Plugin = async (ctx) => {
  // 初始化
  const storage = new FileStorage(ctx.directory)
  const queueManager = new QueueManager({ storage, ctx })
  const executor = new TaskExecutor({ ctx, storage })
  
  // 当前 session ID（从 hook 中捕获）
  let currentSessionId: string | undefined
  
  return {
    // ========== 工具注册 ==========
    tool: {
      "task-add": tool({
        description: "添加任务到队列",
        args: {
          title: tool.schema.string(),
          agent: tool.schema.string(),
          prompt: tool.schema.string(),
          priority: tool.schema.enum(["high", "medium", "low"]).optional(),
          retryCount: tool.schema.number().optional()
        },
        async execute(args) {
          const task = await queueManager.addTask({
            ...args,
            priority: args.priority || "medium",
            retryCount: args.retryCount || 0,
            source: "agent",
            parentSessionId: currentSessionId
          })
          
          return {
            success: true,
            taskId: task.id,
            message: `任务已添加，当前队列: ${queueManager.getPendingCount()} 个待执行`
          }
        }
      })
    },
    
    // ========== Hooks ==========
    
    // 捕获当前 session
    "session.created": async (input) => {
      if (!currentSessionId) {
        currentSessionId = input.sessionID
      }
    },
    
    // 监听任务 session 完成
    "session.idle": async (input) => {
      const task = await storage.findTaskBySessionId(input.sessionID)
      if (task) {
        // 获取 session 结果
        const session = await ctx.client.session.get(input.sessionID)
        
        // 更新任务状态
        await storage.updateTask(task.id, {
          status: "success",
          completedAt: Date.now(),
          result: {
            success: true,
            summary: session.summary || "执行完成"
          }
        })
        
        // 执行下一个任务
        await queueManager.processNext()
      }
    },
    
    // 监听任务 session 失败
    "session.error": async (input, output) => {
      const task = await storage.findTaskBySessionId(input.sessionID)
      if (task) {
        // 处理重试
        if (task.currentRetry < task.retryCount) {
          await storage.updateTask(task.id, {
            currentRetry: task.currentRetry + 1,
            status: "pending"
          })
          await queueManager.processNext()
        } else {
          await storage.updateTask(task.id, {
            status: "failed",
            completedAt: Date.now(),
            error: output.error
          })
          await queueManager.processNext()
        }
      }
    }
  }
}
```

```typescript
// .opencode/plugins/task-manager/index.ts

import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { QueueManager } from "./src/queue"
import { TaskExecutor } from "./src/executor"
import { TaskMonitor } from "./src/monitor"
import { FileStorage } from "./src/storage"
import { ConfigParser } from "./src/config"
import { EventBus } from "./src/events"

export const TaskManagerPlugin: Plugin = async (ctx) => {
  // ========== 1. 初始化核心组件 ==========
  
  const storage = new FileStorage(ctx.directory)
  const eventBus = new EventBus()
  const config = await ConfigParser.load(ctx.directory)
  
  const queueManager = new QueueManager({
    storage,
    eventBus,
    config
  })
  
  const executor = new TaskExecutor({
    client: ctx.client,        // OpenCode SDK Client
    project: ctx.project,      // 项目信息
    eventBus,
    storage
  })
  
  const monitor = new TaskMonitor({
    eventBus,
    storage,
    executor
  })
  
  // ========== 2. 加载持久化数据 ==========
  
  await queueManager.restore()
  
  // ========== 3. 启动队列处理循环 ==========
  
  queueManager.startProcessing()
  
  // ========== 4. 注册自定义工具（供 agent 调用）==========
  
  const taskAddTool = tool({
    description: "添加任务到任务管理器队列",
    args: {
      title: tool.schema.string().describe("任务标题"),
      agent: tool.schema.string().describe("要调用的 agent 名称"),
      prompt: tool.schema.string().describe("传递给 agent 的 prompt"),
      priority: tool.schema.enum(["high", "medium", "low"]).optional().default("medium"),
      retryCount: tool.schema.number().optional().default(0),
      skill: tool.schema.string().optional().describe("可选的 skill 名称"),
    },
    async execute(args, context) {
      const task = await queueManager.addTask({
        title: args.title,
        agent: args.agent,
        prompt: args.prompt,
        priority: args.priority,
        retryCount: args.retryCount,
        skill: args.skill,
        source: "manual"
      })
      return {
        success: true,
        taskId: task.id,
        message: `任务已添加到队列，ID: ${task.id}`
      }
    }
  })
  
  const taskListTool = tool({
    description: "列出任务管理器中的所有任务",
    args: {},
    async execute(args, context) {
      const tasks = await storage.loadTasks()
      return {
        total: tasks.length,
        tasks: tasks.map(t => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority
        }))
      }
    }
  })
  
  const taskStatusTool = tool({
    description: "查询指定任务的状态",
    args: {
      taskId: tool.schema.string().describe("任务 ID")
    },
    async execute(args, context) {
      const task = await storage.getTask(args.taskId)
      if (!task) {
        return { success: false, error: "任务不存在" }
      }
      return {
        success: true,
        task
      }
    }
  })
  
  // ========== 5. 注册事件监听 Hooks ==========
  
  const eventHandler = async ({ event }: { event: any }) => {
    switch (event.type) {
      case "session.idle":
        // Session 完成，可能是我们的任务完成了
        await monitor.onSessionIdle(event.sessionId)
        break
        
      case "session.error":
        // Session 出错
        await monitor.onSessionError(event.sessionId, event.error)
        break
        
      case "session.status":
        // Session 状态变化
        await monitor.onSessionStatus(event.sessionId, event.status)
        break
    }
  }
  
  // ========== 6. 注册 TUI 启动命令 ==========
  
  const startTUITool = tool({
    description: "启动任务管理器 TUI 界面",
    args: {},
    async execute(args, context) {
      // TUI 启动逻辑（后续实现）
      // 需要通过 ctx.$ 或 subprocess 启动
      return {
        success: true,
        message: "TUI 已启动，请查看新终端窗口"
      }
    }
  })
  
  // ========== 7. 返回插件定义 ==========
  
  return {
    // 注册自定义工具
    tool: {
      "task-add": taskAddTool,
      "task-list": taskListTool,
      "task-status": taskStatusTool,
      "task-tui": startTUITool
    },
    
    // 注册事件监听
    event: eventHandler,
    
    // 注册特定事件的 hooks
    "session.idle": async (input, output) => {
      await monitor.onSessionIdle(input.sessionID)
    },
    
    "session.error": async (input, output) => {
      await monitor.onSessionError(input.sessionID, output.error)
    },
    
    "session.created": async (input, output) => {
      // 新 session 创建时的处理
      await monitor.onSessionCreated(input.sessionID)
    },
    
    // Shell 环境注入（可选）
    "shell.env": async (input, output) => {
      output.env.TASK_MANAGER_PLUGIN = "1"
    }
  }
}

export default TaskManagerPlugin
```

### 5.7 TUI 如何启动

TUI 启动有两种方案：

#### 方案一：独立进程启动（推荐）

```typescript
// 在 plugin 中注册 TUI 启动工具
const startTUITool = tool({
  description: "启动任务管理器 TUI",
  args: {},
  async execute(args, context) {
    // 使用 Bun.spawn 启动独立进程
    const tuiProcess = Bun.spawn([
      "bun", "run", 
      join(context.directory, ".opencode/plugins/task-manager/src/tui/index.tsx")
    ], {
      cwd: context.directory,
      stdout: "inherit",
      stdin: "inherit"
    })
    
    return {
      success: true,
      pid: tuiProcess.pid,
      message: "TUI 已启动"
    }
  }
})
```

#### 方案二：使用 TUI 工具（如果 OpenCode 支持）

```typescript
// 检查 OpenCode 是否提供 TUI 容器
// 类似 oh-my-opencode 的方式

// 通过 tui.prompt.append hook 向当前 TUI 注入内容
"tui.prompt.append": async (input, output) => {
  output.content = "Task Manager Panel"
}
```

#### 方案三：TUI 作为独立命令

```typescript
// 在 package.json 中添加 bin
{
  "bin": {
    "task-manager-tui": "./src/tui/cli.ts"
  }
}

// cli.ts
#!/usr/bin/env bun
import { render } from "ink"
import { TaskManagerApp } from "./app"

render(<TaskManagerApp />)
```

用户通过命令启动：
```bash
bun run .opencode/plugins/task-manager/src/tui/cli.ts
# 或
task-manager-tui  # 如果全局安装
```

### 5.8 与 OpenCode Session 的交互流程

```
┌─────────────────────────────────────────────────────────────────┐
│                       OpenCode 主 Session                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  用户: "帮我管理一些任务"                                  │   │
│  │  Agent: "好的，我调用 task-list 工具查看当前任务..."       │   │
│  │  [调用 task-list tool]                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │            Task Manager Plugin                           │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │   │
│  │  │ task-add     │  │ task-list    │  │ task-status  │  │   │
│  │  │ tool         │  │ tool         │  │ tool         │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │   │
│  │                          │                               │   │
│  │                          ▼                               │   │
│  │  ┌──────────────────────────────────────────────────┐  │   │
│  │  │              Queue Manager                        │  │   │
│  │  │  - 任务队列（内存 + 文件持久化）                    │  │   │
│  │  │  - 串行执行                                       │  │   │
│  │  └──────────────────────────────────────────────────┘  │   │
│  │                          │                               │   │
│  │                          ▼                               │   │
│  │  ┌──────────────────────────────────────────────────┐  │   │
│  │  │              Task Executor                        │  │   │
│  │  │  - 创建 child session                             │  │   │
│  │  │  - 调用指定 agent                                  │  │   │
│  │  └──────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼ 创建 child session                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Child Session (Task 1)                      │   │
│  │  parentID: 主 session ID                                 │   │
│  │  ┌─────────────────────────────────────────────────────┐│   │
│  │  │ Agent: explore                                      ││   │
│  │  │ Prompt: "分析 src/ 目录..."                          ││   │
│  │  │ [独立上下文，不共享父 session 状态]                   ││   │
│  │  └─────────────────────────────────────────────────────┘│   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼ session.idle 事件                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │            Plugin Event Handler                          │   │
│  │  - 监听 session.idle                                     │   │
│  │  - 更新任务状态为 success/failed                         │   │
│  │  - 触发下一个任务执行                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 5.9 关键集成点总结

| 集成点 | API/方法 | 用途 |
|--------|---------|------|
| **插件注册** | `export const Plugin` | 让 OpenCode 识别并加载插件 |
| **自定义工具** | `tool()` + `return { tool: {...} }` | 供 agent 调用，添加/查询任务 |
| **事件监听** | `return { event: handler }` | 监听 session 状态变化 |
| **Session 创建** | `ctx.client.session.create()` | 为每个任务创建隔离 session |
| **Prompt 发送** | `ctx.client.session.prompt()` | 向 session 发送任务指令 |
| **Session 查询** | `ctx.client.session.list()` | 查询 session 状态 |
| **日志记录** | `ctx.client.app.log()` | 记录日志到 OpenCode |
| **Shell 执行** | `ctx.$` | 执行系统命令（启动 TUI 等）|

### 5.10 插件依赖安装

```bash
# 在 .opencode/plugins/task-manager/ 目录下
cd .opencode/plugins/task-manager

# 初始化 package.json
bun init

# 安装依赖
bun add @opencode-ai/plugin ink react yaml uuid zod
bun add -d @types/react @types/uuid
```

### 5.11 验证插件是否加载成功

```typescript
// 在插件入口添加日志
export const TaskManagerPlugin: Plugin = async (ctx) => {
  // 记录启动日志
  await ctx.client.app.log({
    service: "task-manager-plugin",
    level: "info",
    message: "Task Manager Plugin 加载成功"
  })
  
  // ... 其他代码
}
```

查看 OpenCode 日志：
```bash
# OpenCode 日志通常在
~/.local/share/opencode/logs/
# 或项目目录
.opencode/logs/
```

### 5.12 常见集成问题及解决方案

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 插件未加载 | 入口文件路径错误 | 确保 `index.ts` 在正确位置 |
| tool 调用失败 | schema 定义错误 | 使用 Zod 正确定义参数 |
| session 创建失败 | 权限不足 | 检查 plugin context 权限 |
| 事件未触发 | hook 名称错误 | 确认事件名称与 OpenCode 一致 |
| TUI 无法启动 | 进程权限问题 | 使用 `Bun.spawn` 并正确处理 stdio |

---

## 六、存储设计

### 6.1 文件结构
```
.opencode/
├── task-manager/
│   ├── tasks.yaml          # 任务配置文件
│   ├── tasks.json          # 任务数据存储
│   ├── queue.json          # 队列状态
│   ├── logs/
│   │   ├── system.log      # 系统日志
│   │   └── task-{id}.log   # 每个任务的日志
│   └── archive/
│       └── tasks-{date}.json  # 归档的任务
│
└── plugins/
    └── task-manager/
        ├── index.ts         # 插件入口
        ├── package.json     # 依赖配置
        ├── src/
        │   ├── queue.ts     # 任务队列
        │   ├── executor.ts  # 任务执行器
        │   ├── monitor.ts   # 状态监控
        │   ├── retry.ts     # 重试管理
        │   ├── events.ts    # 事件系统
        │   ├── storage/
        │   │   ├── index.ts     # 存储入口
        │   │   ├── file-store.ts # JSON 文件操作
        │   │   └── lock.ts       # 文件锁（防止并发写入）
        │   ├── config/
        │   │   ├── parser.ts
        │   │   └── schema.ts
        │   ├── api/
        │   │   └── routes.ts
        │   └── tui/
        │       ├── index.tsx
        │       ├── components/
        │       │   ├── TaskList.tsx
        │       │   ├── TaskDetail.tsx
        │       │   ├── ControlPanel.tsx
        │       │   └── AddTaskDialog.tsx
        │       └── hooks/
        │           └── useTaskQueue.ts
        └── tests/
            ├── queue.test.ts
            ├── executor.test.ts
            └── integration.test.ts
```

### 6.2 文件存储实现（纯 TypeScript）

```typescript
// src/storage/file-store.ts

const STORAGE_DIR = ".opencode/task-manager";
const TASKS_FILE = `${STORAGE_DIR}/tasks.json`;
const QUEUE_FILE = `${STORAGE_DIR}/queue.json`;
const LOGS_DIR = `${STORAGE_DIR}/logs`;

// 存储接口
interface Storage {
  loadTasks(): Promise<Task[]>;
  saveTasks(tasks: Task[]): Promise<void>;
  loadQueueState(): Promise<QueueState>;
  saveQueueState(state: QueueState): Promise<void>;
  appendLog(taskId: string, level: string, message: string): Promise<void>;
}

// 文件存储实现
class FileStorage implements Storage {
  private lock = new FileLock(STORAGE_DIR);
  
  async loadTasks(): Promise<Task[]> {
    try {
      const content = await Bun.file(TASKS_FILE).text();
      const data = JSON.parse(content);
      return data.tasks || [];
    } catch {
      return []; // 文件不存在返回空数组
    }
  }
  
  async saveTasks(tasks: Task[]): Promise<void> {
    await this.lock.acquire();
    try {
      const data = {
        version: "1.0.0",
        updatedAt: Date.now(),
        tasks
      };
      await Bun.write(TASKS_FILE, JSON.stringify(data, null, 2));
    } finally {
      await this.lock.release();
    }
  }
  
  async appendLog(taskId: string, level: string, message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
    const logFile = `${LOGS_DIR}/task-${taskId}.log`;
    
    // 追加写入日志
    const existing = await Bun.file(logFile).text().catch(() => "");
    await Bun.write(logFile, existing + logLine);
  }
  
  // ... 其他方法
}
```

### 6.3 文件锁机制

```typescript
// src/storage/lock.ts

class FileLock {
  private lockFile: string;
  private locked = false;
  
  constructor(storageDir: string) {
    this.lockFile = `${storageDir}/.lock`;
  }
  
  async acquire(): Promise<void> {
    while (this.locked) {
      await new Promise(r => setTimeout(r, 50));
    }
    this.locked = true;
    await Bun.write(this.lockFile, `${process.pid}`);
  }
  
  async release(): Promise<void> {
    this.locked = false;
    await Bun.write(this.lockFile, "");
  }
}
```

### 6.4 数据生命周期
```
任务数据生命周期:

创建 → pending (tasks.json)
         ↓
      running (tasks.json + 更新)
         ↓
     ┌────┴────┐
   success   failed
     ↓         ↓
   保留      保留（可重试）
     ↓
   归档到 archive/tasks-{date}.json
```

---

## 七、技术栈说明

### 7.1 纯 TypeScript + Bun 运行时

本插件完全使用 TypeScript 编写，运行在 OpenCode 的 Bun 运行时环境中。

**技术栈选择**：
| 需求 | 方案 | 说明 |
|------|------|------|
| 运行时 | Bun | OpenCode 内置运行时 |
| 文件操作 | Bun File API | 原生支持，无需额外依赖 |
| YAML 解析 | yaml | 纯 JS 实现，兼容 Bun |
| TUI 框架 | Ink | React 风格的终端 UI |
| UUID | uuid | 纯 JS 实现 |
| 类型验证 | Zod | OpenCode 已集成 |

**依赖列表** (package.json):
```json
{
  "name": "opencode-task-manager",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@opencode-ai/plugin": "latest",
    "ink": "^4.4.1",
    "react": "^18.2.0",
    "yaml": "^2.3.4",
    "uuid": "^9.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "bun-types": "latest"
  }
}
```

### 7.2 关键实现细节

#### 文件操作（使用 Bun 原生 API）
```typescript
// 读取文件
const content = await Bun.file("tasks.json").text();
const data = JSON.parse(content);

// 写入文件
await Bun.write("tasks.json", JSON.stringify(data, null, 2));

// 检查文件是否存在
const exists = await Bun.file("tasks.json").exists();
```

#### YAML 解析
```typescript
import { parse } from "yaml";

const configContent = await Bun.file("tasks.yaml").text();
const config = parse(configContent);
```

#### TUI 组件（Ink）
```typescript
import { render, Box, Text, useInput } from "ink";

function TaskItem({ task }: { task: Task }) {
  const statusIcon = {
    pending: "○",
    running: "●",
    success: "✓",
    failed: "✗",
    cancelled: "⊘",
  }[task.status];
  
  return (
    <Box>
      <Text color={task.priority === "high" ? "red" : "white"}>
        {statusIcon} [{task.priority.toUpperCase()}] {task.title}
      </Text>
    </Box>
  );
}
```

---

## 八、关键技术方案

### 8.1 Session 隔离实现
```typescript
// 创建隔离的子 session
async function createIsolatedSession(task: Task, parentSessionId: string) {
  const session = await Session.create({
    parentID: parentSessionId,
    title: `[TaskManager] ${task.title}`,
    data: {
      taskId: task.id,
      agent: task.agent,
    }
  });
  
  // 注入 prompt
  await session.prompt({
    parts: [{ type: "text", text: task.prompt }]
  });
  
  return session;
}
```

### 8.2 Agent 调用方式
```typescript
// 方案1: 使用 delegate_task (oh-my-opencode)
async function executeWithDelegateTask(task: Task) {
  const result = await delegate_task({
    subagent_type: task.agent,
    skill: task.skill,
    prompt: task.prompt,
    parameters: task.parameters,
    run_in_background: false,  // 串行执行，同步等待
  });
  return result;
}

// 方案2: 使用 SDK client
async function executeWithSDK(task: Task, sessionId: string) {
  const { client } = await createOpencode();
  
  // 发送 prompt 并等待响应
  const response = await client.session.prompt({
    path: { id: sessionId },
    body: {
      parts: [{ type: "text", text: task.prompt }],
      agent: task.agent,
    }
  });
  
  return response;
}
```

### 8.3 Plugin Hook 注册
```typescript
// 插件入口
export const TaskManagerPlugin: Plugin = async (ctx) => {
  const queueManager = new QueueManager(ctx);
  const executor = new TaskExecutor(ctx);
  const monitor = new TaskMonitor(ctx);
  
  return {
    // 注册自定义工具
    tool: {
      "task-add": tool({
        description: "添加任务到队列",
        args: {
          title: tool.schema.string(),
          agent: tool.schema.string(),
          prompt: tool.schema.string(),
          priority: tool.schema.enum(["high", "medium", "low"]),
          retryCount: tool.schema.number().optional(),
        },
        async execute(args) {
          return queueManager.addTask(args);
        },
      }),
    },
    
    // 注册事件监听
    event: async ({ event }) => {
      monitor.handleEvent(event);
    },
    
    // Session 生命周期钩子
    "session.idle": async (input, output) => {
      await monitor.onSessionIdle(input.sessionID);
    },
    
    "session.error": async (input, output) => {
      await monitor.onSessionError(input.sessionID, output.error);
    },
  };
};
```

### 8.4 TUI 实现方案
```typescript
// 使用 Ink (React for CLI)
import { render, Box, Text } from "ink";
import { useTaskQueue } from "./hooks/useTaskQueue";

function TaskManagerUI() {
  const { tasks, currentTask, statistics } = useTaskQueue();
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  // 键盘输入处理
  useInput((input, key) => {
    if (key.upArrow) setSelectedIndex(i => Math.max(0, i - 1));
    if (key.downArrow) setSelectedIndex(i => Math.min(tasks.length - 1, i + 1));
    if (input === "a") openAddDialog();
    if (input === "c") cancelTask(tasks[selectedIndex].id);
    // ...
  });
  
  return (
    <Box flexDirection="column">
      <Header statistics={statistics} />
      <TaskList tasks={tasks} selectedIndex={selectedIndex} />
      <TaskDetail task={tasks[selectedIndex]} />
      <ControlPanel />
    </Box>
  );
}

// 启动 TUI
render(<TaskManagerUI />);
```

---

## 九、边界情况处理

### 9.1 错误场景

| 场景 | 处理方式 |
|------|---------|
| 任务执行超时 | 记录超时日志，标记失败，触发重试机制 |
| Agent 不存在 | 验证时拒绝，返回错误信息 |
| Session 创建失败 | 标记任务失败，记录错误日志 |
| JSON 文件损坏 | 尝试解析备份，失败则重新初始化 |
| 文件写入失败 | 重试 3 次，失败则写入内存缓存 |
| 配置文件格式错误 | 忽略错误配置，记录警告日志 |
| OpenCode 服务断开 | 暂停队列执行，等待重连 |

### 9.2 并发控制
```
串行执行保证:
  - 使用队列锁（mutex）
  - 同一时刻只有一个任务执行
  - 当前任务完成/失败后才能出队下一个
  
取消操作限制:
  - 只能取消 pending 状态的任务
  - running 状态的任务不可取消（需要等待完成）
```

### 9.3 数据一致性
```
状态更新原子性:
  - 使用文件锁保证写入原子性
  - 先写入临时文件，再重命名为正式文件
  - 写入失败不影响原有数据
  
重启恢复:
  - 启动时检查 running 状态的任务
  - 将其标记为 failed（因为中断了）
  - 如果有重试次数，重新加入队列
  - 从 tasks.json 恢复所有任务状态
```

---

## 十、性能考虑

### 10.1 文件存储优化
- 使用增量更新，避免全量写入
- 日志文件按任务拆分，避免单个文件过大
- 定期归档历史任务到独立文件
- 使用文件锁防止并发写入冲突

### 10.2 内存管理
- TUI 只加载当前页的任务（分页）
- 任务结果按需加载
- 大型日志文件流式读取

### 10.3 响应时间目标
- TUI 刷新：< 100ms
- 任务入队：< 50ms
- 文件读写：< 100ms
- 日志查询：< 500ms

---

## 十一、扩展性设计

### 11.1 预留扩展点

| 扩展点 | 说明 |
|--------|------|
| 并行执行 | 数据模型支持，配置 maxConcurrent > 1 |
| 任务依赖 | 数据模型可添加 dependsOn 字段 |
| Web UI | API 层已支持，可添加 Web 前端 |
| WebSocket 推送 | API 层可扩展实时推送 |
| 任务模板 | 可扩展模板系统 |
| 定时任务 | 可扩展 cron 调度 |

### 11.2 插件化设计
```
执行器插件化:
  - 定义 Executor 接口
  - 支持注册自定义执行器
  - 不同 agent 可使用不同执行策略

存储后端可替换:
  - 定义 Storage 接口
  - 默认使用 JSON 文件存储
  - 可扩展支持其他存储后端
```

---

## 十二、测试策略

### 12.1 测试层次
```
单元测试:
  - 任务队列逻辑
  - 优先级排序
  - 重试逻辑
  - 配置解析

集成测试:
  - 完整执行流程
  - Session 隔离验证
  - 持久化恢复

E2E 测试:
  - TUI 交互流程
  - API 完整调用链
```

### 12.2 测试场景覆盖
- 正常任务执行流程
- 高优先级任务插队
- 重试机制验证
- 失败任务处理
- 取消操作
- 配置加载和热更新
- 数据持久化和恢复
- TUI 交互操作

---

## 十三、实施计划概览

### 13.1 阶段划分

| 阶段 | 内容 | 预计工作量 |
|------|------|-----------|
| **阶段1** | 基础框架（类型、配置、存储） | 1-2天 |
| **阶段2** | 核心逻辑（队列、执行器） | 2-3天 |
| **阶段3** | API 层 | 1天 |
| **阶段4** | TUI 界面 | 2-3天 |
| **阶段5** | 集成测试和文档 | 1-2天 |

### 13.2 依赖关系
```
阶段1 → 阶段2 → 阶段3 → 阶段5
              ↘ 阶段4 ↗
```

---

## 十四、风险和缓解措施

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| OpenCode API 变更 | 高 | 使用稳定的 SDK 接口，版本锁定 |
| Session 泄漏 | 中 | 完善清理机制，定期检查孤儿 session |
| JSON 文件损坏 | 高 | 写入前备份，原子写入，定期备份 |
| 并发写入冲突 | 中 | 文件锁机制，写入队列 |
| TUI 性能问题 | 低 | 分页加载，虚拟滚动 |

---

## 附录 A：术语表

| 术语 | 说明 |
|------|------|
| Task | 任务，一次 agent/skill 执行的抽象 |
| Queue | 任务队列，管理待执行任务 |
| Session | OpenCode 的会话，包含上下文和消息历史 |
| Agent | OpenCode 的智能体，执行特定类型任务 |
| Skill | OpenCode 的技能，提供特定能力 |
| TUI | Terminal User Interface，终端用户界面 |
| Plugin | OpenCode 插件，扩展功能模块 |

---

## 附录 B：参考资料

- [OpenCode Plugin SDK](https://opencode.ai/docs/plugins/)
- [OpenCode Session API](https://opencode.ai/docs/sdk/)
- [Ink - React for CLI](https://github.com/vadimdemedes/ink)
- [Bun File API](https://bun.sh/docs/api/file-io)
- [YAML Parser](https://github.com/eemeli/yaml)
- [纯 TypeScript UUID](https://github.com/uuidjs/uuid)