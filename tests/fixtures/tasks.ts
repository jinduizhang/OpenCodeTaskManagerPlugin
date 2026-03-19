/**
 * Test fixtures and utilities
 */

import type { Task, CreateTaskInput, TaskStatus, TaskPriority } from "../../src/types";

// Test task data
export const createTestTaskInput = (
  overrides: Partial<CreateTaskInput> = {}
): CreateTaskInput => ({
  title: "Test Task",
  agent: "explore",
  prompt: "This is a test task",
  priority: "medium",
  retryCount: 0,
  source: "manual",
  ...overrides,
});

export const createHighPriorityTask = (): CreateTaskInput =>
  createTestTaskInput({
    title: "High Priority Task",
    priority: "high",
  });

export const createLowPriorityTask = (): CreateTaskInput =>
  createTestTaskInput({
    title: "Low Priority Task",
    priority: "low",
  });

// Mock task factory
export const createMockTask = (
  status: TaskStatus = "pending",
  overrides: Partial<Task> = {}
): Task => ({
  id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  title: "Mock Task",
  agent: "explore",
  prompt: "Mock prompt",
  priority: "medium",
  retryCount: 0,
  currentRetry: 0,
  status,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  source: "manual",
  ...overrides,
});
