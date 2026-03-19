# OpenCode Task Manager Plugin

一个为 OpenCode 构建的任务编排插件，支持批量任务执行、优先级队列管理和 Agent 协调。

## 功能特性

- **任务队列管理**：添加、列出、取消和重试任务
- **优先级支持**：高/中/低三级优先级，自动排序
- **串行执行**：任务在隔离的 Session 中逐一执行
- **重试机制**：可配置失败重试次数
- **Agent 集成**：支持 explore、oracle、build 等 Agent
- **Skill 支持**：任务执行前加载指定 Skill
- **事件钩子**：通过 session.idle、session.error 监听任务生命周期
- **数据持久化**：任务数据在 OpenCode 重启后保留
- **TUI 界面**：终端界面监控任务状态

## 安装方式

### 方式一：下载 ZIP 包（推荐）

1. 下载 `dist/task-manager.zip`

2. 解压到你的项目：

```
your-project/
└── .opencode/
    └── plugins/
        └── task-manager/    <-- 解压到这里
            ├── index.ts
            ├── package.json
            ├── README.md
            └── src/
```

3. 安装依赖：

```bash
cd your-project/.opencode/plugins/task-manager
npm install
```

4. 重启 OpenCode

### 方式二：从源码打包

```bash
git clone https://github.com/jinduizhang/OpenCodeTaskManagerPlugin.git
cd OpenCodeTaskManagerPlugin

npm install
npm run zip

# 输出: dist/task-manager.zip
```

### 方式三：全局插件

安装到 `~/.config/opencode/plugins/task-manager/`，所有项目共享。

## 配置

### YAML 配置（可选）

创建 `.opencode/task-manager/tasks.yaml`：

```yaml
# 队列设置
settings:
  autoStart: true        # OpenCode 启动时自动开始执行队列
  maxConcurrent: 1       # 串行执行（1 = 一次执行一个任务）
  logLevel: "info"       # 日志级别: debug, info, warn, error

# 预定义任务
tasks:
  - name: "代码分析"
    description: "分析项目结构"
    agent: "explore"
    prompt: |
      分析 src/ 目录：
      1. 列出主要模块
      2. 分析依赖关系
      3. 生成架构图
    priority: "high"
    retryCount: 2

  - name: "Git 发布"
    skill: "git-release"
    parameters:
      version: "1.0.0"
      branch: "main"
    priority: "medium"
    retryCount: 1
```

## 可用工具

### task-add（添加任务）

向队列添加新任务。

```typescript
// Agent 调用示例
{
  tool: "task-add",
  args: {
    title: "代码审查",           // 必填：任务标题
    agent: "explore",           // 必填：要调用的 Agent
    prompt: "审查 PR #123",     // 必填：任务描述
    priority: "high",           // 可选："high" | "medium" | "low"
    retryCount: 2,              // 可选：失败重试次数（默认：0）
    skill: "code-review"        // 可选：先加载的 Skill
  }
}

// 返回结果
{
  success: true,
  taskId: "task-abc123",
  message: "任务已添加到队列。当前有 3 个待执行任务。"
}
```

### task-list（列出任务）

列出队列中的所有任务。

```typescript
{
  tool: "task-list",
  args: {
    status: "pending"  // 可选："pending" | "running" | "success" | "failed" | "all"
  }
}

// 返回结果
{
  total: 5,
  statistics: {
    total: 10,
    pending: 5,
    running: 1,
    success: 3,
    failed: 1,
    cancelled: 0
  },
  tasks: [
    {
      id: "task-abc123",
      title: "代码审查",
      agent: "explore",
      status: "running",
      priority: "high",
      createdAt: "2024-01-15T10:30:00.000Z",
      sessionId: "ses_xxx"
    }
  ]
}
```

### task-status（任务状态）

获取指定任务的详细状态。

```typescript
{
  tool: "task-status",
  args: {
    taskId: "task-abc123"
  }
}

// 返回结果
{
  success: true,
  task: {
    id: "task-abc123",
    title: "代码审查",
    status: "success",
    agent: "explore",
    priority: "high",
    currentRetry: 0,
    result: {
      success: true,
      summary: "审查完成"
    },
    createdAt: "2024-01-15T10:30:00.000Z",
    startedAt: "2024-01-15T10:30:05.000Z",
    completedAt: "2024-01-15T10:35:00.000Z",
    sessionId: "ses_xxx"
  }
}
```

### task-cancel（取消任务）

取消一个待执行的任务。

```typescript
{
  tool: "task-cancel",
  args: {
    taskId: "task-abc123"
  }
}

// 返回结果
{
  success: true,
  message: "任务 task-abc123 已取消"
}
```

### task-retry（重试任务）

重试一个失败的任务。

```typescript
{
  tool: "task-retry",
  args: {
    taskId: "task-abc123"
  }
}

// 返回结果
{
  success: true,
  message: "任务 task-abc123 已重新加入队列"
}
```

### queue-status（队列状态）

获取当前队列状态。

```typescript
{
  tool: "queue-status",
  args: {}
}

// 返回结果
{
  isRunning: true,
  currentTask: {
    id: "task-abc123",
    title: "代码审查",
    status: "running"
  },
  statistics: {
    total: 10,
    pending: 5,
    running: 1,
    success: 3,
    failed: 1,
    cancelled: 0
  }
}
```

### queue-start（启动队列）

启动队列处理。

```typescript
{
  tool: "queue-start",
  args: {}
}

// 返回结果
{
  success: true,
  message: "队列已启动"
}
```

### queue-stop（停止队列）

停止队列处理。

```typescript
{
  tool: "queue-stop",
  args: {}
}

// 返回结果
{
  success: true,
  message: "队列已停止"
}
```

## 事件钩子

插件向 OpenCode 注册以下钩子：

### session.idle

任务 Session 成功完成时触发。

```typescript
// OpenCode 在 Session 变为空闲时调用
"session.idle": async (input) => {
  // input.sessionID - 完成的 Session ID
  // 插件内部处理任务完成逻辑
}
```

### session.error

任务 Session 遇到错误时触发。

```typescript
"session.error": async (input, output) => {
  // input.sessionID - 失败的 Session ID
  // output.error - 错误信息
  // 插件内部处理重试逻辑
}
```

### session.created

新 Session 创建时触发。

```typescript
"session.created": async (input) => {
  // input.sessionID - 新 Session ID
  // input.session - Session 对象
}
```

### shell.env

向 Shell 进程注入环境变量。

```typescript
"shell.env": async (input, output) => {
  output.env.TASK_MANAGER_PLUGIN = "1"
  output.env.TASK_MANAGER_VERSION = "1.0.0"
}
```

## 数据存储

所有数据存储在 `.opencode/task-manager/` 目录：

```
.opencode/task-manager/
├── tasks.json          # 所有任务记录
├── queue.json          # 队列状态
├── logs/
│   ├── task-{id}.log   # 每个任务的执行日志
│   └── system.log      # 系统日志
└── archive/
    └── tasks-{date}.json  # 归档的历史任务
```

### tasks.json 结构

```json
{
  "version": "1.0.0",
  "updatedAt": 1705312200000,
  "tasks": [
    {
      "id": "task-abc123",
      "title": "代码分析",
      "agent": "explore",
      "prompt": "分析 src/...",
      "priority": "high",
      "status": "running",
      "sessionId": "ses_xxx",
      "createdAt": 1705312200000,
      "startedAt": 1705312300000
    }
  ]
}
```

## 任务生命周期

```
          ┌─────────┐
          │ pending │  （等待执行）
          └────┬────┘
               │ queue-start 启动队列
               ▼
          ┌─────────┐
          │ running │  （执行中）◄──────┐
          └────┬────┘                  │
               │                       │
     ┌─────────┼─────────┐             │
     │         │         │             │
     ▼         ▼         ▼             │
 success   failed   cancelled          │
 （成功）   （失败）   （已取消）        │
               │                       │
               │ 可以重试？             │
               └───────────────────────┘
               │
               │ 重试次数用尽
               ▼
            failed (final)
            （最终失败）
```

## 优先级队列规则

1. **高 > 中 > 低**：高优先级任务先执行
2. **同优先级先进先出**：相同优先级按创建时间排序
3. **待执行优先**：待执行任务排在已完成任务之前

## TUI 界面

启动终端界面：

```bash
bun run .opencode/plugins/task-manager/src/tui/cli.ts
```

### TUI 快捷键

| 按键 | 功能 |
|-----|------|
| `↑/↓` | 选择任务 |
| `Enter` | 查看任务详情 |
| `A` | 添加新任务 |
| `C` | 取消选中任务 |
| `R` | 重试失败任务 |
| `F` | 刷新 |
| `Q/Esc` | 退出 |

## 使用示例

### 基础任务

```typescript
// 添加简单任务
{
  tool: "task-add",
  args: {
    title: "分析代码库",
    agent: "explore",
    prompt: "分析项目结构，列出所有模块"
  }
}
```

### 高优先级带重试

```typescript
{
  tool: "task-add",
  args: {
    title: "紧急 Bug 修复",
    agent: "build",
    prompt: "修复 login.ts 中的认证 Bug",
    priority: "high",
    retryCount: 3
  }
}
```

### 使用 Skill

```typescript
{
  tool: "task-add",
  args: {
    title: "Git 操作",
    agent: "explore",
    prompt: "创建新的发布分支",
    skill: "git-master"
  }
}
```

### 监控进度

```typescript
// 查看队列状态
{
  tool: "queue-status",
  args: {}
}

// 查看特定任务
{
  tool: "task-status",
  args: {
    taskId: "task-abc123"
  }
}
```

## 错误处理

### 重试机制

- 设置了 `retryCount > 0` 的任务失败后会自动重试
- `currentRetry` 记录当前重试次数
- 重试次数用尽后，任务状态变为 `failed`

### 手动重试

```typescript
// 重试失败的任务
{
  tool: "task-retry",
  args: {
    taskId: "task-abc123"
  }
}
```

## 构建

```bash
# 安装依赖
npm install

# 类型检查
npm run build

# 运行测试
npm test
```

## 许可证

MIT