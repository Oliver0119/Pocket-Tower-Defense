/**
 * 零依赖静态文件服务器：用于本地运行 Web 原型
 * 用法：npm start（默认 http://localhost:5173）
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.cwd());
const port = Number(process.env.PORT ?? 5173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
    // /__build/* 映射到编译产物目录 .web-out/*
    let filePath = urlPath.startsWith('/__build/')
      ? join(root, '.web-out', normalize(urlPath.slice('/__build/'.length)))
      : join(root, normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
    // 目录 → 默认 index.html
    const info = await stat(filePath).catch(() => null);
    if (info?.isDirectory()) filePath = join(filePath, 'index.html');
    const data = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
});

server.listen(port, () => {
  console.log(`\n  《口袋守塔》Web 原型已启动`);
  console.log(`  → http://localhost:${port}/web/index.html\n`);
  console.log('  提示：先执行 npm run build:web（npm start 会自动构建）');
  console.log('  Ctrl+C 停止服务\n');
});
