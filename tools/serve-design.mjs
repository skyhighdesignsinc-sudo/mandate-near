// tools/serve-design.mjs — serve design/ so the gallery can be previewed in a browser.
// Dependency-free: no framework, no build. Port defaults to 4321.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'design');
const port = Number(process.argv[2] ?? 4321);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.md': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const rel = normalize(url === '/' ? '/index.html' : url).replace(/^([/\\])+/, '');
  const path = join(root, rel);
  if (!path.startsWith(root)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    const info = await stat(path);
    const file = info.isDirectory() ? join(path, 'index.html') : path;
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`design gallery: http://127.0.0.1:${port}`);
});
