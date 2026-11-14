# CLAIMS — the only sentences we are allowed to say

> Rule (enforced by `skill: claims-discipline`): a claim may appear in a README, UI, video or pitch **only if it is in this table**, with its proof artefact.
> Banned vocabulary anywhere in either repo: *trustless, unhackable, impossible, bulletproof, fully secure, guaranteed, nobody can read it, bank-grade*.

---

## 1. Allowed claims

| # | Claim (word for word) | Proof artefact | Justified by |
|---|---|---|---|
| C4 | "The agent's key cannot transfer funds. It can only call `spend`." | `near view-access-keys` output in `SCREENER.md` | ARCHITECTURE §5.1 |
| C5 | "A spend is rejected unless its decision hash matches the attested hash." | attack #5 (`attestation_mismatch`) | ARCHITECTURE §7 |
| C6 | "Revoking the key makes the agent inert in one transaction." | attack #7 (`access_key_missing`) | ARCHITECTURE §5.1 |
| C7 | "Budget is a funded balance per chain, so it cannot be overspent by construction." | `budget_exhausted` test; ePrint 2026/2176 §1 | UNIQUENESS-AUDIT §5 |
| C8 | "Every claim on this page links to a transaction or a test you can run." | the page itself | — |
| C10 | "Testnet demonstration; no mainnet funds are at risk." | footer flag `no mainnet` | AGENTS §2 |
| C11 | "The console holds no key and renders only contract views." | `mandate/console/app.js` (no signer, no arithmetic on money); e2e "renders contract views" | ARCHITECTURE §5.1 |
| C12 | "Every refusal code the console shows is asserted by a contract test." | `28 passed` from `make test-linux`; `src/tests.rs` | AGENTS §4 |
| C13 | "Recompute the policy hash and the intent hashes in your browser." | `#/verify`; `make verify` prints `inputsHash` | `src/util.rs`, `tools/verify.mjs` |
| C14 | "A policy change is an amendment with a new hash; the balance and the counters are untouched." | `update_policy` test asserting hash change and `per_tx_exceeded` under the new policy | D-010 |
| C15 | "A decision is bound to the policy revision it was made under; after `update_policy`, a decision for the previous revision is refused with `policy_changed`." | demo event 14 (5.00 inside every new limit, stale decision, refused); `stale_attestation_after_policy_change_is_refused` | D-014 |
| C16 | "Every policy revision is stored on-chain, so the console shows the limits that were in force at each event." | `get_policy_history()` on `#/mandate`; `policy_history_records_every_revision` | D-014 |
| C17 | "The site renders the same markdown the repository ships, and the documents are built from one source." | `#/paper`; `tools/build-docs.mjs`; e2e "the paper route renders the markdown the repository ships" | D-016 |
| C18 | "The console, the HTTP API and the MCP server render one snapshot; none of them holds a key that can spend." | `tools/api.mjs` reads the same `snapshot.json`; `tools/api-server.mjs` has no write action; `make test-api` | D-017 |
| C19 | "The MCP server exposes six read-only tools and has no write path." | `tools/mcp-server.mjs`; `mandate_verify` returns 13 checks; `tools/api.test.mjs` | D-017 |
| C20 | "An issued key is stored as a SHA-256 hash, carries named scopes, and can be revoked." | `tools/keystore.mjs`; tests `scope_missing` and `key_revoked` | D-017 |
| C21 | "The API and MCP payloads carry the provenance of the data they serve (`replay of a contract run, never deployed` for the snapshot)." | `mode` field in every API and MCP payload; e2e asserts `#ctx-mode` contains `replay` | D-017 |
| C22 | "A spend whose attestation names a different amount is refused by the deployed contract, and the failed transaction is public." | `mandate/console/data/chain.json` → `txs[].code = attestation_mismatch` with an explorer link; `make chain-demo` | `line 563` of `src/lib.rs`, reproduced on testnet |
| C23 | "The balance after a real spend is a contract view read back from testnet, not a number the UI computed." | `chain.json` → `views.mandates[].balance` after the settled spend; `#/verify` renders it | `get_mandate`/`list_mandates` on testnet |
| C25 | "Revoking a mandate deletes the agent's key from the contract account in the same receipt, so the protocol stops accepting that signature — not only the contract refusing to pay." | `revoke_key` in `mandate/contracts/mandate/src/lib.rs`; unit test `revoke_key_suspends_and_deletes_the_key_in_one_receipt` asserts a `DeleteKey` action in the created receipt; code-only redeploy `Es4FLaVn…`; live 2026-11-13: add `BdK7UmaK…` → key present, `revoke_key` `7snHs43D…` → key absent and mandate suspended, `resume` `HjEzoVLJ…` → policy restored, key still absent (`make key-demo`) | D-022 |
| C27 | "Only the account named as the mandate's agent can request a spend; any other caller is refused with `unauthorized` and the balance does not move." | `spend` caller check in `mandate/contracts/mandate/src/lib.rs`; test `only_the_named_agent_can_request_a_spend`; live 2026-11-13: mandate `m58` with agent `someone-else-agent.testnet`, spend sent by the owner `3aqb32W9…` → `unauthorized`, balance `1e18` unchanged; deploy `6HEAin7E…` | D-025 |
| C26 | "A recorded settlement can be contested on chain within 100 blocks with one of four reason codes, and the amount returns to the mandate's balance; the same settlement cannot be contested twice." | `contest` in `mandate/contracts/mandate/src/lib.rs`; tests `contest_refunds_the_balance_and_records_the_reason`, `contest_after_the_window_is_refused`, `the_last_block_inside_the_window_still_contests`, `a_settlement_can_be_contested_once`; live 2026-11-13: spend `2QVZbqqg…`, settle `Cod27sLb…`, contest `4vGSHH9o…` → balance back to `1e18` and `spent_total 0`, second contest `56HHwzRN…` refused `already_contested` (`make contest-demo`) | D-024 |
| C24 | "The contract compares a hash; it does not verify the attestation's signature, so the worker is a trusted component in this build." | `mandate/contracts/mandate/src/policy.rs` header; `src/state.rs` line 74; `docs/ARCHITECTURE.md` trust model | code comment, not a claim of verification |

### 1.1 Retired 2026-11-07 — no artefact in this repository could prove them

These four sentences describe the Pledge/Bond cross-chain flow. That submission was
dropped (`PLAN-V2.md` §0) and Mandate's built contract has **no foreign-chain leg**:
`grep -rn chain_signatures mandate/contracts` returns nothing, and `settle` only stores a
reference string the attestor supplies. A claim we cannot demonstrate is deleted, not
softened (`AGENTS.md` §7).

| # | Retired sentence | Why it is gone | Returns when |
|---|---|---|---|
| C1 | "The deposit is verified by 3 independent RPC providers that must agree." | Mandate takes no deposit from another chain | a reader worker's quorum output is consumed by a deployed contract, with the three responses on-chain |
| C2 | "The seizure is a threshold signature from an 11-of-17 network, not a keeper with a private key." | there is no seizure and no MPC request in this repo | a contract-initiated signature moves funds on a testnet, tx linked in `SCREENER.md` |
| C3 | "No bridge, no wrapped asset, no oracle committee is used in this flow." | true of a flow we no longer ship; vacuous here | Pledge/Bond is rebuilt and deployed |
| C9 | "Built on NEAR Chain Signatures, Read MPC, NEAR Intents and NEAR AI Cloud." | the contract calls none of them; the attestation is a hash comparison | one call to each primitive exists in the deployed code path |

## 2. Claims we are NOT allowed to make (and what to say instead)

| Tempting sentence | Why it fails | Say instead |
|---|---|---|
| "Only NEAR can do this." | ICP Chain Fusion documents the same collateral pattern | "No bridge, no wrapped asset, and 35-chain solver liquidity in one flow." |
| "Unhackable agent wallet." | ERC-7715 session keys already scope spending | "The key cannot transfer; it can only call `spend`, and the reason is attested." |
| "Trustless." | there are 17 operators, 3 RPCs and a TEE vendor | "Requires 11-of-17 signers and 3-of-3 RPC agreement." |
| "Nobody can read your data." | CKD's Trail of Bits review (Dec 2025) is public | "Credentials are sealed to the attested app; the audit is published." |
| "Guaranteed liquidation." | a solver or RPC outage can delay it | "Liquidation is permissionless and reverts on stale price." |
| "Bank-grade security." | meaningless; invites the worst question | "Two High-severity findings from an external review, both remediated." |

## 3. Claim hygiene in the demo video

- Every number shown on screen must also exist in `make demo` output.
- When the video says "verified", the proof rail must show ①②③④ populated. If a stage was simulated, the footer says `FALLBACK` on screen.
- No claim about speed or cost unless measured in the run being filmed (paste the clock).

## 4. Pre-submission sweep

```bash
grep -rniE "trustless|unhackable|impossible|bulletproof|fully secure|guaranteed|bank-grade" \
  --include="*.md" --include="*.ts" --include="*.tsx" --include="*.rs" . \
  | grep -v "docs/CLAIMS.md"   # must return nothing
```
