# 阶段 3 开发日志 - API 层

**日期**: 2026-03-19

## 完成内容

### 查询 API (src/api/routes.ts)

**QueryApi 类** - 提供状态查询接口

#### 任务 API

| 方法 | 说明 | 路径 |
|------|------|------|
| `getTasks(status?)` | 获取所有任务列表 | GET /api/task-manager/tasks |
| `getTask(taskId)` | 获取单个任务详情 | GET /api/task-manager/tasks/:id |
| `createTask(input)` | 创建新任务 | POST /api/task-manager/tasks |
| `cancelTask(taskId)` | 取消任务 | POST /api/task-manager/tasks/:id/cancel |
| `retryTask(taskId)` | 重试任务 | POST /api/task-manager/tasks/:id/retry |
| `deleteTask(taskId)` | 删除任务 | DELETE /api/task-manager/tasks/:id |
| `getTaskLogs(taskId)` | 获取任务日志 | GET /api/task-manager/tasks/:id/logs |

#### 队列 API

| 方法 | 说明 | 路径 |
|------|------|------|
| `getQueueState()` | 获取队列状态 | GET /api/task-manager/queue |
| `startQueue()` | 启动队列 | POST /api/task-manager/queue/start |
| `stopQueue()` | 停止队列 | POST /api/task-manager/queue/stop |
| `getStatistics()` | 获取统计数据 | GET /api/task-manager/statistics |

### 响应格式

所有 API 返回统一的响应格式：

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

### 任务列表响应

```typescript
interface TaskListResponse {
  tasks: Task[];
  statistics: QueueStatistics;
}
```

### 任务详情响应

```typescript
interface TaskDetailResponse {
  task: Task;
  log?: string;  // 任务日志
}
```

## 下一步

阶段 4 将实现 TUI 界面：
- 主界面布局
- 任务列表组件
- 任务详情组件
- 添加任务对话框
- 键盘交互