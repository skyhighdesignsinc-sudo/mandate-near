// tools/demo-report.mjs — the expected output, then the actual one.
//
// `make demo` regenerates the snapshot with a real contract run and then calls
// this. It prints what the run SHOULD be before comparing, so a judge never has
// to take our word for the order, and it fails loudly on a single mismatch.
//
// Determinism: the snapshot contains no clocks or random ids, so its hash is
// stable across machines. If that hash changes, something non-deterministic got
// in — which is a defect, not a detail.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const path = process.argv[2] ?? 'mandate/console/data/snapshot.json';

const EXPECTED = [
  { index: 1, kind: 'authorised', code: null },
  { index: 2, kind: 'refused', code: 'per_counterparty_day_exceeded' },
  { index: 3, kind: 'escalated', code: null },
  { index: 4, kind: 'authorised', code: null },
  { index: 5, kind: 'authorised', code: null },
  { index: 6, kind: 'refused', code: 'counterparty_not_allowed' },
  { index: 7, kind: 'refused', code: 'attestation_mismatch' },
  { index: 8, kind: 'refused', code: 'decision_replayed' },
  { index: 9, kind: 'refused', code: 'mandate_suspended' },
  { index: 10, kind: 'resumed', code: null },
  { index: 11, kind: 'settled', code: null },
  { index: 12, kind: 'refused', code: 'decision_replayed' },
  { index: 13, kind: 'repolicy', code: null },
  { index: 14, kind: 'refused', code: 'policy_changed' },
  { index: 15, kind: 'authorised', code: null },
];

// The balance after the run, in the asset's smallest unit, as a contract view
// would report it: 100.000000 deposited, 12 + 21 + 6 + 5 authorised.
const EXPECTED_BALANCE = '56000000';

const raw = readFileSync(path, 'utf8');
const snap = JSON.parse(raw);

console.log('\n  expected');
console.log('  #   kind        code');
console.log('  --  ----------  ------------------------------');
for (const e of EXPECTED) {
  console.log(`  ${String(e.index).padStart(2)}  ${e.kind.padEnd(10)}  ${e.code ?? '—'}`);
}

const problems = [];
if (snap.steps.length !== EXPECTED.length) {
  problems.push(`expected ${EXPECTED.length} events, snapshot has ${snap.steps.length}`);
}
for (const e of EXPECTED) {
  const s = snap.steps.find((x) => x.index === e.index);
  if (!s) {
    problems.push(`event ${e.index} missing`);
    continue;
  }
  if (s.kind !== e.kind) problems.push(`event ${e.index}: kind ${s.kind}, expected ${e.kind}`);
  if ((s.code ?? null) !== e.code) problems.push(`event ${e.index}: code ${s.code ?? '—'}, expected ${e.code ?? '—'}`);
}

const m = snap.final.mandates[0];
if (!m) problems.push('no mandate in the final views');
else if (String(m.balance) !== EXPECTED_BALANCE) {
  problems.push(`final balance ${m.balance}, expected ${EXPECTED_BALANCE}`);
}

const hash = createHash('sha256').update(raw).digest('hex');
console.log('\n  actual');
console.log(`  events: ${snap.steps.length} · final balance: ${m ? m.balance : 'n/a'} · pending: ${snap.final.pending.length}`);
console.log(`  snapshot sha256: ${hash}`);

if (problems.length) {
  console.error('\n  demo: FAILED');
  for (const p of problems) console.error(`   - ${p}`);
  process.exit(1);
}

console.log('\n  demo: OK — every event matched its expected code, and the balance is the contract view.');
console.log('  The console reads this same file: `make dev`.\n');
