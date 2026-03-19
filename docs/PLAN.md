# OpenCode Task Manager Plugin - 开发计划

## 项目概览

基于 DESIGN.md 设计文档，开发一个 OpenCode 任务管理插件。

## 开发阶段

### 阶段 1: 基础框架 (Foundation)

**目标**: 建立项目基础结构和核心类型定义

**任务列表**:
1. 项目初始化
   - [x] 创建 package.json
   - [x] 创建 tsconfig.json
   - [x] 创建目录结构

2. 核心类型定义 (src/types.ts)
   - [ ] Task 接口
   - [ ] TaskStatus 类型
   - [ ] TaskResult 接口
   - [ ] QueueState 接口
   - [ ] PluginContext 接口

3. 事件系统 (src/events.ts)
   - [ ] EventBus 类
   - [ ] 事件类型定义
   - [ ] 发布/订阅机制

4. 存储层 (src/storage/)
   - [ ] FileStorage 类
   - [ ] JSON 文件读写
   - [ ] 文件锁机制
   - [ ] 日志管理

5. 配置解析器 (src/config/)
   - [ ] YAML 解析
   - [ ] 配置验证
   - [ ] 默认配置

**交付物**: 可编译的基础框架代码

---

### 阶段 2: 核心逻辑 (Core Logic)

**目标**: 实现任务管理的核心功能

**任务列表**:
1. 任务队列 (src/queue.ts)
   - [ ] QueueManager 类
   - [ ] 入队/出队操作
   - [ ] 优先级排序
   - [ ] 状态管理

2. 任务执行器 (src/executor.ts)
   - [ ] TaskExecutor 类
   - [ ] Session 创建
   - [ ] Agent 调用
   - [ ] 结果处理

3. 状态监控 (src/monitor.ts)
   - [ ] TaskMonitor 类
   - [ ] 事件监听
   - [ ] 状态更新
   - [ ] 回调触发

4. 重试管理 (src/retry.ts)
   - [ ] RetryManager 类
   - [ ] 重试策略
   - [ ] 重试队列

**交付物**: 可运行的核心逻辑

---

### 阶段 3: API 层 (API Layer)

**目标**: 提供状态查询接口

**任务列表**:
1. 查询 API (src/api/)
   - [ ] 任务列表查询
   - [ ] 任务详情查询
   - [ ] 队列状态查询
   - [ ] 日志查询

**交付物**: 可用的 API 接口

---

### 阶段 4: TUI 界面 (Terminal UI)

**目标**: 实现终端交互界面

**任务列表**:
1. TUI 组件 (src/tui/)
   - [ ] 主界面布局
   - [ ] 任务列表组件
   - [ ] 任务详情组件
   - [ ] 添加任务对话框
   - [ ] 键盘交互

**交付物**: 可交互的 TUI 界面

---

### 阶段 5: 插件集成 (Plugin Integration)

**目标**: 完成 OpenCode 插件集成

**任务列表**:
1. 插件入口 (index.ts)
   - [ ] 插件注册
   - [ ] 工具定义
   - [ ] Hook 注册
   - [ ] 初始化逻辑

2. 测试与文档
   - [ ] 单元测试
   - [ ] 集成测试
   - [ ] 使用文档

**交付物**: 完整可用的插件

---

## 文件结构

```
.opencode/
├── task-manager/
│   ├── tasks.yaml          # 任务配置文件
│   ├── tasks.json          # 任务数据存储
│   ├── queue.json          # 队列状态
│   └── logs/               # 日志目录
│
└── plugins/
    └── task-manager/
        ├── index.ts         # 插件入口
        ├── package.json     # 依赖配置
        └── src/
            ├── types.ts     # 类型定义
            ├── events.ts    # 事件系统
            ├── queue.ts     # 任务队列
            ├── executor.ts  # 任务执行器
            ├── monitor.ts   # 状态监控
            ├── retry.ts     # 重试管理
            ├── storage/
            │   ├── index.ts
            │   └── file-store.ts
            ├── config/
            │   ├── index.ts
            │   └── parser.ts
            ├── api/
            │   └── routes.ts
            └── tui/
                ├── index.tsx
                └── components/
```

## 开发日志

每个阶段完成后，在 docs/ 目录下记录开发日志。