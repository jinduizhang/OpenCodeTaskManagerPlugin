/**
 * 打包脚本 - 将插件打包成可分发的目录
 * 
 * 运行方式: node scripts/pack.js
 * 输出: dist/task-manager/
 */

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// 输出目录
const outputDir = join(rootDir, 'dist', 'task-manager');

// 清理并创建输出目录
if (existsSync(outputDir)) {
  rmSync(outputDir, { recursive: true });
}
mkdirSync(outputDir, { recursive: true });

console.log('📦 打包 OpenCode Task Manager Plugin...\n');

// 复制文件
const filesToCopy = [
  { src: 'index.ts', dest: 'index.ts' },
  { src: 'package.json', dest: 'package.json' },
  { src: 'README.md', dest: 'README.md' },
];

for (const file of filesToCopy) {
  const srcPath = join(rootDir, file.src);
  const destPath = join(outputDir, file.dest);
  if (existsSync(srcPath)) {
    cpSync(srcPath, destPath);
    console.log(`  ✓ ${file.dest}`);
  }
}

// 复制 src 目录
const srcDir = join(rootDir, 'src');
const destSrcDir = join(outputDir, 'src');
cpSync(srcDir, destSrcDir, { recursive: true });
console.log(`  ✓ src/`);

// 创建简化版 package.json（只保留运行时依赖）
const packageJson = JSON.parse(readFileSync(join(outputDir, 'package.json'), 'utf-8'));
const simplePackage = {
  name: packageJson.name,
  version: packageJson.version,
  type: packageJson.type,
  dependencies: packageJson.dependencies
};
writeFileSync(join(outputDir, 'package.json'), JSON.stringify(simplePackage, null, 2));
console.log(`  ✓ package.json (简化版)`);

// 创建安装说明
const installGuide = `# OpenCode Task Manager Plugin 安装说明

## 安装步骤

1. 将此目录 (\`task-manager\`) 复制到你的项目:

\`\`\`
your-project/
└── .opencode/
    └── plugins/
        └── task-manager/    <-- 放在这里
            ├── index.ts
            ├── package.json
            ├── README.md
            └── src/
\`\`\`

2. 进入插件目录安装依赖:

\`\`\`bash
cd your-project/.opencode/plugins/task-manager
bun install
\`\`\`

或者 npm:

\`\`\`bash
npm install
\`\`\`

3. 重启 OpenCode

## 快速使用

在 OpenCode 中调用工具:

\`\`\`
// 添加任务
task-add --title "代码分析" --agent "explore" --prompt "分析 src/ 目录结构"

// 查看任务列表
task-list

// 启动队列
queue-start
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

详细文档请查看 README.md
`;

writeFileSync(join(outputDir, 'INSTALL.md'), installGuide);
console.log(`  ✓ INSTALL.md`);

console.log(`\n✅ 打包完成!`);
console.log(`\n📁 输出目录: ${outputDir}`);
console.log(`\n使用方法:`);
console.log(`  1. 复制 dist/task-manager/ 到项目的 .opencode/plugins/ 目录`);
console.log(`  2. 运行 bun install 安装依赖`);
console.log(`  3. 重启 OpenCode`);