# DECISIONS

> Append-only. Every decision with more than one option gets an ID. A silent reversal is a defect (see `AGENTS.md` §8).
> Format: ID · date · decision · options · why · revisit trigger · docs amended.

---

**D-001 · 2026-11-01 · Programme scope**
Build **Pledge + Mandate**; reject the incumbent pitch book's portfolio (SafePassage, Proof-of-Exploit, Sweep, Peek, Rugless, Verified Offer).
*Options:* build the book's pair · build Pledge+Mandate · build one product deeply.
*Why:* SafePassage's category collides with NEAR Business (shipped 2026-10-20) and its buyer is deceased by design; PoE's riskiest build item is anvil-with-egress inside a TEE; Sweep needs a lender and a licence. Pledge and Mandate are the only two that pass the uniqueness test in `UNIQUENESS-AUDIT.md` and have a buyer who is alive and funded today.
*Revisit:* G2, if the scaffold slips → drop to one submission.

**D-002 · 2026-11-01 · Budgets are balances, not comparisons**
A mandate's budget is a funded derived address per chain. The contract never compares an amount to a limit before signing.
*Options:* MPC-side comparison (the intuitive design) · funded balance + on-chain policy.
*Why:* IACR ePrint 2026/2176 proves comparison-gating admits a deterministic bypass — "every member signs over-budget transactions with probability one." The balance model is also cheaper to build.
*Revisit:* never. This is a correctness constraint, not a preference.

**D-003 · 2026-11-01 · Claims narrowed after the uniqueness test**
The original claims ("only NEAR can…") are withdrawn. Shipped claims are limited to the surviving sentences in `CLAIMS.md`.
*Options:* keep the strong claims and defend them · narrow to what is provable.
*Why:* ICP's Chain Fusion docs describe the same collateral pattern; ERC-7715 session keys already scope agent spending. A judge from a16z or Dragonfly will know both. Narrow claims are more persuasive than broad ones that fail one search.
*Revisit:* if new evidence of exclusivity appears (e.g. Read MPC proves unreproducible elsewhere).

**D-004 · 2026-11-01 · Two repos, copied scaffold**
Two separate public repos; shared code is copied, never imported.
*Options:* monorepo with two folders · two repos with a shared package · two repos with copied code.
*Why:* one repo = one submission (`projectUrl` unique); the AI screener must run each repo standalone; a shared package adds a failure mode the screener will hit.
*Revisit:* never before submission.

**D-005 · 2026-11-01 · Human approval is not a yield/resume wait**
Escalation is a separate on-chain `pending → approve` flow.
*Options:* pause the contract with yield/resume until a human responds · pending request that executes on approval.
*Why:* the yield/resume window is ~200 blocks (~2 min). A human is slower; a timeout would corrupt state mid-flow.
*Revisit:* never.

**D-018 · 2026-11-06 · A refusal logs its code, because the release profile aborts**
Every `PolicyViolation` logs `violation: <code>` before it panics, so the code survives on chain.
*Options:* build with `panic = "unwind"` so the panic message reaches the node · log the code and keep `panic = "abort"` · leave it.
*Why:* observed on testnet — with `panic = "abort"` the failure arrives as `WebAssembly trap: An 'unreachable' opcode was executed` and no policy code, so a refused spend is indistinguishable from a broken contract in the explorer. `unwind` grows the wasm (already 484 kB) and near-sdk recommends abort. The receipt log is carried in the transaction outcome and the explorer shows it, which is what makes the refusal auditable by someone who does not trust this repository.
*Revisit:* if near-sdk exposes structured errors in the outcome; then the log line becomes redundant, not wrong.

**D-017 · 2026-11-06 · A read control plane: HTTP API + MCP, no write path**
The console gets two machine clients over the same snapshot: a scoped bearer-key HTTP API and an MCP stdio server. Both are read-only.
*Options:* console only · read-only API + MCP · a full API with signed writes.
*Why:* the buyer of an agent-authority product is a program, so a human console alone is not the product; but a write path would need a signer, and shipping an unsigned write API that pretends to spend is exactly the mock AGENTS §5 forbids. Read-only is the honest half, and it is the half a judge can verify against the same figures the page prints. Keys are stored as SHA-256 hashes, carry named scopes, and revoke to a distinct `key_revoked` code.
*Revisit:* when a signer exists on testnet — then `spend` gets its own scope, a nonce discipline and a rate limit, and this entry is amended rather than replaced.

**D-006 · 2026-11-01 · Design source of truth**
`docs/BRAND_GUIDELINES.md` > `tailwind.config` > Figma > Stitch output.
*Options:* Figma-first · code-first with Figma as reference.
*Why:* the screener and the demo both read code; a Figma-first source of truth would require a human in the loop on every change during a 14-day sprint. Figma is used to explore (via Stitch) and to hold variables, not to gate.
*Revisit:* if a dedicated designer joins full-time.

**D-007 · 2026-11-03 · G2 assessed green-on-code, deferred-on-proof; stay at two submissions**
The scaffold (`scaffold/`) implements the frozen SCAFFOLD.md v1 interface: derivePath/buildTx/requestSignature on all three chains (BTC testnet segwit, Base Sepolia EIP-155, Solana devnet), reader (Read MPC primary, 3-of-3 RPC quorum fallback), attest (TDX or labelled mock), worker yield/resume inside 200 blocks, `make doctor`/`make verify` runnable. The actual testnet signature — the G2 *proof* — is blocked on a NEAR testnet account with a FunctionCall access key (H-5), not on code. `make doctor` reports every module FALLBACK until credentials exist; the signer selftest promotes it to ACTIVE once they do.
*Options:* declare G2 failed and drop to one submission (D-001 revisit trigger) · declare G2 green-on-code and proceed with two.
*Why:* the trigger's intent was a capability gap, not a credential wait. The code exists, the pure paths are tested, and dropping to one submission over an item already parked with the human would forfeit a viable second submission two days early.
*Revisit:* 2026-11-06 — if H-5 credentials are still absent, or the signer selftest fails once they exist, drop to one submission and reallocate the freed capacity to its demo depth.

**D-008 · 2026-11-05 · Contract unit tests run in a Linux container; the Windows host is wasm-only**
`cargo test` runs through `docker run rust:1` against the mounted repo. The Windows GNU host keeps building the wasm artifact and is never the reference environment for tests.
*Options:* install gcc + cmake + perl + nasm on Windows (admin, ~350 MB) · rewrite the 16 tests to avoid `near-sdk/unit-testing` · run the suite in a Linux container.
*Why:* `near-sdk`'s `unit-testing` feature pulls `near-crypto`, which pulls `aws-lc-rs` (needs cmake, perl, nasm) and `secp256k1-sys` (needs a C compiler). The wasm build never compiles either, so the host machine only ever failed at *link* time — which hid the real dependency problem behind a `dlltool` error. A container is also what a judge or CI runs, and it keeps machine-specific setup out of the repo. Rewriting tests to dodge the dependency would have removed the `VMContext` coverage that proves the typed error codes.
*Note:* the separate `dlltool` gap is fixed permanently by putting real ucrt64 binutils on `PATH` from `.tools/` (gitignored); the earlier attempt with the rustup `rust-mingw` shim is recorded as failed because that `dlltool.exe` is a wrapper that shells out to an `as` the toolchain does not ship.
*Revisit:* when CI exists, move the recipe there and delete the local instructions.

---

**D-014 · 2026-11-06 · Attestations are bound to a policy revision**
`Attestation.policy_hash` must equal the mandate's current `policy_hash`; `update_policy` increments `policy_rev` and appends a `PolicyRevision`; a pending escalation raised under an older revision cannot be approved (`policy_changed`).
*Options:* keep decisions policy-agnostic and rely on the new limits alone · bind every decision and escalation to the revision it was made under · re-attest the whole queue on every policy change.
*Why:* limits alone are not enough. A decision made under a looser policy names an intent the new policy never saw, so evaluating it against fresh limits lets one decision ride across an amendment. Re-attesting the queue would need the enclave to act without the agent asking, which is a second authority we do not want. A hash comparison is one check, one new code, and it is visible: event 13 changes the policy, event 14 refuses the stale decision while the amount is inside every new limit, event 15 accepts the same spend once re-attested.
*Revisit:* if a review shows a spend that passed with a stale revision. Event 14 of the demo is that check, and `stale_attestation_after_policy_change_is_refused` asserts it.

## Pending human decisions

See `PENDING-HUMAN.md`.

## D-009 — the console is a static page over a contract snapshot

- **Date:** 2026-11-06
- **Options:** (a) framework app with a Node backend that executes policy logic; (b) static page that renders a snapshot produced by the real contract; (c) static page that re-implements the policy in JavaScript.
- **Choice:** (b). `mandate/console/` is dependency-free HTML/CSS/ES modules. Its only data source is `mandate/console/data/snapshot.json`, written by `make demo` from a scenario executed against the contract in near-sdk's test VM. The console formats integers; it never computes a balance, a limit or a decision.
- **Why:** (c) is a mock that looks real — the exact failure AGENTS §5 forbids. (a) adds a server that would have to hold a key or re-implement rules to be writable, and a screener cannot audit either in an hour. (b) keeps one source of truth: if the contract changes behaviour, the snapshot changes, and `make demo` fails when it does.
- **Consequence:** writes are not available in the console. The replay player steps through recorded real calls; buttons that would mutate chain state do not exist. A live read-only mode via `MANDATE_CONTRACT` is a later addition, not a claim.
- **Revisit:** if a deployment exists and judges need to click a real spend, add a signer-driven write path in a separate process — never in the page that renders the receipt.

## D-010 — three contract methods added for the console

- **Date:** 2026-11-06
- **Options:** (a) console assembles mandate and queue lists client-side; (b) add `list_mandates` / `list_pending`; (c) render only the single seeded mandate.
- **Choice:** (b), plus owner-only `update_policy`, which the `09-policy-editor` screen already depicted without a backing method.
- **Why:** (a) means the UI invents rows the contract cannot serve. (c) hides the escalation queue, which is half the product. `update_policy` validates the new policy, rewrites `policy_hash`, and deliberately leaves balance and day counters alone, so tightening a policy cannot forgive past spend.
- **Cost:** +4 unit tests, one new public method, one new view pair. `list_pending` returns the whole queue in one call; at 10k mandates the bound in `MAX_MANDATES` keeps the response sane.
- **Revisit:** if policies need history (who changed what, when), add an append-only `policy_log`; do not mutate stored history.

## D-011 — Bond is deferred, Mandate ships alone unless it compiles by 2026-11-08

- **Date:** 2026-11-06
- **Options:** (a) build Bond contract now in parallel; (b) ship Mandate complete and revisit Bond on 2026-11-08; (c) ship both half-built.
- **Choice:** (b), per `PLAN-V2.md` §5: "If Nov 8 arrives and Bond's contract is not compiling, drop Bond and ship Mandate alone, well."
- **Why:** (c) is the failure mode the plan was written to avoid — two submissions that each cannot reach their demo. Mandate now has 22 contract tests, a console, a deterministic demo, 10 e2e tests and a screener path. Bond has designs and no contract.
- **Revisit trigger:** 2026-11-08. If Bond's `open_bond`/`verify`/`slash` are not green then, Bond is withdrawn and the second submission slot stays empty rather than half-filled.

## D-012 — fonts fall back to system stacks

- **Date:** 2026-11-06
- **Options:** (a) Fontsource packages + 400 KB of woff2 in the repo; (b) Google Fonts CDN; (c) system stacks with the licensed names first.
- **Choice:** (c).
- **Why:** the brand file forbids the CDN (privacy, and a screener may run offline). (a) is the eventual answer, but the console must render with no install step; a 400 KB download that fails offline would break `make dev`. `--font-display: "Fraunces", …, Georgia, serif` uses the licensed face when present on the machine and a documented fallback otherwise.
- **Revisit:** before the demo video — self-host the three faces so the filmed pages match the brand file exactly.

## D-013 — Playwright + axe are the accessibility gate

- **Date:** 2026-11-06
- **Options:** (a) manual review against `BRAND_GUIDELINES.md` §11; (b) axe-only; (c) Playwright behaviour tests plus axe on every route.
- **Choice:** (c): 10 tests, including keyboard path, visible focus ring, reduced motion, 960px rail collapse, no horizontal overflow at 380px, and `axe` with zero WCAG A/AA violations.
- **Why:** (a) is unverifiable by a judge; (b) catches markup, not behaviour — the refusal announcement and the focus ring are behaviours. The suite is the artefact behind any accessibility sentence we say.
- **Revisit:** add `toHaveScreenshot` visual baselines once the fonts are self-hosted (D-012), so a font swap cannot silently shift layout.

## D-015 — "Mandate" is a working title; the rename is the sponsor's call

- **Date:** 2026-11-06
- **Options:** (a) keep "Mandate"; (b) rename now, before the repo is public; (c) keep it and add a disambiguation note.
- **Choice:** keep it temporarily, record the collision, and ask the sponsor (PENDING-HUMAN H-10) to decide before publishing.
- **Why:** searching for the name surfaces `docs.mandate.md`, `mandate.help` (owl mark, ZK proofs), `runmandate.xyz` (Privy/Arc) and `mandate-agent.com` (agentic commerce), all describing agent spending authority — the exact category. NEAR's own Intents Agent API sits adjacent. A judge who searches the name finds four products first, and a submission whose identity is confused with an incumbent reads as derivative before the code is opened. Renaming is cheap now (repo name, wordmark, titles, context bar, `projectUrl`) and expensive after submission.
- **Cost of waiting:** every document says "Mandate" in prose; a rename is one batch of replacements plus the wordmark, and the docs pipeline (D-016) regenerates the site copy from the same files.
- **Revisit trigger:** the sponsor's answer, or 2026-11-09 at the latest — after that, the rename would collide with the freeze.

## D-016 — the site and the repository share one copy of every document

- **Date:** 2026-11-06
- **Options:** (a) hand-write HTML pages for the site; (b) commit a markdown renderer or a static-site dependency; (c) a zero-dependency build step that turns the shipped markdown into one JSON document the console renders.
- **Choice:** (c): `tools/build-docs.mjs` → `console/data/docs.json`, rendered by the `#/paper` route.
- **Why:** (a) guarantees drift between GitHub and the site on the first correction; (b) adds an install step to a repo whose promise is `make dev` with no secrets and no network. Escaping happens before any tag is produced, so a document cannot inject markup. A missing `docs.json` produces an honest "run `make docs`" card, not fabricated content.
- **Cost:** a ~180-line renderer that supports a deliberate markdown subset (headings, paragraphs, lists, tables, fenced code, blockquotes); anything outside it renders as text rather than failing silently.
- **Revisit:** if the subset starts rejecting real documents, move to a pinned renderer with its licence in `NOTICE.md` — do not hand-edit the generated JSON.

## D-019 — submission #2 is a measured baseline, not Bond

- **Date:** 2026-11-07
- **Options:** (a) build Bond as planned; (b) build Pledge; (c) build "Meter" (no spec exists anywhere in the repo); (d) submit the measured enforcement baseline on the `thesis` + `security` tracks; (e) submit one project only.
- **Choice:** (d). Bond and Pledge are withdrawn. D-011's 2026-11-08 revisit is answered early, because the answer does not depend on whether a contract compiles.
- **Why (a) fails:** the same test that killed Pledge kills Bond. "Escrow + stake + slash on a verified acceptance test" is shipped by NEAR AI's own [Agent Market](https://near.ai/near-ai-agent-market-terms-of-service) (escrow, `Verification Hash`, dispute deposit, `Resolver`), Covenant (Base, 14 contracts), AgentBond (Solana), Escrix, CallGuard, x402 Hub and BlindOracle. Bond's only wedge would be payout on the client's chain plus a quorum-verified verdict — the Chain Signatures + Read MPC dependency that is still open at `PENDING-HUMAN.md` H-7. That is the same signing risk as Pledge with less differentiation. Recorded at `UNIQUENESS-AUDIT.md` §6.1.
- **Why (b) fails:** Templar ships the mechanism in production on NEAR, audited by four firms. Recorded at §3 and §7.
- **Why (c) fails:** no specification exists; the plausible readings (usage billing, per-call metering) land on NEAR Business's payroll/invoicing surface, which `AGENTS.md` §6 forbids, or on Mandate's own counter.
- **Why (d) wins:** the field is now crowded with implementations whose behaviour nobody has measured against each other. This repository already owns the measurement apparatus — a deployed contract with 21 typed refusal codes, a replay console, `make verify`, real testnet refusals — so the submission is an experiment, not a mock: scripted spends, published hashes, and a reproducible model that re-derives every figure from RPC. It cannot be read as Mandate split in two (no shared contract, no shared code, different buyer: auditors and marketplaces choosing an implementation), and it competes in `thesis`, the track with the fewest entrants and the lowest build risk.
- **What it may not do:** flatter Mandate. The write-up must include where funded-balance enforcement costs more than session keys and where a TEE rule engine is simpler than a contract.
- **Cost:** a collector, an experiment harness, a write-up and a dashboard over data we already generate. No new contract, no foreign chain, no credentials.
- **Revisit trigger:** 2026-11-09. If `make thesis` cannot regenerate the dataset from RPC by then, withdraw submission #2 and spend the remaining time on one flawless entry (option e).

## D-020 — the daily counter divided nanoseconds by a millisecond constant

- **Date:** 2026-11-07
- **Found by:** the baseline experiment, not by review. Case `daily/second_10` asked for a spend that should be refused `per_day_exceeded`; the contract authorised it. (This is the argument for submission #2 in one line.)
- **Cause:** `env::block_timestamp()` is nanoseconds — `near_sdk::env` ships `block_timestamp_ms()` precisely because this is easy to get wrong. `DAY_MS = 86_400_000` was divided into it, so `day_index` advanced every **86.4 ms** and `roll_day` reset `spent_day` between blocks. `per_day` and `per_counterparty_day` therefore never bound across transactions.
- **Proof:** `day_index 20764932355 × 86_400_000 = 1 794 090 155 472 000 000`, which reads as `2026-11-07T22:22:35Z` only when treated as nanoseconds; and the counter moved ~195 between two calls seconds apart (195 × 86.4 ms ≈ 17 s).
- **Fix:** `DAY_NS = 86_400_000_000_000`, used at both call sites (`create_mandate`, `spend`). Regression test `daily_ceiling_spans_blocks`: two spends one second apart, totalling more than `per_day`, must refuse the second. **28 tests pass.**
- **Redeploy:** `77th4RrA1DQQzxLVXQ6Ag2K6EnhHyqcBP3v47gXTLBVk` on `mandate-hackaton-7c1a.testnet`, code replaced without re-initialising, state preserved (12 mandates). The earlier demo runs are not rewritten; they used the old code and stay as history.
- **Why it matters:** submission #1 would have shipped a daily ceiling that never refused, which is the first claim a security judge tests. It also shows the two submissions are not the same product: one enforces, the other measures, and the measuring one found the defect.
- **Not claimed:** that the ceiling is now a rolling 24 hours. It is a UTC calendar day; a spend either side of 00:00 UTC can use the full cap twice. That gap is recorded as F-1 in `https://github.com/skyhighdesignsinc-sudo/baseline-near/blob/main/docs/FINDINGS.md` and is a fact about the policy language, not a bug.

## D-021 — 2026-11-13: the field saturated; freeze the code, ship the measurement

**Context.** Code freeze was 2026-11-11 and has passed; submission closes 2026-11-14
23:59 UTC. On 2026-11-13 a competition-scoped search (`UNIQUENESS-AUDIT.md` §4.2) found at
least twelve repositories in this event building contract-enforced agent spending:
allowlist, per-transaction cap, daily cap, approval queue, pause, function-call key — most
with a dashboard, several with a demo video, two created after 2026-11-05. Mandate's
mechanic is the default entry, not a differentiator.

**Options.** A: add differentiating features to Mandate (rejected — the features available
to add are the ones twelve teams already shipped, and there is no time to build something
new to production quality). B: merge the two submissions (forbidden, `AGENTS.md` §1).
C: freeze both codebases except defects, tests and docs, and lead each with its narrowest
true claim — Mandate with the two bindings, Baseline with the measurement (chosen).
D: withdraw Mandate (rejected — it is independently deployable and the rules allow two
disclosed projects).

**Choice.** C. Until the deadline the only code that changes is (a) a defect a test finds,
(b) a test, (c) documentation. No new product surface in either repo.

**Why.** The mechanic is a commodity in this field; the measurement is not. F-1 — a daily
ceiling 86.4 ms long, found by the matrix, fixed, redeployed and re-measured — is a defect
in the *standard* architecture. A judge can check every step on chain, and no competing
entry publishes anything comparable. Adding a thirteenth vault makes Mandate
indistinguishable; publishing the experiment makes Baseline the only entry that measures
the category it competes in.

**Consequence.** `make e2e` runs 24 tests (19 behavioural + 5 UAT journeys) and
`make thesis-e2e` exits 1 when the dataset, the JSON files and the prose quoting them
disagree. Both are evidence a screener can run, not polish.

**Revisit trigger.** If the AI screeners score Baseline below Mandate, or a judge asks for
a live product rather than a measurement, revisit before 2026-11-14 12:00 UTC.

**Addendum, same day, measured rather than sampled.** The public directory at
`GET /api/projects` reports 1043 submissions; 560 were collected before the page cap. Of
the first 480 with track data, 229 are in `security`. Thirty-nine names contain guard,
twelve leash, eleven vault; four entries are already called Mandate. The earlier figure of
twelve came from a GitHub search and understated the field by an order of magnitude. This
strengthens the choice rather than changing it: the rules allow two submissions per person
and both slots are in use, so a fifth Mandate could not be sent even if it were built.

## D-022 — 2026-11-13: the sponsor overrides the freeze for one audited gap

**Context.** D-021 froze the product surface. The sponsor then asked for a differential
audit of the comparable vaults and for what they do not have. The audit is
`UNIQUENESS-AUDIT.md` §4.4: eleven READMEs scored mechanically. Ten mechanisms are absent
or near-absent, and four of those are already ours.

**Options.** A: build nothing (rejected — the sponsor asked, and one gap is cheap and
verifiable). B: build every gap (rejected — passkey approval needs a WebAuthn verifier and
a new trust surface; the refusal corpus already exists as submission #2). C: build the one
gap that is protocol-level, testable, and absent in all eleven: revocation that deletes the
agent's key (chosen).

**Choice.** `revoke_key(id, key)`: suspends the mandate and issues a `DeleteKey` promise
against the contract's own account in the same receipt. One contract method, one unit test
that asserts the receipt action, one code-only redeploy.

**Why this one.** Pause is a policy flag that every competitor ships; key deletion changes
*where* the refusal happens (protocol, not contract), it is enforced by NEAR rather than by
our code, and a judge can verify it with `view_access_key`. It strengthens nothing we
already claim, so it cannot make an existing claim false.

**Cost paid.** Contract redeployed code-only (`Es4FLaVn…`, 535,386 bytes, 17 mandates
preserved), tests 28 → 29, claim C25 added, screener §9 added.

**What it does not claim.** The owner supplies the key; the contract cannot verify that it
belongs to the agent, so the claim is "this key can no longer sign for this account", not
"the agent has no other keys".

**Revisit trigger.** None before submission. If `view_access_key` still resolves after a
revoke on testnet, C25 is false and must be deleted, not softened.

## D-023 — 2026-11-13: do not merge the two submissions

**Question.** Can `mandate` and `baseline` be packaged as one submission, and would that
make the entry more unique?

**Rules.** `HACKATHON.md`: "one submission per project", `tracks[]` accepts several ids,
and "a project can enter several tracks and still counts as one submission". Q-015 allows
one person two projects only if they are independent and each README names the other.
Merging is therefore *permitted* as one multi-track project — but it is not a way to gain
entries, and it does not remove the independence requirement for the second repo.

**Decision.** Do not merge. Submit them as two entries, or submit `baseline` alone.

**Why.** (1) Merging does not add uniqueness: the vault half is still one of 229 `security`
entries with four same-named competitors (§4.2); the measurement is already the different
half. (2) It halves the number of surfaces judged — two entries can place in two tracks,
one merged entry competes once per track but presents as a single product. (3) The two have
different buyers: one prevents a bad spend, the other tells you whether prevention holds.
(4) `AGENTS.md` §1 forbids it, so a merge would need an explicit override and a rewrite of
both READMEs.

**What a merge would actually buy**, stated fairly: a security judge would see the evidence
surface attached to a working vault, which is a stronger single story than either half. The
cost is the second entry. If the sponsor prefers one strong story over two chances, that is
the trade, and it is theirs to make.

**Revisit trigger.** If one submission is rejected and cannot be corrected through
`/request-changes`, merging is the fallback rather than submitting a third project.

## D-024 — 2026-11-13: submission #1 becomes repositioned authority + a challenge window

**Question.** Can A (reposition `mandate` around measured runaway-spend complaints) and B (a
contestable payment rail) ship together as submission #1, with `baseline` as #2?

**Answer: yes.** A is copy and demo framing; B is a contract addition in the same repository.
One repo remains one submission, `mandate` stays in `security`/`agents`/`business`, and Q-015
disclosure to `baseline` is unchanged. No third repository is created.

**Why B is not "NEAR Business" (§6).** §6 forbids confidential multisig treasury, payroll,
escrowed invoicing and inheritance/dead-man-switch custody. B does none of those: it does not
hold a vendor's money, it does not invoice, and it has no beneficiary who inherits anything.
The funds are already the payer's, already held by the payer's own contract, and `settle`
today only records a foreign tx reference — no value leaves the contract on settlement. B adds
one thing: within a window measured in blocks, the payer can reverse an authorisation it has
already recorded, with a frozen reason code and an evidence hash, and the balance returns to
its own budget. The boundary is written here so it cannot drift in the judge-facing copy: **we
reverse our own ledger entry; we do not claw back a payment that has left the contract.**

**Cost that is real, and was not obvious before reading the code.** `Mandate.settled` is
`BTreeMap<String, String>`; B needs a settlement to know its amount, its block and whether it
was contested. Adding fields to a borsh-serialised struct means the 17 live mandates on
`mandate-hackaton-7c1a.testnet` no longer deserialize. Two honest paths:

1. `#[init(ignore_state)] migrate()` that reads the old layout and rewrites it — keeps the
   account, the console and every documented hash. **Chosen.**
2. Deploy to a fresh account — cheaper to write, but invalidates the account named in both
   READMEs, `SCREENER.md`, the demo video script and the evidence links. Rejected.

**Order of work, and what gets dropped if time runs out.** A first (two hours, no chain risk),
then the migration and contract for B (six to ten hours), then console surface, demo and video.
If B is not green by the buffer, A ships and B is recorded as unshipped — not half-deployed.
`baseline` receives no further work in this window; its coverage work is closed as of
`11873d9d899d`.

**What B may claim when it works, and nothing more.** A recorded authorisation can be
contested on chain within 100 blocks with one of four reason codes; the amount returns to the
mandate's balance; the contest, its reason and its evidence hash stay readable afterwards.
It may not claim a vendor was charged back, that funds left and returned, or that any dispute
was adjudicated by a third party.
