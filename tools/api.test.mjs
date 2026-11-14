// tools/api.test.mjs — the tests behind `make test-api`.
//
// They start the real server over a real snapshot and talk to it over HTTP, so
// what is asserted is the contract of the API: who gets in, what a scope buys,
// what a revoked key answers, and what the refusal shapes look like. The MCP
// test drives the stdio server frame by frame, the way a client would.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

const dir = mkdtempSync(join(tmpdir(), 'mandate-keys-'));
process.env.MANDATE_KEYS = join(dir, 'api-keys.json');
process.env.MANDATE_SNAPSHOT = 'mandate/console/data/snapshot.json';

// Imported after MANDATE_KEYS is set: the store path is resolved at import time
// so the server and the CLI cannot disagree about which file they are using.
const { issueKey, revokeKey } = await import('./keystore.mjs');

const PORT = 4291;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

const get = (path, key) =>
  fetch(`${BASE}${path}`, { headers: key ? { Authorization: `Bearer ${key}` } : {} });

before(async () => {
  server = spawn(process.execPath, ['tools/api-server.mjs', String(PORT)], {
    env: { ...process.env, MANDATE_API_RATE: '1000' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => process.stderr.write(`[api] ${d}`));
  const deadline = Date.now() + 8000;
  for (;;) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) break;
    } catch {
      /* not listening yet */
    }
    if (Date.now() > deadline) throw new Error('api-server did not answer /health in 8s');
    await new Promise((r) => setTimeout(r, 100));
  }
});

after(() => {
  server?.kill();
  rmSync(dir, { recursive: true, force: true });
});

test('health needs no key and lists the routes', async () => {
  const res = await get('/health');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(body.routes.includes('/v1/mandates'));
  assert.match(body.mode, /replay of a contract run/);
});

test('a request with no key is refused with a typed 401', async () => {
  const res = await get('/v1/status');
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error.code, 'unauthorized');
  assert.match(body.error.message, /keys\.mjs issue/);
});

test('an invented key is refused', async () => {
  const res = await get('/v1/status', 'mk_not-a-real-key');
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, 'unauthorized');
});

test('read:views serves the contract views and nothing more', async () => {
  const issued = issueKey({ label: 'views-only', scopes: ['read:views'] });
  assert.match(issued.key, /^mk_/);

  const status = await get('/v1/status', issued.key);
  assert.equal(status.status, 200);
  const body = await status.json();
  assert.equal(body.contract, 'mandate.testnet');
  assert.equal(body.signed, false);
  assert.match(body.mode, /never deployed/);

  const mandates = await (await get('/v1/mandates', issued.key)).json();
  assert.equal(mandates.mandates[0].agent, 'agent.testnet');
  assert.equal(mandates.mandates[0].balance, '56000000');

  const denied = await get('/v1/events', issued.key);
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error.code, 'scope_missing');
});

test('read:events serves the log and a single event by index', async () => {
  const issued = issueKey({ label: 'events', scopes: ['read:events'] });

  const many = await (await get('/v1/events?limit=3', issued.key)).json();
  assert.equal(many.count, 3);
  assert.equal(many.total, 15);

  const one = await get('/v1/events/6', issued.key);
  assert.equal(one.status, 200);
  assert.equal((await one.json()).event.code, 'counterparty_not_allowed');

  const missing = await get('/v1/events/99', issued.key);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, 'not_found');

  // A key with only read:events cannot touch the other scopes either.
  assert.equal((await get('/v1/status', issued.key)).status, 403);
});

test('read:verify recomputes and agrees', async () => {
  const issued = issueKey({ label: 'auditor', scopes: ['read:verify'] });
  const res = await get('/v1/verify', issued.key);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.failed, 0);
  assert.equal(body.checks, 13);
  assert.match(body.inputsHash, /^[0-9a-f]{64}$/);
});

test('a revoked key answers key_revoked, not a generic 401', async () => {
  const issued = issueKey({ label: 'to-revoke', scopes: ['read:views'] });
  assert.equal((await get('/v1/status', issued.key)).status, 200);
  const revoked = revokeKey(issued.id);
  assert.equal(revoked.revoked, true);
  const res = await get('/v1/status', issued.key);
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, 'key_revoked');
});

test('the API is read-only and unknown routes are typed', async () => {
  const issued = issueKey({ label: 'writer', scopes: ['read:views'] });
  const post = await fetch(`${BASE}/v1/status`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${issued.key}` },
  });
  assert.equal(post.status, 405);
  assert.equal((await post.json()).error.code, 'method_not_allowed');

  const unknown = await get('/v1/nope', issued.key);
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json()).error.code, 'not_found');
});

// ------------------------------------------------------------------ mcp

function startMcp() {
  const child = spawn(process.execPath, ['tools/mcp-server.mjs'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = '';
  const waiting = new Map();
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      const settle = waiting.get(message.id);
      if (settle) {
        waiting.delete(message.id);
        settle(message);
      }
    }
  });
  let nextId = 1;
  const send = (method, params) => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      waiting.set(id, resolve);
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      setTimeout(() => reject(new Error(`mcp: no reply to ${method}`)), 5000);
    });
  };
  return { child, send };
}

test('the MCP server speaks JSON-RPC and exposes read-only tools', async () => {
  const mcp = startMcp();
  try {
    const init = await mcp.send('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
    assert.equal(init.result.serverInfo.name, 'mandate');
    assert.match(init.result.protocolVersion, /^\d{4}-\d{2}-\d{2}$/);

    const list = await mcp.send('tools/list', {});
    const names = list.result.tools.map((t) => t.name);
    assert.deepEqual(names.sort(), [
      'mandate_event',
      'mandate_events',
      'mandate_list',
      'mandate_pending',
      'mandate_status',
      'mandate_verify',
    ]);
    for (const tool of list.result.tools) {
      assert.equal(tool.inputSchema.type, 'object');
      assert.ok(tool.description.length > 40);
    }

    const verified = await mcp.send('tools/call', { name: 'mandate_verify', arguments: {} });
    const body = JSON.parse(verified.result.content[0].text);
    assert.equal(body.ok, true);
    assert.equal(body.checks, 13);

    const event = await mcp.send('tools/call', { name: 'mandate_event', arguments: { index: 14 } });
    assert.equal(JSON.parse(event.result.content[0].text).event.code, 'policy_changed');

    const unknown = await mcp.send('tools/call', { name: 'mandate_nope', arguments: {} });
    assert.equal(unknown.error.code, -32602);
  } finally {
    mcp.child.kill();
  }
});
