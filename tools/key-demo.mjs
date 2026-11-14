// tools/key-demo.mjs — prove on testnet that `revoke_key` removes the key.
//
//   node tools/key-demo.mjs --account mandate-hackaton-7c1a.testnet
//
// The difference between `suspend` and `revoke_key` is where the refusal happens:
// suspend leaves the key able to reach the contract and be refused there;
// revoke_key deletes the key from the contract account, so the protocol refuses
// the signature before any contract code runs.
//
// This script, in order:
//   1. generates an ed25519 key and adds it to the contract account as a
//      function-call key scoped to `spend`;
//   2. confirms `view_access_key` finds it;
//   3. calls `revoke_key` on a mandate this account owns;
//   4. confirms the key is gone and the mandate is suspended;
//   5. calls `resume`: the policy comes back, the key does not.
//
// It writes nothing to the repository and needs the account's credentials in
// ~/.near-credentials/testnet/. Steps 3 and 5 change testnet state: the mandate
// ends resumed, with one key deleted that was created by this run.
//
// The claim it supports is C25 in docs/CLAIMS.md; the limits of that claim are in
// the header of `revoke_key` in the contract.

import { KeyPair, actions } from 'near-api-js';
import { loadCredentials, rpc, submit, viewCall } from './near-tx.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1];
};

const account = arg('account', process.env.MANDATE_CONTRACT ?? 'mandate-hackaton-7c1a.testnet');
const creds = loadCredentials(account);
if (!creds) {
  console.error(`key-demo: no credentials for ${account} (expected ~/.near-credentials/testnet/${account}.json)`);
  process.exit(2);
}

const mandates = await viewCall(account, 'list_mandates');
const target = mandates.find((m) => m.owner === account);
if (!target) {
  console.error(`key-demo: ${account} owns no mandate; run make chain-demo first`);
  process.exit(3);
}
console.log(`mandate ${target.id} (owner ${target.owner})`);

const keyPair = KeyPair.fromRandom('ed25519');
// The action builder wants the PublicKey object; the RPC and JSON args want its
// string form.
const publicKey = keyPair.getPublicKey();
const publicKeyStr = publicKey.toString();

// `rpc()` returns the JSON-RPC `result` payload directly: an existing key has a
// `permission`, a missing one has an `error` and no permission.
const viewKey = async () => {
  const out = await rpc('query', {
    request_type: 'view_access_key',
    finality: 'final',
    account_id: account,
    public_key: publicKeyStr,
  });
  return out?.permission ? 'present' : out?.error ? 'absent' : 'unknown';
};

const send = (actionList, label) =>
  submit({ signerId: account, keyPair: creds.keyPair, receiverId: account, actionList, label, say: console.log });

const call = (method, args) =>
  actions.functionCall(method, Buffer.from(JSON.stringify(args)), BigInt('30000000000000'), BigInt(0));

console.log(`new key: ${publicKeyStr}`);

const added = await send(
  [actions.addFunctionCallAccessKey(publicKey, account, ['spend'], BigInt('250000000000000000000000'))],
  'add key',
);
if (added.failure) {
  console.error(`key-demo: add failed: ${added.failure.code} ${added.failure.detail}`);
  process.exit(3);
}
const present = await viewKey();
console.log(`after add:    ${present}`);

const revoked = await send([call('revoke_key', { id: target.id, key: publicKeyStr })], 'revoke_key');
if (revoked.failure) {
  console.error(`key-demo: revoke failed: ${revoked.failure.code} ${revoked.failure.detail}`);
  process.exit(3);
}
const afterRevoke = await viewKey();
const suspended = (await viewCall(account, 'get_mandate', { id: target.id })).suspended;
console.log(`after revoke: ${afterRevoke}`);
console.log(`suspended:    ${suspended}`);

await send([call('resume', { id: target.id })], 'resume');
const afterResume = await viewKey();
const resumed = (await viewCall(account, 'get_mandate', { id: target.id })).suspended;
console.log(`after resume: key=${afterResume} suspended=${resumed}`);

const ok = present === 'present' && afterRevoke === 'absent' && suspended === true && afterResume === 'absent' && resumed === false;
console.log(
  ok
    ? 'C25 holds: the key was present, the revoke removed it, and resume restored the policy without restoring the key.'
    : 'C25 FAILED: the observed states do not match the claim.',
);
process.exitCode = ok ? 0 : 1;
