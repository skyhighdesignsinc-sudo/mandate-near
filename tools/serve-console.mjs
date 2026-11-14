// tools/serve-console.mjs — serve mandate/console/ with no dependencies.
//
// `make dev` runs this. Port defaults to 4173; `/health` answers 200 so a test
// runner can wait for readiness instead of sleeping.
//
// It serves the folder as-is: no build, no bundler, no transform. A fresh clone
// with Node installed can show the console, which is the point.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'mandate', 'console');
const port = Number(process.argv[2] ?? process.env.PORT ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);

  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, service: 'mandate-console' }));
    return;
  }

  const rel = normalize(url === '/' ? '/index.html' : url).replace(/^([/\\])+/, '');
  let file = join(root, rel);
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' }).end('forbidden');
    return;
  }

  try {
    const info = await stat(file);
    if (info.isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    // Unknown path: hand back the app shell so `#/verify` style links work when
    // someone pastes a URL without the hash router having run.
    try {
      const body = await readFile(join(root, 'index.html'));
      res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
    }
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`mandate console: http://127.0.0.1:${port}`);
});
