// tools/verify-lib.mjs — the verification checks, callable from anywhere.
//
// `make verify`, the HTTP API and the MCP server must not each own a slightly
// different idea of "verified". This module is the single implementation; the
// three callers only decide how to print the result.
//
// Nothing here trusts the snapshot's own claims: every hash is recomputed from
// the canonical JSON the contract serialised.

import { createHash } from 'node:crypto';

export const sha = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** The frozen refusal vocabulary of v1. A new code is a contract change, not a string. */
export const FROZEN_CODES = [
  'amount_zero', 'asset_mismatch', 'attestation_mismatch', 'attestation_required', 'attestor_only',
  'budget_exhausted', 'chain_not_enabled', 'counterparty_not_allowed', 'decision_replayed',
  'mandate_expired', 'mandate_suspended', 'access_key_missing', 'not_found', 'owner_only',
  'per_counterparty_day_exceeded', 'per_day_exceeded', 'per_tx_exceeded', 'policy_changed', 'policy_invalid',
  'request_not_pending', 'unauthorized',
];

/**
 * Recompute every recorded hash and invariant.
 * @param {object} snap parsed snapshot.json
 * @returns {{checks: {name: string, ok: boolean, detail: string}[], failed: object[], inputsHash: string, ok: boolean}}
 */
export function verifySnapshot(snap) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });

  // 1. policy_hash = sha256(canonical policy JSON)
  const policyHash = sha(snap.policyJson);
  add('policy hash', policyHash === snap.policyHash, `${policyHash.slice(0, 16)}… vs ${String(snap.policyHash).slice(0, 16)}…`);

  // 2. intent_hash = sha256 of {amount, asset, chain, vendor} in sorted key order.
  for (const step of snap.steps) {
    const a = step.authorization;
    if (!a) continue;
    const json = JSON.stringify({
      amount: String(a.amount),
      asset: a.asset,
      chain: a.chain,
      vendor: a.vendor,
    });
    add(`event ${step.index} intent`, sha(json) === a.intent_hash, json);
  }

  // 3. A decision authorises one *intent*. An escalation and its approval name
  //    the same decision on purpose (D-005): approval answers the stored request.
  const byDecision = new Map();
  for (const step of snap.steps) {
    const a = step.authorization;
    if (!a) continue;
    if (!byDecision.has(a.decision_hash)) byDecision.set(a.decision_hash, new Set());
    byDecision.get(a.decision_hash).add(a.intent_hash);
  }
  const multiIntent = [...byDecision.values()].filter((set) => set.size > 1).length;
  add('decision binds one intent', multiIntent === 0, `${byDecision.size} decisions, ${multiIntent} reused across intents`);

  // 4. Settlement is recorded on the view, not only in the transcript.
  const m = snap.final.mandates[0];
  add('settlement recorded', Boolean(m) && m.settled_count === 1, `settled_count=${m ? m.settled_count : 'n/a'}`);

  // 5. Stats agree with the rows (arithmetic over views, not over money we chose).
  const sum = snap.final.mandates.reduce((n, x) => n + BigInt(x.spent_total), 0n);
  add('stats consistent', String(sum) === String(snap.final.stats.total_authorised), `sum=${sum} stats=${snap.final.stats.total_authorised}`);

  // 6. Every authorisation names a revision the mandate actually had.
  const history = snap.final.policy_history ?? [];
  const revisionHashes = new Set(history.map((r) => r.hash));
  const stale = snap.steps.filter((s) => s.authorization && !revisionHashes.has(s.authorization.policy_hash));
  add('decisions name a revision', stale.length === 0, `${history.length} revisions, ${stale.length} unknown`);

  const latest = history[history.length - 1];
  add('current hash is newest', Boolean(latest) && latest.hash === snap.final.mandates[0].policy_hash, `rev ${latest ? latest.rev : 'none'}`);
  add('policy_rev equals history', snap.final.mandates[0].policy_rev === history.length, `rev=${snap.final.mandates[0].policy_rev} history=${history.length}`);

  // 7. The refusal vocabulary is the frozen v1 set.
  const observed = [...new Set(snap.steps.map((s) => s.code).filter(Boolean))];
  add('codes are from the frozen set', observed.every((c) => FROZEN_CODES.includes(c)), observed.join(', '));

  const failed = checks.filter((c) => !c.ok);
  const inputsHash = sha(checks.map((c) => `${c.name}:${c.detail}`).join('\n'));
  return { checks, failed, inputsHash, ok: failed.length === 0 };
}
