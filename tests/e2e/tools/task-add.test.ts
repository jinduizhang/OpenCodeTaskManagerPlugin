/**
 * E2E Test: task-add Tool
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TaskManagerPlugin } from "../../../index";
import { createMockPluginContext } from "../../mocks/mock-context";
import { createTempDir, cleanupTempDir } from "../../utils/temp-dir";
import type { PluginContext, PluginReturn } from "../../../src/types";
import * as fs from "fs";

describe("E2E: task-add Tool", () => {
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

  it("should add task with required fields", async () => {
    const tool = pluginReturn.tool!["task-add"];
    
    const result = await tool.execute(
      {
        title: "Test Task",
        agent: "explore",
        prompt: "Analyze the code structure",
      },
      { directory: tempDir, worktree: tempDir }
    );

    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("taskId");
    expect(result).toHaveProperty("message");
  });

  it("should add task with optional fields", async () => {
    const tool = pluginReturn.tool!["task-add"];
    
    const result = await tool.execute(
      {
        title: "High Priority Task",
        agent: "oracle",
        prompt: "Review this code",
        priority: "high",
        retryCount: 3,
        skill: "git-master",
      },
      { directory: tempDir, worktree: tempDir }
    );

    expect(result).toHaveProperty("success", true);
  });

  it("should persist task to storage", async () => {
    const tool = pluginReturn.tool!["task-add"];
    
    await tool.execute(
      {
        title: "Persisted Task",
        agent: "explore",
        prompt: "Test persistence",
      },
      { directory: tempDir, worktree: tempDir }
    );

    // Verify tasks.json was created
    const tasksFile = `${tempDir}/.opencode/task-manager/tasks.json`;
    expect(fs.existsSync(tasksFile)).toBe(true);

    const content = JSON.parse(fs.readFileSync(tasksFile, "utf-8"));
    expect(content.tasks).toHaveLength(1);
    expect(content.tasks[0].title).toBe("Persisted Task");
  });
});