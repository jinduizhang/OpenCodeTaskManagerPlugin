/**
 * E2E Test: task-list Tool
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TaskManagerPlugin } from "../../../index";
import { createMockPluginContext } from "../../mocks/mock-context";
import { createTempDir, cleanupTempDir } from "../../utils/temp-dir";
import type { PluginContext, PluginReturn } from "../../../src/types";

describe("E2E: task-list Tool", () => {
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

  it("should list empty tasks", async () => {
    const tool = pluginReturn.tool!["task-list"];
    
    const result = await tool.execute({}, { directory: tempDir, worktree: tempDir });

    expect(result).toHaveProperty("total", 0);
    expect(result).toHaveProperty("tasks");
    expect(result.tasks).toHaveLength(0);
  });

  it("should list all tasks", async () => {
    // Add tasks first
    const addTool = pluginReturn.tool!["task-add"];
    await addTool.execute(
      { title: "Task 1", agent: "explore", prompt: "Test 1" },
      { directory: tempDir, worktree: tempDir }
    );
    await addTool.execute(
      { title: "Task 2", agent: "explore", prompt: "Test 2" },
      { directory: tempDir, worktree: tempDir }
    );

    const listTool = pluginReturn.tool!["task-list"];
    const result = await listTool.execute({}, { directory: tempDir, worktree: tempDir });

    expect(result.total).toBe(2);
    expect(result.tasks).toHaveLength(2);
  });

  it("should filter tasks by status", async () => {
    const addTool = pluginReturn.tool!["task-add"];
    await addTool.execute(
      { title: "Pending Task", agent: "explore", prompt: "Test" },
      { directory: tempDir, worktree: tempDir }
    );

    const listTool = pluginReturn.tool!["task-list"];
    const result = await listTool.execute(
      { status: "pending" },
      { directory: tempDir, worktree: tempDir }
    );

    expect(result.tasks.every((t: any) => t.status === "pending")).toBe(true);
  });
});