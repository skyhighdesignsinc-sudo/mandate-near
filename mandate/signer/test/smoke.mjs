import * as m from '../src/index.mjs';
const { derivePath, buildTx, requestSignature, CHAINS, PRODUCT } = m;

const paths = {};
for (const c of Object.values(CHAINS)) {
  paths[c] = derivePath(PRODUCT.MANDATE, 'alice.testnet', 'm-001', c);
  console.log(c.padEnd(15), paths[c]);
}

const evm = buildTx(CHAINS.BASE_SEPOLIA, {
  from: '0x1111111111111111111111111111111111111111',
  to: '0x2222222222222222222222222222222222222222',
  amount: 1000000000000000n, asset: 'ETH', nonce: 0,
  derivationPath: paths[CHAINS.BASE_SEPOLIA],
});
console.log('evm rlp       ', evm.rlp.slice(0, 40) + '...');

const btc = buildTx(CHAINS.BTC_TESTNET, {
  inputs: [{ txid: 'ab'.repeat(32), vout: 0 }],
  outputs: [{ address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', value: 600n, pubkeyHash20: '00'.repeat(20) }],
  derivationPath: paths[CHAINS.BTC_TESTNET],
});
console.log('btc unsigned  ', btc.unsignedHex.slice(0, 40) + '...');
console.log('btc bodyHash  ', btc.bodyHash.slice(0, 32) + '...');

const sol = buildTx(CHAINS.SOLANA_DEVNET, {
  from: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
  to: '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T',
  amount: 1000000n, asset: 'SOL', blockhash: '11111111111111111111111111111111',
  derivationPath: paths[CHAINS.SOLANA_DEVNET],
});
console.log('sol msg b64   ', (sol.messageBase64 ?? 'null').slice(0, 44) + '...');

try { buildTx(CHAINS.BASE_SEPOLIA, { from: '0x1111111111111111111111111111111111111111', to: '0x2222222222222222222222222222222222222222', amount: -1n, asset: 'ETH', nonce: 0 }); }
catch (e) { console.log('typed error   ', e.code, '-', e.message.slice(0, 50)); }

try { buildTx(CHAINS.SOLANA_DEVNET, { from: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', to: '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T', amount: 1n, asset: 'USDC' }); }
catch (e) { console.log('typed error   ', e.code, '-', e.message.slice(0, 60)); }

const r = await requestSignature(evm, {});
console.log('no-creds      ', r.ok, r.error.code);

const p = derivePath(PRODUCT.PLEDGE, 'bob.testnet', 'loan-9', CHAINS.BTC_TESTNET);
console.log('parsePath     ', JSON.stringify(m.parsePath(p)));
