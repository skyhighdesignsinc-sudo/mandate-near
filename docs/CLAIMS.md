# CLAIMS â€” the only sentences we are allowed to say

> Rule (enforced by `skill: claims-discipline`): a claim may appear in a README, UI, video or pitch **only if it is in this table**, with its proof artefact.
> Banned vocabulary anywhere in either repo: *trustless, unhackable, impossible, bulletproof, fully secure, guaranteed, nobody can read it, bank-grade*.

---

## 1. Allowed claims

| # | Claim (word for word) | Proof artefact | Justified by |
|---|---|---|---|
| C4 | "The agent's key cannot transfer funds. It can only call `spend`." | `near view-access-keys` output in `SCREENER.md` | ARCHITECTURE Â§5.1 |
| C5 | "A spend is rejected unless its decision hash matches the attested hash." | attack #5 (`attestation_mismatch`) | ARCHITECTURE Â§7 |
| C6 | "Revoking the key makes the agent inert in one transaction." | attack #7 (`access_key_missing`) | ARCHITECTURE Â§5.1 |
| C7 | "Budget is a funded balance per chain, so it cannot be overspent by construction." | `budget_exhausted` test; ePrint 2026/2176 Â§1 | UNIQUENESS-AUDIT Â§5 |
| C8 | "Every claim on this page links to a transaction or a test you can run." | the page itself | â€” |
| C10 | "Testnet demonstration; no mainnet funds are at risk." | footer flag `no mainnet` | AGENTS Â§2 |
| C11 | "The console holds no key and renders only contract views." | `mandate/console/app.js` (no signer, no arithmetic on money); e2e "renders contract views" | ARCHITECTURE Â§5.1 |
| C12 | "Every refusal code the console shows is asserted by a contract test." | `28 passed` from `make test-linux`; `src/tests.rs` | AGENTS Â§4 |
| C13 | "Recompute the policy hash and the intent hashes in your browser." | `#/verify`; `make verify` prints `inputsHash` | `src/util.rs`, `tools/verify.mjs` |
| C14 | "A policy change is an amendment with a new hash; the balance and the counters are untouched." | `update_policy` test asserting hash change and `per_tx_exceeded` under the new policy | D-010 |
| C15 | "A decision is bound to the policy revision it was made under; after `update_policy`, a decision for the previous revision is refused with `policy_changed`." | demo event 14 (5.00 inside every new limit, stale decision, refused); `stale_attestation_after_policy_change_is_refused` | D-014 |
| C16 | "Every policy revision is stored on-chain, so the console shows the limits that were in force at each event." | `get_policy_history()` on `#/mandate`; `policy_history_records_every_revision` | D-014 |
| C17 | "The site renders the same markdown the repository ships, and the documents are built from one source." | `#/paper`; `tools/build-docs.mjs`; e2e "the paper route renders the markdown the repository ships" | D-016 |
| C18 | "The console, the HTTP API and the MCP server render one snapshot; none of them holds a key that can spend." | `tools/api.mjs` reads the same `snapshot.json`; `tools/api-server.mjs` has no write action; `make test-api` | D-017 |
| C19 | "The MCP server exposes six read-only tools and has no write path." | `tools/mcp-server.mjs`; `mandate_verify` returns 13 checks; `tools/api.test.mjs` | D-017 |
| C20 | "An issued key is stored as a SHA-256 hash, carries named scopes, and can be revoked." | `tools/keystore.mjs`; tests `scope_missing` and `key_revoked` | D-017 |
| C21 | "The API and MCP payloads carry the provenance of the data they serve (`replay of a contract run, never deployed` for the snapshot)." | `mode` field in every API and MCP payload; e2e asserts `#ctx-mode` contains `replay` | D-017 |
| C22 | "A spend whose attestation names a different amount is refused by the deployed contract, and the failed transaction is public." | `mandate/console/data/chain.json` â†’ `txs[].code = attestation_mismatch` with an explorer link; `make chain-demo` | `line 563` of `src/lib.rs`, reproduced on testnet |
| C23 | "The balance after a real spend is a contract view read back from testnet, not a number the UI computed." | `chain.json` â†’ `views.mandates[].balance` after the settled spend; `#/verify` renders it | `get_mandate`/`list_mandates` on testnet |
| C25 | "Revoking a mandate suspends it, and â€” when the caller is the contract owner â€” deletes the named key from the contract account in the same receipt, so the protocol stops accepting that signature; a caller who is only the mandate's owner gets the suspension and a logged refusal of the deletion." | `revoke_key` in `mandate/contracts/mandate/src/lib.rs`; unit tests `revoke_key_suspends_and_deletes_the_key_in_one_receipt` and `a_mandate_owner_who_is_not_the_contract_owner_cannot_delete_account_keys`; live 2026-11-14 on the fixed build (`d913321eâ€¦`): add `GUfDeUbZâ€¦` â†’ key present, `revoke_key` `ArC71Vwhâ€¦` â†’ key absent and mandate suspended, `resume` `8N6sVJXLâ€¦` â†’ policy restored, key still absent (`make key-demo`); the refusal branch is live-tested by `make probe-revoke` â†’ `8HHWMDhXâ€¦`, log `violation: key_delete_requires_contract_owner`, key count unchanged | D-022, D-027 |
| C27 | "Only the account named as the mandate's agent can request a spend; any other caller is refused with `unauthorized` and the balance does not move." | `spend` caller check in `mandate/contracts/mandate/src/lib.rs`; test `only_the_named_agent_can_request_a_spend` (asserts the refusal code and an unchanged balance). **No live transaction is cited**: the one recorded on 2026-11-13 was a locally computed id and does not resolve (`docs/AUDIT-2026-11-14.md` F-4). | D-025 |
| C28 | "One intent authorises one debit: asking twice for the same chain, amount, vendor and asset is refused with `intent_consumed`, and the balance moves once." | guard in `spend` before the debit; live 2026-11-14 on build `3fb2f82fâ€¦`: `m114` create `H1ALmzSsâ€¦`, spend `21YT7eVmâ€¦`, second spend `7CcArdAPâ€¦` refused `intent_consumed`, `get_mandate` balance `9999999999000000` (one debit, not two) | D-028 |
| C29 | "A foreign transaction reference settles one authorisation: recording the same reference against a second mandate is refused with `tx_replayed`." | used-set in `settle`; live on the same build: `m114` settle `8BPhv8vrâ€¦`, `m115` spend `9RVvuYRiâ€¦`, settle with the same reference `74hPPwd1â€¦` refused `tx_replayed` | D-028 |
| C30 | "Closing a mandate pays its balance to that mandate's owner in the same receipt; the contract owner can withdraw only the part of the account balance no open mandate reserves, and a withdrawal above that is refused with `balance_reserved`." | `close_mandate` and `withdraw`; live on the same build: close `X128ZuNoâ€¦` (balance released), withdraw `FNT9vHo8â€¦`, over-withdrawal `ZS3FuqsLâ€¦` refused `balance_reserved` | D-028 |
| C26 | "A recorded settlement can be contested on chain inside a 100-block window with one of four reason codes and an evidence hash; the amount returns to the mandate's balance while the day's allowance stays spent; the same settlement cannot be contested twice." | `contest` in `mandate/contracts/mandate/src/lib.rs`; unit tests `contest_refunds_the_balance_and_records_the_reason`, `contest_after_the_window_is_refused`, `the_last_block_inside_the_window_still_contests`, `a_settlement_can_be_contested_once`, `a_contest_does_not_free_the_daily_ceiling`; live 2026-11-14 on build `d913321eâ€¦`: `H7oxeKpMâ€¦` (create) â†’ `2k6FiZG3â€¦` (spend) â†’ `Ld2v7yssâ€¦` (settle) â†’ `7ufoNHGRâ€¦` (contest, balance back to `1e18`, `spent_day` still `5`) â†’ `EweWtJu6â€¦` (second contest refused `already_contested`) | D-024, D-026, D-027 |
| C24 | "The contract compares a hash; it does not verify the attestation's signature, so the worker is a trusted component in this build." | `mandate/contracts/mandate/src/policy.rs` header; `src/state.rs` line 74; `docs/ARCHITECTURE.md` trust model | code comment, not a claim of verification |

### 1.1a Withdrawn on 2026-11-13, restored on 2026-11-14 â€” C26

The contest window was withdrawn when `tools/contest-demo.mjs` failed its own assertion, and
re-reading it found a second reason: `contest` subtracted the refunded amount from
`spent_day`, so a contest handed the day's allowance back (`docs/AUDIT-2026-11-14.md` F-5).

Both were fixed on 2026-11-14, and the claim returned only after the end-to-end run passed.
The evidence is the run, not the sentence:

| Step | Transaction |
|---|---|
| `create_mandate` (`m107`) | `H7oxeKpMyTLaF3sK86jWvbFMVeCWs16defwFVcGDPGz7` |
| `spend` 5 | `2k6FiZG3do9qdZCLcEzC4CbpmUJnqmgQyGsRa4RQbbPa` |
| `settle` | `Ld2v7yssJDuCLV9DGsEwZYFL61XBLg8uyEmXXMgLLAq` |
| `contest` â†’ balance back to `1e18`, `spent_total 0`, **`spent_day` still 5** | `7ufoNHGRKABuCxRjjgGvD3cYBaqYQKv5EMk8wmgVQNCs` |
| second `contest` â†’ refused `already_contested` | `EweWtJu6Ex3n62oAUAbJRXqPEfJYNUDT5yaKijdeSuh7` |

The `spent_day` figure is read from `get_mandate("m107")` after the contest: the money came
back, the day's allowance did not. That is the difference between the old build and this one,
and it is a contract view a reader can fetch, not a log line.

### 1.1 Retired 2026-11-07 â€” no artefact in this repository could prove them

These four sentences describe the Pledge/Bond cross-chain flow. That submission was
dropped (`PLAN-V2.md` Â§0) and Mandate's built contract has **no foreign-chain leg**:
`grep -rn chain_signatures mandate/contracts` returns nothing, and `settle` only stores a
reference string the attestor supplies. A claim we cannot demonstrate is deleted, not
softened (`AGENTS.md` Â§7).

| # | Retired sentence | Why it is gone | Returns when |
|---|---|---|---|
| C1 | "The deposit is verified by 3 independent RPC providers that must agree." | Mandate takes no deposit from another chain | a reader worker's quorum output is consumed by a deployed contract, with the three responses on-chain |
| C2 | "The seizure is a threshold signature from an 11-of-17 network, not a keeper with a private key." | there is no seizure and no MPC request in this repo | a contract-initiated signature moves funds on a testnet, tx linked in `SCREENER.md` |
| C3 | "No bridge, no wrapped asset, no oracle committee is used in this flow." | true of a flow we no longer ship; vacuous here | Pledge/Bond is rebuilt and deployed |
| C9 | "Built on NEAR Chain Signatures, Read MPC, NEAR Intents and NEAR AI Cloud." | the contract calls none of them; the attestation is a hash comparison | one call to each primitive exists in the deployed code path |
| C31 | "Once the owner registers an Ed25519 attestor key, `spend` accepts an attestation only if it carries a signature by that key over the contract account, a version tag, the mandate, intent, decision, policy and code hashes; a signature moved to another decision, replayed on another deployment, or missing is refused with `attestation_mismatch`." | `check_attestation` + `set_attestor_key` in `mandate/contracts/mandate/src/lib.rs`; live 2026-11-14 on `mig-mwgxoq09.testnet` (throwaway account, same wasm `3ff5997b…`): deploy `2o7rBts4…`, reset `CvST2u4L…`, create `5eyRPgD9…`, key `6QSEtGvA…`, signed spend `8pkz6Jj7…`, moved signature `HaWYjNrw…` refused, unsigned `H6n6BbiF…` refused (8/8). The live demo account leaves the key unset, so its spends are hash-compared only and log `attestation_unsigned`. | D-029 |

### 1.3 Evidence after the second review (current deployment)

Contract `mandate-hackaton-7c1a.testnet`, wasm `b43a819c…`, state reset once (D-030) and recorded
once. These are the receipts on that deployment; older ones above still resolve on chain but
describe earlier builds.

| Claim | Current receipts |
|---|---|
| console run | `m1` — create `6B7DXZDX…`, spend `5d4FWXr4…`, refused `FdaRD96k…`, settle `nNzKHhwG…`; `settlement` and `settled_count: 1` are in `chain.json` |
| C25 | `m1` — add `34q6NU8K…`, `revoke_key` `G2WP4KiJ…`, `resume` `Ep4yhzyx…`; `make key-demo` passes |
| C26 | `m2` — create `G2tAddc8…`, spend `GxaQge7Y…`, settle `BFbzRWzU…`, contest `GJxpCQ3G…`, second contest `5yGEjivX…` refused `already_contested` |
| C28 / C29 | `m3`/`m4` — spend `12j3FTmD…`, repeat `2FokB9fJ…` refused `intent_consumed`; settle `EJJnzbVW…`, replay `D7ZMTRvW…` refused `tx_replayed` (9/9) |
| C30 | close `DeLqz1Q3…` pays the mandate owner; withdraw `CqQKFQx…`; over-withdrawal `Apo465rV…` refused `balance_reserved` |
| C31 | `mig-mwgxoq09.testnet` — signed `DRMtpyVM…` accepted; moved `Dvm2kwcw…`, unsigned `68YVSruY…` refused (8/8) |

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
- When the video says "verified", the proof rail must show â‘ â‘¡â‘¢â‘£ populated. If a stage was simulated, the footer says `FALLBACK` on screen.
- No claim about speed or cost unless measured in the run being filmed (paste the clock).

## 4. Pre-submission sweep

```bash
grep -rniE "trustless|unhackable|impossible|bulletproof|fully secure|guaranteed|bank-grade" \
  --include="*.md" --include="*.ts" --include="*.tsx" --include="*.rs" . \
  | grep -v "docs/CLAIMS.md"   # must return nothing
```
