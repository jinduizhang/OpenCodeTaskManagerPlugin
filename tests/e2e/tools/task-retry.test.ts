/**
 * E2E Test: task-retry Tool
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TaskManagerPlugin } from "../../../index";
import { createMockPluginContext } from "../../mocks/mock-context";
import { createTempDir, cleanupTempDir } from "../../utils/temp-dir";
import type { PluginContext, PluginReturn } from "../../../src/types";
import * as fs from "fs";

describe("E2E: task-retry Tool", () => {
  let tempDir: string;
  let ctx: PluginContext;
  let pluginReturn: PluginReturn;

  beforeEach(async () => {
    tempDir = createTempDir();
    ctx = createMockPluginContext({ directory: tempDir });
    pluginReturn = await TaskManagerPlugin.setup(ctx);
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("should fail to retry non-failed task", async () => {
    // Add a pending task
    const addTool = pluginReturn.tool!["task-add"];
    const addResult = await addTool.execute(
      { title: "Pending Task", agent: "explore", prompt: "Test" },
      { directory: tempDir, worktree: tempDir }
    );

    const retryTool = pluginReturn.tool!["task-retry"];
    const result = await retryTool.execute(
      { taskId: addResult.taskId },
      { directory: tempDir, worktree: tempDir }
    );

    expect(result).toHaveProperty("success", false);
    expect(result.error).toContain("只能重试 failed");
  });

  it("should fail to retry non-existing task", async () => {
    const retryTool = pluginReturn.tool!["task-retry"];
    const result = await retryTool.execute(
      { taskId: "non-existing-id" },
      { directory: tempDir, worktree: tempDir }
    );

    expect(result).toHaveProperty("success", false);
  });

  it("should retry failed task", async () => {
    // Create a failed task manually
    const tasksFile = `${tempDir}/.opencode/task-manager/tasks.json`;
    const taskId = "task-failed-test";
    
    const tasksData = {
      version: "1.0.0",
      updatedAt: Date.now(),
      tasks: [{
        id: taskId,
        title: "Failed Task",
        agent: "explore",
        prompt: "Test",
        priority: "medium",
        retryCount: 2,
        currentRetry: 1,
        status: "failed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        source: "manual",
      }]
    };
    fs.writeFileSync(tasksFile, JSON.stringify(tasksData, null, 2));

    // Reload plugin to pick up the task
    pluginReturn = await TaskManagerPlugin.setup(ctx);

    const retryTool = pluginReturn.tool!["task-retry"];
    const result = await retryTool.execute(
      { taskId },
      { directory: tempDir, worktree: tempDir }
    );

    expect(result).toHaveProperty("success", true);
  });
});