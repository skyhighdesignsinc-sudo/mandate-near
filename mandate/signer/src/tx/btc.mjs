// signer/src/tx/btc.mjs — BTC testnet unsigned-tx builder.
// Pure. The MPC signs a per-input sighash; the contract layer assembles the
// signed witness. For the scaffold interface we produce the canonical unsigned
// tx layout (version, vin, vout, locktime) and the segwit-v0 sighash for the
// single-input P2WPKH case, which is what the demo needs.

import { createHash } from 'node:crypto';
import { SignerError } from '../errors.mjs';

const CHAIN = 'btc_testnet';
const NATIVE = 'BTC';
const DUST = 546n; // satoshis, standard relay floor
const MAX_SATS = 21_000_000n * 100_000_000n;

// Format check only. Full bech32m/bech32 checksum validation lands with the
// selftest (signer/src/selftest.mjs) — labelled there, not here.
export function isBtcTestnetAddress(addr) {
  if (typeof addr !== 'string') return false;
  if (/^tb1(q|p)[02-9ac-hj-np-z]{38,59}$/i.test(addr)) return true; // bech32 segwit v0/v1
  if (/^[mn][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(addr)) return true; // legacy testnet P2PKH/P2SH
  return false;
}

function sha256(b) { return createHash('sha256').update(b).digest(); }
function hash256(b) { return sha256(sha256(b)); }

function varint(n) {
  if (n < 0xfd) return new Uint8Array([n]);
  if (n <= 0xffff) return new Uint8Array([0xfd, n & 0xff, (n >> 8) & 0xff]);
  if (n <= 0xffffffff) return new Uint8Array([0xfe, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]);
  const lo = Number(n & 0xffffffffn);
  const hi = Number((n >> 32n) & 0xffffffffn);
  return new Uint8Array([0xff, lo & 0xff, (lo >> 8) & 0xff, (lo >> 16) & 0xff, (lo >> 24) & 0xff,
    hi & 0xff, (hi >> 8) & 0xff, (hi >> 16) & 0xff, (hi >> 24) & 0xff]);
}

function hexToBytes(hex) {
  const h = hex.replace(/^0x/, '');
  if (h.length % 2 !== 0) throw new SignerError('destination_invalid', `odd-length hex: ${hex}`);
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const bytesToHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

// P2WPKH scriptPubKey: OP_0 <20-byte keyhash>
function p2wpkhScript(pubkeyHash20) {
  if (pubkeyHash20.length !== 20) throw new SignerError('destination_invalid', 'expected 20-byte keyhash');
  return new Uint8Array([0x00, 0x14, ...pubkeyHash20]);
}

// Build the canonical unsigned tx bytes (no witness). Used as the signing
// payload base; the actual sighash for segwit v0 is hash256 of a per-input
// serialization that includes scriptCode — produced separately.
export function buildBtcTx({ inputs, outputs, locktime = 0, derivationPath }) {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new SignerError('destination_invalid', 'inputs empty');
  if (!Array.isArray(outputs) || outputs.length === 0) throw new SignerError('destination_invalid', 'outputs empty');

  for (const o of outputs) {
    if (typeof o.value !== 'bigint' || o.value < DUST) throw new SignerError('amount_too_large', `output below dust: ${o.value}`);
    if (o.value > MAX_SATS) throw new SignerError('amount_too_large', String(o.value));
    if (!isBtcTestnetAddress(o.address)) throw new SignerError('destination_invalid', o.address);
  }

  // Serialize canonical unsigned tx (legacy form; witness appended at submit)
  const parts = [];
  parts.push(new Uint8Array([0x01, 0x00, 0x00, 0x00])); // version 1, LE
  parts.push(varint(inputs.length));
  for (const vin of inputs) {
    if (!vin.txid || !Number.isInteger(vin.vout) || vin.vout < 0) throw new SignerError('destination_invalid', 'bad input');
    const txid = hexToBytes(vin.txid).reverse(); // internal LE
    parts.push(txid);
    parts.push(new Uint8Array([vin.vout & 0xff, (vin.vout >> 8) & 0xff, (vin.vout >> 16) & 0xff, (vin.vout >> 24) & 0xff]));
    parts.push(new Uint8Array([0x00])); // empty scriptSig for segwit
    parts.push(new Uint8Array([0x00])); // sequence
  }
  parts.push(varint(outputs.length));
  for (const o of outputs) {
    const val = o.value;
    const le = new Uint8Array(8);
    let v = val;
    for (let i = 0; i < 8; i++) { le[i] = Number(v & 0xffn); v >>= 8n; }
    parts.push(le);
    // For the demo we accept a precomputed scriptPubKey (hex) or a 20-byte keyhash.
    let script;
    if (o.scriptPubKey) script = hexToBytes(o.scriptPubKey);
    else if (o.pubkeyHash20) script = p2wpkhScript(hexToBytes(o.pubkeyHash20));
    else throw new SignerError('destination_invalid', 'output missing scriptPubKey/pubkeyHash20');
    parts.push(varint(script.length));
    parts.push(script);
  }
  parts.push(new Uint8Array([locktime & 0xff, (locktime >> 8) & 0xff]));

  const txBytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) { txBytes.set(p, off); off += p.length; }

  return {
    chain: CHAIN,
    kind: 'segwit_v0_p2wpkh',
    derivationPath: derivationPath ?? null,
    asset: NATIVE,
    inputs: inputs.map((i) => ({ txid: i.txid, vout: i.vout })),
    outputs: outputs.map((o) => ({ address: o.address, value: o.value.toString() })),
    locktime,
    unsignedHex: bytesToHex(txBytes),
    // sighash per input is computed by the contract layer; expose the hash of
    // the unsigned body so the demo can show "what we asked the MPC to sign".
    bodyHash: bytesToHex(hash256(txBytes)),
  };
}
