/**
 * OpenCode Task Manager Plugin - 文件锁机制
 * 
 * 防止并发写入冲突
 */

import * as fs from "fs";
import * as path from "path";

/**
 * 文件锁类
 * 
 * 使用简单的文件标记实现锁机制
 * 兼容 Node.js 和 Bun 运行时
 */
export class FileLock {
  private lockFile: string;
  private locked = false;
  private lockPromise: Promise<void> | null = null;

  constructor(storageDir: string) {
    this.lockFile = path.join(storageDir, ".lock");
  }

  /**
   * 获取锁
   */
  async acquire(): Promise<void> {
    // 如果已经在等待锁，返回同一个 Promise
    if (this.lockPromise) {
      return this.lockPromise;
    }

    // 如果已经持有锁，直接返回
    if (this.locked) {
      return;
    }

    // 创建获取锁的 Promise
    this.lockPromise = this.tryAcquire();
    
    try {
      await this.lockPromise;
    } finally {
      this.lockPromise = null;
    }
  }

  /**
   * 尝试获取锁
   */
  private async tryAcquire(): Promise<void> {
    const maxRetries = 50; // 最大重试次数
    const retryDelay = 50; // 重试延迟（毫秒）

    for (let i = 0; i < maxRetries; i++) {
      try {
        // 确保目录存在
        const dir = path.dirname(this.lockFile);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // 检查锁文件是否存在
        if (!fs.existsSync(this.lockFile)) {
          // 创建锁文件
          fs.writeFileSync(this.lockFile, `${process.pid}\n${Date.now()}`);
          this.locked = true;
          return;
        }

        // 检查锁是否过期（超过 10 秒认为过期）
        const content = fs.readFileSync(this.lockFile, "utf-8");
        const lines = content.split("\n");
        const timestamp = parseInt(lines[1] || "0", 10);
        
        if (Date.now() - timestamp > 10000) {
          // 锁过期，强制获取
          fs.writeFileSync(this.lockFile, `${process.pid}\n${Date.now()}`);
          this.locked = true;
          return;
        }
      } catch {
        // 文件读取失败，尝试创建
        try {
          fs.writeFileSync(this.lockFile, `${process.pid}\n${Date.now()}`);
          this.locked = true;
          return;
        } catch {
          // 忽略错误，继续重试
        }
      }

      // 等待后重试
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }

    throw new Error("Failed to acquire file lock after maximum retries");
  }

  /**
   * 释放锁
   */
  async release(): Promise<void> {
    if (!this.locked) {
      return;
    }

    try {
      if (fs.existsSync(this.lockFile)) {
        // 验证锁是否属于当前进程
        const content = fs.readFileSync(this.lockFile, "utf-8");
        const pid = content.split("\n")[0];

        if (pid === `${process.pid}`) {
          // 删除锁文件
          fs.unlinkSync(this.lockFile);
        }
      }
    } catch {
      // 忽略释放错误
    } finally {
      this.locked = false;
    }
  }

  /**
   * 检查是否已锁定
   */
  isLocked(): boolean {
    return this.locked;
  }
}