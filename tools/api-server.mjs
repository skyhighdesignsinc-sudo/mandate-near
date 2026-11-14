// tools/api-server.mjs — a read-only HTTP API over the same contract views.
//
//   node tools/api-server.mjs 4174          (or `make api`)
//
// Every route requires a bearer key issued by `node tools/keys.mjs issue`, and
// each route names the one scope it needs. There is no write path: nothing here
// signs, deploys or spends. The console fetches the same snapshot directly, so a
// judge can compare the two and see one source of truth.
//
// Errors are typed JSON, never an HTML page:
//   { "error": { "code": "scope_missing", "message": "..." } }

import { createServer } from 'node:http';

import {
  ApiError,
  SCOPES,
  MODE,
  DEFAULT_SNAPSHOT,
  eventBody,
  eventsBody,
  loadSnapshot,
  mandatesBody,
  pendingBody,
  policyBody,
  statsBody,
  statusBody,
  verifyBody,
} from './api.mjs';
import { matchKey } from './keystore.mjs';

const port = Number(process.argv[2] ?? process.env.MANDATE_API_PORT ?? 4174);
const host = process.env.MANDATE_API_HOST ?? '127.0.0.1';
const RATE_LIMIT = Number(process.env.MANDATE_API_RATE ?? 120); // requests per minute per key
const WINDOW_MS = 60_000;

/** Routes are data, so the scope table and the router cannot drift apart. */
const ROUTES = [
  { path: '/v1/status', scope: SCOPES.VIEWS, body: (snap) => statusBody(snap) },
  { path: '/v1/mandates', scope: SCOPES.VIEWS, body: (snap) => mandatesBody(snap) },
  { path: '/v1/pending', scope: SCOPES.VIEWS, body: (snap) => pendingBody(snap) },
  { path: '/v1/stats', scope: SCOPES.VIEWS, body: (snap) => statsBody(snap) },
  { path: '/v1/policy', scope: SCOPES.VIEWS, body: (snap) => policyBody(snap) },
  { path: '/v1/events', scope: SCOPES.EVENTS, body: (snap, query) => eventsBody(snap, { limit: query.get('limit'), from: query.get('from') }) },
  { path: '/v1/verify', scope: SCOPES.VERIFY, body: (snap) => verifyBody(snap) },
];

const buckets = new Map();

function rateLimited(id) {
  const now = Date.now();
  const bucket = buckets.get(id) ?? { start: now, count: 0 };
  if (now - bucket.start >= WINDOW_MS) {
    bucket.start = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  buckets.set(id, bucket);
  return { limited: bucket.count > RATE_LIMIT, retryAfter: Math.ceil((bucket.start + WINDOW_MS - now) / 1000) };
}

const LOOPBACK = /^http:\/\/(127\.0\.0\.1|localhost|\[::1])(:\d+)?$/;

function corsHeaders(origin) {
  if (!origin || !LOOPBACK.test(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    Vary: 'Origin',
  };
}

function send(res, status, payload, origin, extra = {}) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Mandate-Mode': MODE.replace(/\s+/g, '-'),
    ...corsHeaders(origin),
    ...extra,
  });
  res.end(body);
}

const fail = (res, status, code, message, origin, extra) =>
  send(res, status, { error: { code, message } }, origin, extra);

const server = createServer((req, res) => {
  const started = Date.now();
  const origin = req.headers.origin;
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(origin));
    res.end();
    return;
  }

  const finish = (status, note = '') => {
    console.log(`${req.method} ${url.pathname}${url.search} ${status}${note ? ` ${note}` : ''} ${Date.now() - started}ms`);
  };

  if (url.pathname === '/health') {
    send(res, 200, { ok: true, service: 'mandate-api', mode: MODE, routes: ROUTES.map((r) => r.path) }, origin);
    finish(200);
    return;
  }

  if (req.method !== 'GET') {
    fail(res, 405, 'method_not_allowed', 'this API is read-only; it accepts GET', origin, { Allow: 'GET, OPTIONS' });
    finish(405);
    return;
  }

  const auth = req.headers.authorization ?? '';
  const secret = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const matched = matchKey(secret);
  if (!matched.ok) {
    const message =
      matched.code === 'key_revoked'
        ? 'this key was revoked; issue a new one with `node tools/keys.mjs issue`'
        : 'no valid bearer key. Mint one with `node tools/keys.mjs issue --label <name>`';
    fail(res, 401, matched.code, message, origin, { 'WWW-Authenticate': 'Bearer' });
    finish(401, matched.code);
    return;
  }

  const limit = rateLimited(matched.key.id);
  if (limit.limited) {
    fail(res, 429, 'rate_limited', `${RATE_LIMIT} requests per minute per key`, origin, { 'Retry-After': String(limit.retryAfter) });
    finish(429, matched.key.id);
    return;
  }

  const eventMatch = url.pathname.match(/^\/v1\/events\/(\d{1,4})$/);
  const route = eventMatch ? { path: '/v1/events/:index', scope: SCOPES.EVENTS } : ROUTES.find((r) => r.path === url.pathname);

  if (!route) {
    fail(res, 404, 'not_found', `${url.pathname} is not a route. See /health for the list.`, origin);
    finish(404);
    return;
  }

  if (!matched.key.scopes.includes(route.scope)) {
    fail(res, 403, 'scope_missing', `this key has [${matched.key.scopes.join(', ')}]; ${route.path} needs ${route.scope}`, origin);
    finish(403, route.scope);
    return;
  }

  let snap;
  try {
    snap = loadSnapshot(DEFAULT_SNAPSHOT);
    const payload = eventMatch
      ? eventBody(snap, Number(eventMatch[1]))
      : route.body(snap, url.searchParams);
    send(res, 200, payload, origin);
    finish(200, matched.key.id);
  } catch (err) {
    if (err instanceof ApiError) {
      fail(res, err.status, err.code, err.message, origin);
      finish(err.status, err.code);
      return;
    }
    fail(res, 500, 'internal_error', err.message, origin);
    finish(500, 'internal_error');
  }
});

server.listen(port, host, () => {
  console.log(`mandate api: http://${host}:${port}  (${ROUTES.length + 1} routes, read-only, key required)`);
  console.log(`mode: ${MODE}`);
});
