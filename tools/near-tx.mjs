// tools/near-tx.mjs — the small, boring layer between this repository and testnet.
//
// Signing is done here and nowhere else: a transaction is built, sha256-hashed,
// signed with the account's key, and broadcast as base64. Two details are easy
// to get wrong and both cost an hour, so they are written down once:
//
//   * the protocol signs sha256(serialized transaction), not the bytes;
//   * `broadcast_tx_commit` wants base64, while the transaction id is
//     base58(sha256(bytes)) — `baseEncode` in near-api-js is base58.
//
// Keys live in ~/.near-credentials/testnet/<account>.json, outside the
// repository. Nothing here prints a private key.

import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  KeyPair,
  Signature,
  SignedTransaction,
  base64Encode,
  baseDecode,
  baseEncode,
  createTransaction,
  encodeTransaction,
} from 'near-api-js';

export const RPC = process.env.NEAR_RPC ?? 'https://rpc.testnet.near.org';
export const FAUCET = process.env.NEAR_FAUCET ?? 'https://helper.testnet.near.org/account';
export const EXPLORER = 'https://testnet.nearblocks.io';

export class Fail extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const sha256 = (bytes) => new Uint8Array(createHash('sha256').update(bytes).digest());
export const sha256Hex = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** The contract's intent hash: sorted-key JSON of (amount, asset, chain, vendor). */
export const intentHash = (chain, amount, vendor, asset) =>
  sha256Hex(JSON.stringify({ amount: String(amount), asset, chain, vendor }));

export async function rpc(method, params, timeoutMs = 30_000) {
  let res;
  try {
    res = await fetch(RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: `mandate-${Date.now()}`, method, params }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    throw timedOut
      ? new Fail('rpc_timeout', `${method} got no answer in ${Math.round(timeoutMs / 1000)}s`)
      : new Fail('rpc_unreachable', `cannot reach ${RPC}: ${err.message}`);
  }
  let body;
  try {
    body = await res.json();
  } catch {
    throw new Fail('rpc_bad_response', `${RPC} answered ${res.status} with a non-JSON body`);
  }
  if (body.error) {
    throw new Fail('rpc_error', `${method}: ${body.error.message} ${JSON.stringify(body.error.cause ?? '').slice(0, 200)}`);
  }
  return body.result;
}

export async function viewCall(accountId, method, args = {}) {
  const res = await rpc('query', {
    request_type: 'call_function',
    finality: 'final',
    account_id: accountId,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
  }, 25_000);
  return JSON.parse(Buffer.from(res.result).toString('utf8'));
}

export async function accountExists(accountId) {
  try {
    await rpc('query', { request_type: 'view_account', finality: 'final', account_id: accountId }, 25_000);
    return true;
  } catch {
    return false;
  }
}

export const credentialsPath = (accountId) => join(homedir(), '.near-credentials', 'testnet', `${accountId}.json`);

export function loadCredentials(accountId) {
  const file = credentialsPath(accountId);
  if (!existsSync(file)) return null;
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  return { keyPair: KeyPair.fromString(parsed.private_key), file };
}

/** Faucet-sponsored creation: testnet only, no email, no wallet, no funding account. */
export async function createViaFaucet(accountId, say = console.log) {
  const keyPair = KeyPair.fromRandom('ed25519');
  const publicKey = keyPair.getPublicKey().toString();
  say(`  creating ${accountId} through the testnet faucet …`);
  let res;
  try {
    res = await fetch(FAUCET, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: publicKey }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    throw new Fail('faucet_unreachable', `cannot reach ${FAUCET}: ${err.message}`);
  }
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    throw new Fail('faucet_refused', `the faucet answered ${res.status}: ${text}. Pass --account with another name.`);
  }
  const file = credentialsPath(accountId);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(
    file,
    `${JSON.stringify({ account_id: accountId, public_key: publicKey, private_key: keyPair.toString() }, null, 2)}\n`,
    { mode: 0o600 },
  );
  chmodSync(file, 0o600);
  say(`  key saved outside the repository: ${file}`);
  return { keyPair, file };
}

async function headBlockHash() {
  const block = await rpc('block', { finality: 'final' }, 25_000);
  return baseDecode(block.header.hash);
}

// Access-key nonces only advance once a transaction is included in a block, so
// three calls in a row would otherwise all read the same nonce and the later
// two would be dropped as invalid — which looks like a contract refusal and is
// not one. Cache the last nonce we used and count up from there.
const nonceCache = new Map();

async function nextNonce(accountId, publicKey) {
  const cacheKey = `${accountId}:${publicKey.toString()}`;
  const cached = nonceCache.get(cacheKey);
  if (cached !== undefined) {
    const next = cached + 1n;
    nonceCache.set(cacheKey, next);
    return next;
  }
  const key = await rpc('query', {
    request_type: 'view_access_key',
    finality: 'final',
    account_id: accountId,
    public_key: publicKey.toString(),
  }, 25_000);
  const next = BigInt(key.nonce) + 1n;
  nonceCache.set(cacheKey, next);
  return next;
}

/**
 * Pull a typed refusal out of a failed transaction, or null.
 *
 * A panicking contract surfaces as `"Smart contract panicked: PolicyViolation:
 * <code>"` somewhere inside the failure JSON, and the exact nesting differs
 * between a top-level Failure and a failed receipt. Both are scanned, and
 * `tx_failed` is kept for failures that are not a policy decision (bad nonce,
 * out of gas) so the two can never be confused.
 */
export function extractFailure(outcome) {
  const parts = [];
  if (outcome.status?.Failure) parts.push(JSON.stringify(outcome.status.Failure));
  for (const r of outcome.receipts_outcome ?? []) {
    if (r.outcome?.status?.Failure) parts.push(JSON.stringify(r.outcome.status.Failure));
  }
  if (!parts.length) return null;
  const text = parts.join(' ');

  // The release profile sets panic = "abort", so a panicking contract traps with
  // "WebAssembly trap: An `unreachable` opcode was executed" and the panic
  // message never reaches the error object. The code the contract logged before
  // panicking does reach the receipt, and the explorer shows it too.
  const logs = [];
  for (const r of outcome.receipts_outcome ?? []) logs.push(...(r.outcome?.logs ?? []));
  logs.push(...(outcome.transaction_outcome?.outcome?.logs ?? []));
  const fromLog = logs.join('\n').match(/violation:\s*([a-zA-Z_]+)/);

  const fromMessage = text.match(/PolicyViolation:\s*([a-zA-Z_]+)/);
  const code = fromLog ? fromLog[1] : fromMessage ? fromMessage[1] : 'tx_failed';
  return { code, detail: text.slice(0, 300) + (logs.length ? ` | logs: ${logs.slice(-3).join(' / ').slice(0, 300)}` : '') };
}

async function waitForTx(txHash, senderId) {
  const deadline = Date.now() + 150_000;
  for (;;) {
    try {
      const outcome = await rpc('tx', { tx_hash: txHash, sender_account_id: senderId, wait_until: 'EXECUTED_OPTIMISTIC' }, 25_000);
      return outcome.transaction_outcome ? outcome : { ...outcome, transaction_outcome: { id: txHash } };
    } catch (err) {
      if (Date.now() > deadline) throw new Fail('tx_not_found', `transaction ${txHash} was not found in 150s (${err.message})`);
      await new Promise((r) => setTimeout(r, 3_000));
    }
  }
}

/**
 * Build, sign and broadcast one transaction.
 * @returns {{txHash: string, explorer: string, failure: null | {code: string, detail: string}}}
 */
export async function submit({ signerId, keyPair, receiverId, actionList, label, say = () => {} }) {
  const publicKey = keyPair.getPublicKey();
  const tx = createTransaction(
    signerId,
    publicKey,
    receiverId,
    await nextNonce(signerId, publicKey),
    actionList,
    await headBlockHash(),
  );
  const signature = new Signature({ keyType: publicKey.keyType, data: keyPair.sign(sha256(encodeTransaction(tx))).signature });
  const bytes = new SignedTransaction({ transaction: tx, signature }).encode();
  const txHash = baseEncode(sha256(bytes));
  const explorer = `${EXPLORER}/txns/${txHash}`;

  say(`  ${label.padEnd(18)} ${txHash}`);
  say(`  ${''.padEnd(18)} ${explorer}`);

  let outcome;
  try {
    outcome = await rpc('broadcast_tx_commit', [base64Encode(bytes)], 120_000);
  } catch (err) {
    if (err.code !== 'rpc_timeout') throw err;
    say(`  ${''.padEnd(18)} broadcast is slow, polling for the receipt …`);
    outcome = await waitForTx(txHash, signerId);
  }
  return { txHash, explorer, failure: extractFailure(outcome), outcome };
}
