// workers/attest/src/verify-selftest.mjs — `make verify` entry point.
// Proves canonicalization is deterministic and mock attest is stable.
import { selftest } from './index.mjs';

const r = await selftest();
if (!r.ok) {
  console.error('verify: FAIL —', r.reason);
  process.exit(1);
}
console.log('verify: OK   inputsHash=' + r.inputsHash);
process.exit(0);
