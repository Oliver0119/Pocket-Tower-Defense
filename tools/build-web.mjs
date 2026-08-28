/**
 * 构建 Web 运行原型：
 *  1) 用 tsconfig.web.json 把纯逻辑层编译为 ESM（输出到 .web-out）
 *  2) 为相对 import 补上 .js 后缀（浏览器 ESM 要求完整路径）
 * 用法：npm run build:web
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const outDir = join(root, '.web-out');
const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');

console.log('[1/2] 编译纯逻辑层 → ESM ...');
execFileSync(process.execPath, [tsc, '-p', 'tsconfig.web.json'], { stdio: 'inherit', cwd: root });

console.log('[2/2] 修复 ESM 相对路径后缀 ...');
let fixed = 0;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { walk(full); continue; }
    if (!full.endsWith('.js')) continue;
    const src = readFileSync(full, 'utf8');
    // 匹配 from "./x" / from "../x" / import "./x"（不带 .js 结尾）
    const dst = src.replace(
      /(\bfrom\s+|\bimport\s+)(["'])(\.\.?\/[^"']*?)\2/g,
      (m, kw, q, spec) => (spec.endsWith('.js') ? m : `${kw}${q}${spec}.js${q}`),
    );
    if (dst !== src) { writeFileSync(full, dst, 'utf8'); fixed++; }
  }
}
walk(outDir);
// 标记产物为 ESM，避免 Node 侧解析告警（浏览器不受影响）
writeFileSync(join(outDir, 'package.json'), JSON.stringify({ type: 'module' }, null, 2), 'utf8');
console.log(`     已修复 ${fixed} 个文件`);
console.log(`     产物目录：${relative(root, outDir)}`);
console.log('\n构建完成，执行 npm start 启动本地服务器。');
