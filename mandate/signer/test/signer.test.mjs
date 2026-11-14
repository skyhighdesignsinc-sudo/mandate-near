// signer.test.mjs — the pure signer surface, asserted (not just printed).
// Requires no credentials: derivePath/buildTx are pure, requestSignature must
// return a typed Err('credentials_missing') when called without them.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  derivePath, parsePath, buildTx, requestSignature,
  CHAINS, PRODUCT, SignerError,
} from '../src/index.mjs';

test('derivePath is deterministic and chain-scoped', () => {
  const a = derivePath(PRODUCT.MANDATE, 'alice.testnet', 'm-001', CHAINS.BASE_SEPOLIA);
  const b = derivePath(PRODUCT.MANDATE, 'alice.testnet', 'm-001', CHAINS.BASE_SEPOLIA);
  const c = derivePath(PRODUCT.MANDATE, 'alice.testnet', 'm-001', CHAINS.SOLANA_DEVNET);
  assert.equal(a, b);
  assert.notEqual(a, c);
  const parsed = parsePath(a);
  assert.ok(parsed && typeof parsed === 'object');
});

test('buildTx covers all three chains', () => {
  const eth = buildTx(CHAINS.BASE_SEPOLIA, {
    from: '0x1111111111111111111111111111111111111111',
    to: '0x2222222222222222222222222222222222222222',
    amount: 1_000_000_000_000_000n, asset: 'ETH', nonce: 0,
  });
  assert.match(eth.rlp, /^0x[0-9a-f]+$/);

  const btc = buildTx(CHAINS.BTC_TESTNET, {
    inputs: [{ txid: 'ab'.repeat(32), vout: 0 }],
    outputs: [{ address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', value: 600n, pubkeyHash20: '00'.repeat(20) }],
  });
  assert.match(btc.unsignedHex, /^[0-9a-f]+$/);

  const sol = buildTx(CHAINS.SOLANA_DEVNET, {
    from: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
    to: '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T',
    amount: 1_000_000n, asset: 'SOL', blockhash: '11111111111111111111111111111111',
  });
  assert.ok(sol.messageBase64.length > 0);
});

test('buildTx rejects invalid input with typed errors, not panics', () => {
  assert.throws(
    () => buildTx(CHAINS.BASE_SEPOLIA, {
      from: '0x1111111111111111111111111111111111111111',
      to: '0x2222222222222222222222222222222222222222',
      amount: -1n, asset: 'ETH', nonce: 0,
    }),
    (e) => e instanceof SignerError && e.code === 'amount_negative',
  );
  assert.throws(
    () => buildTx('dogecoin', {}),
    (e) => e instanceof SignerError && e.code === 'chain_unsupported',
  );
});

test('requestSignature without credentials returns Err, never a fake hash', async () => {
  const r = await requestSignature({ signingPayload: '00', derivationPath: "m/1'/2'/3'/4'" }, {});
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'credentials_missing');
});