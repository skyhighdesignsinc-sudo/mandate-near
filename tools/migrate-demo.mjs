// tools/migrate-demo.mjs — prove D-029's migration on a throwaway account.
//
//   node tools/migrate-demo.mjs
//
// D-029 adds `attestor_key` to Contract, so the deployed bytes no longer match the
// struct until `migrate_attestor()` runs. That is only acceptable if the migration
// is tested against real old-format state, not reasoned about. This script:
//
//   1. creates a faucet account and deploys the PRE-D-029 wasm to it
//      (`.tools/mandate-D028.wasm`, layout-identical to the live account);
//   2. writes state the old way: one mandate, funded;
//   3. deploys the new wasm and calls migrate_attestor();
//   4. asserts the mandate survived, the id counter survived, and the new field
//      starts empty;
//   5. registers an attestor key and proves a signed spend passes, a tampered
//      signature is refused, and an unsigned record is refused.
//
// It touches no account but the one it creates, and prints no secret.
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { KeyPair, actions } from 'near-api-js';

import { createViaFaucet, submit, viewCall } from './near-tx.mjs';

const OLD_WASM = process.argv[2] ?? '.tools/mandate-D028.wasm';
const NEW_WASM = process.argv[3] ?? '.tools/mandate-D029.wasm';
const oldBytes = readFileSync(OLD_WASM);
const newBytes = readFileSync(NEW_WASM);
const sha = (b) => createHash('sha256').update(b).digest('hex');

const id = `mig-${Date.now().toString(36)}.testnet`;
console.log(`account  ${id}`);
console.log(`old wasm ${sha(oldBytes).slice(0, 12)} (${oldBytes.length} bytes)`);
console.log(`new wasm ${sha(newBytes).slice(0, 12)} (${newBytes.length} bytes)\n`);

const { keyPair } = await createViaFaucet(id, console.log);

const call = (method, args, gas = '300000000000000', deposit = 0n) =>
  actions.functionCall(method, Buffer.from(JSON.stringify(args)), BigInt(gas), BigInt(deposit));

const send = (actionList, label) =>
  submit({ signerId: id, keyPair, receiverId: id, actionList, label, say: console.log });

// A view at `final` can land before the write it is meant to observe, especially on
// a fresh account. Poll for the state instead of assuming one round trip is enough.
const viewEventually = async (method, args, predicate, label) => {
  let last;
  for (let i = 0; i < 20; i += 1) {
    try {
      last = await viewCall(id, method, args);
      if (predicate(last)) return last;
    } catch (err) {
      last = err.message;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label}: state never matched (last: ${JSON.stringify(last).slice(0, 160)})`);
};

const results = [];
const verdict = (name, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// 1. old code, old state
const deployedOld = await send([actions.deployContract(oldBytes)], 'deploy old');
verdict('the old wasm deploys', !deployedOld.failure, deployedOld.failure?.code);

const init = await send([call('new', { attestor: id })], 'new');
verdict('the old constructor runs', !init.failure, init.failure?.code);

const policy = {
  version: 1,
  asset: 'USDC',
  expires_at_block: 0,
  allow: [{ chain: 'base_sepolia', to: '0x9f2c55ac1d3e4b77a0c8f1d2e3b4a5c6d7e8f901', label: 'mig' }],
  per_tx: '1000000',
  per_day: '10000000',
  per_counterparty_day: '10000000',
  escalate_over: '1000000',
  require_attestation: true,
  attestation_code_hash: null,
};
const created = await send([call('create_mandate', { agent: id, policy }, '300000000000000', 10n ** 16n)], 'create_mandate (old)');
verdict('old code stores a mandate', !created.failure, created.failure?.code);
const before = await viewEventually('list_mandates', {}, (m) => Array.isArray(m) && m.length === 1, 'old mandate');
verdict('old state has one mandate', before.length === 1, `${before.length} mandates`);

// 2. new code over old bytes, then migrate
const deployedNew = await send([actions.deployContract(newBytes)], 'deploy new');
verdict('the new wasm deploys', !deployedNew.failure, deployedNew.failure?.code);

const migrated = await send([call('migrate_attestor', {})], 'migrate_attestor');
verdict('the migration call succeeds', !migrated.failure, migrated.failure?.code);

const after = await viewEventually('list_mandates', {}, (m) => Array.isArray(m) && m.length === 1, 'post-migration mandate');
verdict('the mandate survived the migration', after.length === 1 && after[0].id === before[0].id, `${after.length} mandates, ${after[0]?.id}`);
verdict('the policy hash is unchanged', after[0]?.policy_hash === before[0]?.policy_hash);
verdict('the balance is unchanged', after[0]?.balance === before[0]?.balance, `${before[0]?.balance} → ${after[0]?.balance}`);

const keyBefore = await viewCall(id, 'get_attestor_key');
verdict('the new field starts empty', keyBefore === null, JSON.stringify(keyBefore));

const second = await send([call('create_mandate', { agent: id, policy }, '300000000000000', 10n ** 16n)], 'create_mandate (new)');
const ids = (await viewEventually('list_mandates', {}, (m) => Array.isArray(m) && m.length === 2, 'second mandate')).map((m) => m.id).sort();
verdict('the id counter survived (m2, not m1 again)', !second.failure && ids.join(',') === 'm1,m2', ids.join(','));

// 3. signed attestation
const attestor = KeyPair.fromRandom('ed25519');
const raw = attestor.getPublicKey().toString();
const attestorKey = raw.startsWith('ed25519:') ? raw : `ed25519:${raw}`;
const registered = await send([call('set_attestor_key', { key: attestorKey })], 'set_attestor_key');
verdict('the owner can register an attestor key', !registered.failure, registered.failure?.code);
const storedKey = await viewEventually('get_attestor_key', {}, (k) => k === attestorKey, 'registered key');
verdict('the view returns the registered key', storedKey === attestorKey, storedKey);

const vendor = '0x9f2c55ac1d3e4b77a0c8f1d2e3b4a5c6d7e8f901';
const amount = 1_000_000;
const intent = createHash('sha256')
  .update(JSON.stringify({ amount: String(amount), asset: 'USDC', chain: 'base_sepolia', vendor }))
  .digest('hex');

const messageFor = (mandate, decision, policyHash, code = 'codehash', quote = 'quotedemo') =>
  `${mandate}|${intent}|${decision}|${policyHash}|${code}|${quote}`;

const spendArgs = (mandate, decision, policyHash, signature) => ({
  id: mandate,
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

const policyHash = (await viewCall(id, 'get_mandate', { id: 'm1' })).policy_hash;
const decision = `mig-${randomBytes(4).toString('hex')}`;
const sig = Buffer.from(attestor.sign(Buffer.from(messageFor('m1', decision, policyHash))).signature).toString('hex');
const signed = await send([call('spend', spendArgs('m1', decision, policyHash, sig))], 'spend (signed)');
verdict('a correctly signed attestation spends', !signed.failure, signed.failure?.code);

const tampered = await send(
  [call('spend', spendArgs('m1', `${decision}-x`, policyHash, sig))],
  'spend (moved signature)',
);
verdict('a signature moved to another decision is refused', tampered.failure?.code === 'attestation_mismatch', tampered.failure?.code ?? 'it succeeded');

const unsigned = await send(
  [call('spend', spendArgs('m2', `mig-${randomBytes(4).toString('hex')}`, policy.policy_hash ?? policyHash, null))],
  'spend (unsigned)',
);
verdict(
  'an unsigned record is refused once a key is registered',
  unsigned.failure?.code === 'attestation_mismatch',
  unsigned.failure?.code ?? 'it succeeded',
);

const passed = results.every(Boolean);
console.log(`\n${passed ? 'MIGRATION HOLDS' : 'MIGRATION FAILED'} — ${results.filter(Boolean).length}/${results.length}`);
process.exit(passed ? 0 : 1);
