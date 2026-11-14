# Kimi review — Mandate and Baseline

**Review date:** 2026-11-14  
**Reviewer role:** senior software architecture and security review  
**Reviewed submissions:**

- Mandate: `e7fe779c32de953c2733ab15ac8cdc2585d11d92` (`publish/mandate`)
- Baseline: `7982e8a061b4f351307e573c417befddd9c61dd4` (`publish/baseline`)

This is an independent source and execution review, not a professional security audit. Findings marked **High confidence** have a complete code path and confirmed actor-controlled input. Destructive exploit paths were not executed.

## 1. Verdict

| Question | Mandate | Baseline |
|---|---|---|
| Safe for real funds or a production launch? | **NO-GO.** A critical cross-mandate key-deletion flaw, unauthenticated attestations, economic accounting bugs and an incomplete asset/settlement model block launch. | **Not a financial production app.** Its static research dashboard has a small runtime attack surface, but its evidence pipeline and repeat experiment are not release-ready. |
| Potentially eligible for the hackathon? | **In principle, yes.** Testnet-only projects and local demos are allowed, and `security` is a good track fit. The current judge path and contract findings still need attention. | **In principle, yes for `security`.** The `thesis` track is a poor fit without an actual investment thesis and model. Standalone reproduction currently fails. |
| Ready to submit unchanged? | **No.** The critical authorization bug and broken/contradictory judge material should be addressed first. | **No.** The offline artefact gate is red and the documented standalone commands do not form a clean-clone path. |
| Formal eligibility confirmed? | **Not confirmed.** Public repo, hosted demo and media exist; the required public X post and successful application were not established by this review. | **Not confirmed.** Same external requirements. No project named Baseline appeared in the public directory query checked during review. |

**Bottom line:** these can be useful hackathon prototypes, but Mandate must not custody real value in its current form. Baseline's committed 24-row dataset is genuine—I independently matched all 24 rows to chain semantics—but the repository's own consistency check fails and its experiment is not cleanly reproducible.

The official rules used for this verdict are [NEAR HACKATHON's `HACKATHON.md`](https://nearhackathon.com/HACKATHON.md) and the [public track definitions](https://nearhackathon.com/). In particular, Q-010 allows testnet-only entries, Q-011 makes integrations optional, Q-012 permits local demos, and Q-015 requires independent, mutually disclosed projects.

---

## 2. Mandate findings

### M-01 — Any mandate creator can delete keys belonging to the shared contract account (Critical)

**Confidence:** High; source-confirmed. Not executed against the live account.

**Locations:**

- `publish/mandate/mandate/contracts/mandate/src/lib.rs:95-149`
- `publish/mandate/mandate/contracts/mandate/src/lib.rs:192-205`
- `publish/mandate/mandate/contracts/mandate/src/lib.rs:764-767`
- `publish/mandate/tools/key-demo.mjs:74-76`

**Issue:** `create_mandate` is public and sets `mandate.owner` to any predecessor. `revoke_key` checks only that per-mandate owner, then issues `DeleteKey` against `env::current_account_id()`, which is the shared contract account. There is no check that the supplied public key belongs to that mandate's agent.

**Attack path:**

1. An attacker creates a minimal mandate and becomes its owner.
2. The attacker enumerates the contract account's public keys through public RPC.
3. The attacker calls `revoke_key` on their own mandate with any target public key.
4. `assert_owner` passes and the contract deletes that target key from itself.

A read-only RPC check during review found **one full-access key and no function-call keys** on `mandate-hackaton-7c1a.testnet`. Deleting the remaining full-access key could permanently remove deployment/admin recovery. Deleting function-call keys can deny service to agents.

The documentation's statement that deleting a key the owner does not control is a protocol no-op is unsafe: existence and ownership of the private key are different things. The public key is enough for this contract-initiated deletion.

**Additional scope problem:** if `mandate.agent` is a separate account, this method does not delete that account's key at all. The demo works because it adds the key to, and uses the same account as, the contract. Also, `Promise::new(...).delete_key(...)` creates a follow-up receipt; the unit test checks action creation, not its eventual success.

**Required direction:** disable or redeploy this path until only the correct contract administrator can delete a specifically registered key. Add a malicious second-account test and verify receipt outcomes. Treat the remaining full-access deploy key as a production emergency, not a demo detail.

### M-02 — The asset model is ledger-only; real attached NEAR has no payout or withdrawal path (Launch blocker)

**Confidence:** High.

**Locations:**

- `publish/mandate/mandate/contracts/mandate/src/lib.rs:92-149`
- `publish/mandate/mandate/contracts/mandate/src/lib.rs:151-169`
- `publish/mandate/mandate/contracts/mandate/src/state.rs:8-12`
- `publish/mandate/tools/chain-demo.mjs:94-101`

**Issue:** `create_mandate` and `fund` accept `attached_deposit().as_yoctonear()`, while policy and UI labels call the same integer `USDC`. There is no NEP-141 token integration, token contract identity, native transfer to a vendor, owner withdrawal, or other value-moving call. `spend` only changes integers; `settle` stores a string.

**Impact:**

- This is not a working USDC payment rail.
- Any real native NEAR attached under the current interface is locked in the contract with no user exit path short of a trusted code upgrade.
- “No custody” is not an accurate description of a contract that accepts and holds native deposits.
- The demo's “12 USDC” is 12,000,000 units of an internal label attached to a 100,000,000-yoctoNEAR deposit, not a USDC transfer.

**Required direction:** keep the current build strictly ledger-only/testnet and do not invite real deposits. A production version needs an explicit asset and custody model, actual payout/withdrawal semantics, unit tests with real token amounts, and a migration/recovery plan.

### M-03 — The agent can fabricate every attestation field (High)

**Confidence:** High.

**Locations:**

- `publish/mandate/mandate/contracts/mandate/src/lib.rs:711-752`
- `publish/mandate/mandate/contracts/mandate/src/state.rs:103-127`
- `publish/mandate/tools/chain-demo.mjs:64-65`
- `publish/mandate/tools/chain-demo.mjs:117-123`

**Issue:** the agent supplies `decision_hash`, `code_hash`, `quote_hash`, `policy_hash` and `intent_hash`. The contract checks non-empty strings and equality with public values. It does not authenticate the attestor, verify a signature, verify a TEE quote, or call the attestation worker. The demo itself generates these values locally in the spender's script.

An injected agent can therefore invent a fresh decision hash and arbitrary quote hash, copy the public policy/code hashes, compute the public intent hash, and present a fabricated “attested reason.” Direct-spend caps still apply; this finding does not imply an arbitrary vendor or unlimited amount bypass by itself.

**Impact:** the central attestation evidence has no authenticity or provenance value against the agent it is meant to constrain. Fresh fabricated decision hashes also enable the repeated-intent issue in M-05.

**Required direction:** either authenticate the decision on a trusted path and verify its quote/signature, or describe these values explicitly as unauthenticated caller assertions and remove security claims that depend on attestation.

### M-04 — Owner approval can exceed daily/vendor ceilings and bypass expiry (High)

**Confidence:** High. Owner approval is a required precondition; this is not an unauthenticated direct debit.

**Locations:**

- Initial checks: `publish/mandate/mandate/contracts/mandate/src/lib.rs:340-405`
- Approval: `publish/mandate/mandate/contracts/mandate/src/lib.rs:257-307`
- Debit: `publish/mandate/mandate/contracts/mandate/src/lib.rs:755-761`

**Issue:** pending requests are checked when created, but `approve` rechecks only suspension, policy hash and balance. It does not recheck `per_day`, `per_counterparty_day` or `expires_at_block`, and it does not call `roll_day` before debiting.

**Confirmed scenarios by code inspection:**

- Create several differently sized pending requests while the daily counter is zero, then approve all of them. Each request was valid at creation, but the combined approvals push `spent_day` and the vendor counter above policy.
- Create a request before expiry and approve it after expiry; the approval path never evaluates expiry.
- Approve an old request after UTC rollover. The debit is added to the stale day; the next direct spend rolls the day and erases that amount from the new day's accounting.

**Required direction:** revalidate all economic invariants atomically at approval, define reservation semantics for concurrent pending requests, and test multiple approvals, expiry and day-boundary cases.

### M-05 — One intent can debit repeatedly but settle only once (High)

**Confidence:** High.

**Locations:**

- Debit and amount overwrite: `publish/mandate/mandate/contracts/mandate/src/lib.rs:400-445`
- Single settlement per intent: `publish/mandate/mandate/contracts/mandate/src/lib.rs:468-497`

**Issue:** replay prevention is keyed by `decision_hash`, while `authorised_amount` and `settled` are keyed only by `intent_hash`. A fresh decision hash for the same chain/amount/asset/vendor authorises another debit and overwrites `authorised_amount[intent]`. `settle` then refuses a second settlement for that intent.

With `require_attestation = false`, even an exact repeat is accepted because `check_attestation` returns before consuming a decision.

**Impact:** a worker can execute multiple external payments that the contract can represent as only one settlement. A contest can reverse only the single recorded amount, and the ledger cannot reconcile each authorisation to a distinct foreign transaction.

**Required direction:** introduce a unique authorisation ID/nonce and bind decision, intent, debit and settlement to it. Add tests for same intent with a new decision and exact repeats with attestation disabled.

### M-06 — Public creation enables storage and availability griefing (High)

**Confidence:** High.

**Locations:**

- `publish/mandate/mandate/contracts/mandate/src/lib.rs:50-51`
- `publish/mandate/mandate/contracts/mandate/src/lib.rs:92-149`
- `publish/mandate/mandate/contracts/mandate/src/policy.rs:56-83`
- Unbounded views: `publish/mandate/mandate/contracts/mandate/src/lib.rs:581-679`

**Issue:** any account can create up to the shared 10,000-mandate cap with a minimal deposit. Policy strings and allowlists have no size limits, there is no mandate deletion or storage-cost accounting, and all records share the contract account's storage. `used_decisions`, settlements and policy history also grow indefinitely. Several views iterate the whole state without pagination.

**Impact:** an attacker can consume the creation cap, lock shared balance into storage, inflate serialization/read costs, and eventually make legitimate creation or views unavailable. This is an economic denial-of-service path, not a direct transfer to the attacker.

**Required direction:** add explicit storage-funding rules and size limits, decide whether creation is permissioned, add deletion/garbage-collection semantics, paginate views, and use scalable contract collections where appropriate.

### M-07 — `contest` refills the daily ceiling (High, already disclosed but still deployed)

**Confidence:** High; confirmed again in source.

**Location:** `publish/mandate/mandate/contracts/mandate/src/lib.rs:508-568`, especially `:560-562`.

**Issue:** `contest` subtracts the amount from `spent_day` but not from the per-counterparty counter. This contradicts the function comment and allows daily allowance to be reused after contests, up to the remaining vendor capacity and across additional vendors. A contest after day rollover can also subtract an older settlement from the current day's counter.

The project has withdrawn C26 and disclosed this defect, which is good disclosure. Withdrawal does not remove the deployed behavior or make the contract production-ready.

**Required direction:** disable the contest path for any real deployment until the counter behavior is corrected and its end-to-end demo and adversarial tests pass.

### M-08 — “Settlement” does not verify a foreign payment (Medium)

**Confidence:** High.

**Locations:**

- `publish/mandate/mandate/contracts/mandate/src/lib.rs:466-505`
- `publish/mandate/tools/chain-demo.mjs:171-180`

**Issue:** `settle` requires only a non-empty `tx_ref` from one attestor. It does not verify chain, transaction existence, recipient, asset, amount, finality, or global uniqueness of the reference. The demo constructs a synthetic `base_sepolia:0x…` string from a local hash and records it.

The NEAR `settle` transaction is real; the claimed foreign payment behind the reference is not established by this artifact.

**Required direction:** label the current step “attestor-recorded reference” everywhere. Production settlement needs independent foreign-chain verification and a uniqueness binding to mandate, intent, amount, asset and recipient.

### M-09 — Migration strands pre-upgrade unsettled authorisations (Medium)

**Confidence:** High.

**Locations:**

- `publish/mandate/mandate/contracts/mandate/src/migrate.rs:54-91`
- `publish/mandate/mandate/contracts/mandate/src/lib.rs:482-487`

**Issue:** migration initializes every old mandate's `authorised_amount` to an empty map. `settle` now rejects an intent absent from that map. Any authorisation created but not settled before the upgrade can therefore never be settled through the new code.

**Required direction:** include in-flight authorisations in migration/recovery planning and test an upgrade with both settled and unsettled historical spends. Preserving balances is not the same as preserving workflow behavior.

### M-10 — Decision and escalation identifiers create cross-mandate and review races (Medium)

**Confidence:** High for the code behavior; exploitation requires knowledge of a target decision hash or an owner review race.

**Locations:**

- Global decisions: `publish/mandate/mandate/contracts/mandate/src/lib.rs:69-73` and `:741-752`
- Escalation ID/insert: `publish/mandate/mandate/contracts/mandate/src/lib.rs:408-425`

**Issue:**

- `used_decisions` is global to the whole contract, not scoped by mandate. One mandate can consume a decision hash needed by another, producing a cross-tenant denial of service when the hash is predictable or observed before execution.
- `request_id = mandate_id:intent_hash` is stable for repeated identical requests. A new escalation with the same intent silently overwrites the old pending request while consuming both decision hashes. An owner reviewing the old request may approve a different decision record without changing the payment fields.

**Required direction:** scope decisions to their mandate/attestor and use unique, append-only request IDs. Surface replacement attempts as typed refusals.

---

## 3. Baseline findings

### B-01 — The documented standalone experiment path is broken (High)

**Confidence:** High; confirmed from a clean local clone.

**Evidence:**

- `publish/baseline/Makefile` does not exist, despite README/JUDGE instructions to run `make thesis`, `make thesis-e2e` and `make thesis-hygiene`.
- `publish/baseline/README.md:48-63` and `publish/baseline/docs/SCREENER.md:6-35` invoke `node thesis/tools/collect.mjs` and describe `thesis/data`, but the published paths are `tools/collect.mjs` and `data/`.
- `publish/baseline/tools/experiment.mjs:17-19` imports `near-api-js`, while `publish/baseline/package.json:13-15` declares only Playwright.
- `package-lock.json` is absent in the reviewed commit. `npm ci` fails before installation with the missing-lockfile usage error.

The parent workspace's `node_modules` and home credentials masked the missing package during this review. A genuinely standalone clone does not provide those resources.

**Impact:** the official requirement for a reproducible README and the project's own fresh-clone contract are not met, even though `npm run site` can serve the static dashboard.

**Required direction:** make one documented command path work from a standalone clone, declare every runtime dependency, commit a lockfile, and separate read-only demo commands from operator-only testnet writes.

### B-02 — The offline artefact gate is red (High)

**Confidence:** High; reproduced.

**Locations:**

- `publish/baseline/tools/e2e.mjs:151-181`
- `publish/baseline/docs/FINDINGS.md:17-27`

**Observed:** `node tools/e2e.mjs` completes seven checks, then fails:

> `FINDINGS.md no longer cites the pre-fix spend`

The checker requires at least one hash from its `HISTORIC` allowlist, while the prose deliberately removed the unresolved pre-fix hashes. The test enforces the old documentation policy, not the corrected one.

**Required direction:** align the checker with the rule that unresolved hashes must be absent. Keep this as a blocking release check; do not bypass it.

### B-03 — `--repeat` does not produce a valid distribution and miscounts skips (Medium)

**Confidence:** High from the loop/state design.

**Locations:**

- `publish/baseline/tools/experiment.mjs:250-400`
- `publish/baseline/tools/experiment.mjs:417-423`
- `publish/baseline/docs/SCREENER.md:80-85`

**Issue:** repeats reuse the same mandates and counters. The budget shape is exhausted after the first repetition, suspension persists into later repetitions, and the fixed replay decision is already consumed. Daily shapes also accumulate rather than restarting their premise. These produce mismatches, not independent observations.

The documentation says `--repeat 5` means 50 transactions, but 24 cases times five is 120. Skipped rows use `got: "skipped"`, which the summary counts as refused because every non-`authorised` result is included in `counts.refused`.

**Required direction:** define an independent experimental unit per repetition or reset each premise, report skipped counts separately, and test the repeat mode itself before presenting distributions.

### B-04 — The shipped evidence checker validates existence, not the row's claim (Medium)

**Confidence:** High.

**Locations:**

- `publish/baseline/tools/check-evidence.mjs:42-69`
- `publish/baseline/tools/e2e.mjs:184-229`

**Issue:** the online checks establish that a transaction outcome exists and was executed. They do not compare the row's expected method, receiver, arguments, success/failure, or receipt refusal code. Offline checks trust the dataset's `got` and `expected` fields. A valid but unrelated hash could therefore support an incorrect row and pass these tools.

**Important qualification:** I independently performed the missing semantic comparison on the committed dataset: **24/24 rows agree** with the public chain on method, arguments, outcome and refusal code. This finding concerns future verification strength, not evidence that the current rows are fabricated.

### B-05 — `thesis` is currently the wrong primary track (High for hackathon fit)

**Confidence:** High.

**Evidence:** `publish/baseline/README.md:31-44` states that the derived model is “not written” and the write-up is “not written.” The official `thesis` track asks for a **long-term investment thesis for NEAR**, backed by on-chain analytics, dashboards and rerunnable models.

This repository is a useful enforcement experiment, but it is not an investment thesis. `security` is the natural track. `open` may be a better secondary track than `thesis`, subject to the sponsor's positioning.

### B-06 — Independence under Q-015 is unresolved (Medium; organizer judgment required)

**Confidence:** High for the dependency; the eligibility decision belongs to the organizers.

**Evidence:**

- `publish/baseline/README.md:35-36` measures Mandate's deployed contract.
- `publish/baseline/README.md:69-70` says “shares no contract,” then acknowledges reading Mandate's contract.
- `publish/baseline/tools/near.mjs:1-4` describes a deliberate copy of the other submission's signing layer.

**Assessment:** mutual README disclosure exists, which is good. Separate repositories alone do not establish that these are not “the same project twice.” Baseline has a different research purpose, but it depends on Mandate as its experimental subject and copies implementation code. Present this dependency plainly and let the organizer decide; do not claim there is no shared contract.

---

## 4. Cross-submission release problems

### J-01 — Mandate's judge instructions and generated evidence are inconsistent (High for screening)

**Confirmed items:**

- `publish/mandate/JUDGE.md:23-25` invokes `node tools/check-evidence.mjs JUDGE.md`, but that file is absent. The clean-clone command fails `MODULE_NOT_FOUND`.
- `publish/mandate/JUDGE.md:43-50` invokes `make thesis-e2e` and a `thesis/data/spends.json` path; the Mandate Makefile has no such target and the repo has no such tree.
- `node tools/check-docs.mjs` fails with three broken references: `docs/FINDINGS.md`, `docs/EVIDENCE-CHECK.md`, and `thesis/docs/FINDINGS.md`.
- `publish/mandate/README.md:113-121` still claims live C27 proof from `3aqb32W9…`, while `publish/mandate/JUDGE.md:28-34` and `docs/CLAIMS.md` correctly say no live C27 transaction is cited.
- `publish/mandate/mandate/README.md:39-55` still presents the contest behavior as valid and says counters are not rewound, contradicting both the root README and the code.
- Test claims drift among 27, 36 plus worker tests, and 37. `make test` runs only Cargo; `make verify` checks only the snapshot. The signer tests and worker self-test exist but are not wired into those commands.
- `node tools/doctor.mjs` marks attestation, reader and signer `ACTIVE` merely because directories exist, and Cargo `ACTIVE` because the binary exists. The modules are not connected to the contract flow and the Rust test build failed on this host. This is presence detection, not readiness detection.

### J-02 — Hosted Mandate and fresh-clone Mandate serve different evidence (Medium)

**Confirmed in two browser views:**

- The hosted Verify page shows run `m101` at block `277665179`. Its authorised spend, attestation refusal and settle transaction all passed independent RPC verification.
- The reviewed `main` commit's `mandate/console/data/chain.json` instead serves runs `m4`/`m5` at block `276548869` and earlier. One displayed spend, `5i8mGcuBTeyHtDP7cVcHFKtMQnJWvCs3q5enTheXgQLZ`, returned no outcome from either public RPC tried.

The hosted demo is therefore healthier than the source a screener clones. Publish generated evidence from one reproducible source and test resolution of every displayed hash, not only the prose files.

### J-03 — External submission requirements remain unverified (Hard eligibility gate)

**Verified:** both GitHub repositories are publicly readable, both hosted judge pages load, licenses exist, and Mandate's hosted demo includes media. The sibling projects name each other.

**Not established:** the two required public X posts and successful application submissions. Neither repo contains a definitive submitted X URL, and the public directory query did not find a project named Baseline. Several projects named Mandate exist, so a name-only match cannot identify this one.

If the human has not completed both external steps before the official deadline, code quality cannot cure the missed requirement. This review did not submit anything or post publicly.

---

## 5. What passed

| Check | Result |
|---|---|
| Mandate `node tools/verify.mjs` | **PASS** — 13 checks; stable `inputsHash` `eb93f27f…d96e`. |
| Mandate `node tools/demo-report.mjs` | **PASS** — committed 15-event snapshot matches expected output. This does not regenerate the Rust snapshot. |
| Mandate `node --test tools/api.test.mjs` | **PASS** — 9 API/MCP tests. |
| Mandate signer tests | **PASS** — 4 tests. |
| Mandate attestation worker self-test | **PASS** — deterministic mock-mode hash test only. |
| Mandate `npx playwright test` | **PASS** — all 24 tests, including UAT and accessibility checks. |
| Mandate current headline chain sample | **PASS** — authorised `spend`, refused `spend` with `attestation_mismatch`, and `settle` independently checked via RPC. |
| Baseline `node tools/check-evidence.mjs data/spends.json` | **PASS** — all 24 hashes resolve. |
| Baseline independent semantic RPC check | **PASS** — 24/24 methods, arguments, outcomes and refusal codes agree. |
| Baseline `npx playwright test` | **PASS** — all 8 public-site tests after installing the required Chromium version. |
| Hosted pages | **PASS** — dynamic data loaded in both judge views; Baseline displayed 24 rows and Mandate's current hosted run loaded. |
| Baseline `node tools/e2e.mjs` | **FAIL** — stale historic-hash assertion in B-02. |
| Baseline `npm ci` in pristine clone | **FAIL** — no lockfile. |
| Mandate `node tools/check-docs.mjs` | **FAIL** — three broken references. |
| Mandate `node tools/check-evidence.mjs JUDGE.md` | **FAIL** — script absent. |
| Mandate `cargo test --locked` | **NOT VERIFIED** — build stopped before tests at `dlltool.exe: program not found`; Docker daemon was unavailable. This is an environment/toolchain blocker, not a failing contract assertion. |
| `make` commands on this host | **BLOCKED LOCALLY** — `make` is not installed. Underlying Node/Cargo commands were used where possible. Baseline separately has no Makefile. |
| npm dependency audit | Baseline: **0 advisories**. Mandate: **2 low** in development-only Mermaid/KaTeX; no moderate, high or critical npm advisories reported. |
| Rust dependency audit | **NOT RUN** — `cargo-audit` is unavailable. |
| Secret-file name check | No tracked `.env`, `.secrets`, PEM, P12/PFX or `.key` filenames found in either public repo. Secret stores were not opened. |

**Security positives:** the direct `spend` path binds the named agent, uses integer amounts, checks common policy limits before debit, and logs typed refusal codes. The read API defaults to loopback, uses scoped random bearer keys, constant-time hash comparison and no write path. I found no high-confidence XSS, command injection, read-API authorization bypass or committed private key in the reviewed surfaces.

---

## 6. Minimum release gates

### Before any real-money Mandate deployment

1. Remove or securely redesign `revoke_key`, redeploy, and prove a second account cannot delete another mandate's or the contract administrator's keys.
2. Do not accept real deposits until native/token custody, payout and withdrawal behavior is implemented and covered by economic tests.
3. Authenticate attestation provenance; otherwise remove all security reliance on the claimed attested reason.
4. Enforce limits at approval, make authorisation-to-settlement identity unique, and test duplicate intent, concurrent approvals and day rollover.
5. Disable contest until its counters and end-to-end behavior pass.
6. Add storage funding/bounds, pagination and abuse tests; independently verify real foreign settlement.
7. Secure deployment governance and produce a reproducible source-to-wasm hash proof. Obtain an independent contract audit after these changes.

### Before hackathon handoff

1. Fix Mandate's judge commands, contradictory C27/contest copy and main-versus-hosted evidence drift.
2. Fix Baseline's clean-clone commands, declared dependencies, lockfile and red offline gate.
3. Repair or withdraw Baseline's repeat-mode claims and strengthen evidence checks to compare chain semantics.
4. Present Mandate primarily as `security`; reconsider `agents`/`business` unless an actual agent/payment flow is demonstrated. Present Baseline as `security`, or write a real investment thesis before using `thesis`.
5. Ask the organizer to assess Q-015 independence if there is any doubt; mutual disclosure alone does not settle it.
6. Confirm the human's public X posts and successful applications through the official flow.

---

## 7. Review side effects and limits

**Accidental testnet writes, disclosed:** while checking the documented Baseline commands in a local clone, parent-workspace dependencies and existing home credentials allowed the state-changing experiment to start instead of failing for missing setup. I stopped it after two mandate creations (`m103`, `m104`) and five spend attempts: two authorised and three expected refusals. No mainnet action occurred, no published repository was modified, and the experiment was stopped before it could overwrite its dataset.

The five recorded spend transactions are:

- `FNLr7kXjCnp9vbWbNjYGYZFQKKxShYb422sEWaFn5BMp` — authorised
- `17F8VSSS4W5JxkMrFAugvcV6fFoLuxmPogRKCH7TvFi` — `per_tx_exceeded`
- `2VzkyacJognFoBG2FF2nqE2Dua6ZMxrQVgNx3ewPZqxc` — `amount_zero`
- `9LRt33LATKj3jETwUqw8kAyE8teaniYhFKFLtivC4TxA` — authorised
- `EV8xpv8SE1NmriFCTYVrvzYknuadCnbr6CrbfXDeTwPd` — `per_day_exceeded`

The harness did not print the two create transaction IDs. After this incident, review network activity was restricted to read-only RPC, public pages and local tests.

**Not verified:** Linux Rust test execution, source-to-deployed-wasm equivalence, Rust dependency advisories, foreign-chain settlement, actual X posts/application receipts, and the organizers' final independence/track decisions. These are explicit open items rather than assumed passes.
