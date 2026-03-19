/**
 * OpenCode Task Manager Plugin - TUI 自定义 Hooks
 */

import { useState, useEffect, useCallback } from "react";
import type { Task, QueueState, QueueStatistics, CreateTaskInput } from "../../types";

/**
 * 模拟的队列状态管理（实际使用时会连接到真实的 QueueManager）
 */
interface UseTaskQueueOptions {
  initialState?: QueueState;
  onAddTask?: (input: CreateTaskInput) => Promise<Task>;
  onCancelTask?: (taskId: string) => Promise<boolean>;
  onRetryTask?: (taskId: string) => Promise<boolean>;
  onDeleteTask?: (taskId: string) => Promise<boolean>;
  refreshInterval?: number;
}

/**
 * 任务队列 Hook
 */
export function useTaskQueue(options: UseTaskQueueOptions = {}) {
  const {
    initialState,
    onAddTask,
    onCancelTask,
    onRetryTask,
    onDeleteTask,
    refreshInterval = 1000,
  } = options;

  const [state, setState] = useState<QueueState>(
    initialState || {
      tasks: [],
      isRunning: false,
      statistics: {
        total: 0,
        pending: 0,
        running: 0,
        success: 0,
        failed: 0,
        cancelled: 0,
      },
    }
  );

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 刷新状态
  const refresh = useCallback(() => {
    // 实际实现中会从 QueueManager 获取状态
    // 这里只是一个占位符
  }, []);

  // 定时刷新
  useEffect(() => {
    if (refreshInterval > 0) {
      const timer = setInterval(refresh, refreshInterval);
      return () => clearInterval(timer);
    }
  }, [refreshInterval, refresh]);

  // 添加任务
  const addTask = useCallback(
    async (input: CreateTaskInput) => {
      setIsLoading(true);
      setError(null);

      try {
        if (onAddTask) {
          const task = await onAddTask(input);
          return task;
        }
        throw new Error("onAddTask not provided");
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [onAddTask]
  );

  // 取消任务
  const cancelTask = useCallback(
    async (taskId: string) => {
      setIsLoading(true);
      setError(null);

      try {
        if (onCancelTask) {
          return await onCancelTask(taskId);
        }
        throw new Error("onCancelTask not provided");
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [onCancelTask]
  );

  // 重试任务
  const retryTask = useCallback(
    async (taskId: string) => {
      setIsLoading(true);
      setError(null);

      try {
        if (onRetryTask) {
          return await onRetryTask(taskId);
        }
        throw new Error("onRetryTask not provided");
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [onRetryTask]
  );

  // 删除任务
  const deleteTask = useCallback(
    async (taskId: string) => {
      setIsLoading(true);
      setError(null);

      try {
        if (onDeleteTask) {
          return await onDeleteTask(taskId);
        }
        throw new Error("onDeleteTask not provided");
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [onDeleteTask]
  );

  return {
    // 状态
    tasks: state.tasks,
    currentTask: state.currentTask,
    isRunning: state.isRunning,
    statistics: state.statistics,
    isLoading,
    error,

    // 操作
    addTask,
    cancelTask,
    retryTask,
    deleteTask,
    refresh,

    // 更新状态（供外部使用）
    setState,
  };
}

/**
 * 键盘输入 Hook
 */
export function useKeyboardInput(
  handlers: Record<string, () => void>
) {
  useEffect(() => {
    const handleKeyPress = (key: string) => {
      const handler = handlers[key];
      if (handler) {
        handler();
      }
    };

    // 使用 Ink 的 useInput 处理键盘输入
    // 这里提供一个简化的实现
    const stdin = process.stdin;
    if (stdin && stdin.isTTY) {
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding("utf8");

      const onData = (data: string) => {
        // 处理特殊键
        if (data === "\u001b[A") {
          handleKeyPress("up");
        } else if (data === "\u001b[B") {
          handleKeyPress("down");
        } else if (data === "\r") {
          handleKeyPress("enter");
        } else if (data === "\u001b") {
          handleKeyPress("escape");
        } else {
          handleKeyPress(data.toLowerCase());
        }
      };

      stdin.on("data", onData);

      return () => {
        stdin.off("data", onData);
        stdin.setRawMode(false);
        stdin.pause();
      };
    }
  }, [handlers]);
}

/**
 * 任务选择 Hook
 */
export function useTaskSelection(tasks: Task[]) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // 确保选中索引在有效范围内
  useEffect(() => {
    if (selectedIndex >= tasks.length) {
      setSelectedIndex(Math.max(0, tasks.length - 1));
    }
  }, [tasks.length, selectedIndex]);

  const moveUp = useCallback(() => {
    setSelectedIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const moveDown = useCallback(() => {
    setSelectedIndex((prev) => Math.min(tasks.length - 1, prev + 1));
  }, [tasks.length]);

  const selectedTask = tasks[selectedIndex] || null;

  return {
    selectedIndex,
    selectedTask,
    moveUp,
    moveDown,
    setSelectedIndex,
  };
}