// tools/verify.mjs — recompute what the contract recorded, from the snapshot.
//
// This is the `make verify` path and it must not trust the console OR the
// snapshot's own claims. It reads the canonical policy JSON and the intent
// tuples the contract serialised, hashes them again, and compares. Prints
// `verify: OK` and a stable `inputsHash`; exits 1 on any disagreement.
//
// The checks themselves live in verify-lib.mjs because the HTTP API and the MCP
// server run the same ones. The same three checks also run in the browser on
// #/verify, so a judge can confirm the UI is not the only thing agreeing with
// itself.

import { readFileSync } from 'node:fs';

import { verifySnapshot } from './verify-lib.mjs';

const path = process.argv[2] ?? 'mandate/console/data/snapshot.json';

let snap;
try {
  snap = JSON.parse(readFileSync(path, 'utf8'));
} catch (err) {
  console.error(`verify: cannot read ${path}: ${err.message}`);
  process.exit(1);
}

const { checks, failed, inputsHash } = verifySnapshot(snap);

for (const c of checks) {
  console.log(`  ${c.ok ? 'OK  ' : 'FAIL'}  ${c.name.padEnd(22)} ${c.detail}`);
}

if (failed.length) {
  console.log(`\nverify: ${failed.length} check(s) failed`);
  process.exit(1);
}

// Stable across runs: derived only from the snapshot's own content, sorted.
console.log(`\nverify: OK`);
console.log(`checks: ${checks.length}`);
console.log(`inputsHash: ${inputsHash}`);
