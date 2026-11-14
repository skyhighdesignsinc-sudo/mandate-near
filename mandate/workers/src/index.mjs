// workers/src/index.mjs — TEE request → attest → resume skeleton.
//
// Per SCAFFOLD.md §1 worker module: "TEE request → attest → resume skeleton
// (yield/resume inside 200 blocks)". Per D-005: escalation is NOT yield/resume
// — that pattern is only for worker round-trips, never for user-facing flows.
//
// The flow:
//   1. A contract calls the worker with a request (foreign fact to verify, or
//      an attested decision to produce).
//   2. The worker yields: it returns a Promise that the contract can await
//      across a cross-contract call boundary. The yield window is 200 blocks
//      (~4 minutes at 1.2s/block on NEAR) — beyond that, the resume fails.
//   3. The worker attests the result (workers/attest) and resumes the caller
//      with a Proof2.
//
// This module is the skeleton: it defines the yield/resume protocol and the
// 200-block window. The actual TEE integration (D-006) plugs in here.

import { createHash } from 'node:crypto';
import { SignerError } from '../../signer/src/errors.mjs';
import { attest } from '../attest/src/index.mjs';

export { SignerError };

export const Ok = (value) => ({ ok: true, value });
export const Err = (error) => ({ ok: false, error });

const YIELD_WINDOW_BLOCKS = 200;

// A request is { id, kind, inputs, deadlineBlock }. The contract creates it,
// the worker fulfils it. `id` is unique per request; `deadlineBlock` is the
// NEAR block height after which resume fails.
export async function yieldRequest(request, { currentBlock, teeProvider, teeHost, codeHash }) {
  if (!request?.id) return Err(new SignerError('destination_invalid', 'request.id missing'));
  if (!request?.kind) return Err(new SignerError('chain_unsupported', 'request.kind missing'));
  if (!request?.inputs || typeof request.inputs !== 'object') {
    return Err(new SignerError('destination_invalid', 'request.inputs must be a non-empty object'));
  }
  if (typeof currentBlock !== 'number' || currentBlock < 0) {
    return Err(new SignerError('destination_invalid', 'currentBlock missing'));
  }
  const deadline = request.deadlineBlock ?? (currentBlock + YIELD_WINDOW_BLOCKS);
  if (deadline <= currentBlock) {
    return Err(new SignerError('mpc_unavailable', `deadline ${deadline} <= current ${currentBlock}`));
  }

  // The worker attests its inputs before doing the work. The contract can
  // verify the attestation matches what it expects before resuming.
  const attested = await attest({ ...request.inputs, _requestId: request.id }, { teeProvider, teeHost, codeHash });
  if (!attested.ok) return attested;

  // In the real flow, the worker does the foreign-chain work here (verify a tx,
  // run an attested inference) and then resumes the contract with a callback.
  // The skeleton returns the attestation; the product layer (pledge/mandate)
  // fills in the actual work and the resume transaction.
  return Ok({
    requestId: request.id,
    deadlineBlock: deadline,
    yieldedAtBlock: currentBlock,
    attestation: attested.value,
    // resumePayload is what the contract will receive when it calls back.
    // Hash-only — never the raw prompt (SCAFFOLD.md §3.3).
    resumePayload: {
      decisionHash: attested.value.decisionHash,
      inputsHash: attested.value.inputsHash,
      quote: attested.value.quote,
    },
  });
}

// The contract calls this to check whether a yielded request is still resumable.
export function canResume(yielded, currentBlock) {
  if (!yielded?.deadlineBlock) return false;
  if (currentBlock > yielded.deadlineBlock) return false;
  return true;
}

// 200-block window in seconds, for the UI to show "expires in Ns".
export const YIELD_WINDOW_SECONDS = YIELD_WINDOW_BLOCKS * 1.2;
export { YIELD_WINDOW_BLOCKS };
