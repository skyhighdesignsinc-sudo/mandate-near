// tools/cdp.mjs — minimal CDP client for the local Freebuff browser (port 9223).
//
// The browser tools can only address a page's top document. Some apps (Stitch)
// render entirely inside a cross-origin frame, so their DOM is unreachable from
// there. CDP is privileged: an isolated world created on a child frameId runs in
// that frame's origin, so we can read it and click it.
//
// Usage:
//   node tools/cdp.mjs targets
//   node tools/cdp.mjs eval "<js>" [frameUrlSubstring] [pageUrlSubstring]
//
// Defaults: frame = appspot (Stitch), page = stitch.withgoogle.com.

const PORT = 9223;

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : def;
}

async function list() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return res.json();
}

async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  const send = (method, params = {}) =>
    new Promise((res) => {
      const id = ++seq;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
    });
  return { ws, send };
}

function flatten(node, out = []) {
  out.push(node.frame);
  for (const child of node.childFrames ?? []) flatten(child, out);
  return out;
}

async function main() {
  const mode = process.argv[2] ?? 'targets';

  if (mode === 'targets') {
    const all = await list();
    for (const t of all) {
      if (t.type !== 'page') continue;
      console.log(`${t.id}\n  ${t.title}\n  ${t.url}`);
    }
    return;
  }

  if (mode !== 'eval') {
    console.error(`unknown mode: ${mode}`);
    process.exit(2);
  }

  const expression = process.argv[3];
  const frameMatch = arg('--frame', 'appspot');
  const pageMatch = arg('--page', 'stitch.withgoogle.com');

  const targets = (await list()).filter((t) => t.type === 'page' && t.url.includes(pageMatch));
  if (targets.length === 0) {
    console.error(`no page target matching "${pageMatch}"`);
    process.exit(3);
  }
  const target = targets[0];

  const { ws, send } = await connect(target);
  await send('Page.enable');
  const tree = await send('Page.getFrameTree');
  const frames = flatten(tree.result.frameTree);

  const frame = frames.find((f) => f.url.includes(frameMatch)) ;
  if (!frame) {
    console.error(`no frame matching "${frameMatch}"`);
    console.error(frames.map((f) => `  ${f.url.slice(0, 80)}`).join('\n'));
    ws.close();
    process.exit(4);
  }

  const world = await send('Page.createIsolatedWorld', { frameId: frame.id, worldName: 'agent' });
  const res = await send('Runtime.evaluate', {
    expression,
    contextId: world.result.executionContextId,
    returnByValue: true,
    awaitPromise: true,
  });

  if (res.result?.exceptionDetails) {
    console.error(JSON.stringify(res.result.exceptionDetails, null, 2));
    ws.close();
    process.exit(5);
  }
  const value = res.result?.result?.value;
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  ws.close();
}

main().catch((e) => { console.error(String(e)); process.exit(1); });
