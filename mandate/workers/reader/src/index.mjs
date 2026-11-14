// workers/reader/src/index.mjs — verify a foreign fact (SCAFFOLD.md §2):
//   verify(txRef, { amount, asset }) -> Promise<Ok(Proof) | Err({code})>
//
// Proof = { ok, amount, asset, confirmations, rpcHashes: [string,string,string],
//           mode: 'READ_MPC' | 'RPC_QUORUM', quote? }
//
// Primary path: Read MPC (a NEAR contract reads the foreign chain state directly).
// Fallback: 3-of-3 RPC quorum from three independent providers.
// Per SCAFFOLD.md §3.2: fewer than three rpcHashes is a failed proof, not a degraded one.

import { SignerError } from '../../../signer/src/errors.mjs';
export { SignerError };

export const Ok = (value) => ({ ok: true, value });
export const Err = (error) => ({ ok: false, error });

// A provider is { name, url, fetchTx(txRef) -> Promise<{ amount, asset, confirmations, rpcHash }> }
// Three providers per chain, configured in .env. The reader calls all three in
// parallel and requires agreement on (amount, asset) before returning Ok.

export async function verify(txRef, expected, { providers, readMpc }) {
  if (!txRef || typeof txRef !== 'string') return Err(new SignerError('destination_invalid', 'txRef missing'));
  if (typeof expected?.amount !== 'bigint') return Err(new SignerError('amount_negative', 'expected.amount must be bigint'));

  // Try Read MPC first if configured (H-7 pending — may not be available to a contract today)
  if (readMpc?.contractId && readMpc?.callView) {
    try {
      const r = await readMpc.callView(readMpc.contractId, 'verify', { tx_ref: txRef });
      if (r?.ok && r.amount === expected.amount.toString() && r.asset === expected.asset) {
        return Ok({
          ok: true,
          amount: BigInt(r.amount),
          asset: r.asset,
          confirmations: r.confirmations,
          rpcHashes: r.rpc_hashes ?? [],
          mode: 'READ_MPC',
          quote: r.quote,
        });
      }
    } catch (e) {
      // Fall through to RPC quorum. The mode label in the UI footer must reflect this.
    }
  }

  if (!providers || providers.length < 3) {
    return Err(new SignerError('rpc_unreachable', `need 3 providers, got ${providers?.length ?? 0}`));
  }

  const results = await Promise.allSettled(providers.map((p) => p.fetchTx(txRef)));
  const ok = results.filter((r) => r.status === 'fulfilled' && r.value);
  if (ok.length < 3) {
    return Err(new SignerError('rpc_unreachable', `${3 - ok.length} of 3 providers failed`));
  }

  const [a, b, c] = ok.map((r) => r.value);
  const amountMatch = a.amount === b.amount && b.amount === c.amount;
  const assetMatch = a.asset === b.asset && b.asset === c.asset;
  if (!amountMatch || !assetMatch) {
    return Err(new SignerError('not_confident', 'providers disagree on amount or asset'));
  }
  if (a.amount !== expected.amount || a.asset !== expected.asset) {
    return Err(new SignerError('amount_too_large', `expected ${expected.amount} ${expected.asset}, got ${a.amount} ${a.asset}`));
  }

  return Ok({
    ok: true,
    amount: a.amount,
    asset: a.asset,
    confirmations: Math.min(a.confirmations, b.confirmations, c.confirmations),
    rpcHashes: [a.rpcHash, b.rpcHash, c.rpcHash],
    mode: 'RPC_QUORUM',
  });
}
