#!/usr/bin/env node
// bin/key.mjs — issue the agent's NEAR testnet key, scoped to `spend` and nothing else.
//
// Why not a full-access key: the agent's authority is meant to be the budget (a funded
// balance) plus the contract's policy. A full-access key can call `transfer` and move that
// balance anywhere, which leaves the policy with nothing to enforce. So there is no
// full-access mode here at all — asking for one is a usage error, not a flag.
//
// Usage:
//   node mandate/bin/key.mjs --account agent.testnet --contract mandate.testnet
//   node mandate/bin/key.mjs --account agent.testnet --contract mandate.testnet --allowance 2
//   node mandate/bin/key.mjs ... --print-secret     # only on a machine you control
//
// Exit codes: 0 = key created and self-verified · 2 = usage error or refused request.

import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const YOCTO = 10n ** 24n; // 1 NEAR
const METHODS = ['spend']; // the only method the agent may call

function die(code, msg) {
  console.error(`key: ${msg}`);
  process.exit(code);
}

// base58 is required by the NEAR key format; kept local so this script has no dependencies.
function base58(bytes) {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  const digits = [0];
  for (let i = zeros; i < bytes.length; i += 1) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j += 1) {
      carry += digits[j] * 256;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let out = '1'.repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i -= 1) out += ALPHABET[digits[i]];
  return out;
}

function parseArgs(argv) {
  const out = { allowance: '1', printSecret: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--account') out.account = argv[++i];
    else if (a === '--contract') out.contract = argv[++i];
    else if (a === '--allowance') out.allowance = argv[++i];
    else if (a === '--print-secret') out.printSecret = true;
    else if (a === '--full' || a === '--full-access' || a === '--fullaccess') {
      die(2, 'refused: a full-access key can call transfer() and bypass the budget. '
        + 'This script only emits a function-call key scoped to `spend`.');
    } else if (a === '--help' || a === '-h') {
      console.log('usage: node mandate/bin/key.mjs --account <acct> --contract <acct> '
        + '[--allowance <NEAR>] [--print-secret]');
      process.exit(0);
    } else die(2, `unknown argument: ${a}`);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

const ACCOUNT_RE = /^[a-z0-9][a-z0-9._-]{1,62}$/;
if (!args.account) die(2, 'missing --account (the agent account that will hold this key)');
if (!args.contract) die(2, 'missing --contract (the mandate contract the key is scoped to)');
if (!ACCOUNT_RE.test(args.account)) die(2, `not a valid testnet account id: ${args.account}`);
if (!ACCOUNT_RE.test(args.contract)) die(2, `not a valid contract account id: ${args.contract}`);
if (!/^\d+(\.\d+)?$/.test(args.allowance)) die(2, `--allowance must be a decimal NEAR amount`);

const whole = args.allowance.split('.');
const frac = (whole[1] ?? '').padEnd(24, '0').slice(0, 24);
const allowanceYocto = BigInt(whole[0]) * YOCTO + BigInt(frac);
if (allowanceYocto <= 0n) die(2, '--allowance must be greater than zero');

// --- generate -------------------------------------------------------------
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pubRaw = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
const seed = Buffer.from(privateKey.export({ format: 'jwk' }).d, 'base64url');
if (pubRaw.length !== 32 || seed.length !== 32) die(2, 'unexpected key length from node:crypto');

// NEAR serialises a secret key as seed||public, so a mismatched pair silently produces a
// key that cannot sign. Prove the pair before anything is written to disk.
const probe = Buffer.from(`mandate-key-probe:${args.account}`);
if (!verify(null, probe, publicKey, sign(null, probe, privateKey))) {
  die(2, 'self-check failed: the generated key does not verify its own signature');
}

const publicKeyStr = `ed25519:${base58(pubRaw)}`;
const secretKeyStr = `ed25519:${base58(Buffer.concat([seed, pubRaw]))}`;

// --- write ----------------------------------------------------------------
const dir = resolve(root, '.secrets');
const file = resolve(dir, `${args.account}.json`);
mkdirSync(dir, { recursive: true, mode: 0o700 });
writeFileSync(file, `${JSON.stringify({
  account: args.account,
  contract: args.contract,
  public_key: publicKeyStr,
  secret_key: secretKeyStr,
  allowance_yocto: allowanceYocto.toString(),
  method_names: METHODS,
}, null, 2)}\n`, { mode: 0o600 });

// --- emit the grant -------------------------------------------------------
// The agent's key gets its own small allowance so it can pay gas, and may call exactly
// one method on exactly one contract. It is not a general-purpose account key.
const accessKey = {
  nonce: 0,
  permission: {
    FunctionCall: {
      allowance: allowanceYocto.toString(),
      receiver_id: args.contract,
      method_names: METHODS,
    },
  },
};

// Review Grok (Low): NEAR's JSON-RPC has no `add_key` method. Adding a key is an
// `AddKey` action inside a signed transaction, so that is what is printed. The old
// output looked like a call you could POST, which it never was.
const addKeyAction = {
  AddKey: {
    public_key: publicKeyStr,
    access_key: accessKey,
  },
};

console.log('');
console.log('mandate key — function-call only');
console.log(`  agent      : ${args.account}`);
console.log(`  contract   : ${args.contract}`);
console.log(`  methods    : ${METHODS.join(', ')}   (nothing else is callable with this key)`);
console.log(`  allowance  : ${args.allowance} NEAR (${allowanceYocto} yocto) — gas only, not the budget`);
console.log(`  public key : ${publicKeyStr}`);
console.log(`  secret     : ${file} (gitignored, mode 600)`);
if (args.printSecret) console.log(`  secret key : ${secretKeyStr}`);
console.log('');
console.log('1) grant it, near-cli-rs:');
console.log('');
console.log(`   near account add-key ${args.account} \\`);
console.log('     grant-function-call-access \\');
console.log(`     --allowance '${args.allowance} NEAR' \\`);
console.log(`     --receiver-id ${args.contract} \\`);
console.log('     --method-names spend \\');
console.log(`     --public-key '${publicKeyStr}' \\`);
console.log('     network-config testnet sign-with-legacy-keychain send');
console.log('');
console.log('2) or as an AddKey action in a transaction you sign and send:');
console.log('');
console.log(JSON.stringify({ receiver_id: args.account, actions: [addKeyAction] }, null, 2));
console.log('');
console.log('The budget itself is a funded balance on the contract, not this allowance.');
console.log('Rotate by re-running this script and deleting the old key on-chain.');
