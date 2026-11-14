// signer/src/index.mjs — the frozen signer interface (SCAFFOLD.md §2):
//   derivePath(product, owner, id, chain) -> string
//   buildTx(chain, {from, to, amount, asset, ...}) -> UnsignedTx
//   requestSignature(unsigned) -> Promise<Ok({txHash, signerId}) | Err({code, detail})>
//
// The first two are pure. requestSignature needs NEAR RPC + an account access
// key — the credential-gated path. When credentials are missing it returns a
// typed Err('credentials_missing'), never a mock that looks real (AGENTS.md §2.5).

import { derivePath, parsePath, CHAINS, PRODUCT, PathError } from './paths.mjs';
import { buildEvmTx } from './tx/evm.mjs';
import { buildBtcTx } from './tx/btc.mjs';
import { buildSolTx } from './tx/sol.mjs';
import { SignerError } from './errors.mjs';

export { derivePath, parsePath, CHAINS, PRODUCT, PathError, SignerError };

export function buildTx(chain, args) {
  switch (chain) {
    case CHAINS.BASE_SEPOLIA:
      return buildEvmTx(args);
    case CHAINS.BTC_TESTNET:
      return buildBtcTx(args);
    case CHAINS.SOLANA_DEVNET:
      return buildSolTx(args);
    default:
      throw new SignerError('chain_unsupported', String(chain));
  }
}

// Result shape mirrors the contract surface in BUILD_PLAN: Ok(..) | Err(..)
export const Ok = (value) => ({ ok: true, value });
export const Err = (error) => ({ ok: false, error });

export async function requestSignature(unsigned, { rpcUrl, signerId, accountId, signer }) {
  // `signer`: an object with `signAndSendTransaction` (from near-api-key /
  // @near-js/client with a FunctionCall access key). Injected by the caller so
  // this module stays dependency-free and testable.
  if (!rpcUrl || !signerId || !accountId || !signer) {
    return Err(new SignerError('credentials_missing',
      'requestSignature needs { rpcUrl, signerId, accountId, signer } — see .env.example'));
  }
  if (!unsigned || !unsigned.signingPayload) {
    return Err(new SignerError('chain_unsupported', 'unsigned tx has no signingPayload'));
  }
  if (!unsigned.derivationPath) {
    return Err(new SignerError('chain_unsupported', 'unsigned tx has no derivationPath; call derivePath first'));
  }

  try {
    const res = await signer.signAndSendTransaction({
      receiverId: signerId,
      actions: [{
        type: 'FunctionCall',
        functionName: 'sign',
        args: {
          request: {
            payload: Array.from(Buffer.from(unsigned.signingPayload, 'hex')),
            path: unsigned.derivationPath,
            key_version: 0,
          },
        },
        gas: '300000000000000',
      }],
    });
    // The MPC contract responds via callback; the result carries big_r and s.
    // Parsing depends on the exact contract version — the selftest pins it.
    return Ok({ txHash: res.transaction.hash, signerId });
  } catch (e) {
    const msg = String(e?.message ?? e);
    if (/timed?\s?out|timeout/i.test(msg)) return Err(new SignerError('mpc_unavailable', msg));
    if (/connect|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(msg)) return Err(new SignerError('rpc_unreachable', msg));
    return Err(new SignerError('mpc_unavailable', msg));
  }
}
