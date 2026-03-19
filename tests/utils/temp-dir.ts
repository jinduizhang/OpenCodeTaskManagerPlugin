/**
 * Temporary directory utilities for testing
 */

import { mkdtempSync, rmSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

export function createTempDir(): string {
  const tempDir = mkdtempSync(join(tmpdir(), "task-manager-test-"));
  return tempDir;
}

export function cleanupTempDir(dir: string): void {
  if (existsSync(dir)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Failed to cleanup temp dir: ${dir}`, error);
    }
  }
}

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
