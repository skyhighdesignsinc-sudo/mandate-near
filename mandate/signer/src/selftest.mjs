// signer/src/selftest.mjs — the reachability test that promotes `make doctor`'s
// signer row from FALLBACK to ACTIVE.
//
// What it proves, when it passes:
//   1. The MPC signer contract is reachable on the configured NEAR testnet RPC.
//   2. derivePath produces a path the contract accepts (view call: derive_address).
//   3. The derived address is non-empty and chain-format-valid for each enabled chain.
//
// What it does NOT prove (out of scope, needs a funded account):
//   - That requestSignature actually returns a signature. That requires a
//     FunctionCall access key on a NEAR testnet account, which is H-5 territory.
//
// Exit codes: 0 = ACTIVE (all three chains derived a valid address), 1 = FALLBACK.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { derivePath, CHAINS, PRODUCT } from './paths.mjs';
import { isEvmAddress } from './tx/evm.mjs';
import { isBtcTestnetAddress } from './tx/btc.mjs';
import { isSolanaAddress } from './tx/sol.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..');

function loadEnv() {
  const envPath = resolve(root, '.env');
  if (!existsSync(envPath)) return null; // selftest refuses to run on .env.example
  const out = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

function viewCall(rpcUrl, contractId, methodName, args) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 'selftest', method: 'query', params: {
    request_type: 'call_function', finality: 'final', account_id: contractId,
    method_name: methodName, args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
  }});
  return fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
    .then((r) => r.json());
}

const ADDRESS_VALIDATORS = {
  [CHAINS.BTC_TESTNET]: isBtcTestnetAddress,
  [CHAINS.BASE_SEPOLIA]: isEvmAddress,
  [CHAINS.SOLANA_DEVNET]: isSolanaAddress,
};

async function main() {
  const env = loadEnv();
  if (!env) {
    console.error('selftest: no .env present (using .env.example); signer stays FALLBACK');
    process.exit(1);
  }
  const rpcUrl = env.NEAR_TESTNET_RPC;
  const signerId = env.MPC_SIGNER_ID;
  const chains = (env.CHAINS_ENABLED || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!rpcUrl || !signerId || chains.length === 0) {
    console.error('selftest: NEAR_TESTNET_RPC, MPC_SIGNER_ID, CHAINS_ENABLED must all be set in .env');
    process.exit(1);
  }

  let allOk = true;
  for (const chain of chains) {
    const path = derivePath(PRODUCT.MANDATE, 'selftest.account.testnet', 'probe-1', chain);
    try {
      const res = await viewCall(rpcUrl, signerId, 'derive_address', { path, key_version: 0 });
      if (res?.error) { console.error(`  ${chain}: RPC error ${res.error.message}`); allOk = false; continue; }
      const result = res?.result?.result;
      if (!result) { console.error(`  ${chain}: no result`); allOk = false; continue; }
      const addr = JSON.parse(Buffer.from(result, 'base64').toString('utf8'));
      const valid = ADDRESS_VALIDATORS[chain]?.(addr);
      console.log(`  ${chain.padEnd(15)} ${valid ? 'OK' : 'BAD'}  path=${path}  addr=${addr}`);
      if (!valid) allOk = false;
    } catch (e) {
      console.error(`  ${chain}: ${String(e?.message ?? e).slice(0, 80)}`);
      allOk = false;
    }
  }
  process.exit(allOk ? 0 : 1);
}

main();
