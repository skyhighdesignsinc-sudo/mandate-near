// tools/deploy-testnet.mjs — put the contract on testnet, and say what happened.
//
//   node tools/deploy-testnet.mjs --account mandate-demo.testnet
//   node tools/deploy-testnet.mjs --dry          # show the plan, send nothing
//
// What it does, in order:
//   1. load ~/.near-credentials/testnet/<account>.json, or ask the testnet faucet
//      to create the account with a freshly generated key (no email, no wallet);
//   2. deploy out/mandate.wasm (`make contract-wasm` builds it in the reference
//      container);
//   3. call `new(attestor)`, then `create_mandate` with the policy this repo's
//      snapshot was produced from, and a small attached deposit;
//   4. print every transaction hash with an explorer link.
//
// Key material never enters the repository and is never printed. The account id
// and tx hashes are public, so they are printed and are safe to paste into
// SCREENER.md.

import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  KeyPair,
  Signature,
  SignedTransaction,
  actions,
  base64Encode,
  baseDecode,
  baseEncode,
  createTransaction,
  encodeTransaction,
} from 'near-api-js';

const RPC = process.env.NEAR_RPC ?? 'https://rpc.testnet.near.org';
const FAUCET = process.env.NEAR_FAUCET ?? 'https://helper.testnet.near.org/account';
const WASM = resolve('mandate/contracts/mandate/out/mandate.wasm');
const SNAPSHOT = resolve(process.env.MANDATE_SNAPSHOT ?? 'mandate/console/data/snapshot.json');
const EXPLORER = 'https://testnet.nearblocks.io';

class Fail extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const sha256 = (bytes) => new Uint8Array(createHash('sha256').update(bytes).digest());
const arg = (name, fallback = undefined) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1];
};
const flag = (name) => process.argv.includes(`--${name}`);
const say = (line = '') => console.log(line);

async function rpc(method, params, timeoutMs = 30_000) {
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
    const cause = body.error.cause?.name ?? body.error.data ?? '';
    throw new Fail('rpc_error', `${method}: ${body.error.message}${cause ? ` (${cause})` : ''}`);
  }
  return body.result;
}

async function accountExists(accountId) {
  try {
    await rpc('query', { request_type: 'view_account', finality: 'final', account_id: accountId });
    return true;
  } catch {
    return false;
  }
}

function credentialsPath(accountId) {
  return join(homedir(), '.near-credentials', 'testnet', `${accountId}.json`);
}

function loadCredentials(accountId) {
  const file = credentialsPath(accountId);
  if (!existsSync(file)) return null;
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  return { keyPair: KeyPair.fromString(parsed.private_key), file };
}

async function createViaFaucet(accountId) {
  const keyPair = KeyPair.fromRandom('ed25519');
  const publicKey = keyPair.getPublicKey().toString();
  say(`  creating ${accountId} through the testnet faucet …`);
  let res;
  try {
    res = await fetch(FAUCET, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: publicKey }),
    });
  } catch (err) {
    throw new Fail('faucet_unreachable', `cannot reach ${FAUCET}: ${err.message}`);
  }
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    throw new Fail(
      'faucet_refused',
      `the faucet answered ${res.status}: ${text}. Pick a different name with --account, or create one at https://testnet.mynearwallet.com and import it.`,
    );
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

async function blockHash() {
  const block = await rpc('block', { finality: 'final' });
  return baseDecode(block.header.hash);
}

async function nextNonce(accountId, publicKey) {
  const key = await rpc('query', {
    request_type: 'view_access_key',
    finality: 'final',
    account_id: accountId,
    public_key: publicKey.toString(),
  });
  return BigInt(key.nonce) + 1n;
}

/**
 * Poll a transaction we already broadcast. The tx id is base58(sha256(signed
 * bytes)), so it is known before the node answers — which is what makes a
 * timeout recoverable instead of a lost deployment.
 */
async function waitForTx(txHash, senderId) {
  const deadline = Date.now() + 150_000;
  for (;;) {
    try {
      const outcome = await rpc('tx', { tx_hash: txHash, sender_account_id: senderId, wait_until: 'EXECUTED_OPTIMISTIC' }, 25_000);
      return outcome.transaction_outcome ? outcome : { ...outcome, transaction_outcome: { id: txHash } };
    } catch (err) {
      if (err.code === 'rpc_error' && /UnknownTransaction|Not found/i.test(err.message) === false && Date.now() > deadline) throw err;
      if (Date.now() > deadline) throw new Fail('tx_not_found', `transaction ${txHash} was not found in 150s`);
      await new Promise((r) => setTimeout(r, 3_000));
    }
  }
}

function assertOutcome(outcome, label) {
  if (outcome.status?.Failure) {
    throw new Fail('tx_failed', `${label} failed on chain: ${JSON.stringify(outcome.status.Failure).slice(0, 400)}`);
  }
  // A top-level SuccessValue of "" hides a panicking receipt: check each one.
  const failed = (outcome.receipts_outcome ?? []).find((r) => r.outcome?.status?.Failure);
  if (failed) {
    throw new Fail('receipt_failed', `${label}: a receipt failed: ${JSON.stringify(failed.outcome.status.Failure).slice(0, 400)}`);
  }
}

/** Sign with sha256(tx bytes), which is what the protocol verifies. */
async function submit({ signerId, keyPair, receiverId, actionList, label }) {
  const publicKey = keyPair.getPublicKey();
  const nonce = await nextNonce(signerId, publicKey);
  const tx = createTransaction(signerId, publicKey, receiverId, nonce, actionList, await blockHash());
  const signature = new Signature({ keyType: publicKey.keyType, data: keyPair.sign(sha256(encodeTransaction(tx))).signature });
  const signed = new SignedTransaction({ transaction: tx, signature });
  const bytes = signed.encode();
  const txHash = baseEncode(sha256(bytes));

  say(`  ${label.padEnd(16)} ${txHash}`);
  say(`  ${''.padEnd(16)} ${EXPLORER}/txns/${txHash}`);

  let outcome;
  try {
    // base64, not base58: `baseEncode` in this library is base58, which the node
    // rejects with "Failed to decode transaction: Invalid padding".
    outcome = await rpc('broadcast_tx_commit', [base64Encode(bytes)], 120_000);
  } catch (err) {
    if (err.code !== 'rpc_timeout') throw err;
    say(`  ${''.padEnd(16)} broadcast is slow, polling for the receipt …`);
    outcome = await waitForTx(txHash, signerId);
  }
  assertOutcome(outcome, label);
  return outcome;
}

/** A view call, so the script can tell an initialized contract from a fresh one. */
async function viewCall(accountId, method, args = {}) {
  const res = await rpc('query', {
    request_type: 'call_function',
    finality: 'final',
    account_id: accountId,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
  }, 20_000);
  return JSON.parse(Buffer.from(res.result).toString('utf8'));
}

async function main() {
  if (!existsSync(WASM)) {
    throw new Fail('wasm_missing', `${WASM} not found. Run \`make contract-wasm\` (Docker, reference container).`);
  }
  if (!existsSync(SNAPSHOT)) {
    throw new Fail('snapshot_missing', `${SNAPSHOT} not found. Run \`make demo\` first: the policy to install comes from it.`);
  }
  const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  const policy = JSON.parse(snap.policyJson);
  const account = arg('account', process.env.MANDATE_ACCOUNT ?? `mandate-${Date.now().toString(36)}.testnet`);
  const attestor = arg('attestor', process.env.MANDATE_ATTESTOR ?? account);
  const deposit = arg('deposit', process.env.MANDATE_DEPOSIT ?? '100000000');
  const dry = flag('dry');

  if (!/^[a-z0-9._-]+\.testnet$/.test(account)) {
    throw new Fail('bad_account', `--account must be a .testnet name, got "${account}"`);
  }

  say(`\n  target    ${account}  (${RPC})`);
  say(`  wasm      ${WASM}  ${(readFileSync(WASM).length / 1024).toFixed(0)} kB`);
  say(`  policy    ${snap.policyHash}  per_tx ${policy.per_tx}  per_day ${policy.per_day}`);
  say(`  attestor  ${attestor}`);
  say(`  deposit   ${deposit} yoctoNEAR attached to create_mandate\n`);

  const exists = await accountExists(account);
  let credentials = exists ? loadCredentials(account) : null;

  if (!exists && !credentials) {
    if (dry) {
      say('  dry run: the account does not exist yet, so nothing was created or sent.');
      return;
    }
    credentials = await createViaFaucet(account);
  } else if (!credentials) {
    throw new Fail(
      'key_missing',
      `${account} exists but ${credentialsPath(account)} does not. Import its key there, or pass --account for a fresh name.`,
    );
  }

  if (dry) {
    say('  dry run: account resolved, wasm present, policy parsed. Nothing was sent.');
    return;
  }

  const { keyPair } = credentials;
  const signerId = account;

  await submit({
    signerId,
    keyPair,
    receiverId: account,
    label: 'deploy',
    actionList: [actions.deployContract(new Uint8Array(readFileSync(WASM)))],
  });

  // Re-running the script must not double-initialize: `new` panics on a contract
  // that already has state, and two mandates would make the demo ambiguous.
  let mandateCount = 0;
  try {
    const stats = await viewCall(account, 'stats');
    mandateCount = Number(stats.total_mandates ?? 0);
  } catch {
    mandateCount = 0;
  }

  if (mandateCount > 0) {
    say(`\n  already initialized with ${mandateCount} mandate(s); code deployed, init skipped.`);
  } else {
    await submit({
      signerId,
      keyPair,
      receiverId: account,
      label: 'new',
      actionList: [actions.functionCall('new', { attestor }, 100_000_000_000_000n, 0n)],
    });

    await submit({
      signerId,
      keyPair,
      receiverId: account,
      label: 'create_mandate',
      actionList: [actions.functionCall('create_mandate', { agent: snap.agent, policy }, 150_000_000_000_000n, BigInt(deposit))],
    });
  }

  const mandates = await viewCall(account, 'list_mandates').catch(() => []);
  for (const m of mandates) {
    say(`  mandate ${m.id}: balance ${m.balance} ${m.asset}, agent ${m.agent}, policy ${String(m.policy_hash).slice(0, 12)}…`);
  }

  say(`\n  deployed. Next:`);
  say(`    export MANDATE_CONTRACT=${account}`);
  say(`    node tools/doctor.mjs        # the testnet row flips to ACTIVE`);
  say(`    ${EXPLORER}/address/${account}`);
  say(`\n  Then put the contract id and one tx hash into mandate/docs/SCREENER.md §0,\n  and change the console build line from \`never deployed\` to \`live on testnet\`.\n`);
}

main().catch((err) => {
  console.error(`\ndeploy: ${err.code ?? 'error'}: ${err.message}\n`);
  process.exit(1);
});
