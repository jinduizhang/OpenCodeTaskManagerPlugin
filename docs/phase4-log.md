# 阶段 4 开发日志 - TUI 界面

**日期**: 2026-03-19

## 完成内容

### TUI 框架

使用 **Ink** 框架（React for CLI）实现终端用户界面。

### 组件结构

```
src/tui/
├── index.tsx              # 主应用组件
├── cli.ts                 # CLI 入口
├── components/
│   ├── index.ts           # 组件入口
│   ├── TaskList.tsx       # 任务列表组件
│   ├── TaskDetail.tsx     # 任务详情组件
│   ├── ControlPanel.tsx   # 控制面板组件
│   └── AddTaskDialog.tsx  # 添加任务对话框
└── hooks/
    └── useTaskQueue.ts    # 自定义 Hooks
```

### 组件说明

#### TaskList (任务列表)

- 显示所有任务列表
- 支持选中状态高亮
- 显示状态图标和颜色：
  - pending: ○ 黄色
  - running: ● 蓝色
  - success: ✓ 绿色
  - failed: ✗ 红色
  - cancelled: ⊘ 灰色
- 显示优先级颜色：
  - high: 红色
  - medium: 黄色
  - low: 灰色
- 显示执行时长（running 状态）

#### TaskDetail (任务详情)

- 显示任务完整信息
- 包含：ID、标题、Agent、Skill、状态、优先级
- 显示时间信息：创建时间、开始时间、完成时间、执行时长
- 显示重试信息
- 显示错误信息（失败任务）
- 显示 Prompt 内容

#### ControlPanel (控制面板)

- 显示队列运行状态
- 显示统计信息：待执行、成功、失败
- 快捷键提示

#### AddTaskDialog (添加任务对话框)

- 表单字段：
  - 标题（文本输入）
  - Agent（选择器）
  - Prompt（多行文本）
  - 优先级（选择器）
  - 重试次数（数字调整）
- Tab 切换字段
- Enter 提交
- Esc 取消

### 自定义 Hooks

#### useTaskQueue

- 管理任务队列状态
- 提供 CRUD 操作
- 支持定时刷新

#### useTaskSelection

- 管理选中任务索引
- 提供 moveUp/moveDown 导航
- 自动处理边界情况

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| ↑/↓ | 选择任务 |
| A | 添加任务 |
| C | 取消任务 |
| R | 重试任务 |
| D | 删除任务 |
| S | 启动/停止队列 |
| Q/Esc | 退出 |

### 启动 TUI

```bash
bun run src/tui/cli.ts
```

## 下一步

阶段 5 将实现插件入口：
- 插件注册
- 工具定义
- Hook 注册
- OpenCode 集成