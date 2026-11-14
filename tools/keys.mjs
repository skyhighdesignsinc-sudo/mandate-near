#!/usr/bin/env node
// tools/keys.mjs — issue, list and revoke client keys for the read API.
//
//   node tools/keys.mjs issue --label claude --scopes read:views,read:events
//   node tools/keys.mjs list
//   node tools/keys.mjs revoke k_1a2b3c
//
// The secret is printed once, to stdout, on issue. `list` prints only prefixes:
// a key that can be recovered from a file is not a key, it is a password.

import { issueKey, listKeys, revokeKey, STORE_PATH } from './keystore.mjs';
import { ALL_SCOPES } from './api.mjs';

const argv = process.argv.slice(2);
const command = argv[0] ?? 'help';
const flag = (name, fallback = undefined) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 || i === argv.length - 1 ? fallback : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);

function usage(code = 0) {
  const out = code ? console.error : console.log;
  out(`usage: node tools/keys.mjs <command>

  issue --label <name> [--scopes ${ALL_SCOPES.join(',')}] [--json]
        Mint a key. The secret is printed once and stored only as a hash.
  list  Show issued keys: id, label, scopes, prefix, state. No secrets.
  revoke <id>
        Mark a key revoked. The next request with it answers key_revoked.

Store: ${STORE_PATH}
`);
  process.exit(code);
}

if (command === 'issue') {
  const label = flag('label', 'client');
  const scopes = (flag('scopes', 'read:views') ?? 'read:views').split(',').map((s) => s.trim()).filter(Boolean);
  try {
    const issued = issueKey({ label, scopes });
    if (has('json')) {
      console.log(JSON.stringify(issued));
    } else {
      console.log(`key:    ${issued.key}`);
      console.log(`id:     ${issued.id}`);
      console.log(`label:  ${issued.label}`);
      console.log(`scopes: ${issued.scopes.join(', ')}`);
      console.error('\nThis secret is shown once. Store it outside the repository:');
      console.error('  export MANDATE_KEY=<the key>   # or your secret manager');
    }
  } catch (err) {
    console.error(`keys: ${err.message}`);
    process.exit(2);
  }
} else if (command === 'list') {
  const keys = listKeys();
  if (!keys.length) {
    console.log('no keys issued. `node tools/keys.mjs issue --label <name>` mints one.');
    process.exit(0);
  }
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad('id', 8)} ${pad('label', 18)} ${pad('prefix', 13)} ${pad('scopes', 24)} state`);
  for (const k of keys) {
    console.log(`${pad(k.id, 8)} ${pad(k.label, 18)} ${pad(k.prefix, 13)} ${pad(k.scopes.join(','), 24)} ${k.revoked ? 'revoked' : 'active'}`);
  }
} else if (command === 'revoke') {
  const id = argv[1];
  if (!id || id.startsWith('--')) usage(2);
  const entry = revokeKey(id);
  if (!entry) {
    console.error(`keys: no key ${id}`);
    process.exit(1);
  }
  console.log(`revoked ${entry.id} (${entry.label}); requests with it now answer key_revoked`);
} else {
  usage(command === 'help' || command === '--help' ? 0 : 2);
}
