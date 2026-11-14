// workers/attest/src/index.mjs — encode/decode attestation (SCAFFOLD.md §2):
//   attest(inputs) -> Promise<Ok(Proof2) | Err({code})>
//   Proof2 = { decisionHash, codeHash, quote, inputsHash }
//
// Per SCAFFOLD.md §3.3: the worker returns hashes only. Prompts and credentials
// never leave the enclave. inputsHash is sha256 of the canonicalized inputs;
// decisionHash is sha256 of the decision the agent reached; codeHash is the
// measured hash of the code that ran; quote is the TDX/SGX attestation quote.
//
// When TEE_PROVIDER=none (the default, and the screener's path), attest runs
// in mock mode: it produces a Proof2 with quote=null and a flag the UI footer
// must show. Never claim a real quote when mock ran (AGENTS.md §2.5).

import { createHash } from 'node:crypto';
import { SignerError } from '../../../signer/src/errors.mjs';
export { SignerError };

export const Ok = (value) => ({ ok: true, value });
export const Err = (error) => ({ ok: false, error });

function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex');
}

function canonicalize(inputs) {
  // Deterministic JSON: sorted keys, no whitespace. The enclave and the verifier
  // must agree byte-for-byte on what was hashed.
  if (inputs === null || typeof inputs !== 'object') return JSON.stringify(inputs);
  const keys = Object.keys(inputs).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(inputs[k])).join(',') + '}';
}

export async function attest(inputs, { teeProvider = 'none', teeHost = null, codeHash = null } = {}) {
  if (inputs === undefined || inputs === null) {
    return Err(new SignerError('destination_invalid', 'attest(inputs) needs inputs'));
  }
  const inputsHash = sha256Hex(canonicalize(inputs));
  // decisionHash is computed by the caller (the agent's decision is a string);
  // attest just binds it to the inputs and the codeHash.
  const decision = typeof inputs === 'object' && inputs?.decision ? String(inputs.decision) : '';
  const decisionHash = decision ? sha256Hex(decision) : null;

  if (teeProvider === 'none' || !teeHost) {
    return Ok({
      ok: true,
      decisionHash,
      codeHash: codeHash ?? 'mock-codehash-scaffold',
      quote: null,
      inputsHash,
      mode: 'MOCK',
    });
  }

  // Real TEE path: POST canonicalized inputs to the enclave, receive a quote.
  // The enclave never returns the raw prompt back — only the hashes and the quote.
  try {
    const res = await fetch(`${teeHost}/attest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inputs: canonicalize(inputs), decision }),
    });
    if (!res.ok) return Err(new SignerError('mpc_unavailable', `enclave HTTP ${res.status}`));
    const body = await res.json();
    if (!body?.quote) return Err(new SignerError('not_confident', 'enclave returned no quote'));
    return Ok({
      ok: true,
      decisionHash: body.decisionHash ?? decisionHash,
      codeHash: body.codeHash,
      quote: body.quote,
      inputsHash,
      mode: 'TDX',
    });
  } catch (e) {
    return Err(new SignerError('rpc_unreachable', String(e?.message ?? e)));
  }
}

// verify-selftest: prove that canonicalize is deterministic and that mock mode
// produces a stable Proof2 for the same inputs. Run by `make verify`.
export function selftest() {
  const a = attest({ decision: 'spend 1000 USDC to vendor X', reason: 'invoice #42' });
  const b = attest({ reason: 'invoice #42', decision: 'spend 1000 USDC to vendor X' });
  // key order differs; canonicalize must produce identical hashes
  return Promise.all([a, b]).then(([ra, rb]) => {
    if (!ra.ok || !rb.ok) return { ok: false, reason: 'one failed' };
    if (ra.value.inputsHash !== rb.value.inputsHash) return { ok: false, reason: 'inputsHash diverged' };
    if (ra.value.decisionHash !== rb.value.decisionHash) return { ok: false, reason: 'decisionHash diverged' };
    if (ra.value.mode !== 'MOCK' || rb.value.mode !== 'MOCK') return { ok: false, reason: 'expected MOCK mode' };
    return { ok: true, inputsHash: ra.value.inputsHash };
  });
}
