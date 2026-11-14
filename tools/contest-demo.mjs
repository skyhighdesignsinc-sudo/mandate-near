// tools/contest-demo.mjs — prove on testnet that a recorded settlement can be
// contested inside a block window, and that the amount returns to the balance.
//
//   node tools/contest-demo.mjs --account mandate-hackaton-7c1a.testnet
//
// What it does, in order:
//   1. creates a small mandate owned by the account (policy allows one 5-unit
//      spend with no attestation, so the script is about the window, not the
//      enclave);
//   2. spends 5 through the contract, reading the balance before and after;
//   3. records the settlement with a foreign tx reference (attestor account);
//   4. contests it with reason `not_delivered` and an evidence hash;
//   5. shows the balance returned, the dispute log, and that a second contest of
//      the same settlement is refused with `already_contested`.
//
// It changes testnet state: one mandate and its history stay on chain. No key is
// printed and nothing is written to the repository.
//
// The claim it supports is C26 in docs/CLAIMS.md. What it does not show: the
// contract never moves value at settlement, so this reverses our own ledger entry
// — it is not a chargeback against a vendor.

import { actions } from 'near-api-js';

import { intentHash, loadCredentials, submit, viewCall } from './near-tx.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1];
};

const account = arg('account', process.env.MANDATE_CONTRACT ?? 'mandate-hackaton-7c1a.testnet');
const amount = BigInt(arg('amount', '5'));
const CHAIN = 'base_sepolia';
const ASSET = 'USDC';
const VENDOR = arg('vendor', '0x9f2c55ac1d3e4b77a0c8f1d2e3b4a5c6d7e8f901');

const creds = loadCredentials(account);
if (!creds) {
  console.error(`contest-demo: no credentials for ${account} (expected ~/.near-credentials/testnet/${account}.json)`);
  process.exit(2);
}

const call = (method, args, deposit = 0n) =>
  actions.functionCall(method, Buffer.from(JSON.stringify(args)), BigInt('60000000000000'), BigInt(deposit));

const send = (actionList, label) =>
  submit({ signerId: account, keyPair: creds.keyPair, receiverId: account, actionList, label, say: console.log });

const policy = {
  version: 1,
  asset: ASSET,
  expires_at_block: 0,
  allow: [{ chain: CHAIN, to: VENDOR, label: 'vendor' }],
  per_tx: String(amount * 2n),
  per_day: String(amount * 10n),
  per_counterparty_day: String(amount * 10n),
  escalate_over: String(amount * 2n),
  require_attestation: false,
  attestation_code_hash: null,
};

const known = new Set((await viewCall(account, 'list_mandates')).map((m) => m.id));
const created = await send([call('create_mandate', { agent: account, policy }, 10n ** 18n)], 'create_mandate');
if (created.failure) {
  console.error(`contest-demo: create failed: ${created.failure.code} ${created.failure.detail}`);
  process.exit(3);
}

let mandate;
for (let i = 0; i < 15 && !mandate; i += 1) {
  mandate = (await viewCall(account, 'list_mandates')).find((m) => !known.has(m.id));
  if (!mandate) await new Promise((r) => setTimeout(r, 1_000));
}
if (!mandate) {
  console.error('contest-demo: the mandate was created but no new id appeared within 15s');
  process.exit(3);
}
console.log(`mandate ${mandate.id}  balance ${mandate.balance}  policy ${mandate.policy_hash.slice(0, 12)}…`);

const intent = intentHash(CHAIN, amount, VENDOR, ASSET);
const emptyAttestation = { decision_hash: '', code_hash: '', quote_hash: '', policy_hash: '', intent_hash: '' };

const spent = await send(
  [call('spend', { id: mandate.id, chain: CHAIN, amount: String(amount), asset: ASSET, vendor: VENDOR, attestation: emptyAttestation })],
  'spend',
);
if (spent.failure) {
  console.error(`contest-demo: spend failed: ${spent.failure.code} ${spent.failure.detail}`);
  process.exit(3);
}

let afterSpend = await viewCall(account, 'get_mandate', { id: mandate.id });
for (let i = 0; i < 20 && BigInt(afterSpend.balance) === BigInt(mandate.balance); i += 1) {
  await new Promise((r) => setTimeout(r, 500));
  afterSpend = await viewCall(account, 'get_mandate', { id: mandate.id });
}
console.log(`after spend:    balance ${afterSpend.balance}  spent_total ${afterSpend.spent_total}`);

const txRef = `demo:${spent.txHash.slice(0, 16)}`;
const settled = await send([call('settle', { id: mandate.id, intent, tx_ref: txRef })], 'settle');
if (settled.failure) {
  console.error(`contest-demo: settle failed: ${settled.failure.code} ${settled.failure.detail}`);
  console.error('contest-demo: `settle` is attestor-only; pass --account of the attestor account.');
  process.exit(3);
}
console.log(`settled:        ${txRef}`);

const contested = await send(
  [call('contest', { id: mandate.id, intent, reason: 'not_delivered', evidence_hash: `sha256:${'0'.repeat(56)}not-delivered` })],
  'contest',
);
if (contested.failure) {
  console.error(`contest-demo: contest failed: ${contested.failure.code} ${contested.failure.detail}`);
  process.exit(3);
}

// Views can trail the receipt by a block; contest is only visible once the state
// the claim describes actually exists, so poll for it rather than sampling once.
let afterContest = await viewCall(account, 'get_mandate', { id: mandate.id });
let settlement = await viewCall(account, 'get_settlement', { id: mandate.id, intent });
let log = await viewCall(account, 'list_contests');
for (let i = 0; i < 20 && (!settlement?.contest || log.length === 0); i += 1) {
  await new Promise((r) => setTimeout(r, 500));
  afterContest = await viewCall(account, 'get_mandate', { id: mandate.id });
  settlement = await viewCall(account, 'get_settlement', { id: mandate.id, intent });
  log = await viewCall(account, 'list_contests');
}

// One settlement, one contest: the contract must refuse the second.
const twice = await send(
  [call('contest', { id: mandate.id, intent, reason: 'duplicate', evidence_hash: `sha256:${'0'.repeat(56)}again` })],
  'contest again',
);
const refusedTwice = twice.failure?.code === 'already_contested';

console.log(`after contest:  balance ${afterContest.balance}  spent_total ${afterContest.spent_total}`);
console.log(`settlement:     amount ${settlement?.amount}  reason ${settlement?.contest?.reason}  at block ${settlement?.contest?.at_block}`);
console.log(`dispute log:    ${log.length} entr${log.length === 1 ? 'y' : 'ies'}  ${log[0]?.reason ?? '—'}  ${log[0]?.evidence_hash?.slice(0, 24) ?? ''}…`);
console.log(`second contest: ${twice.failure?.code ?? 'ACCEPTED'}`);

const refunded = BigInt(afterContest.balance) === BigInt(afterSpend.balance) + amount;
const ok = refunded && settlement?.contest?.reason === 'not_delivered' && log.length >= 1 && refusedTwice;
console.log(
  ok
    ? 'C26 holds: the amount returned to the balance, the reason is on chain, and the same settlement cannot be contested twice.'
    : 'C26 FAILED: the observed states do not match the claim.',
);
process.exitCode = ok ? 0 : 1;
