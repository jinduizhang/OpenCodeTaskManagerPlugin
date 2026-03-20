# OpenCode Task Manager Plugin

一个为 OpenCode 构建的任务队列插件，用于批量处理文件。

## 功能特性

- **任务队列**：扫描目录文件，创建任务队列
- **串行/并行执行**：支持串行（默认）或批量并行执行
- **Session 管理**：每个任务创建独立 Session
- **结果汇总**：汇总所有任务的执行结果
- **项目隔离**：不同项目的队列互不干扰

## 安装

### 步骤 1：复制插件文件

复制 `task-manager.ts` 到项目的 `.opencode/plugins/task-manager.ts`

### 步骤 2：添加依赖（必配）

在 `.opencode/package.json` 中添加依赖：

```json
{
  "dependencies": {
    "@opencode-ai/plugin": "^1.2.27"
  }
}
```

> ⚠️ **必配项**：`@opencode-ai/plugin` 是 OpenCode 插件开发 SDK，缺少此依赖插件无法运行。

### 步骤 3：安装依赖

```bash
cd .opencode
npm install
```

### 步骤 4：复制命令文件（可选）

复制 `commands/` 目录下的文件到 `.opencode/commands/`

## 使用方法

### 工具调用

```
# 创建任务队列
task-create dir="src/main/java" ext="java" recursive=true prompt="分析这个文件"

# 启动队列
task-start

# 查看状态
task-status

# 汇总结果
task-summary

# 停止队列
task-stop
```

### 命令调用（交互式）

```
/task-create
/task-start
/task-status
/task-summary
```

## 参数说明

### task-create

| 参数 | 说明 | 默认值 | 示例 |
|------|------|--------|------|
| `dir` | 目录路径（支持相对/绝对路径） | - | `src/main/java` 或 `D:\project\src` |
| `ext` | 文件后缀 | `java` | `java`、`ts`、`tsx` |
| `recursive` | 是否递归扫描子目录 | `false` | `true` / `false` |
| `prompt` | 任务提示词，`{filename}` 代表文件名 | - | `分析 {filename}` |
| `batchSize` | 每次并行执行的任务数量 | `1` | `1`（串行）、`3`（并行3个） |

### 示例

```
# 串行执行（默认）
task-create dir="src/main/java" ext="java" recursive=true prompt="为这个文件编写单元测试"

# 并行执行，每次同时执行3个任务
task-create dir="src/main/java" ext="java" recursive=true prompt="分析代码" batchSize=3

# 使用绝对路径
task-create dir="D:\OpenCode\config-history\src" ext="java" recursive=true prompt="分析代码结构"
```

## 执行流程

1. `task-create` 扫描目录，创建任务队列
2. `task-start` 启动队列
3. 根据 batchSize 创建 N 个 Session，并行发送 prompt
4. 等待这批 Session 完成
5. 自动创建下一批 Session
6. 重复直到所有任务完成
7. `task-summary` 查看结果汇总

## batchSize 说明

| 值 | 执行方式 | 适用场景 |
|----|----------|----------|
| `1` | 串行，一个接一个 | 默认值，适合需要顺序执行的任务 |
| `2-5` | 小批量并行 | 适合独立任务，提高效率 |
| `6+` | 大批量并行 | 适合大量独立文件，但会占用更多资源 |

## Session 显示

- 每个任务创建独立 Session
- Session 标题为文件名（如 `ConfigServiceImpl.java`）

## 注意事项

- 任务执行时间最长 1 小时
- 队列按项目目录隔离，不同项目互不干扰
- 执行过程中可以切换 Session 查看进度

## 许可证

MIT