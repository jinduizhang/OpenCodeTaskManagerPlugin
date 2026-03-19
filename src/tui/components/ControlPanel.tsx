/**
 * OpenCode Task Manager Plugin - 控制面板组件
 */

import React from "react";
import { Box, Text } from "ink";
import type { QueueStatistics } from "../../types";

/**
 * 控制面板属性
 */
interface ControlPanelProps {
  isRunning: boolean;
  statistics: QueueStatistics;
}

/**
 * 控制面板组件
 */
export function ControlPanel({ isRunning, statistics }: ControlPanelProps) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray">
      {/* 状态栏 */}
      <Box justifyContent="space-between">
        {/* 运行状态 */}
        <Box>
          <Text color="gray">队列状态: </Text>
          <Text color={isRunning ? "green" : "yellow"} bold>
            {isRunning ? "● 运行中" : "○ 已停止"}
          </Text>
        </Box>

        {/* 统计信息 */}
        <Box>
          <Text color="gray">待执行: </Text>
          <Text color="yellow">{statistics.pending}</Text>
          <Text color="gray"> | 成功: </Text>
          <Text color="green">{statistics.success}</Text>
          <Text color="gray"> | 失败: </Text>
          <Text color="red">{statistics.failed}</Text>
        </Box>
      </Box>

      {/* 快捷键提示 */}
      <Box justifyContent="space-between" marginTop={1}>
        <Text color="cyan">[↑/↓]</Text>
        <Text color="gray">选择</Text>
        <Text color="cyan">[A]</Text>
        <Text color="gray">添加</Text>
        <Text color="cyan">[C]</Text>
        <Text color="gray">取消</Text>
        <Text color="cyan">[R]</Text>
        <Text color="gray">重试</Text>
        <Text color="cyan">[F]</Text>
        <Text color="gray">刷新</Text>
        <Text color="cyan">[Q/Esc]</Text>
        <Text color="gray">退出</Text>
      </Box>
    </Box>
  );
}

/**
 * 顶部状态栏属性
 */
interface StatusBarProps {
  isRunning: boolean;
  statistics: QueueStatistics;
}

/**
 * 顶部状态栏组件
 */
export function StatusBar({ isRunning, statistics }: StatusBarProps) {
  return (
    <Box
      justifyContent="space-between"
      borderStyle="single"
      borderColor="gray"
    >
      {/* 标题 */}
      <Box>
        <Text bold color="white">
          Task Manager
        </Text>
      </Box>

      {/* 运行状态 */}
      <Box>
        <Text color={isRunning ? "green" : "yellow"}>
          {isRunning ? "● 运行中" : "○ 已停止"}
        </Text>
      </Box>

      {/* 统计 */}
      <Box>
        <Text color="yellow">{statistics.pending}</Text>
        <Text color="gray"> 待执行 | </Text>
        <Text color="green">{statistics.success}</Text>
        <Text color="gray"> 成功 | </Text>
        <Text color="red">{statistics.failed}</Text>
        <Text color="gray"> 失败</Text>
      </Box>

      {/* 快捷键 */}
      <Box>
        <Text color="cyan">[R]</Text>
        <Text color="gray">刷新 </Text>
        <Text color="cyan">[A]</Text>
        <Text color="gray">添加 </Text>
        <Text color="cyan">[Q]</Text>
        <Text color="gray">退出</Text>
      </Box>
    </Box>
  );
}