/**
 * E2E Test: Events and Persistence
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TaskManagerPlugin } from "../../../index";
import { createMockPluginContext, MockOpenCodeClient } from "../../mocks/mock-context";
import { createTempDir, cleanupTempDir } from "../../utils/temp-dir";
import type { PluginContext, PluginReturn } from "../../../src/types";
import * as fs from "fs";

describe("E2E: Events and Persistence", () => {
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

  describe("Session Events", () => {
    it("should handle session.idle event", async () => {
      // Add and start a task
      const addTool = pluginReturn.tool!["task-add"];
      await addTool.execute(
        { title: "Event Test", agent: "explore", prompt: "Test" },
        { directory: tempDir, worktree: tempDir }
      );

      const startTool = pluginReturn.tool!["queue-start"];
      await startTool.execute({}, { directory: tempDir, worktree: tempDir });

      // Wait for async execution to complete (session creation happens asynchronously)
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Get session ID
      const sessions = ctx.client.getAllSessions();
      expect(sessions.length).toBeGreaterThan(0);

      const sessionId = sessions[0].id;

      // Trigger session.idle hook
      const idleHook = pluginReturn["session.idle"];
      expect(typeof idleHook).toBe("function");

      await idleHook!({ sessionID: sessionId }, {});
    });

    it("should handle session.error event", async () => {
      // Create a running task
      const addTool = pluginReturn.tool!["task-add"];
      const addResult = await addTool.execute(
        { title: "Error Test", agent: "explore", prompt: "Test", retryCount: 1 },
        { directory: tempDir, worktree: tempDir }
      );

      const startTool = pluginReturn.tool!["queue-start"];
      await startTool.execute({}, { directory: tempDir, worktree: tempDir });

      // Wait for async execution to complete (session creation happens asynchronously)
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Get session ID
      const sessions = ctx.client.getAllSessions();
      if (sessions.length > 0) {
        const sessionId = sessions[0].id;

        // Trigger session.error hook
        const errorHook = pluginReturn["session.error"];
        expect(typeof errorHook).toBe("function");

        await errorHook!({ sessionID: sessionId }, { error: "Test error" });
      }
    });
  });

  describe("Persistence", () => {
    it("should persist tasks to JSON file", async () => {
      const addTool = pluginReturn.tool!["task-add"];
      await addTool.execute(
        { title: "Persisted Task", agent: "explore", prompt: "Test" },
        { directory: tempDir, worktree: tempDir }
      );

      const tasksFile = `${tempDir}/.opencode/task-manager/tasks.json`;
      const content = JSON.parse(fs.readFileSync(tasksFile, "utf-8"));

      expect(content.version).toBe("1.0.0");
      expect(content.tasks).toHaveLength(1);
      expect(content.tasks[0].title).toBe("Persisted Task");
    });

    it("should persist queue state", async () => {
      const queueFile = `${tempDir}/.opencode/task-manager/queue.json`;
      
      // Verify queue.json was created
      expect(fs.existsSync(queueFile)).toBe(true);

      const content = JSON.parse(fs.readFileSync(queueFile, "utf-8"));
      expect(content.version).toBe("1.0.0");
      expect(content).toHaveProperty("isRunning");
      expect(content).toHaveProperty("statistics");
    });

    it("should create log files", async () => {
      const logsDir = `${tempDir}/.opencode/task-manager/logs`;
      expect(fs.existsSync(logsDir)).toBe(true);
    });
  });

  describe("Queue State Recovery", () => {
    it("should restore tasks on plugin reload", async () => {
      // Add a task
      const addTool = pluginReturn.tool!["task-add"];
      await addTool.execute(
        { title: "Recovery Test", agent: "explore", prompt: "Test" },
        { directory: tempDir, worktree: tempDir }
      );

      // Reload plugin
      const newPluginReturn = await TaskManagerPlugin(ctx as any);

      // Verify task still exists
      const listTool = newPluginReturn.tool!["task-list"];
      const result = await listTool.execute({}, { directory: tempDir, worktree: tempDir });

      expect(result.total).toBe(1);
      expect(result.tasks[0].title).toBe("Recovery Test");
    });
  });
});