// tools/chain-demo.mjs — the same scenario as `make demo`, on testnet.
//
//   node tools/chain-demo.mjs --account mandate-hackaton-7c1a.testnet
//
// It creates a mandate whose agent is the account itself (so this machine can be
// both owner and agent), then, on chain:
//
//   1. `spend` 12 USDC to an allowlisted vendor with a matching attestation
//      → authorised, balance debited;
//   2. `spend` 7 USDC with the attestation computed for 8 USDC
//      → the transaction fails with PolicyViolation: attestation_mismatch;
//   3. `settle` the authorised intent with a foreign tx reference → the proof
//      rail's fourth stage is no longer empty;
//   4. reads the views back and writes `mandate/console/data/chain.json`.
//
// The console renders that file; nothing on the page is typed by hand. A refusal
// that happens on chain is evidence, so the failing transaction id is recorded
// rather than swallowed.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { actions } from 'near-api-js';

import {
  EXPLORER,
  Fail,
  accountExists,
  createViaFaucet,
  credentialsPath,
  intentHash,
  loadCredentials,
  rpc,
  sha256Hex,
  submit,
  viewCall,
} from './near-tx.mjs';

const SNAPSHOT = 'mandate/console/data/snapshot.json';
const OUT = 'mandate/console/data/chain.json';
const USDC = 1_000_000;

/** Runs already recorded in chain.json, oldest first. Older builds wrote one. */
function previousRuns(file) {
  if (!existsSync(file)) return [];
  try {
    const old = JSON.parse(readFileSync(file, 'utf8'));
    if (old.schema !== 1) return [];
    if (Array.isArray(old.runs) && old.runs.length) return old.runs;
    return old.txs
      ? [{ at: old.captured_at, block_height: old.block_height, mandate: old.mandate, txs: old.txs, verified: old.verified }]
      : [];
  } catch {
    return []; // A corrupt file is replaced, not trusted.
  }
}

const arg = (name, fallback = undefined) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1];
};
const say = (line = '') => console.log(line);
const GAS = 100_000_000_000_000n;

/** A deterministic "attested decision": a hash an enclave would have produced. */
const decision = (tag) => `sha256:${sha256Hex(`mandate-chain-demo:${tag}`)}`;

async function main() {
  if (!existsSync(SNAPSHOT)) throw new Fail('snapshot_missing', `${SNAPSHOT} is missing. Run \`make demo\` first.`);
  const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  const policy = JSON.parse(snap.policyJson);

  const account = arg('account', process.env.MANDATE_ACCOUNT);
  if (!account) throw new Fail('account_required', 'pass --account <id.testnet> (the deployed contract, whose key you hold)');
  if (!(await accountExists(account))) throw new Fail('account_missing', `${account} does not exist on testnet`);

  let credentials = loadCredentials(account);
  if (!credentials) {
    credentials = await createViaFaucet(account, say);
  }
  const { keyPair } = credentials;
  say(`\n  contract   ${account}`);
  say(`  rpc        ${(process.env.NEAR_RPC ?? 'https://rpc.testnet.near.org')}`);
  say(`  asset      ${policy.asset}   per_tx ${policy.per_tx}   escalate_over ${policy.escalate_over}\n`);

  const txs = [];

  // 1. A fresh mandate this account can both own and spend from.
  //
  // Fresh every run on purpose: the day counters and the counterparty ceiling are
  // per mandate, and decision hashes are consumed contract-wide. Re-using a
  // mandate would make the second run fail on limits rather than on the thing the
  // demo is about, and a demo that passes only once is not a demo.
  const before = await viewCall(account, 'list_mandates').catch(() => []);
  const created = await submit({
    signerId: account,
    keyPair,
    receiverId: account,
    label: 'create_mandate',
    say,
    actionList: [actions.functionCall('create_mandate', { agent: account, policy }, GAS, 100_000_000n)],
  });
  if (created.failure) throw new Fail(created.failure.code, `create_mandate failed: ${created.failure.detail}`);
  txs.push({ label: 'create_mandate', hash: created.txHash, explorer: created.explorer, outcome: 'success' });
  const known = new Set(before.map((m) => m.id));
  const mandate = (await viewCall(account, 'list_mandates')).find((m) => !known.has(m.id));
  if (!mandate) throw new Fail('mandate_missing', 'create_mandate succeeded but no new mandate appeared');
  say(`  mandate ${mandate.id} created with balance ${mandate.balance} ${mandate.asset}\n`);

  const runId = Date.now().toString(36);

  const entry = policy.allow[0];
  const chain = entry.chain;
  const vendor = entry.to;
  const asset = policy.asset;
  const amount = 12 * USDC;
  const intent = intentHash(chain, amount, vendor, asset);
  const attestation = {
    decision_hash: decision(`authorised-${runId}`),
    code_hash: policy.attestation_code_hash ?? '',
    quote_hash: `sha256:${sha256Hex('mandate-chain-demo:quote')}`,
    policy_hash: mandate.policy_hash,
    intent_hash: intent,
  };

  // 2. The honest spend: the attestation names exactly the intent being asked for.
  const authorised = await submit({
    signerId: account,
    keyPair,
    receiverId: account,
    label: 'spend (matching)',
    say,
    actionList: [
      actions.functionCall('spend', { id: mandate.id, chain, amount: String(amount), asset, vendor, attestation }, GAS, 0n),
    ],
  });
  if (authorised.failure) throw new Fail(authorised.failure.code, `the matching spend was refused: ${authorised.failure.detail}`);
  txs.push({ label: 'spend authorised', hash: authorised.txHash, explorer: authorised.explorer, outcome: 'authorised' });

  // 3. The refusal: same call, attestation computed for a different amount. This
  //    transaction is *expected* to fail, and the id is kept as evidence.
  const tampered = { ...attestation, decision_hash: decision(`tampered-${runId}`), intent_hash: intentHash(chain, amount + USDC, vendor, asset) };
  const refused = await submit({
    signerId: account,
    keyPair,
    receiverId: account,
    label: 'spend (tampered)',
    say,
    actionList: [
      actions.functionCall('spend', { id: mandate.id, chain, amount: String(amount - USDC), asset, vendor, attestation: tampered }, GAS, 0n),
    ],
  });
  if (!refused.failure) throw new Fail('expected_refusal', 'the tampered spend was accepted: that is a defect, not a demo');
  if (refused.failure.code === 'tx_failed') {
    // A transaction rejected before execution (bad nonce, no gas) leaves no
    // receipt. That is not the contract refusing anything, so it must never be
    // written into chain.json as evidence.
    throw new Fail(
      'not_a_policy_refusal',
      `the tampered spend failed without a policy code: ${refused.failure.detail}. Nothing was written.`,
    );
  }
  say(`  ${''.padEnd(18)} refused with ${refused.failure.code}\n`);
  txs.push({
    label: 'spend refused',
    hash: refused.txHash,
    explorer: refused.explorer,
    outcome: 'refused',
    code: refused.failure.code,
  });

  // 4. Settle, so stage four of the proof rail is a fact rather than a promise.
  const txRef = `base_sepolia:0x${sha256Hex(`mandate-chain-demo:${intent}`).slice(0, 64)}`;
  const settled = await submit({
    signerId: account,
    keyPair,
    receiverId: account,
    label: 'settle',
    say,
    actionList: [actions.functionCall('settle', { id: mandate.id, intent, tx_ref: txRef }, GAS, 0n)],
  });
  if (settled.failure) throw new Fail(settled.failure.code, `settle failed: ${settled.failure.detail}`);
  txs.push({ label: 'settled', hash: settled.txHash, explorer: settled.explorer, outcome: 'settled' });

  // 5. Read the state back. Everything written below is a contract view.
  const [mandates, stats, held, history, settlement] = await Promise.all([
    viewCall(account, 'list_mandates'),
    viewCall(account, 'stats'),
    viewCall(account, 'held'),
    viewCall(account, 'get_policy_history', { id: mandate.id }),
    viewCall(account, 'get_settlement', { intent }).catch(() => null),
  ]);
  const block = await rpc('block', { finality: 'final' });

  const capturedAt = new Date().toISOString();
  const verified = {
    chain,
    vendor,
    asset,
    authorised_intent: intent,
    refused_code: refused.failure.code,
    settlement_ref: txRef,
  };
  const priorRuns = previousRuns(OUT);
  const payload = {
    schema: 1,
    network: 'testnet',
    contract: account,
    attestor: account,
    mandate: mandate.id,
    captured_at: capturedAt,
    block_height: block.header.height,
    explorer: `${EXPLORER}/address/${account}`,
    verified,
    txs,
    views: { mandates, stats, held, history, settlement },
    // Appended, not overwritten: the console files each run under its own
    // disclosure, so the testnet history stays readable as it grows. Twenty runs
    // kept; the chain itself has all of them.
    runs: [
      ...priorRuns,
      { at: capturedAt, block_height: block.header.height, mandate: mandate.id, txs, verified },
    ].slice(-20),
  };
  writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
  say(`  wrote ${OUT} — ${payload.runs.length} run${payload.runs.length === 1 ? '' : 's'} recorded`);
  say(`  ${EXPLORER}/address/${account}\n`);
}

main().catch((err) => {
  console.error(`\nchain-demo: ${err.code ?? 'error'}: ${err.message}\n`);
  process.exit(1);
});
