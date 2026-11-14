// signer/src/tx/sol.mjs — Solana devnet transfer builder.
// Pure. Compiles a single-instruction SystemProgram::Transfer into the
// compact message wire format (version 0). The MPC signs the message bytes;
// the (r, s) recovery becomes an ed25519-style deployment detail handled at
// submit time — for the scaffold we produce the exact bytes to be signed.

import { SignerError } from '../errors.mjs';

const CHAIN = 'solana_devnet';
const NATIVE = 'SOL';
const LAMPORTS_PER_SOL = 1_000_000_000n;
const MAX_LAMPORTS = 2n ** 62n;

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Decode(s) {
  if (typeof s !== 'string' || s.length === 0) return null;
  const bytes = [];
  for (const ch of s) {
    const val = BASE58_ALPHABET.indexOf(ch);
    if (val < 0) return null;
    let carry = val;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (let i = 0; i < s.length && s[i] === '1'; i++) bytes.push(0);
  return new Uint8Array(bytes.reverse());
}

export function isSolanaAddress(addr) {
  const b = base58Decode(addr);
  return b !== null && b.length === 32;
}

function encodeShortVec(n) {
  if (n < 0 || n > 0xffffffff) throw new SignerError('destination_invalid', 'shortvec overflow');
  const out = [];
  let v = n;
  while (true) {
    let byte = v & 0x7f;
    v >>= 7;
    if (v === 0) { out.push(byte); break; }
    out.push(byte | 0x80);
  }
  return out;
}

function u64le(v) {
  const out = new Uint8Array(8);
  let x = v;
  for (let i = 0; i < 8; i++) { out[i] = Number(x & 0xffn); x >>= 8n; }
  return out;
}

// SystemProgram::Transfer instruction data: u32 LE discriminator (2) + u64 lamports
const TRANSFER_DISCRIMINATOR = 2;

// buildTx for Solana: one SystemProgram::Transfer, no compiled address lookup
// tables, no PDA args. from/to are the derived address and the vendor.
export function buildSolTx({ from, to, amount, asset, blockhash = null, memo = null, derivationPath }) {
  if (asset !== NATIVE && asset !== 'USDC') throw new SignerError('asset_mismatch', `expected ${NATIVE}|USDC, got '${asset}'`);
  if (typeof amount !== 'bigint' || amount < 0n) throw new SignerError('amount_negative', String(amount));
  if (amount > MAX_LAMPORTS) throw new SignerError('amount_too_large', `${amount} > ${MAX_LAMPORTS}`);
  const fromK = base58Decode(from);
  const toK = base58Decode(to);
  if (fromK === null || fromK.length !== 32) throw new SignerError('destination_invalid', `from: ${from}`);
  if (toK === null || toK.length !== 32) throw new SignerError('destination_invalid', `to: ${to}`);
  if (blockhash !== null && !isSolanaAddress(blockhash)) throw new SignerError('destination_invalid', `blockhash: ${blockhash}`);

  // For USDC we would build an SPL Token transfer; out of scaffold scope (the
  // demo spends native SOL on devnet). Typed refusal, not a silent wrong tx.
  if (asset === 'USDC') {
    throw new SignerError('chain_unsupported', 'SPL token transfers are product scope, not scaffold scope');
  }

  const unsigned = {
    chain: CHAIN,
    kind: 'legacy_transfer_v0',
    derivationPath: derivationPath ?? null,
    asset: NATIVE,
    from, to,
    amount: amount.toString(),
    lamports: Number(amount),
    memo: memo ?? null,
    blockhash,
  };

  if (blockhash === null) {
    // blockhash is fetched at submit time; serialization needs it.
    unsigned.messageBase64 = null;
    return unsigned;
  }

  // Compact message layout (v0, no lookup tables):
  //   header: numRequiredSignatures=1, numReadonlySigned=0, numReadonlyUnsigned=1
  //   account keys: [from(writable, signer), to(writable), SYSTEM_PROGRAM(readonly)]
  //   recent blockhash (32 bytes)
  //   instructions: [{ programIdIndex:2, accounts:[0,1], data: discriminator+lamports }]
  const SYSTEM_PROGRAM = '11111111111111111111111111111111';
  const sysKey = base58Decode(SYSTEM_PROGRAM);
  const bh = base58Decode(blockhash);

  const parts = [];
  parts.push(new Uint8Array([0x01, 0x00, 0x01])); // header
  parts.push(new Uint8Array(encodeShortVec(3))); // 3 account keys
  parts.push(fromK, toK, sysKey);
  parts.push(bh);
  parts.push(new Uint8Array(encodeShortVec(1))); // 1 instruction
  parts.push(new Uint8Array([0x02])); // programIdIndex = 2 (SYSTEM_PROGRAM)
  parts.push(new Uint8Array(encodeShortVec(2))); // accounts [0, 1]
  const data = new Uint8Array(4 + 8);
  new DataView(data.buffer).setUint32(0, TRANSFER_DISCRIMINATOR, true);
  data.set(u64le(amount), 4);
  parts.push(new Uint8Array(encodeShortVec(data.length)));
  parts.push(data);

  const msg = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) { msg.set(p, off); off += p.length; }
  unsigned.messageBase64 = Buffer.from(msg).toString('base64');
  unsigned.signingPayload = Buffer.from(msg).toString('hex');
  return unsigned;
}
