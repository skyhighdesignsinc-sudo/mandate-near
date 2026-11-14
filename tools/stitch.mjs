// tools/stitch.mjs — generate the Mandate and Bond screens with Stitch and save them locally.
//
// Usage:  node tools/stitch.mjs [--only mandate|bond] [--screen 05-refusal]
//
// Reads STITCH_API_KEY from the environment or from mandate/.env (gitignored).
// Output: design/<app>/<id>.png + .html, design/manifest.json, design/index.html
//
// Two things about the Stitch API that cost real quota to learn, so they are written down:
//   1. generate_screen_from_text returns the screens inside its own response, at
//      result.outputComponents[].design.screens[]. list_screens returns an empty object for
//      these projects, so polling it for new screens never finds anything.
//   2. A generation takes minutes and is not idempotent. Never retry a timed-out call; record
//      the failure in the manifest instead.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APPS } from './stitch-screens.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const designDir = resolve(root, 'design');

const MODEL = 'GEMINI_3_8_FLASH';
const DEVICE = 'DESKTOP';

function apiKey() {
  if (process.env.STITCH_API_KEY) return process.env.STITCH_API_KEY.trim();
  const envPath = resolve(root, 'mandate', '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const t = line.trim();
      if (t.startsWith('STITCH_API_KEY=')) return t.slice('STITCH_API_KEY='.length).trim();
    }
  }
  throw new Error('no STITCH_API_KEY (set it in mandate/.env or the environment)');
}

let KEY = null;
let rpcId = 0;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function rpc(name, args, { timeoutMs = 600_000 } = {}) {
  const res = await fetch('https://stitch.googleapis.com/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'X-Goog-Api-Key': KEY,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} ${body.slice(0, 300)}`);
  const json = JSON.parse(body);
  if (json.error) throw new Error(`${name}: ${json.error.message ?? JSON.stringify(json.error)}`);
  const result = json.result ?? {};
  if (result.isError) {
    const text = result.content?.map((c) => c.text).join(' ') ?? 'unknown error';
    throw new Error(`${name}: ${text.slice(0, 300)}`);
  }
  const text = result.content?.find((c) => c.type === 'text')?.text;
  if (text === undefined) return result;
  try {
    return JSON.parse(text);
  } catch {
    return { text, ...result };
  }
}

function screensOf(payload) {
  const out = [];
  for (const c of payload.outputComponents ?? []) {
    for (const s of c?.design?.screens ?? c?.screens ?? []) out.push(s);
  }
  return out;
}

async function ensureProject(title) {
  const { projects = [] } = await rpc('list_projects', {});
  const hit = projects.find((p) => p.title === title);
  if (hit) {
    log(`project exists: ${hit.name}`);
    return hit.name.split('/').pop();
  }
  const created = await rpc('create_project', { title });
  const name = created.name ?? created.project?.name;
  log(`project created: ${name}`);
  return name.split('/').pop();
}

// Stitch file URLs do not return the file. They return a JSON envelope:
//   image: {"imageMetadata":{"mimeType":"png"},"dataString":"<base64 png>"}
//   html : {"dataString":"<!DOCTYPE html>..."}
// Writing the response body straight to disk produces a 600 KB "PNG" that no browser can draw,
// which is exactly what happened before this was caught. Decode the envelope.
async function download(url, target) {
  const res = await fetch(url, { headers: { 'X-Goog-Api-Key': KEY } });
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  const raw = Buffer.from(await res.arrayBuffer());

  if (raw[0] === 0x7b /* '{' */) {
    let env;
    try {
      env = JSON.parse(raw.toString('utf8'));
    } catch {
      writeFileSync(target, raw);
      return raw.length;
    }
    if (typeof env.dataString === 'string') {
      const mime = env.imageMetadata?.mimeType ?? '';
      const isImage = /png|jpe?g|webp|gif/i.test(mime) || target.endsWith('.png');
      const bytes = isImage ? Buffer.from(env.dataString, 'base64') : Buffer.from(env.dataString, 'utf8');
      writeFileSync(target, bytes);
      return bytes.length;
    }
  }

  writeFileSync(target, raw);
  return raw.length;
}

async function saveScreen(app, spec, projectId, force) {
  // Generation is billed per screen, so an existing artefact is never overwritten by default.
  const existing = resolve(designDir, app.slug, `${spec.id}.png`);
  if (!force && existsSync(existing)) {
    log(`skip ${app.slug}/${spec.id} (already generated; pass --force to redo)`);
    const html = resolve(designDir, app.slug, `${spec.id}.html`);
    const files = [{ file: `${spec.id}.png`, kind: 'screenshot' }];
    if (existsSync(html)) files.push({ file: `${spec.id}.html`, kind: 'html' });
    return { id: spec.id, title: spec.title, files, seconds: 0, skipped: true };
  }
  log(`generating ${app.slug}/${spec.id} — ${spec.title}`);
  const started = Date.now();
  const payload = await rpc('generate_screen_from_text', {
    projectId,
    prompt: spec.prompt,
    deviceType: DEVICE,
    modelId: MODEL,
  });

  const screens = screensOf(payload);
  if (screens.length === 0) {
    const text = (payload.outputComponents ?? []).filter((c) => c.text).map((c) => c.text).join(' ');
    throw new Error(`no screens in response. model said: ${(text || JSON.stringify(payload)).slice(0, 200)}`);
  }

  const outDir = resolve(designDir, app.slug);
  mkdirSync(outDir, { recursive: true });
  const files = [];

  for (const [i, s] of screens.entries()) {
    const suffix = screens.length > 1 ? `-${i + 1}` : '';
    for (const [kind, entry, ext] of [
      ['screenshot', s.screenshot, 'png'],
      ['html', s.htmlCode, 'html'],
    ]) {
      const url = entry?.downloadUrl;
      if (!url) continue;
      const file = `${spec.id}${suffix}.${ext}`;
      try {
        const bytes = await download(url, resolve(outDir, file));
        files.push({ file, kind, bytes });
        log(`  saved ${app.slug}/${file} (${Math.round(bytes / 1024)} KB)`);
      } catch (err) {
        log(`  warn ${file}: ${err.message}`);
      }
    }
    files.push({ screenId: (s.name ?? '').split('/').pop() ?? null, screenName: s.name ?? null });
  }

  const seconds = Math.round((Date.now() - started) / 1000);
  log(`done ${app.slug}/${spec.id} in ${seconds}s`);
  return { id: spec.id, title: spec.title, files, seconds };
}

function gallery(manifest) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rows = manifest.apps
    .map((app) => {
      const cards = app.screens
        .map((s) => {
          const png = s.files?.find((f) => f.kind === 'screenshot')?.file;
          const html = s.files?.find((f) => f.kind === 'html')?.file;
          return `
      <article class="card">
        <header>
          <span class="idx">${esc(s.id)}</span>
          <h3>${esc(s.title)}</h3>
          ${s.error ? '<span class="badge bad">failed</span>' : `<span class="badge good">${s.seconds ?? '?'}s</span>`}
        </header>
        ${png ? `<a href="${esc(app.slug)}/${esc(png)}" target="_blank"><img src="${esc(app.slug)}/${esc(png)}" alt="${esc(s.title)}"></a>` : `<p class="bad">${esc(s.error ?? 'no screenshot')}</p>`}
        ${html ? `<a class="link" href="${esc(app.slug)}/${esc(html)}" target="_blank">open generated HTML</a>` : ''}
      </article>`;
        })
        .join('');
      return `<section><h2>${esc(app.title)}</h2><div class="grid">${cards}</div></section>`;
    })
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Mandate &amp; Bond — generated screens</title>
<style>
:root{--paper:#E9EEF3;--raised:#F4F7FA;--ink:#0F1720;--muted:#55636F;--rule:#C3CDD6;--ok:#2E6F5E;--bad:#A83A2C}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 "Public Sans",system-ui,sans-serif}
header.top{border-bottom:1px solid var(--rule);padding:28px 32px}
h1{font:600 28px/1.15 Fraunces,Georgia,serif;margin:0 0 4px}
.top p{margin:0;color:var(--muted);max-width:70ch}
.mono{font-family:"JetBrains Mono",ui-monospace,monospace}
section{padding:28px 32px 8px}
h2{font:600 21px/1.2 Fraunces,Georgia,serif;margin:0 0 16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:24px}
.card{background:var(--raised);border:1px solid var(--rule);border-radius:2px;padding:16px;display:flex;flex-direction:column;gap:12px}
.card header{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.idx{font:12px "JetBrains Mono",monospace;color:var(--muted)}
h3{font:600 17px/1.3 "Public Sans",sans-serif;margin:0;flex:1}
.badge{font:12px "JetBrains Mono",monospace;padding:2px 6px;border-radius:2px;border:1px solid currentColor}
.good{color:var(--ok)}.bad{color:var(--bad)}
img{width:100%;display:block;border:1px solid var(--rule);border-radius:2px;background:#fff}
.link{font:12px "JetBrains Mono",monospace;color:var(--muted)}
</style></head><body>
<header class="top"><h1>Mandate &amp; Bond — generated screens</h1>
<p>Stitch output, ${esc(manifest.generatedAt)}. The design source of truth is <span class="mono">docs/BRAND_GUIDELINES.md</span>; these screens follow it, they do not overrule it.</p></header>
${rows}
</body></html>`;
}

async function main() {
  const argv = process.argv.slice(2);
  const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
  const one = argv.includes('--screen') ? argv[argv.indexOf('--screen') + 1] : null;
  const force = argv.includes('--force');

  KEY = apiKey();
  mkdirSync(designDir, { recursive: true });
  const manifest = { generatedAt: new Date().toISOString(), model: MODEL, apps: [] };
  const apps = APPS.filter((a) => !only || a.slug === only);

  // One worker per app: separate projects, so they can run together without competing.
  await Promise.all(
    apps.map(async (app) => {
      const projectId = await ensureProject(app.title);
      const screens = [];
      for (const spec of app.screens.filter((s) => !one || s.id === one)) {
        try {
          screens.push(await saveScreen(app, spec, projectId, force));
        } catch (err) {
          log(`FAILED ${app.slug}/${spec.id}: ${err.message}`);
          screens.push({ id: spec.id, title: spec.title, error: err.message, files: [] });
        }
      }
      manifest.apps.push({ slug: app.slug, title: app.title, projectId, screens });
    }),
  );

  writeFileSync(resolve(designDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(resolve(designDir, 'index.html'), gallery(manifest));

  const all = manifest.apps.flatMap((a) => a.screens);
  const ok = all.filter((s) => !s.error).length;
  log(`finished: ${ok}/${all.length} screens generated`);
  for (const s of all.filter((x) => x.error)) log(`  failed ${s.id}: ${s.error}`);
  process.exit(ok === all.length ? 0 : 1);
}

main().catch((err) => {
  console.error('stitch:', err.message);
  process.exit(1);
});
