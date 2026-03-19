/**
 * Mock Plugin Context for testing
 */

import type { PluginContext, ProjectInfo, BunShell } from "../../src/types";
import { MockOpenCodeClient } from "./mock-client";

export interface MockPluginContextOptions {
  directory?: string;
  worktree?: string;
}

export function createMockPluginContext(
  options: MockPluginContextOptions = {}
): PluginContext {
  const directory = options.directory || "/tmp/test-project";
  const worktree = options.worktree || directory;

  const client = new MockOpenCodeClient();

  const project: ProjectInfo = {
    id: "test-project-id",
    worktree,
    vcs: "git",
  };

  // Mock Bun Shell
  const $: BunShell = async (strings, ...values) => {
    const command = strings.reduce((acc, str, i) => {
      return acc + str + (values[i] || "");
    }, "");
    console.log(`[Mock Shell] ${command}`);
    return {
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  };

  return {
    client,
    project,
    directory,
    worktree,
    $,
  };
}

// Export MockOpenCodeClient for convenience
export { MockOpenCodeClient } from "./mock-client";
