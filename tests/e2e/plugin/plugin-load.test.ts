/**
 * E2E Test: Plugin Loading
 * 
 * Tests the complete plugin loading process
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TaskManagerPlugin } from "../../../index";
import { createMockPluginContext, MockOpenCodeClient } from "../../mocks/mock-context";
import { createTempDir, cleanupTempDir } from "../../utils/temp-dir";
import type { PluginContext } from "../../../src/types";
import * as fs from "fs";

describe("E2E: Plugin Loading", () => {
  let tempDir: string;
  let ctx: PluginContext & { client: MockOpenCodeClient };

  beforeEach(() => {
    tempDir = createTempDir();
    ctx = createMockPluginContext({ directory: tempDir }) as PluginContext & { client: MockOpenCodeClient };
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("should load plugin and return plugin definition", async () => {
    // Test: Call plugin function
    const pluginReturn = await TaskManagerPlugin(ctx as any);

    // Verify: Plugin returned expected structure
    expect(pluginReturn).toBeDefined();
    expect(pluginReturn.tool).toBeDefined();
    expect(pluginReturn["session.idle"]).toBeDefined();
    expect(pluginReturn["session.error"]).toBeDefined();
  });

  it("should register all required tools", async () => {
    const pluginReturn = await TaskManagerPlugin(ctx as any);
    const tools = pluginReturn.tool!;

    // Verify: All tools are registered
    expect(tools["task-add"]).toBeDefined();
    expect(tools["task-list"]).toBeDefined();
    expect(tools["task-status"]).toBeDefined();
    expect(tools["task-cancel"]).toBeDefined();
    expect(tools["task-retry"]).toBeDefined();
    expect(tools["queue-status"]).toBeDefined();
    expect(tools["queue-start"]).toBeDefined();
    expect(tools["queue-stop"]).toBeDefined();

    // Verify: Tools have required properties
    expect(tools["task-add"].description).toBeDefined();
    expect(tools["task-add"].args).toBeDefined();
    expect(typeof tools["task-add"].execute).toBe("function");
  });

  it("should bind session hooks", async () => {
    const pluginReturn = await TaskManagerPlugin(ctx as any);

    // Verify: Hooks are functions
    expect(typeof pluginReturn["session.idle"]).toBe("function");
    expect(typeof pluginReturn["session.error"]).toBe("function");
    expect(typeof pluginReturn["shell.env"]).toBe("function");
  });

  it("should initialize storage directory", async () => {
    await TaskManagerPlugin(ctx as any);

    // Verify: Storage directory was created
    const storageDir = `${tempDir}/.opencode/task-manager`;
    expect(fs.existsSync(storageDir)).toBe(true);
  });
});