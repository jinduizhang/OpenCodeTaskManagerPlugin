/**
 * E2E Test: Full Execution Flow
 * 
 * Tests the complete flow: Plugin Start → Task Create → Execute → Complete
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TaskManagerPlugin } from "../../../index";
import { createMockPluginContext, MockOpenCodeClient } from "../../mocks/mock-context";
import { createTempDir, cleanupTempDir } from "../../utils/temp-dir";
import type { PluginContext, PluginReturn } from "../../../src/types";
import * as fs from "fs";

describe("E2E: Full Execution Flow", () => {
  let tempDir: string;
  let ctx: PluginContext & { client: MockOpenCodeClient };
  let pluginReturn: PluginReturn;

  beforeEach(async () => {
    tempDir = createTempDir();
    ctx = createMockPluginContext({ directory: tempDir }) as PluginContext & { client: MockOpenCodeClient };
    pluginReturn = await TaskManagerPlugin(ctx as any);
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("should execute complete flow: add → start → complete", async () => {
    // Step 1: Add a task
    const addTool = pluginReturn.tool!["task-add"];
    const addResult = await addTool.execute(
      { 
        title: "Full Flow Test", 
        agent: "explore", 
        prompt: "Test the full execution flow" 
      },
      { directory: tempDir, worktree: tempDir }
    );

    expect(addResult.success).toBe(true);
    const taskId = addResult.taskId;

    // Step 2: Verify task is pending
    const statusTool = pluginReturn.tool!["task-status"];
    let statusResult = await statusTool.execute(
      { taskId },
      { directory: tempDir, worktree: tempDir }
    );
    expect(statusResult.task.status).toBe("pending");

    // Step 3: Start queue
    const startTool = pluginReturn.tool!["queue-start"];
    await startTool.execute({}, { directory: tempDir, worktree: tempDir });

    // Wait for async execution to complete (session creation happens asynchronously)
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Step 4: Verify session was created
    const sessionCalls = ctx.client.getCallHistory("session.create");
    expect(sessionCalls.length).toBeGreaterThan(0);

    // Step 5: Verify task is running
    statusResult = await statusTool.execute(
      { taskId },
      { directory: tempDir, worktree: tempDir }
    );
    expect(statusResult.task.status).toBe("running");

    // Step 6: Simulate session completion
    const sessions = ctx.client.getAllSessions();
    if (sessions.length > 0) {
      const sessionId = sessions[0].id;
      
      // Trigger session.idle hook
      await pluginReturn["session.idle"]!({ sessionID: sessionId }, {});
    }

    // Step 7: Verify task completed
    statusResult = await statusTool.execute(
      { taskId },
      { directory: tempDir, worktree: tempDir }
    );
    expect(statusResult.task.status).toBe("success");
  });

  it("should handle priority ordering", async () => {
    const addTool = pluginReturn.tool!["task-add"];

    // Add low priority task first
    await addTool.execute(
      { title: "Low Priority", agent: "explore", prompt: "Low", priority: "low" },
      { directory: tempDir, worktree: tempDir }
    );

    // Add high priority task
    const highResult = await addTool.execute(
      { title: "High Priority", agent: "explore", prompt: "High", priority: "high" },
      { directory: tempDir, worktree: tempDir }
    );

    // Add medium priority task
    await addTool.execute(
      { title: "Medium Priority", agent: "explore", prompt: "Medium", priority: "medium" },
      { directory: tempDir, worktree: tempDir }
    );

    // Start queue
    const startTool = pluginReturn.tool!["queue-start"];
    await startTool.execute({}, { directory: tempDir, worktree: tempDir });

    // Verify high priority task is running first
    const statusTool = pluginReturn.tool!["task-status"];
    const statusResult = await statusTool.execute(
      { taskId: highResult.taskId },
      { directory: tempDir, worktree: tempDir }
    );
    expect(statusResult.task.status).toBe("running");
  });

  it("should persist data across restarts", async () => {
    // Add a task
    const addTool = pluginReturn.tool!["task-add"];
    await addTool.execute(
      { title: "Persistence Test", agent: "explore", prompt: "Test" },
      { directory: tempDir, worktree: tempDir }
    );

    // Verify tasks.json exists
    const tasksFile = `${tempDir}/.opencode/task-manager/tasks.json`;
    expect(fs.existsSync(tasksFile)).toBe(true);

    // Read and verify content
    const content = JSON.parse(fs.readFileSync(tasksFile, "utf-8"));
    expect(content.tasks).toHaveLength(1);
    expect(content.tasks[0].title).toBe("Persistence Test");
  });
});