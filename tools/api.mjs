// tools/api.mjs — the read model behind the HTTP API and the MCP server.
//
// One rule: this module formats what the contract returned and adds nothing.
// No balance is summed here, no limit is compared, no decision is invented. If
// a field is missing from the snapshot, the response says so; it does not fill
// it in.
//
// The snapshot is a replay of a contract run (`make demo`). Every response
// carries `mode` so a client cannot mistake it for a live chain read.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { verifySnapshot } from './verify-lib.mjs';

export const DEFAULT_SNAPSHOT = 'mandate/console/data/snapshot.json';

/** The whole scope vocabulary. A method names the one scope it needs. */
export const SCOPES = {
  VIEWS: 'read:views',
  EVENTS: 'read:events',
  VERIFY: 'read:verify',
};
export const ALL_SCOPES = Object.values(SCOPES);

export class ApiError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export function loadSnapshot(path = process.env.MANDATE_SNAPSHOT ?? DEFAULT_SNAPSHOT) {
  const file = resolve(path);
  let snap;
  try {
    snap = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new ApiError('snapshot_missing', `cannot read ${path}: ${err.message}. Run \`make demo\`.`, 503);
  }
  if (snap.schema !== 1 || !Array.isArray(snap.steps) || !snap.final) {
    throw new ApiError('snapshot_unreadable', `${path} is not a schema-1 snapshot. Run \`make demo\`.`, 503);
  }
  return snap;
}

export const MODE = 'replay of a contract run, never deployed';

export function statusBody(snap) {
  return {
    service: 'mandate',
    mode: MODE,
    network: snap.network,
    contract: snap.contract,
    attestor: snap.attestor,
    asset: snap.asset,
    decimals: snap.decimals,
    mandate_id: snap.mandateId,
    events: snap.steps.length,
    owner: snap.owner,
    agent: snap.agent,
    signed: false,
    note: 'read-only: this service holds no key and submits no transaction',
  };
}

export function mandatesBody(snap) {
  return { mode: MODE, asset: snap.asset, decimals: snap.decimals, held: snap.final.held, mandates: snap.final.mandates };
}

export function pendingBody(snap) {
  return { mode: MODE, asset: snap.asset, pending: snap.final.pending };
}

export function statsBody(snap) {
  return { mode: MODE, asset: snap.asset, held: snap.final.held, stats: snap.final.stats };
}

function eventRow(step) {
  return {
    index: step.index,
    kind: step.kind,
    code: step.code ?? null,
    label: step.label,
    detail: step.detail,
    authorization: step.authorization ?? null,
    balance: step.views.mandates[0]?.balance ?? null,
    suspended: step.views.mandates[0]?.suspended ?? null,
  };
}

export function eventsBody(snap, { limit = 50, from = 1 } = {}) {
  const max = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const start = Math.max(Number(from) || 1, 1);
  const rows = snap.steps.filter((s) => s.index >= start).slice(0, max).map(eventRow);
  return { mode: MODE, total: snap.steps.length, from: start, count: rows.length, events: rows };
}

export function eventBody(snap, index) {
  const step = snap.steps.find((s) => s.index === Number(index));
  if (!step) throw new ApiError('not_found', `no event ${index} in this snapshot (1..${snap.steps.length})`, 404);
  return { mode: MODE, event: eventRow(step) };
}

export function verifyBody(snap) {
  const { checks, failed, inputsHash, ok } = verifySnapshot(snap);
  return {
    mode: MODE,
    ok,
    checks: checks.length,
    failed: failed.length,
    inputsHash,
    results: checks,
    note: 'recomputed in this process from the canonical JSON; the snapshot’s own claims are not trusted',
  };
}

export function policyBody(snap) {
  return {
    mode: MODE,
    policy: JSON.parse(snap.policyJson),
    policy_hash: snap.policyHash,
    revisions: snap.final.policy_history ?? [],
    attestation_code_hash: snap.attestationCodeHash,
  };
}
