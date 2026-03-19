# 阶段 2 开发日志 - 核心逻辑

**日期**: 2026-03-19

## 完成内容

### 1. 任务队列管理 (src/queue.ts)

**QueueManager 类**:
- `initialize()` - 初始化队列，从存储恢复状态
- `restore()` - 从文件恢复队列状态
- `start()` / `stop()` - 启动/停止队列处理
- `processNext()` - 处理下一个任务
- `addTask(input)` - 添加任务到队列
- `dequeue()` - 从队列取出下一个任务
- `cancelTask(taskId)` - 取消任务
- `retryTask(taskId)` - 重试失败的任务
- `deleteTask(taskId)` - 删除任务记录
- `getTasks()` / `getTask(id)` - 查询任务
- `getQueueState()` - 获取队列状态
- `getPendingCount()` - 获取待执行任务数量

**优先级排序规则**:
1. pending 状态优先
2. high > medium > low
3. 同优先级按创建时间排序（FIFO）

**任务状态流转**:
```
pending → running → success/failed/cancelled
                ↑           ↓
                └─── retry ───┘
```

### 2. 任务执行器 (src/executor.ts)

**TaskExecutor 类**:
- `execute(task)` - 执行任务
- `createIsolatedSession(task)` - 创建隔离的 child session
- `buildPrompt(task)` - 构建 prompt（包含 agent/skill 指令）
- `sendPrompt(sessionId, prompt)` - 发送 prompt 到 session
- `handleSessionComplete(sessionId, session)` - 处理 session 完成事件
- `handleSessionError(sessionId, error)` - 处理 session 错误事件
- `cancelExecution(taskId)` - 取消任务执行

**Session 隔离机制**:
- 每个任务创建独立的 child session
- 通过 `parentID` 关联父 session
- 设置 session data 标记为 taskManager 任务
- 任务之间不共享上下文

**Prompt 构建**:
```
[首先加载 skill: xxx]
[使用 xxx agent 执行以下任务]
{prompt 内容}
[参数]
- key: value
```

### 3. 状态监控 (src/monitor.ts)

**TaskMonitor 类**:
- `onSessionIdle(sessionId)` - 处理 Session 空闲事件
- `onSessionError(sessionId, error)` - 处理 Session 错误事件
- `onSessionCreated(sessionId, session)` - 处理 Session 创建事件
- `onSessionStatus(sessionId, status)` - 处理 Session 状态变化事件
- `addStatusListener(listener)` - 添加状态变化监听器
- `getTaskStatus(taskId)` - 获取任务状态
- `getAllTaskStatuses()` - 获取所有任务状态

**事件订阅**:
- task.created
- task.started
- task.completed
- task.failed
- task.retrying
- task.cancelled
- queue.started
- queue.idle

### 4. 重试管理 (src/retry.ts)

**RetryManager 类**:
- `canRetry(task)` - 检查任务是否可以重试
- `retryNow(taskId)` - 手动触发重试
- `scheduleRetry(task)` - 调度延迟重试
- `cancelPendingRetry(taskId)` - 取消待重试
- `getPendingRetryCount()` - 获取待重试数量
- `updateStrategy(strategy)` - 更新重试策略

**重试策略配置**:
```typescript
interface RetryStrategy {
  enabled: boolean;           // 是否启用重试
  maxRetries: number;         // 最大重试次数
  delay: number;              // 重试延迟（毫秒）
  exponentialBackoff: boolean; // 是否使用指数退避
  maxDelay: number;           // 最大延迟
}
```

**指数退避算法**:
```
delay * 2^(attempt-1)
例如：1000ms → 2000ms → 4000ms → 8000ms...
最大延迟限制：30000ms
```

## 组件关系

```
┌─────────────────────────────────────────────────────────────┐
│                      QueueManager                            │
│  - 管理任务队列                                              │
│  - 调度执行                                                  │
│  - onExecute → 调用 Executor                                │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      TaskExecutor                            │
│  - 创建隔离 Session                                          │
│  - 调用 Agent                                                │
│  - 发送 Prompt                                               │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      TaskMonitor                             │
│  - 监听 OpenCode 事件                                        │
│  - 更新任务状态                                              │
│  - 通知状态变化                                              │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      RetryManager                            │
│  - 处理失败重试                                              │
│  - 延迟调度                                                  │
│  - 指数退避                                                  │
└─────────────────────────────────────────────────────────────┘
```

## 下一步

阶段 3 将实现 API 层：
- 任务列表查询
- 任务详情查询
- 队列状态查询
- 日志查询