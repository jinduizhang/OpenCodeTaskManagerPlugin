/**
 * E2E Test: task-status Tool
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TaskManagerPlugin } from "../../../index";
import { createMockPluginContext } from "../../mocks/mock-context";
import { createTempDir, cleanupTempDir } from "../../utils/temp-dir";
import type { PluginContext, PluginReturn } from "../../../src/types";

describe("E2E: task-status Tool", () => {
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

  it("should return task status for existing task", async () => {
    // Add a task first
    const addTool = pluginReturn.tool!["task-add"];
    const addResult = await addTool.execute(
      { title: "Status Test Task", agent: "explore", prompt: "Test" },
      { directory: tempDir, worktree: tempDir }
    );

    const statusTool = pluginReturn.tool!["task-status"];
    const result = await statusTool.execute(
      { taskId: addResult.taskId },
      { directory: tempDir, worktree: tempDir }
    );

    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("task");
    expect(result.task.title).toBe("Status Test Task");
    expect(result.task.status).toBe("pending");
  });

  it("should return error for non-existing task", async () => {
    const statusTool = pluginReturn.tool!["task-status"];
    const result = await statusTool.execute(
      { taskId: "non-existing-id" },
      { directory: tempDir, worktree: tempDir }
    );

    expect(result).toHaveProperty("success", false);
    expect(result).toHaveProperty("error");
  });
});