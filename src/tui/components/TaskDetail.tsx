/**
 * OpenCode Task Manager Plugin - 任务详情组件
 */

import React from "react";
import { Box, Text } from "ink";
import type { Task } from "../../types";

/**
 * 格式化时间
 */
function formatDateTime(timestamp: number | undefined): string {
  if (!timestamp) return "-";
  const date = new Date(timestamp);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * 格式化持续时间
 */
function formatDuration(startedAt?: number, completedAt?: number): string {
  if (!startedAt) return "-";
  
  const end = completedAt || Date.now();
  const duration = end - startedAt;
  const seconds = Math.floor(duration / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * 状态颜色
 */
const STATUS_COLORS: Record<string, string> = {
  pending: "yellow",
  running: "blue",
  success: "green",
  failed: "red",
  cancelled: "gray",
};

/**
 * 任务详情属性
 */
interface TaskDetailProps {
  task: Task | null;
}

/**
 * 任务详情组件
 */
export function TaskDetail({ task }: TaskDetailProps) {
  if (!task) {
    return (
      <Box flexDirection="column" borderStyle="single" borderColor="gray">
        <Text bold color="white">
          {" 任务详情 "}
        </Text>
        <Box paddingX={1}>
          <Text color="gray">选择一个任务查看详情</Text>
        </Box>
      </Box>
    );
  }

  const statusColor = STATUS_COLORS[task.status] || "white";

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray">
      {/* 标题 */}
      <Box>
        <Text bold color="white">
          {" 任务详情 "}
        </Text>
      </Box>

      {/* 基本信息 */}
      <Box flexDirection="column" paddingX={1}>
        {/* ID */}
        <Box>
          <Text color="gray">ID: </Text>
          <Text>{task.id}</Text>
        </Box>

        {/* 标题 */}
        <Box>
          <Text color="gray">标题: </Text>
          <Text bold>{task.title}</Text>
        </Box>

        {/* Agent */}
        <Box>
          <Text color="gray">Agent: </Text>
          <Text color="cyan">{task.agent}</Text>
          {task.skill && (
            <Text color="magenta"> (+{task.skill})</Text>
          )}
        </Box>

        {/* 状态 */}
        <Box>
          <Text color="gray">状态: </Text>
          <Text color={statusColor} bold>
            {task.status}
          </Text>
        </Box>

        {/* 优先级 */}
        <Box>
          <Text color="gray">优先级: </Text>
          <Text color={task.priority === "high" ? "red" : task.priority === "medium" ? "yellow" : "gray"}>
            {task.priority}
          </Text>
        </Box>

        {/* 时间信息 */}
        <Box>
          <Text color="gray">创建时间: </Text>
          <Text>{formatDateTime(task.createdAt)}</Text>
        </Box>

        {task.startedAt && (
          <Box>
            <Text color="gray">开始时间: </Text>
            <Text>{formatDateTime(task.startedAt)}</Text>
          </Box>
        )}

        {task.completedAt && (
          <Box>
            <Text color="gray">完成时间: </Text>
            <Text>{formatDateTime(task.completedAt)}</Text>
          </Box>
        )}

        {task.startedAt && (
          <Box>
            <Text color="gray">执行时长: </Text>
            <Text>{formatDuration(task.startedAt, task.completedAt)}</Text>
          </Box>
        )}

        {/* 重试信息 */}
        {task.retryCount > 0 && (
          <Box>
            <Text color="gray">重试次数: </Text>
            <Text>
              {task.currentRetry} / {task.retryCount}
            </Text>
          </Box>
        )}

        {/* 错误信息 */}
        {task.error && (
          <Box flexDirection="column">
            <Text color="gray">错误信息:</Text>
            <Box marginLeft={2}>
              <Text color="red">{task.error}</Text>
            </Box>
          </Box>
        )}

        {/* Prompt */}
        <Box flexDirection="column">
          <Text color="gray">Prompt:</Text>
          <Box marginLeft={2} marginTop={0}>
            <Text color="white">
              {task.prompt.length > 100
                ? task.prompt.slice(0, 100) + "..."
                : task.prompt}
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}