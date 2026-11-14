// tools/keystore.mjs — scoped client keys for the read API.
//
// A key is shown once, when it is issued. What is stored is the SHA-256 of the
// secret and a short prefix, so the file on disk cannot be replayed as a
// credential. The file lives under `mandate/console/data/` and is gitignored: a
// fresh clone starts with no clients, which is why the API answers 401 until
// somebody runs `node tools/keys.mjs issue`.
//
// This is the customer-facing half of the product: a mandate's owner hands their
// own dashboard or agent a key that can read the mandate and nothing else.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { ALL_SCOPES } from './api.mjs';

export const STORE_PATH = resolve(process.env.MANDATE_KEYS ?? 'mandate/console/data/api-keys.json');

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest();

export function readStore() {
  if (!existsSync(STORE_PATH)) return { schema: 1, keys: [] };
  try {
    const parsed = JSON.parse(readFileSync(STORE_PATH, 'utf8'));
    if (parsed.schema !== 1 || !Array.isArray(parsed.keys)) return { schema: 1, keys: [] };
    return parsed;
  } catch {
    // A corrupt store is treated as empty rather than crashing the server: the
    // failure surfaces as 401 on every call, which is the safe direction.
    return { schema: 1, keys: [] };
  }
}

function writeStore(store) {
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  writeFileSync(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
}

function assertScopes(scopes) {
  const bad = scopes.filter((s) => !ALL_SCOPES.includes(s));
  if (bad.length) {
    throw new Error(`unknown scope${bad.length === 1 ? '' : 's'}: ${bad.join(', ')}. Known: ${ALL_SCOPES.join(', ')}`);
  }
  if (!scopes.length) throw new Error(`at least one scope is required. Known: ${ALL_SCOPES.join(', ')}`);
}

/**
 * Issue a key. The secret is returned exactly once, here; only its hash is kept.
 * @returns {{key: string, id: string, label: string, scopes: string[], prefix: string, created: string}}
 */
export function issueKey({ label = 'client', scopes = ['read:views'] } = {}) {
  const clean = [...new Set(scopes.map((s) => s.trim()).filter(Boolean))];
  assertScopes(clean);
  const store = readStore();
  const secret = `mk_${randomBytes(24).toString('base64url')}`;
  const id = `k_${randomBytes(3).toString('hex')}`;
  const entry = {
    id,
    label: String(label).slice(0, 60),
    prefix: secret.slice(0, 11),
    hash: sha256(secret).toString('hex'),
    scopes: clean,
    created: new Date().toISOString(),
    revoked: false,
  };
  store.keys.push(entry);
  writeStore(store);
  return { key: secret, id, label: entry.label, scopes: clean, prefix: entry.prefix, created: entry.created };
}

export function listKeys() {
  return readStore()
    .keys.map(({ hash, ...rest }) => rest)
    .sort((a, b) => a.created.localeCompare(b.created));
}

export function revokeKey(id) {
  const store = readStore();
  const entry = store.keys.find((k) => k.id === id);
  if (!entry) return null;
  entry.revoked = true;
  entry.revoked_at = new Date().toISOString();
  writeStore(store);
  return entry;
}

/**
 * Resolve a presented secret to a live key.
 * @returns {{ok: true, key: object} | {ok: false, code: 'unauthorized'|'key_revoked', key?: object}}
 */
export function matchKey(secret) {
  if (typeof secret !== 'string' || !secret.startsWith('mk_')) return { ok: false, code: 'unauthorized' };
  const presented = sha256(secret);
  for (const key of readStore().keys) {
    const stored = Buffer.from(key.hash, 'hex');
    // Compare hashes in constant time; a length check first because
    // timingSafeEqual throws on a length mismatch.
    if (stored.length === presented.length && timingSafeEqual(stored, presented)) {
      return key.revoked ? { ok: false, code: 'key_revoked', key } : { ok: true, key };
    }
  }
  return { ok: false, code: 'unauthorized' };
}
