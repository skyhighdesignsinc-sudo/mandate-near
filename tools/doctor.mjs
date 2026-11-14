// tools/doctor.mjs — what is actually running, and what is standing in for it.
//
// AGENTS.md §3 requires `make doctor` to print ACTIVE or FALLBACK per module and
// exit non-zero when anything is on a fallback. A fresh clone with no .env is
// expected to show fallbacks: that is the credential-gated paths being labelled,
// not a broken build. Nothing here reads .env or prints a secret.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const root = process.cwd();
const has = (cmd, args = ['--version']) => {
  try {
    execFileSync(cmd, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const nonEmpty = (dir) => {
  try {
    return readdirSync(join(root, dir)).length > 0;
  } catch {
    return false;
  }
};

const snapshotPath = join(root, 'mandate/console/data/snapshot.json');
let snapshotOk = false;
let snapshotNote = 'missing — run `make demo`';
try {
  const snap = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  snapshotOk = snap.schema === 1 && Array.isArray(snap.steps) && snap.steps.length > 0;
  snapshotNote = snapshotOk ? `${snap.steps.length} events, schema ${snap.schema}` : 'unreadable or wrong schema';
} catch {
  /* keeps the default note */
}

const docker = has('docker', ['version', '--format', '{{.Server.Version}}']);
const cargo = has('cargo');

const rows = [
  {
    module: 'contract unit tests',
    active: docker || cargo,
    note: docker ? 'docker (rust:1, reference environment)' : cargo ? 'cargo on this machine' : 'no cargo and no docker',
  },
  {
    module: 'console snapshot',
    active: snapshotOk,
    note: snapshotNote,
  },
  {
    module: 'console server',
    active: true,
    note: 'node, no dependencies (`make dev`)',
  },
  {
    module: 'attestation worker',
    active: nonEmpty('mandate/workers'),
    note: nonEmpty('mandate/workers') ? 'present; mode printed by the worker itself' : 'absent — replay snapshot only',
  },
  {
    module: 'reader (RPC quorum)',
    active: nonEmpty('mandate/workers'),
    note: nonEmpty('mandate/workers') ? 'present; quorum logic in workers/reader' : 'absent — no live chain reads',
  },
  {
    module: 'signer',
    active: nonEmpty('mandate/signer'),
    note: nonEmpty('mandate/signer') ? 'present; needs credentials to sign' : 'absent — nothing signs in this build',
  },
  {
    module: 'testnet deployment',
    active: Boolean(process.env.MANDATE_CONTRACT),
    note: process.env.MANDATE_CONTRACT ? `MANDATE_CONTRACT=${process.env.MANDATE_CONTRACT}` : 'MANDATE_CONTRACT unset — replay only',
  },
];

const width = Math.max(...rows.map((r) => r.module.length));
console.log('\n  module'.padEnd(width + 10) + 'status     note');
console.log('  ' + '-'.repeat(width + 10) + '----------' + '-' + '-'.repeat(46));
for (const r of rows) {
  console.log(`  ${r.module.padEnd(width + 8)}${r.active ? 'ACTIVE  ' : 'FALLBACK'}   ${r.note}`);
}

const fallbacks = rows.filter((r) => !r.active);
console.log('');
if (fallbacks.length) {
  console.log(`  ${fallbacks.length} of ${rows.length} modules on a documented fallback.`);
  console.log('  A fresh clone with no credentials is expected to look like this; see docs/DECISIONS.md.');
  process.exit(1);
}
console.log(`  all ${rows.length} modules ACTIVE.`);
