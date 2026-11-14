// signer/src/errors.mjs — typed errors for the signer surface.
// Per AGENTS.md §4: failure paths produce a typed error, not a panic.
// Every error carries a machine-readable `code` so the UI and the demo
// can assert on it without string-matching messages.

export class SignerError extends Error {
  constructor(code, detail, { cause } = {}) {
    super(`SignerError(${code})${detail ? `: ${detail}` : ''}`, { cause });
    this.name = 'SignerError';
    this.code = code;
  }
}

// Codes (frozen v1 — add via a decision id in docs/DECISIONS.md):
//   'chain_unsupported'     buildTx called with a chain not in CHAINS
//   'amount_negative'       amount < 0
//   'amount_too_large'      exceeds the chain's per-tx sanity cap (dust guard)
//   'asset_mismatch'        asset not native to the chain
//   'destination_invalid'   destination address failed format check
//   'rpc_unreachable'       NEAR RPC (or foreign RPC) did not respond
//   'mpc_unavailable'       MPC signer contract rejected or timed out
//   'not_confident'         MPC returned success with confidence below threshold
//   'credentials_missing'   .env lacks the key this path needs (screener mock path)

export const CODES = Object.freeze([
  'chain_unsupported',
  'amount_negative',
  'amount_too_large',
  'asset_mismatch',
  'destination_invalid',
  'rpc_unreachable',
  'mpc_unavailable',
  'not_confident',
  'credentials_missing',
]);
