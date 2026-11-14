// bin/doctor.mjs — prints which feature flags are ACTIVE vs FALLBACK.
// Per AGENTS.md §3: `make doctor` must print which feature flags are ACTIVE vs FALLBACK.
// Per SCAFFOLD.md §3.1: never claim READ_MPC when the fallback ran.
//
// Exit codes: 0 = all modules ACTIVE, 1 = at least one FALLBACK, 2 = config error.
// The screener runs this first. A FALLBACK is not a failure; a mislabelled ACTIVE is.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnv() {
  const envPath = resolve(root, '.env');
  const examplePath = resolve(root, '.env.example');
  const src = existsSync(envPath) ? envPath : examplePath;
  const out = {};
  if (!existsSync(src)) return out;
  for (const line of readFileSync(src, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

const env = loadEnv();
const usingExample = !existsSync(resolve(root, '.env'));

function flag(name, def = '') {
  return env[name] ?? def;
}

function chainsEnabled() {
  return flag('CHAINS_ENABLED', 'btc_testnet,base_sepolia,solana_devnet')
    .split(',').map(s => s.trim()).filter(Boolean);
}

// A module is ACTIVE if every credential it needs is present and not the example default.
// It is FALLBACK if any required input is missing — the screener must see this honestly.

function signerStatus() {
  // G2 criterion: one contract-derived address signs a native tx per chain.
  // ACTIVE requires a real .env (not the example defaults) AND a non-empty MPC signer id.
  // Until a reachability self-test exists (signer/src/selftest.mjs), we do not claim ACTIVE
  // from .env.example alone — that would mislead the screener.
  const mpc = flag('MPC_SIGNER_ID');
  const chains = chainsEnabled();
  if (!mpc) return { state: 'FALLBACK', reason: 'MPC_SIGNER_ID unset' };
  if (chains.length === 0) return { state: 'FALLBACK', reason: 'no chains enabled' };
  if (usingExample) return { state: 'FALLBACK', reason: `mpc=${mpc} (from .env.example; run selftest to promote)` };
  return { state: 'ACTIVE', reason: `mpc=${mpc}; chains=${chains.join(',')}` };
}

function readerStatus() {
  const readMpc = flag('READ_MPC_ENABLED') === 'true';
  const readMpcContract = flag('READ_MPC_CONTRACT');
  const btc = flag('RPC_QUORUM_BTC').split(',').filter(Boolean);
  const base = flag('RPC_QUORUM_BASE').split(',').filter(Boolean);
  const sol = flag('RPC_QUORUM_SOL').split(',').filter(Boolean);

  if (readMpc && readMpcContract) {
    return { state: 'ACTIVE', mode: 'READ_MPC', reason: `contract=${readMpcContract}` };
  }
  // Fallback: 3-of-3 RPC quorum per chain. Fewer than 3 on any chain = FALLBACK.
  const quorate = (arr) => arr.length >= 3;
  const allQuorate = quorate(btc) && quorate(base) && quorate(sol);
  if (allQuorate) {
    return { state: 'ACTIVE', mode: 'RPC_QUORUM', reason: '3 RPCs per chain configured' };
  }
  const missing = [];
  if (btc.length < 3) missing.push(`btc=${btc.length}/3`);
  if (base.length < 3) missing.push(`base=${base.length}/3`);
  if (sol.length < 3) missing.push(`sol=${sol.length}/3`);
  return { state: 'FALLBACK', mode: 'RPC_QUORUM', reason: `incomplete quorum: ${missing.join('; ')}` };
}

function attestStatus() {
  const provider = flag('TEE_PROVIDER', 'none');
  if (provider === 'none') return { state: 'FALLBACK', reason: 'TEE_PROVIDER=none; attest module runs in mock mode' };
  if (!flag('TEE_HOST')) return { state: 'FALLBACK', reason: 'TEE_PROVIDER set but TEE_HOST unset' };
  return { state: 'ACTIVE', reason: `provider=${provider}; host set` };
}

function intentsStatus() {
  const acct = flag('INTENTS_ACCOUNT');
  const dry = flag('INTENTS_DRY', 'true');
  if (!acct) return { state: 'FALLBACK', reason: 'INTENTS_ACCOUNT unset; Intents path disabled' };
  return { state: 'ACTIVE', reason: `account=${acct}; dry=${dry}` };
}

function aiCloudStatus() {
  const key = flag('NEAR_AI_CLOUD_KEY');
  if (!key) return { state: 'FALLBACK', reason: 'NEAR_AI_CLOUD_KEY unset; reasoning uses mock attestation' };
  return { state: 'ACTIVE', reason: 'key set' };
}

const modules = [
  { name: 'signer',  ...signerStatus() },
  { name: 'reader',  ...readerStatus() },
  { name: 'attest',  ...attestStatus() },
  { name: 'intents', ...intentsStatus() },
  { name: 'ai',      ...aiCloudStatus() },
];

const width = 10;
const lines = [];
let anyFallback = false;
let anyActive = false;

lines.push('');
lines.push('scaffold doctor — G2 status');
lines.push(`  env source : ${usingExample ? '.env.example (no .env present)' : '.env'}`);
lines.push(`  chains     : ${chainsEnabled().join(', ')}`);
lines.push('');
for (const m of modules) {
  const tag = m.state === 'ACTIVE' ? 'ACTIVE' : 'FALLBACK';
  if (m.state === 'FALLBACK') anyFallback = true;
  if (m.state === 'ACTIVE') anyActive = true;
  const mode = m.mode ? ` [${m.mode}]` : '';
  lines.push(`  ${m.name.padEnd(width)} ${tag}${mode}  ${m.reason}`);
}
lines.push('');
lines.push('  Per SCAFFOLD.md §3.1: mode is surfaced to the UI footer. Never claim READ_MPC when RPC_QUORUM ran.');
lines.push('');

console.log(lines.join('\n'));
process.exit(anyFallback ? 1 : 0);
