/**
 * 打包脚本 - 将插件打包成 zip 文件
 * 
 * 运行方式: node scripts/zip.js
 * 输出: dist/task-manager.zip
 * 
 * 使用方法:
 * 1. 解压 task-manager.zip 到项目的 .opencode/plugins/ 目录
 * 2. 进入插件目录运行 npm install
 * 3. 重启 OpenCode
 */

import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// 创建输出目录
const distDir = join(rootDir, 'dist');
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// 输出文件
const outputPath = join(distDir, 'task-manager.zip');
const output = createWriteStream(outputPath);
const archive = archiver('zip', { zlib: { level: 9 } });

console.log('📦 打包 OpenCode Task Manager Plugin...\n');

output.on('close', () => {
  console.log(`\n✅ 打包完成!`);
  console.log(`   文件: ${outputPath}`);
  console.log(`   大小: ${(archive.pointer() / 1024).toFixed(2)} KB`);
  console.log(`\n📖 使用方法:`);
  console.log(`   1. 解压 task-manager.zip 到项目的 .opencode/plugins/ 目录`);
  console.log(`   2. cd .opencode/plugins/task-manager && npm install`);
  console.log(`   3. 重启 OpenCode`);
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);

// 要打包的文件
const files = ['index.ts'];
for (const file of files) {
  const filePath = join(rootDir, file);
  if (existsSync(filePath)) {
    archive.file(filePath, { name: file });
    console.log(`  + ${file}`);
  }
}

// 简化版 package.json
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'));
const simplePackage = {
  name: packageJson.name,
  version: packageJson.version,
  type: packageJson.type,
  dependencies: packageJson.dependencies
};
archive.append(JSON.stringify(simplePackage, null, 2), { name: 'package.json' });
console.log(`  + package.json`);

// src 目录（排除测试文件）
function addDirectory(dirPath, archivePath) {
  const items = readdirSync(dirPath);
  
  for (const item of items) {
    // 跳过测试文件
    if (item.endsWith('.test.ts') || item.endsWith('.spec.ts')) continue;
    if (item === '__tests__') continue;
    
    const itemPath = join(dirPath, item);
    const itemArchivePath = join(archivePath, item);
    const stat = statSync(itemPath);
    
    if (stat.isDirectory()) {
      addDirectory(itemPath, itemArchivePath);
    } else {
      archive.file(itemPath, { name: itemArchivePath.replace(/\\/g, '/') });
      console.log(`  + ${itemArchivePath.replace(/\\/g, '/')}`);
    }
  }
}

const srcDir = join(rootDir, 'src');
if (existsSync(srcDir)) {
  addDirectory(srcDir, 'src');
}

// README（简化版）
const readme = `# OpenCode Task Manager Plugin

任务编排插件，支持批量任务执行、优先级队列和 Agent 协调。

## 安装

\`\`\`bash
npm install
\`\`\`

## 可用工具

| 工具 | 说明 |
|------|------|
| task-add | 添加新任务 |
| task-list | 列出所有任务 |
| task-status | 查询任务详情 |
| task-cancel | 取消待执行任务 |
| task-retry | 重试失败任务 |
| queue-start | 启动队列 |
| queue-stop | 停止队列 |
| queue-status | 查看队列状态 |

## 快速使用

\`\`\`
// 添加任务
task-add title="代码分析" agent="explore" prompt="分析项目结构"

// 启动队列
queue-start

// 查看状态
task-list
\`\`\`

## 参数说明

### task-add
- title: 任务标题（必填）
- agent: Agent 名称，如 explore、oracle、build（必填）
- prompt: 任务描述（必填）
- priority: 优先级 high/medium/low（可选，默认 medium）
- retryCount: 失败重试次数（可选，默认 0）
- skill: 预加载的 Skill（可选）

完整文档: https://github.com/jinduizhang/OpenCodeTaskManagerPlugin
`;

archive.append(readme, { name: 'README.md' });
console.log(`  + README.md`);

archive.finalize();