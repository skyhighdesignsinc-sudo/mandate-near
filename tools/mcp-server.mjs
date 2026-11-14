// tools/mcp-server.mjs — Mandate over the Model Context Protocol, stdio.
//
//   node tools/mcp-server.mjs
//
// An agent that runs Claude Code, Cursor or any MCP client can read a mandate
// with the tools below: what the policy allows, the balance the contract holds,
// every recorded event, and the verification result. This is the read path an
// operator wires into their own assistant; it holds no key and signs nothing.
//
// Transport: JSON-RPC 2.0, one message per line on stdin, one response per line
// on stdout. No dependency, no network, no telemetry.

import { createInterface } from 'node:readline';

import {
  SCOPES,
  eventBody,
  eventsBody,
  loadSnapshot,
  mandatesBody,
  pendingBody,
  statusBody,
  verifyBody,
} from './api.mjs';

const PROTOCOL = '2024-11-05';

const obj = (properties = {}) => ({ type: 'object', properties, additionalProperties: false });

const TOOLS = [
  {
    name: 'mandate_status',
    description:
      'Read the mandate service status: network, contract id, asset, decimals, event count. Data is a replay of a contract run, never a live chain call.',
    inputSchema: obj(),
    scope: SCOPES.VIEWS,
    run: (snap) => statusBody(snap),
  },
  {
    name: 'mandate_list',
    description:
      'List every mandate with the balance the contract holds, the limits in force and the settled count. Amounts are integer strings in the mandate asset.',
    inputSchema: obj(),
    scope: SCOPES.VIEWS,
    run: (snap) => mandatesBody(snap),
  },
  {
    name: 'mandate_pending',
    description: 'List spends above the escalation threshold that are waiting for the owner to approve or reject.',
    inputSchema: obj(),
    scope: SCOPES.VIEWS,
    run: (snap) => pendingBody(snap),
  },
  {
    name: 'mandate_events',
    description: 'Read the recorded event log: kind, refusal code, detail, the authorisation and the balance after the event.',
    inputSchema: obj({
      limit: { type: 'integer', minimum: 1, maximum: 200, description: 'how many events to return (default 50)' },
      from: { type: 'integer', minimum: 1, description: 'first event index to return (default 1)' },
    }),
    scope: SCOPES.EVENTS,
    run: (snap, args) => eventsBody(snap, { limit: args.limit, from: args.from }),
  },
  {
    name: 'mandate_event',
    description: 'Read one recorded event by index, including the refusal code when the spend was refused.',
    inputSchema: obj({ index: { type: 'integer', minimum: 1, description: 'event index, 1-based' } }),
    scope: SCOPES.EVENTS,
    required: ['index'],
    run: (snap, args) => eventBody(snap, args.index),
  },
  {
    name: 'mandate_verify',
    description:
      'Recompute the policy hash and every intent hash from the canonical JSON and compare them with what was recorded. Returns each check and a stable inputsHash.',
    inputSchema: obj(),
    scope: SCOPES.VERIFY,
    run: (snap) => verifyBody(snap),
  },
];

const byName = new Map(TOOLS.map((t) => [t.name, t]));

function reply(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function replyError(id, code, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`);
}

function handle(message) {
  const { id, method, params } = message;
  const isNotification = id === undefined || id === null;

  if (method === 'initialize') {
    return reply(id, {
      protocolVersion: PROTOCOL,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'mandate', version: '0.1.0' },
      instructions:
        'Read-only access to a Mandate contract replay. Amounts are integer strings; call mandate_verify before quoting any figure as verified.',
    });
  }
  if (method === 'ping') return reply(id, {});
  if (method?.startsWith('notifications/')) return undefined;

  if (method === 'tools/list') {
    return reply(id, {
      tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    });
  }

  if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments ?? {};
    const tool = byName.get(name);
    if (!tool) return replyError(id, -32602, `unknown tool: ${name}. Known: ${TOOLS.map((t) => t.name).join(', ')}`);
    for (const key of tool.required ?? []) {
      if (args[key] === undefined) return replyError(id, -32602, `${name} requires "${key}"`);
    }
    try {
      const snap = loadSnapshot();
      const body = tool.run(snap, args);
      return reply(id, { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }], isError: false });
    } catch (err) {
      return reply(id, { content: [{ type: 'text', text: `${err.code ?? 'error'}: ${err.message}` }], isError: true });
    }
  }

  if (!isNotification) replyError(id, -32601, `method not found: ${method}`);
  return undefined;
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  const text = line.trim();
  if (!text) return;
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    replyError(null, -32700, 'parse error: each line must be one JSON-RPC message');
    return;
  }
  handle(message);
});

rl.on('close', () => process.exit(0));

// stderr is the diagnostic channel; stdout carries protocol frames only.
console.error(`mandate mcp: ${TOOLS.length} read-only tools over stdio (${PROTOCOL})`);
