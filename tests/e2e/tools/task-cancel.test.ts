/**
 * E2E Test: task-cancel Tool
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TaskManagerPlugin } from "../../../index";
import { createMockPluginContext } from "../../mocks/mock-context";
import { createTempDir, cleanupTempDir } from "../../utils/temp-dir";
import type { PluginContext, PluginReturn } from "../../../src/types";

describe("E2E: task-cancel Tool", () => {
  let tempDir: string;
  let ctx: PluginContext;
  let pluginReturn: PluginReturn;

  beforeEach(async () => {
    tempDir = createTempDir();
    ctx = createMockPluginContext({ directory: tempDir });
    pluginReturn = await TaskManagerPlugin(ctx as any);
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("should cancel pending task", async () => {
    // Add a task
    const addTool = pluginReturn.tool!["task-add"];
    const addResult = await addTool.execute(
      { title: "Task to Cancel", agent: "explore", prompt: "Test" },
      { directory: tempDir, worktree: tempDir }
    );

    const cancelTool = pluginReturn.tool!["task-cancel"];
    const result = await cancelTool.execute(
      { taskId: addResult.taskId },
      { directory: tempDir, worktree: tempDir }
    );

    expect(result).toHaveProperty("success", true);

    // Verify task is cancelled
    const statusTool = pluginReturn.tool!["task-status"];
    const statusResult = await statusTool.execute(
      { taskId: addResult.taskId },
      { directory: tempDir, worktree: tempDir }
    );
    expect(statusResult.task.status).toBe("cancelled");
  });

  it("should fail to cancel non-existing task", async () => {
    const cancelTool = pluginReturn.tool!["task-cancel"];
    const result = await cancelTool.execute(
      { taskId: "non-existing-id" },
      { directory: tempDir, worktree: tempDir }
    );

    expect(result).toHaveProperty("success", false);
  });
});