/**
 * OpenCode Task Manager Plugin - 任务列表组件
 */

import React from "react";
import { Box, Text } from "ink";
import type { Task, TaskStatus, TaskPriority } from "../../types";

/**
 * 状态图标
 */
const STATUS_ICONS: Record<TaskStatus, string> = {
  pending: "○",
  running: "●",
  success: "✓",
  failed: "✗",
  cancelled: "⊘",
};

/**
 * 状态颜色
 */
const STATUS_COLORS: Record<TaskStatus, string> = {
  pending: "yellow",
  running: "blue",
  success: "green",
  failed: "red",
  cancelled: "gray",
};

/**
 * 优先级颜色
 */
const PRIORITY_COLORS: Record<TaskPriority, string> = {
  high: "red",
  medium: "yellow",
  low: "gray",
};

/**
 * 格式化时间
 */
function formatTime(timestamp: number | undefined): string {
  if (!timestamp) return "-";
  const date = new Date(timestamp);
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * 格式化持续时间
 */
function formatDuration(startedAt: number | undefined): string {
  if (!startedAt) return "-";
  const duration = Date.now() - startedAt;
  const seconds = Math.floor(duration / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * 任务项属性
 */
interface TaskItemProps {
  task: Task;
  isSelected: boolean;
}

/**
 * 任务项组件
 */
export function TaskItem({ task, isSelected }: TaskItemProps) {
  const statusIcon = STATUS_ICONS[task.status];
  const statusColor = STATUS_COLORS[task.status];
  const priorityColor = PRIORITY_COLORS[task.priority];

  // 格式化显示时间
  const displayTime =
    task.status === "running"
      ? formatDuration(task.startedAt)
      : formatTime(task.createdAt);

  return (
    <Box>
      {/* 选中指示器 */}
      <Text color={isSelected ? "cyan" : undefined}>
        {isSelected ? "► " : "  "}
      </Text>

      {/* 状态图标 */}
      <Text color={statusColor}>{statusIcon} </Text>

      {/* 优先级标签 */}
      <Text color={priorityColor} bold>
        [{task.priority.toUpperCase().padEnd(4, " ")}]
      </Text>

      {/* 任务标题 */}
      <Text
        color={isSelected ? "white" : "gray"}
        bold={isSelected}
      >
        {" "}
        {task.title.length > 30 ? task.title.slice(0, 30) + "..." : task.title.padEnd(32, " ")}
      </Text>

      {/* 状态 */}
      <Text color={statusColor}> {task.status.padEnd(8, " ")} </Text>

      {/* 时间 */}
      <Text color="gray">{displayTime}</Text>

      {/* 重试信息 */}
      {task.status === "failed" && task.currentRetry < task.retryCount && (
        <Text color="yellow">
          {" "}
          (重试 {task.currentRetry}/{task.retryCount})
        </Text>
      )}
    </Box>
  );
}

/**
 * 任务列表属性
 */
interface TaskListProps {
  tasks: Task[];
  selectedIndex: number;
  title?: string;
}

/**
 * 任务列表组件
 */
export function TaskList({ tasks, selectedIndex, title = "任务列表" }: TaskListProps) {
  return (
    <Box flexDirection="column">
      {/* 标题 */}
      <Box borderStyle="single" borderColor="gray">
        <Text bold color="white">
          {` ${title} `}
        </Text>
        <Text color="gray">({tasks.length} 个任务)</Text>
      </Box>

      {/* 任务列表 */}
      {tasks.length === 0 ? (
        <Box paddingX={1}>
          <Text color="gray">暂无任务</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {tasks.map((task, index) => (
            <TaskItem
              key={task.id}
              task={task}
              isSelected={index === selectedIndex}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}