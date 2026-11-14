// tools/reset-state.mjs — discard the demo state and keep the owner (D-030).
//
//   node tools/reset-state.mjs
//
// The attestor-signature change added a field to Contract, so the deployed bytes and
// the struct disagree until an initialiser runs. D-030 chose a reset over a migration
// because the state is a demo: `reset(attestor)` reads the old layout only to check
// that the caller is the owner, then writes a fresh state in one transaction.
//
// Prints the discarded counts from the receipt log and the empty state after it.
import { actions } from 'near-api-js';

import { loadCredentials, rpc, submit, viewCall } from './near-tx.mjs';

const account = process.argv[2] ?? process.env.MANDATE_CONTRACT ?? 'mandate-hackaton-7c1a.testnet';
const creds = loadCredentials(account);
if (!creds) {
  console.error(`reset-state: no key for ${account} in .secrets/`);
  process.exit(3);
}

const sent = await submit({
  signerId: account,
  keyPair: creds.keyPair,
  receiverId: account,
  actionList: [
    actions.functionCall(
      'reset',
      Buffer.from(JSON.stringify({ attestor: account })),
      BigInt('100000000000000'),
      BigInt(0),
    ),
  ],
  label: 'reset',
  say: console.log,
});

if (sent.failure) {
  console.error(`reset-state: refused: ${sent.failure.code} ${sent.failure.detail ?? ''}`);
  process.exit(1);
}

// The log line is the evidence that the right state was discarded.
const logs = [];
try {
  const tx = await rpc('tx', { tx_hash: sent.txHash, sender_account_id: account, wait_until: 'FINAL' });
  const body = tx?.result ?? tx;
  for (const r of body?.receipts_outcome ?? []) {
    for (const line of r.outcome?.logs ?? []) logs.push(line);
  }
} catch (err) {
  console.log(`could not re-read the logs: ${err.message}`);
}
const resetLine = logs.find((l) => l.includes('state_reset'));
if (resetLine) console.log(`  ${resetLine}`);

const mandates = await viewCall(account, 'list_mandates');
const stats = await viewCall(account, 'stats');
console.log(`  mandates after reset: ${mandates.length}`);
console.log(`  stats: ${JSON.stringify(stats)}`);
const empty = mandates.length === 0 && Number(stats.total_mandates) === 0;
console.log(`\n${empty ? 'STATE RESET' : 'RESET DID NOT TAKE'}`);
process.exit(empty ? 0 : 1);
