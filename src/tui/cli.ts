#!/usr/bin/env bun
/**
 * OpenCode Task Manager Plugin - TUI CLI 入口
 */

import { render } from "ink";
import React from "react";
import { TaskManagerApp } from "./index";
import type { QueueState, CreateTaskInput, Task } from "../types";

// 模拟数据（实际使用时会连接到真实的 QueueManager）
const mockState: QueueState = {
  tasks: [
    {
      id: "task-1",
      title: "代码结构分析",
      description: "分析项目代码结构",
      agent: "explore",
      prompt: "分析 src/ 目录的代码结构，找出主要模块和依赖关系",
      priority: "high",
      retryCount: 2,
      currentRetry: 0,
      status: "pending",
      createdAt: Date.now() - 3600000,
      updatedAt: Date.now() - 3600000,
      source: "config",
    },
    {
      id: "task-2",
      title: "生成文档",
      description: "生成 API 文档",
      agent: "build",
      skill: "git-master",
      prompt: "为 API 接口生成文档",
      priority: "medium",
      retryCount: 1,
      currentRetry: 0,
      status: "running",
      startedAt: Date.now() - 1800000,
      sessionId: "ses-xxx",
      createdAt: Date.now() - 7200000,
      updatedAt: Date.now() - 1800000,
      source: "manual",
    },
    {
      id: "task-3",
      title: "清理日志文件",
      agent: "build",
      prompt: "删除 tmp/ 目录下所有超过7天的文件",
      priority: "low",
      retryCount: 0,
      currentRetry: 0,
      status: "success",
      completedAt: Date.now() - 86400000,
      createdAt: Date.now() - 172800000,
      updatedAt: Date.now() - 86400000,
      source: "config",
      result: { success: true, summary: "清理完成" },
    },
    {
      id: "task-4",
      title: "部署测试环境",
      agent: "build",
      prompt: "部署测试环境",
      priority: "medium",
      retryCount: 3,
      currentRetry: 2,
      status: "failed",
      error: "连接超时",
      completedAt: Date.now() - 3600000,
      createdAt: Date.now() - 14400000,
      updatedAt: Date.now() - 3600000,
      source: "manual",
    },
  ],
  isRunning: true,
  statistics: {
    total: 4,
    pending: 1,
    running: 1,
    success: 1,
    failed: 1,
    cancelled: 0,
  },
};

// 模拟操作
const handleAddTask = async (input: CreateTaskInput): Promise<Task> => {
  console.log("Add task:", input);
  return {
    id: `task-${Date.now()}`,
    ...input,
    priority: input.priority || "medium",
    retryCount: input.retryCount || 0,
    currentRetry: 0,
    status: "pending",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    source: input.source || "manual",
  };
};

const handleCancelTask = async (taskId: string): Promise<boolean> => {
  console.log("Cancel task:", taskId);
  return true;
};

const handleRetryTask = async (taskId: string): Promise<boolean> => {
  console.log("Retry task:", taskId);
  return true;
};

const handleDeleteTask = async (taskId: string): Promise<boolean> => {
  console.log("Delete task:", taskId);
  return true;
};

// 启动 TUI
const { unmount } = render(
  React.createElement(TaskManagerApp, {
    initialState: mockState,
    onAddTask: handleAddTask,
    onCancelTask: handleCancelTask,
    onRetryTask: handleRetryTask,
    onDeleteTask: handleDeleteTask,
    onStartQueue: () => console.log("Start queue"),
    onStopQueue: () => console.log("Stop queue"),
    onExit: () => {
      console.log("Exiting...");
      setTimeout(() => {
        unmount();
        process.exit(0);
      }, 100);
    },
  })
);