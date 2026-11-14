// tools/intent-demo.mjs — the M-05 / M-08 / M-02 probes, run on testnet.
//
//   node tools/intent-demo.mjs
//
// Three findings, one run:
//
//   M-05  one intent could be debited twice and settled once. `spend` now refuses
//         an intent that was already authorised or settled (`intent_consumed`).
//   M-08  the same foreign tx reference could settle two authorisations. `settle`
//         now keeps the reference in a used-set and refuses a second claim
//         (`tx_replayed`).
//   M-02  a deposit could only leave through a contest. `close_mandate` releases
//         a balance and `withdraw` pays the owner the unreserved part.
//
// Every step signs as the contract owner, because that is the account this
// checkout holds a key for. It writes mandates to testnet; it prints no secrets.
import { createHash } from 'node:crypto';

import { actions } from 'near-api-js';

import { loadCredentials, submit, viewCall } from './near-tx.mjs';

const contract = process.env.MANDATE_CONTRACT ?? 'mandate-hackaton-7c1a.testnet';
const creds = loadCredentials(contract);
if (!creds) {
  console.error(`intent-demo: no key for ${contract} in .secrets/`);
  process.exit(3);
}

const call = (method, args, deposit = 0n) =>
  actions.functionCall(method, Buffer.from(JSON.stringify(args)), BigInt('100000000000000'), BigInt(deposit));

// Every receipt is kept so the run prints its own evidence, including refusals:
// a failed call still has a hash, and a claim that cites a refusal needs one.
const trail = [];
const send = async (actionList, label) => {
  const out = await submit({
    signerId: contract,
    keyPair: creds.keyPair,
    receiverId: contract,
    actionList,
    label,
    say: console.log,
  });
  trail.push({ label, tx: out.txHash, code: out.failure?.code ?? 'ok' });
  return out;
};

const policy = (perTx, perDay) => ({
  version: 1,
  asset: 'USDC',
  expires_at_block: 0,
  allow: [{ chain: 'base_sepolia', to: '0x9f2c55ac1d3e4b77a0c8f1d2e3b4a5c6d7e8f901', label: 'probe' }],
  per_tx: String(perTx),
  per_day: String(perDay),
  per_counterparty_day: String(perDay),
  // validate requires escalate_over <= per_tx; spending exactly per_tx is not
  // "above" it, so nothing this probe does can escalate.
  escalate_over: String(perTx),
  require_attestation: false,
  attestation_code_hash: null,
});

const ids = async () => new Set((await viewCall(contract, 'list_mandates')).map((m) => m.id));

// Same derivation as util::intent_hash: sha256 over the sorted JSON map.
const intentOf = (chain, amount, vendor, asset) =>
  createHash('sha256')
    .update(JSON.stringify({ amount: String(amount), asset, chain, vendor }))
    .digest('hex');

const createMandate = async (label, perTx, perDay) => {
  const before = await ids();
  const sent = await send([call('create_mandate', { agent: contract, policy: policy(perTx, perDay) }, 10n ** 16n)], label);
  if (sent.failure) throw new Error(`create_mandate failed: ${sent.failure.code}`);
  for (let i = 0; i < 20; i += 1) {
    const fresh = (await viewCall(contract, 'list_mandates')).find((m) => !before.has(m.id));
    if (fresh) return fresh;
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error('the mandate was created but no new id appeared within 20s');
};

const spend = (id, amount, decision) =>
  send(
    [
      call('spend', {
        id,
        chain: 'base_sepolia',
        amount: String(amount),
        asset: 'USDC',
        vendor: '0x9f2c55ac1d3e4b77a0c8f1d2e3b4a5c6d7e8f901',
        attestation: {
          decision_hash: decision,
          code_hash: '',
          quote_hash: '',
          policy_hash: '',
          intent_hash: '',
        },
      }),
    ],
    'spend',
  );

const results = [];
const verdict = (name, ok, detail) => {
  results.push(ok);
  console.log(`\n${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log(`contract ${contract}\n`);

// ---------------------------------------------------------------- M-05
const m1 = await createMandate('create_mandate (m05)', 1_000_000, 10_000_000);
const amount = 1_000_000;
const vendor = '0x9f2c55ac1d3e4b77a0c8f1d2e3b4a5c6d7e8f901';
const intent1 = intentOf('base_sepolia', amount, vendor, 'USDC');
const first = await spend(m1.id, amount, `probe-m05-a-${Date.now()}`);
verdict('the first debit is authorised', !first.failure, first.failure?.code);

const second = await spend(m1.id, 1_000_000, `probe-m05-b-${Date.now()}`);
const secondCode = second.failure?.code;
verdict('the same intent cannot be debited twice', secondCode === 'intent_consumed', secondCode ?? 'it succeeded');

const after = await viewCall(contract, 'get_mandate', { id: m1.id });
// The balance is the attached deposit minus exactly one debit. The deposit is
// 10n**16 yocto, the debit is `amount`, and a second debit would show two.
const expected = (10n ** 16n - BigInt(amount)).toString();
verdict('the balance was debited once', after.balance === expected, `balance ${after.balance}, expected ${expected}`);

// ---------------------------------------------------------------- M-08
const txRef = `probe-tx-${Date.now()}`;
const settle1 = await send([call('settle', { id: m1.id, intent: intent1, tx_ref: txRef })], 'settle');
const settle1Code = settle1.failure?.code;
verdict('the first settlement is recorded', !settle1.failure, settle1Code);

const m2 = await createMandate('create_mandate (m08)', 1_000_000, 10_000_000);
const intent2 = intentOf('base_sepolia', amount, vendor, 'USDC');
const spend2 = await spend(m2.id, amount, `probe-m08-${Date.now()}`);
verdict('the second mandate can spend', !spend2.failure, spend2.failure?.code);

const settle2 = await send(
  [call('settle', { id: m2.id, intent: intent2, tx_ref: txRef })],
  'settle (replay)',
);
const settle2Code = settle2.failure?.code;
verdict(
  'the same tx reference cannot settle a second mandate',
  settle2Code === 'tx_replayed',
  settle2Code ?? 'it succeeded',
);

// ---------------------------------------------------------------- M-02
const closed = await send([call('close_mandate', { id: m2.id })], 'close_mandate');
verdict('a mandate can be closed and its balance released', !closed.failure, closed.failure?.code);

const withdrawn = await send([call('withdraw', { amount: '1' })], 'withdraw');
verdict('the owner can withdraw free balance', !withdrawn.failure, withdrawn.failure?.code);

const overdraw = await send([call('withdraw', { amount: '999999999999999999999999999' })], 'withdraw (too much)');
verdict(
  'a withdrawal above the free balance is refused',
  overdraw.failure?.code === 'balance_reserved',
  overdraw.failure?.code ?? 'it succeeded',
);

const passed = results.every(Boolean);
console.log(`\n${passed ? 'M-02/M-05/M-08 HOLD' : 'PROBE FAILED'} — ${results.filter(Boolean).length}/${results.length} assertions`);
console.log(`probe mandates: ${m1.id}, ${m2.id}`);
console.log('\nreceipts:');
for (const r of trail) console.log(`  ${r.code.padEnd(18)} ${r.label.padEnd(24)} ${r.tx}`);
process.exit(passed ? 0 : 1);
