// tools/deploy-code.mjs — replace the code on an account that already exists.
//
//   node tools/deploy-code.mjs --account mandate-hackaton-7c1a.testnet
//
// deploy-testnet.mjs initialises a NEW account (new + create_mandate); running it
// against the demo account fails on the second call. This script does the one
// thing a fix needs: DeployContract on an initialised account, with no state
// call, so balances, mandates and history are untouched.
//
// It prints the wasm sha256 before sending, and the node's transaction hash
// after, because the two are what a reader needs to tie the source to the chain.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { actions } from 'near-api-js';

import { loadCredentials, submit } from './near-tx.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1];
};

const account = arg('account', process.env.MANDATE_CONTRACT ?? 'mandate-hackaton-7c1a.testnet');
const wasmPath = resolve(
  arg('wasm', 'mandate/contracts/mandate/target/wasm32-unknown-unknown/release/mandate.wasm'),
);

const bytes = readFileSync(wasmPath);
const sha = createHash('sha256').update(bytes).digest('hex');
console.log(`${wasmPath}\n  ${bytes.length} bytes\n  sha256 ${sha}\n`);

const creds = loadCredentials(account);
if (!creds) {
  console.error(`deploy-code: no credentials for ${account}`);
  process.exit(2);
}

const out = await submit({
  signerId: account,
  keyPair: creds.keyPair,
  receiverId: account,
  actionList: [actions.deployContract(new Uint8Array(bytes))],
  label: 'deploy_code',
  say: console.log,
});

if (out.failure) {
  console.error(`deploy-code: refused: ${out.failure.code} ${out.failure.detail ?? ''}`);
  process.exit(3);
}

console.log(`\ndeployed ${sha}`);
console.log(`tx       ${out.txHash}`);
console.log(`explorer ${out.explorer}`);
