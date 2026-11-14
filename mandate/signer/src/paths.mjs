// signer/src/paths.mjs — deterministic derivation paths (SCAFFOLD.md §2, frozen v1)
//
//   derivePath(owner, id, chain) -> "m/{product}/{owner}/{id}/{chain}"
//
// Pure module: no network, no credentials. The MPC contract turns a path into
// a public key; each chain module turns the public key into an address.
// One mandate/loan = one path = one address per chain.

export const CHAINS = Object.freeze({
  BTC_TESTNET: 'btc_testnet',
  BASE_SEPOLIA: 'base_sepolia',
  SOLANA_DEVNET: 'solana_devnet',
});

export const PRODUCT = Object.freeze({
  PLEDGE: 'pledge',
  MANDATE: 'mandate',
});

// Path components are integers in BIP32 land. We hash the human-readable
// owner/id into 31-bit hardened indexes so the path is deterministic,
// collision-resistant in practice for this scope, and never leaks the raw
// owner string into the derivation path.
//
// sha256 → first 4 bytes → uint32 with the hardened bit (0x80000000) set.
import { createHash } from 'node:crypto';

function hardenedIndex(input) {
  const h = createHash('sha256').update(input, 'utf8').digest();
  return h.readUInt32BE(0) | 0x80000000;
}

export class PathError extends Error {
  constructor(rule, detail) {
    super(`PathError: ${rule}${detail ? `: ${detail}` : ''}`);
    this.name = 'PathError';
    this.rule = rule; // machine-readable: 'empty_owner' | 'bad_chain' | ...
  }
}

export function derivePath(product, owner, id, chain) {
  if (!Object.values(PRODUCT).includes(product)) {
    throw new PathError('bad_product', `expected one of ${Object.values(PRODUCT).join('|')}, got '${product}'`);
  }
  if (typeof owner !== 'string' || owner.length === 0) throw new PathError('empty_owner');
  if (typeof id !== 'string' || id.length === 0) throw new PathError('empty_id');
  if (!Object.values(CHAINS).includes(chain)) {
    throw new PathError('bad_chain', `expected one of ${Object.values(CHAINS).join('|')}, got '${chain}'`);
  }
  const pi = hardenedIndex(product);
  const oi = hardenedIndex(owner);
  const ii = hardenedIndex(id);
  const ci = hardenedIndex(chain);
  // Display convention: hardened index shown as the unhardened value with `'`.
  // The full uint32 (with bit 31 set) is what the MPC contract receives.
  const h = (x) => `${x & 0x7fffffff}'`;
  return `m/${h(pi)}/${h(oi)}/${h(ii)}/${h(ci)}`;
}

// Parse back into components (for logs and the UI's spend graph).
// Returns null on malformed input rather than throwing — this runs in render paths.
export function parsePath(path) {
  const m = /^m\/(\d+)'\/(\d+)'\/(\d+)'\/(\d+)'$/.exec(String(path ?? ''));
  if (!m) return null;
  const [_, product, owner, id, chain] = m;
  const hardened = (s) => (Number(s) | 0x80000000) >>> 0;
  return {
    product: hardened(product),
    owner: hardened(owner),
    id: hardened(id),
    chain: hardened(chain),
  };
}
