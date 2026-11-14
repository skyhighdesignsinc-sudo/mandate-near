// signer/src/tx/evm.mjs — Base Sepolia (EVM) unsigned-tx builder + RLP.
// Pure. The MPC signs keccak256(rlp(tx)); recovery id from the returned
// (big_r, s) produces the 65-byte secp256k1 signature for eth_sendRawTransaction.

import { SignerError } from '../errors.mjs';

const CHAIN = 'base_sepolia';
const CHAIN_ID = 84532; // Base Sepolia
const NATIVE = 'ETH';
const MAX_VALUE = 2n ** 96n; // sanity cap, well below wei-max; guards dust-field bugs

export function isEvmAddress(addr) {
  return typeof addr === 'string' && /^0x[0-9a-fA-F]{40}$/.test(addr);
}

// --- minimal RLP (this payload only needs bytes, lists, uints) ---
function rlpUint(n) {
  if (n === 0n) return new Uint8Array([0x00]);
  const bytes = [];
  let v = n;
  while (v > 0n) { bytes.unshift(Number(v & 0xffn)); v >>= 8n; }
  return new Uint8Array(bytes);
}

function rlpBytes(input) {
  if (input.length === 1 && input[0] < 0x80) return new Uint8Array([input[0]]);
  if (input.length <= 55) {
    const out = new Uint8Array(input.length + 1);
    out[0] = 0x80 + input.length;
    out.set(input, 1);
    return out;
  }
  const lenBytes = rlpUint(BigInt(input.length));
  const out = new Uint8Array(1 + lenBytes.length + input.length);
  out[0] = 0xb7 + lenBytes.length;
  out.set(lenBytes, 1);
  out.set(input, 1 + lenBytes.length);
  return out;
}

function rlpList(items) {
  const payload = new Uint8Array(items.reduce((n, i) => n + i.length, 0));
  let off = 0;
  for (const i of items) { payload.set(i, off); off += i.length; }
  if (payload.length <= 55) {
    const out = new Uint8Array(payload.length + 1);
    out[0] = 0xc0 + payload.length;
    out.set(payload, 1);
    return out;
  }
  const lenBytes = rlpUint(BigInt(payload.length));
  const out = new Uint8Array(1 + lenBytes.length + payload.length);
  out[0] = 0xf7 + lenBytes.length;
  out.set(lenBytes, 1);
  out.set(payload, 1 + lenBytes.length);
  return out;
}

function hexToBytes(hex) {
  const h = hex.replace(/^0x/, '');
  if (h.length % 2 !== 0) throw new SignerError('destination_invalid', `odd-length hex: ${hex}`);
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export const bytesToHex = (b) => '0x' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

// buildTx(chain, from, to, amount, asset) for EVM (SCAFFOLD.md §2 shape)
export function buildEvmTx({ from, to, amount, asset, nonce, gas = 21000n, gasPrice = 100_000_000n, data = '', derivationPath }) {
  if (asset !== NATIVE) throw new SignerError('asset_mismatch', `expected ${NATIVE}, got '${asset}'`);
  if (typeof amount !== 'bigint' || amount < 0n) throw new SignerError('amount_negative', String(amount));
  if (amount > MAX_VALUE) throw new SignerError('amount_too_large', `${amount} > ${MAX_VALUE}`);
  if (!isEvmAddress(from)) throw new SignerError('destination_invalid', `from: ${from}`);
  if (!isEvmAddress(to)) throw new SignerError('destination_invalid', `to: ${to}`);
  if (!Number.isInteger(nonce) || nonce < 0) throw new SignerError('destination_invalid', `nonce: ${nonce}`);

  const fields = [
    rlpUint(BigInt(CHAIN_ID)), // EIP-155 replay protection
    rlpUint(BigInt(nonce)),
    rlpUint(gasPrice),
    rlpUint(gas),
    rlpBytes(hexToBytes(to)),
    rlpUint(amount),
    rlpBytes(hexToBytes(data)),
    rlpUint(0n), // v placeholder — EIP-155 empty signature
    rlpUint(0n),
    rlpUint(0n),
  ];
  const rlp = rlpList(fields);
  return {
    chain: CHAIN,
    chainId: CHAIN_ID,
    kind: 'eip155_legacy',
    derivationPath: derivationPath ?? null,
    from, to,
    amount: amount.toString(),
    asset: NATIVE,
    nonce,
    gas: gas.toString(),
    gasPrice: gasPrice.toString(),
    rlp: bytesToHex(rlp),
    // the MPC signs keccak256 of this exact payload
    signingPayload: bytesToHex(rlp),
  };
}
