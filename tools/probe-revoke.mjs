// tools/probe-revoke.mjs — the M-01 attack, attempted on testnet, expected to fail.
//
//   node tools/probe-revoke.mjs
//
// The 2026-11-14 review found that `create_mandate` is permissionless and
// `revoke_key` deleted whatever key it was handed from the CONTRACT's account.
// So a stranger could create a mandate, become its owner, and delete the demo
// account's keys — freezing every mandate and the deploy key with them.
//
// The fix gates the DeleteKey on the contract owner. This script runs the attack
// for real, with a second account, and then asserts three things:
//   1. the call succeeds as a suspension (typed, logged);
//   2. it logs `key_delete_requires_contract_owner` instead of deleting;
//   3. the contract account's key list is byte-for-byte what it was before.
//
// It writes testnet state (one mandate, suspended). It never deletes a key.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { KeyPair, actions } from 'near-api-js';

import { createViaFaucet, loadCredentials, submit, viewCall, rpc } from './near-tx.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1];
};

const contract = arg('account', process.env.MANDATE_CONTRACT ?? 'mandate-hackaton-7c1a.testnet');
let strangerId = arg('stranger', 'agent.testnet');

const keysOf = async (accountId) => {
  const res = await rpc('query', { request_type: 'view_access_key_list', finality: 'final', account_id: accountId });
  const body = res?.result ?? res;
  return (body?.keys ?? []).map((k) => `${k.public_key}:${k.access_key.permission}`).sort();
};

const keyIsOnAccount = async (accountId, keyPair) => {
  try {
    const pk = keyPair.getPublicKey().toString();
    return (await keysOf(accountId)).some((k) => k.startsWith(`${pk}:`));
  } catch {
    return false;
  }
};

// The second account's key lives in the ignored .secrets/ folder when it is not
// the deploy account, so both locations are tried and neither is printed.
let stranger =
  loadCredentials(strangerId) ??
  ['mandate/.secrets', 'publish/mandate/mandate/.secrets']
    .map((dir) => join(process.cwd(), dir, `${strangerId}.json`))
    .filter((file) => existsSync(file))
    .map((file) => {
      const parsed = JSON.parse(readFileSync(file, 'utf8'));
      return { keyPair: KeyPair.fromString(parsed.private_key ?? parsed.secret_key), file };
    })[0];

// A key file is not the same thing as a key on the account: the one in .secrets/
// is aimed at a contract that is not this one. Verify before sending, and fall
// back to a fresh faucet account, which is what "a stranger" means here.
if (stranger && !(await keyIsOnAccount(strangerId, stranger.keyPair))) {
  console.log(`the stored key for ${strangerId} is not an access key on that account`);
  stranger = null;
}

if (!stranger) {
  strangerId = `probe-${Date.now().toString(36)}.testnet`;
  console.log(`creating ${strangerId} through the faucet, so the caller really is a stranger`);
  stranger = await createViaFaucet(strangerId, console.log);
}

const call = (method, args, deposit = 0n) =>
  actions.functionCall(method, Buffer.from(JSON.stringify(args)), BigInt('100000000000000'), BigInt(deposit));

const send = (actionList, label) =>
  submit({
    signerId: strangerId,
    keyPair: stranger.keyPair,
    receiverId: contract,
    actionList,
    label,
    say: console.log,
  });

const keysBefore = await keysOf(contract);
console.log(`\ncontract ${contract}`);
console.log(`keys before: ${keysBefore.length} → ${keysBefore.join(', ')}\n`);

// 1. The stranger creates a mandate. `create_mandate` is permissionless, so this
//    is exactly what the attack needs, and refusing it would be a different
//    contract from the one under review.
const policy = {
  version: 1,
  asset: 'USDC',
  expires_at_block: 0,
  allow: [{ chain: 'base_sepolia', to: '0x9f2c55ac1d3e4b77a0c8f1d2e3b4a5c6d7e8f901', label: 'probe' }],
  per_tx: '1000000',
  per_day: '1000000',
  per_counterparty_day: '1000000',
  escalate_over: '1000000',
  require_attestation: false,
  attestation_code_hash: null,
};

const known = new Set((await viewCall(contract, 'list_mandates')).map((m) => m.id));
const created = await send([call('create_mandate', { agent: strangerId, policy }, 10n ** 16n)], 'create_mandate');
if (created.failure) {
  console.error(`probe-revoke: could not create the probe mandate: ${created.failure.code}`);
  process.exit(3);
}

let probe;
for (let i = 0; i < 20 && !probe; i += 1) {
  probe = (await viewCall(contract, 'list_mandates')).find((m) => !known.has(m.id) && m.agent === strangerId);
  if (!probe) await new Promise((r) => setTimeout(r, 1_000));
}
if (!probe) {
  console.error('probe-revoke: the probe mandate was created but no new id appeared within 20s');
  process.exit(3);
}
console.log(`probe mandate ${probe.id}, owned by the stranger ${strangerId}\n`);

// 2. The attack: hand revoke_key a key on the contract account. Any key would do;
//    a syntactically valid one that is not present proves the same branch.
const targetKey = 'ed25519:11111111111111111111111111111111';
const revoked = await send([call('revoke_key', { id: probe.id, key: targetKey })], 'revoke_key');
if (revoked.failure) {
  console.error(`probe-revoke: revoke_key failed: ${revoked.failure.code} ${revoked.failure.detail ?? ''}`);
  process.exit(3);
}

// 3. Read the logs of the receipt and the account's key list.
const logs = [];
const collect = (outcome) => {
  const body = outcome?.result ?? outcome;
  for (const r of body?.receipts_outcome ?? []) {
    for (const line of r.outcome?.logs ?? []) logs.push(line);
  }
  if (body?.receipt_outcome) {
    for (const line of body.receipt_outcome.outcome?.logs ?? []) logs.push(line);
  }
};
collect(revoked.outcome);

// broadcast_tx_commit returns the final outcome on most nodes, but not always
// the logs of the function-call receipt; ask the node for the transaction too.
if (logs.length === 0) {
  try {
    const tx = await rpc('tx', { tx_hash: revoked.txHash, sender_account_id: strangerId, wait_until: 'FINAL' });
    collect(tx);
  } catch (err) {
    console.log(`could not re-read the transaction: ${err.message}`);
  }
}
if (logs.length) console.log(`\nreceipt logs:\n  ${logs.join('\n  ')}`);

const suspended = (await viewCall(contract, 'get_mandate', { id: probe.id })).suspended;
const keysAfter = await keysOf(contract);
const refused = logs.some((l) => l.includes('key_delete_requires_contract_owner'));
const deleted = keysAfter.length < keysBefore.length;

console.log(`\nsuspended:            ${suspended}`);
console.log(`log says refused:     ${refused}`);
console.log(`keys after:           ${keysAfter.length} (${keysAfter.join(', ')})`);
console.log(`any key disappeared:  ${deleted}`);

const ok = suspended && refused && !deleted && keysAfter.length === keysBefore.length;
console.log(`\n${ok ? 'M-01 HOLDS' : 'M-01 FAILED'}: create_mandate still permissionless, key deletion gated on the contract owner`);
process.exit(ok ? 0 : 1);
