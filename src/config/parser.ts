/**
 * OpenCode Task Manager Plugin - 配置解析器
 * 
 * 解析 YAML 格式的任务配置文件
 * 兼容 Node.js 和 Bun 运行时
 */

import { join } from "path";
import { parse } from "yaml";
import * as fs from "fs";
import type {
  TaskManagerConfig,
  TaskManagerSettings,
  TaskConfig,
  TaskPriority,
} from "../types";

/**
 * 配置解析器选项
 */
export interface ConfigParserOptions {
  /** 工作目录 */
  directory: string;
  /** 配置文件名 */
  configFileName?: string;
}

/**
 * 默认设置
 */
const DEFAULT_SETTINGS: TaskManagerSettings = {
  autoStart: false,
  maxConcurrent: 1,
  logLevel: "info",
};

/**
 * 配置解析器
 * 
 * 负责读取、解析和验证 YAML 配置文件
 */
export class ConfigParser {
  private configPath: string;
  private config: TaskManagerConfig | null = null;

  /**
   * 创建配置解析器实例
   */
  constructor(options: ConfigParserOptions) {
    const { directory, configFileName = "tasks.yaml" } = options;
    this.configPath = join(directory, ".opencode/task-manager", configFileName);
  }

  /**
   * 加载配置
   */
  async load(): Promise<TaskManagerConfig> {
    try {
      if (!fs.existsSync(this.configPath)) {
        // 配置文件不存在，返回默认配置
        this.config = {
          version: "1.0.0",
          settings: DEFAULT_SETTINGS,
          tasks: [],
        };
        return this.config;
      }

      const content = fs.readFileSync(this.configPath, "utf-8");
      const rawConfig = parse(content);

      // 验证和规范化配置
      this.config = this.normalizeConfig(rawConfig);
      return this.config;
    } catch (error) {
      console.error("Failed to load config:", error);
      // 返回默认配置
      this.config = {
        version: "1.0.0",
        settings: DEFAULT_SETTINGS,
        tasks: [],
      };
      return this.config;
    }
  }

  /**
   * 获取当前配置（需要先调用 load）
   */
  getConfig(): TaskManagerConfig | null {
    return this.config;
  }

  /**
   * 获取设置
   */
  getSettings(): TaskManagerSettings {
    return this.config?.settings || DEFAULT_SETTINGS;
  }

  /**
   * 获取任务配置列表
   */
  getTasks(): TaskConfig[] {
    return this.config?.tasks || [];
  }

  /**
   * 保存配置
   */
  async save(config: TaskManagerConfig): Promise<void> {
    const yamlContent = this.toYaml(config);
    // 确保目录存在
    const dir = join(this.configPath, "..");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, yamlContent);
    this.config = config;
  }

  /**
   * 添加任务配置
   */
  async addTask(task: TaskConfig): Promise<void> {
    if (!this.config) {
      await this.load();
    }

    this.config!.tasks = this.config!.tasks || [];
    this.config!.tasks.push(task);
    await this.save(this.config!);
  }

  /**
   * 移除任务配置
   */
  async removeTask(name: string): Promise<boolean> {
    if (!this.config || !this.config.tasks) {
      return false;
    }

    const index = this.config.tasks.findIndex((t) => t.name === name);
    if (index === -1) {
      return false;
    }

    this.config.tasks.splice(index, 1);
    await this.save(this.config);
    return true;
  }

  // ==================== 私有方法 ====================

  /**
   * 规范化配置
   */
  private normalizeConfig(raw: unknown): TaskManagerConfig {
    const config: TaskManagerConfig = {
      version: "1.0.0",
      settings: DEFAULT_SETTINGS,
      tasks: [],
    };

    if (!raw || typeof raw !== "object") {
      return config;
    }

    const rawConfig = raw as Record<string, unknown>;

    // 解析版本
    if (typeof rawConfig.version === "string") {
      config.version = rawConfig.version;
    }

    // 解析设置
    if (rawConfig.settings && typeof rawConfig.settings === "object") {
      config.settings = this.normalizeSettings(rawConfig.settings as Record<string, unknown>);
    }

    // 解析任务列表
    if (Array.isArray(rawConfig.tasks)) {
      config.tasks = rawConfig.tasks
        .filter((t) => this.validateTaskConfig(t))
        .map((t) => this.normalizeTaskConfig(t));
    }

    return config;
  }

  /**
   * 规范化设置
   */
  private normalizeSettings(raw: Record<string, unknown>): TaskManagerSettings {
    const settings: TaskManagerSettings = { ...DEFAULT_SETTINGS };

    if (typeof raw.autoStart === "boolean") {
      settings.autoStart = raw.autoStart;
    }

    if (typeof raw.maxConcurrent === "number" && raw.maxConcurrent > 0) {
      settings.maxConcurrent = raw.maxConcurrent;
    }

    if (["debug", "info", "warn", "error"].includes(raw.logLevel as string)) {
      settings.logLevel = raw.logLevel as "debug" | "info" | "warn" | "error";
    }

    return settings;
  }

  /**
   * 验证任务配置
   */
  private validateTaskConfig(raw: unknown): boolean {
    if (!raw || typeof raw !== "object") {
      return false;
    }

    const task = raw as Record<string, unknown>;

    // 必须有 name 和 prompt
    if (typeof task.name !== "string" || !task.name) {
      return false;
    }

    if (typeof task.prompt !== "string" || !task.prompt) {
      return false;
    }

    // 必须有 agent 或 skill
    if (!task.agent && !task.skill) {
      return false;
    }

    return true;
  }

  /**
   * 规范化任务配置
   */
  private normalizeTaskConfig(raw: Record<string, unknown>): TaskConfig {
    const task: TaskConfig = {
      name: raw.name as string,
      prompt: raw.prompt as string,
    };

    if (typeof raw.description === "string") {
      task.description = raw.description;
    }

    if (typeof raw.agent === "string") {
      task.agent = raw.agent;
    }

    if (typeof raw.skill === "string") {
      task.skill = raw.skill;
    }

    if (raw.parameters && typeof raw.parameters === "object") {
      task.parameters = raw.parameters as Record<string, unknown>;
    }

    if (["high", "medium", "low"].includes(raw.priority as string)) {
      task.priority = raw.priority as TaskPriority;
    } else {
      task.priority = "medium";
    }

    if (typeof raw.retryCount === "number" && raw.retryCount >= 0) {
      task.retryCount = raw.retryCount;
    } else {
      task.retryCount = 0;
    }

    return task;
  }

  /**
   * 将配置转换为 YAML 字符串
   */
  private toYaml(config: TaskManagerConfig): string {
    const lines: string[] = [];

    // 版本
    if (config.version) {
      lines.push(`version: "${config.version}"`);
      lines.push("");
    }

    // 设置
    if (config.settings) {
      lines.push("settings:");
      lines.push(`  autoStart: ${config.settings.autoStart || false}`);
      lines.push(`  maxConcurrent: ${config.settings.maxConcurrent || 1}`);
      lines.push(`  logLevel: "${config.settings.logLevel || "info"}"`);
      lines.push("");
    }

    // 任务
    if (config.tasks && config.tasks.length > 0) {
      lines.push("tasks:");
      for (const task of config.tasks) {
        lines.push(`  - name: "${task.name}"`);
        
        if (task.description) {
          lines.push(`    description: "${task.description}"`);
        }
        
        if (task.agent) {
          lines.push(`    agent: "${task.agent}"`);
        }
        
        if (task.skill) {
          lines.push(`    skill: "${task.skill}"`);
        }
        
        // prompt 使用多行字符串
        lines.push(`    prompt: |`);
        const promptLines = task.prompt.split("\n");
        for (const line of promptLines) {
          lines.push(`      ${line}`);
        }
        
        if (task.priority) {
          lines.push(`    priority: "${task.priority}"`);
        }
        
        if (task.retryCount !== undefined) {
          lines.push(`    retryCount: ${task.retryCount}`);
        }
        
        lines.push("");
      }
    }

    return lines.join("\n");
  }
}

/**
 * 创建配置解析器实例
 */
export function createConfigParser(options: ConfigParserOptions): ConfigParser {
  return new ConfigParser(options);
}

/**
 * 默认配置模板
 */
export const DEFAULT_CONFIG: TaskManagerConfig = {
  version: "1.0.0",
  settings: DEFAULT_SETTINGS,
  tasks: [
    {
      name: "示例任务",
      description: "这是一个示例任务配置",
      agent: "explore",
      prompt: "分析项目结构，找出主要模块和依赖关系",
      priority: "medium",
      retryCount: 1,
    },
  ],
};