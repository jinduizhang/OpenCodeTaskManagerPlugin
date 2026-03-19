/**
 * OpenCode Task Manager Plugin - TUI 主应用
 */

import React, { useState, useCallback, useEffect } from "react";
import { render, Box, Text, useApp, useInput } from "ink";
import {
  TaskList,
  TaskDetail,
  ControlPanel,
  AddTaskDialog,
} from "./components";
import { useTaskQueue, useTaskSelection } from "./hooks/useTaskQueue";
import type { Task, CreateTaskInput, QueueState } from "../types";

/**
 * 主应用属性
 */
interface TaskManagerAppProps {
  initialState?: QueueState;
  onAddTask?: (input: CreateTaskInput) => Promise<Task>;
  onCancelTask?: (taskId: string) => Promise<boolean>;
  onRetryTask?: (taskId: string) => Promise<boolean>;
  onDeleteTask?: (taskId: string) => Promise<boolean>;
  onStartQueue?: () => void;
  onStopQueue?: () => void;
  onExit?: () => void;
}

/**
 * 主应用组件
 */
export function TaskManagerApp({
  initialState,
  onAddTask,
  onCancelTask,
  onRetryTask,
  onDeleteTask,
  onStartQueue,
  onStopQueue,
  onExit,
}: TaskManagerAppProps) {
  const { exit } = useApp();

  // 队列状态
  const {
    tasks,
    currentTask,
    isRunning,
    statistics,
    addTask,
    cancelTask,
    retryTask,
    deleteTask,
  } = useTaskQueue({
    initialState,
    onAddTask,
    onCancelTask,
    onRetryTask,
    onDeleteTask,
  });

  // 任务选择
  const { selectedIndex, selectedTask, moveUp, moveDown } = useTaskSelection(tasks);

  // 对话框状态
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // 显示消息
  const showMessage = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }, []);

  // 键盘输入处理
  useInput(
    (input, key) => {
      // 如果对话框打开，不处理全局快捷键
      if (showAddDialog) return;

      // 导航
      if (key.upArrow) {
        moveUp();
      } else if (key.downArrow) {
        moveDown();
      }

      // 添加任务
      else if (input === "a" || input === "A") {
        setShowAddDialog(true);
      }

      // 取消任务
      else if (input === "c" || input === "C") {
        if (selectedTask && selectedTask.status === "pending") {
          cancelTask(selectedTask.id).then((success) => {
            showMessage(success ? "任务已取消" : "取消失败");
          });
        } else {
          showMessage("只能取消待执行的任务");
        }
      }

      // 重试任务
      else if (input === "r" || input === "R") {
        if (selectedTask && selectedTask.status === "failed") {
          retryTask(selectedTask.id).then((success) => {
            showMessage(success ? "任务已重新加入队列" : "重试失败");
          });
        } else if (selectedTask) {
          showMessage("只能重试失败的任务");
        }
      }

      // 删除任务
      else if (input === "d" || input === "D") {
        if (selectedTask && selectedTask.status !== "running") {
          deleteTask(selectedTask.id).then((success) => {
            showMessage(success ? "任务已删除" : "删除失败");
          });
        } else if (selectedTask) {
          showMessage("无法删除正在执行的任务");
        }
      }

      // 启动/停止队列
      else if (input === "s" || input === "S") {
        if (isRunning) {
          onStopQueue?.();
          showMessage("队列已停止");
        } else {
          onStartQueue?.();
          showMessage("队列已启动");
        }
      }

      // 退出
      else if (input === "q" || input === "Q" || key.escape) {
        onExit?.();
        exit();
      }
    },
    { isActive: !showAddDialog }
  );

  // 添加任务提交
  const handleAddTask = useCallback(
    async (input: CreateTaskInput) => {
      try {
        await addTask(input);
        setShowAddDialog(false);
        showMessage("任务已添加");
      } catch {
        showMessage("添加任务失败");
      }
    },
    [addTask]
  );

  // 取消添加
  const handleCancelAdd = useCallback(() => {
    setShowAddDialog(false);
  }, []);

  return (
    <Box flexDirection="column" minHeight={20}>
      {/* 状态栏 */}
      <ControlPanel isRunning={isRunning} statistics={statistics} />

      {/* 主内容区 */}
      <Box flexDirection="row" minHeight={10}>
        {/* 任务列表 */}
        <Box width="60%" flexDirection="column">
          <TaskList tasks={tasks} selectedIndex={selectedIndex} />
        </Box>

        {/* 任务详情 */}
        <Box width="40%" flexDirection="column">
          <TaskDetail task={selectedTask} />
        </Box>
      </Box>

      {/* 当前执行的任务 */}
      {currentTask && (
        <Box borderStyle="single" borderColor="blue" marginTop={1}>
          <Text color="blue">正在执行: </Text>
          <Text bold>{currentTask.title}</Text>
          <Text color="gray"> ({currentTask.agent})</Text>
        </Box>
      )}

      {/* 消息提示 */}
      {message && (
        <Box marginTop={1}>
          <Text color="yellow">{message}</Text>
        </Box>
      )}

      {/* 添加任务对话框 */}
      {showAddDialog && (
        <Box marginTop={1}>
          <AddTaskDialog onSubmit={handleAddTask} onCancel={handleCancelAdd} />
        </Box>
      )}
    </Box>
  );
}

/**
 * 启动 TUI
 */
export function startTUI(options: TaskManagerAppProps = {}) {
  const { unmount } = render(<TaskManagerApp {...options} />);
  return { unmount };
}