# SCAFFOLD — the interface both submissions build against

> Frozen at G2 (2026-11-03). Built once by the infra squad, **copied** (never imported) into `pledge/` and `mandate/`.
> A change to this contract must be announced to both squads in the same batch (`AGENTS.md` §5, `PM-PACK/07-communication.md` C-3).

## 1. Modules

| Module | Path | Responsibility | Owner |
|---|---|---|---|
| `signer` | `signer/` | derive a path per mandate/loan, build a foreign tx, request an MPC signature | infra |
| `worker` | `workers/` | TEE request → attest → resume skeleton (yield/resume inside 200 blocks) | infra |
| `reader` | `workers/reader/` | verify a foreign fact: Read MPC primary, 3-RPC quorum fallback | infra |
| `attest` | `workers/attest/` | encode/decode attestation, verify a TDX quote in-browser | infra |
| `uikit` | `console/components/` | shell, proof rail, verifier component, explorer-link primitive | frontend |

## 2. The three interfaces

```ts
// signer
derivePath(owner: string, id: string, chain: Chain): string        // m/{product}/{owner}/{id}/{chain}
buildTx(chain: Chain, from: string, to: string, amount: bigint, asset: Asset): UnsignedTx
requestSignature(unsigned: UnsignedTx): Promise<{ txHash: string; signerId: string }>

// reader
verify(txRef: string, expect: { amount: bigint; asset: Asset }): Promise<Proof>
// Proof = { ok, amount, asset, confirmations, rpcHashes: [string,string,string], mode: 'READ_MPC' | 'RPC_QUORUM', quote? }

// attest
attest(inputs: unknown): Promise<Proof2>
// Proof2 = { decisionHash, codeHash, quote, inputsHash }   // never the raw prompt, never a credential
```

## 3. Rules

1. `mode` must be surfaced to the UI footer. Never claim `READ_MPC` when the fallback ran.
2. `rpcHashes` has exactly three entries, from three independent providers. Fewer than three is a failed proof, not a degraded one.
3. The worker returns hashes only. Prompts and credentials never leave the enclave.
4. Both repos vendor their own copy; a fix lands in both or it does not land.
5. Until G2, the interface lives here and nowhere else. After G2, this file is versioned at v1 and changes require a decision id.

## 4. Definition of done for the scaffold

- [ ] one contract-derived address signs a native tx on BTC testnet, Base Sepolia and Solana devnet
- [ ] a contract receives an attested result inside the yield/resume window
- [ ] `make doctor` prints, per module, `ACTIVE` or `FALLBACK`
- [ ] the proof rail renders four live stages from real state
