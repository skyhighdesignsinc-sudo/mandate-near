// tools/attestor-demo.mjs — the M-03 signature check, on an existing testnet account.
//
//   node tools/attestor-demo.mjs [account]
//
// The faucet refuses new accounts (429, "retry in 11 hours"), so this reuses a
// throwaway account from an earlier probe. It resets that account's state (owner
// only), creates one mandate that requires attestation, registers an Ed25519 key,
// then proves:
//
//   * a correctly signed attestation spends;
//   * a signature moved to a different decision is refused (`attestation_mismatch`);
//   * an unsigned record is refused while a key is registered.
//
// No secret is printed. The account's key is read from ~/.near-credentials.
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { KeyPair, actions } from 'near-api-js';

import { loadCredentials, submit, viewCall } from './near-tx.mjs';

const account = process.argv[2] ?? 'mig-mwgxni4a.testnet';
const wasmPath = '.tools/mandate-D029.wasm';
const creds = loadCredentials(account);
if (!creds) {
  console.error(`attestor-demo: no key for ${account} in ~/.near-credentials/testnet/`);
  process.exit(3);
}

const call = (method, args, gas = '300000000000000', deposit = 0n) =>
  actions.functionCall(method, Buffer.from(JSON.stringify(args)), BigInt(gas), BigInt(deposit));

const trail = [];
const send = async (actionList, label) => {
  const out = await submit({
    signerId: account,
    keyPair: creds.keyPair,
    receiverId: account,
    actionList,
    label,
    say: console.log,
  });
  trail.push({ label, tx: out.txHash, code: out.failure?.code ?? 'ok' });
  return out;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const verdict = (name, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const until = async (method, args, predicate, label) => {
  let last;
  for (let i = 0; i < 20; i += 1) {
    try {
      last = await viewCall(account, method, args);
      if (predicate(last)) return last;
    } catch (err) {
      last = err.message;
    }
    await sleep(500);
  }
  throw new Error(`${label}: ${JSON.stringify(last).slice(0, 160)}`);
};

console.log(`account ${account}\n`);

const deployed = await send([actions.deployContract(readFileSync(wasmPath))], 'deploy');
verdict('the new wasm deploys', !deployed.failure, deployed.failure?.code);

const reset = await send([call('reset', { attestor: account })], 'reset');
verdict('reset clears the account state', !reset.failure, reset.failure?.code);
await until('list_mandates', {}, (m) => Array.isArray(m) && m.length === 0, 'empty state');

const policy = {
  version: 1,
  asset: 'USDC',
  expires_at_block: 0,
  allow: [{ chain: 'base_sepolia', to: '0x9f2c55ac1d3e4b77a0c8f1d2e3b4a5c6d7e8f901', label: 'sig' }],
  per_tx: '1000000',
  per_day: '10000000',
  per_counterparty_day: '10000000',
  escalate_over: '1000000',
  require_attestation: true,
  attestation_code_hash: null,
};
const created = await send([call('create_mandate', { agent: account, policy }, '300000000000000', 10n ** 16n)], 'create_mandate');
verdict('a mandate requiring attestation is created', !created.failure, created.failure?.code);
const mandate = await until('list_mandates', {}, (m) => Array.isArray(m) && m.length === 1, 'mandate');
const policyHash = mandate[0].policy_hash;

const attestor = KeyPair.fromRandom('ed25519');
const raw = attestor.getPublicKey().toString();
const attestorKey = raw.startsWith('ed25519:') ? raw : `ed25519:${raw}`;
const set = await send([call('set_attestor_key', { key: attestorKey })], 'set_attestor_key');
verdict('the owner registers an attestor key', !set.failure, set.failure?.code);
const stored = await until('get_attestor_key', {}, (k) => k === attestorKey, 'stored key');
verdict('the contract returns that key', stored === attestorKey);

const vendor = '0x9f2c55ac1d3e4b77a0c8f1d2e3b4a5c6d7e8f901';
const amount = 1_000_000;
const intent = createHash('sha256')
  .update(JSON.stringify({ amount: String(amount), asset: 'USDC', chain: 'base_sepolia', vendor }))
  .digest('hex');
const message = (decision) => `${mandate[0].id}|${intent}|${decision}|${policyHash}|codehash|quotedemo`;

const spendArgs = (decision, signature) => ({
  id: mandate[0].id,
  chain: 'base_sepolia',
  amount: String(amount),
  asset: 'USDC',
  vendor,
  attestation: {
    decision_hash: decision,
    code_hash: 'codehash',
    quote_hash: 'quotedemo',
    policy_hash: policyHash,
    intent_hash: intent,
    signature,
  },
});

const decision = `sig-${randomBytes(4).toString('hex')}`;
const signature = Buffer.from(attestor.sign(Buffer.from(message(decision))).signature).toString('hex');

const signed = await send([call('spend', spendArgs(decision, signature))], 'spend (signed)');
verdict('a correctly signed attestation spends', !signed.failure, signed.failure?.code);

const moved = await send([call('spend', spendArgs(`${decision}-other`, signature))], 'spend (moved signature)');
verdict(
  'a signature moved to another decision is refused',
  moved.failure?.code === 'attestation_mismatch',
  moved.failure?.code ?? 'ACCEPTED',
);

const unsignedDecision = `sig-${randomBytes(4).toString('hex')}`;
const unsigned = await send([call('spend', spendArgs(unsignedDecision, null))], 'spend (unsigned)');
verdict(
  'an unsigned record is refused once a key is registered',
  unsigned.failure?.code === 'attestation_mismatch',
  unsigned.failure?.code ?? 'ACCEPTED',
);

const passed = results.every(Boolean);
console.log(`\n${passed ? 'M-03 HOLDS' : 'M-03 FAILED'} — ${results.filter(Boolean).length}/${results.length}`);
console.log('\nreceipts:');
for (const r of trail) console.log(`  ${r.code.padEnd(18)} ${r.label.padEnd(30)} ${r.tx}`);
process.exit(passed ? 0 : 1);
