# UNIQUENESS AUDIT — can these be built elsewhere?

> Method: for each product, list the mechanisms it *requires*, then ask who else ships each mechanism today. Sources linked. Verdict per mechanism: **Exclusive / Near-exclusive / Commodity**.
> This doc exists because the sponsor asked a binary question — "are these unique to NEAR, or can they be built elsewhere?" The honest answer was **no, not as originally framed**, and that changed the products.

---

## 1. Verdict up front

| Product | Original uniqueness claim | Test result | Surviving claim |
|---|---|---|---|
| Pledge | "only NEAR can hold native cross-chain collateral" | ❌ **FALSE** — ICP documents the exact product | "no oracle, no bridge, no wrapped asset, and 35-chain solver liquidity in one flow" |
| Mandate | "only NEAR can scope agent spending" | ❌ **FALSE** — ERC-7715/4337 session keys do this | "the only stack that binds a TEE attestation to a foreign-chain threshold signature, so the *reason* is enforced, not just logged" |

Neither product is out of reach elsewhere. Both are **hard to reproduce without NEAR**, for reasons given below — and the READMEs are written against the surviving claims, not the original ones.

---

## 2. Mechanism differential

| Mechanism | NEAR | ICP | EVM (4337/7715) | Solana |
|---|---|---|---|---|
| Native key control on foreign chains | Chain Signatures, **11-of-17**, all ops in Intel TDX since **2026-10-23**, verifiable on-chain | threshold ECDSA/EdDSA (BTC/ETH/SOL) | none native — third-party MPC only | none |
| Verify a foreign-chain fact without bridge/oracle | **Read MPC**: signing quorum requires a whitelisted **3-of-5 RPC quorum** before signing | HTTPS outcalls (not quorum-verified by the signers) | oracles / bridges | oracles |
| Competing-solver any-chain settlement | **NEAR Intents**, 35+ chains, **$35B+** all-time, >$52M fees | none | CoW Protocol (EVM-wide only) | none |
| Private execution in the settlement path | **Confidential Intents** (confidential shard, no MEV) | vetKeys (encryption, not settlement privacy) | FHE/TEE vendors, separate from liquidity | none |
| Attested AI inference bound to a money movement | **NEAR AI Cloud** (TDX, serves Brave Leo) | vetKeys only | none first-party | none |
| Native scoped key (contract + method + allowance) | **FunctionCall access keys** | none (canister-level control) | 4337 session-key modules | none |

**Read:** every row is matched by someone. Only the *composition* is unclaimed.

Sources: `near.org/blog/chain-signatures-tee` (2026-10-23); `near.org/blog/introducing-near-business` (2026-10-20); IACR ePrint **2026/2176**; `docs.internetcomputer.org/concepts/chain-fusion` ("a lending protocol that accepts Bitcoin as collateral (held in a canister-controlled BTC address)"); ECO/ERC-7715 explainer (2026-09-17); Alchemy 4337 overview (2026-10-19).

---

## 3. Pledge — why the claim shrank

**Killed claim:** "cross-chain collateral is only possible on NEAR."
ICP's own developer docs describe a canister-controlled BTC address as loan collateral issuing stablecoins, and an Encode Club programme explicitly teaches "multichain lending protocols where collateral can be Bitcoin, ETH, or SOL." Building Pledge on ICP is a weekend.

**What ICP cannot do, and why it matters commercially:** there is no solver layer competing to fund the loan. A lender on ICP must bring its own capital and its own market makers. Pledge's liquidity is Intents: solvers already move $4B+/month across 35 chains and will fill a quote if it pays. That is a distribution advantage, not a cryptographic one — which is exactly the kind of advantage that survives a judge's question, because it cannot be copied by forking the repo.

**Second differentiator:** Read MPC bundles *verified foreign state* into the *same quorum that signs*. ICP's HTTPS outcalls are a separate trust surface from its threshold signers. So ICP's liquidation depends on an outcall the signers do not attest; Pledge's does not.

**Allowed sentences:** "no oracle committee, no bridge, no wrapped asset; the read is quorum-verified by the same network that signs."
**Forbidden:** "only possible on NEAR", "trustless cross-chain credit".

---

## 4. Mandate — why the claim shrank

**Killed claim:** "only NEAR can bound an agent's spending."
ERC-7715 session keys (Sept 2026 coverage) already grant "a spend cap, allowed contracts, expiry" to an agent; every major smart-wallet vendor ships it. The spending-limit half of Mandate is a commodity, and a judge from a16z will say so in one sentence.

**What nobody else ships:** a signature that **cannot exist** unless a TEE attestation over the agent's decision matches the hash the contract is about to execute. On EVM the policy module checks *parameters*; it has no idea what the model decided. On NEAR the attested inference and the threshold signature are in the same request path, so `spend()` can require `decision_hash == attested_hash`, and a compromised agent cannot launder an unexplained payment through an allowed vendor.

**Second differentiator (weaker, state honestly):** one authority object that signs natively on BTC/SOL/Base. EVM needs a separate smart account and module per chain; a cross-chain mandate there is N policies that can drift.

**Allowed sentences:** "the enforcement point is the key, not the agent's code", "the reason for the spend is attested and bound to the signature".
**Forbidden:** "agents can't be hacked", "unhackable", "zero trust".

---

### 4.1 Mandate, re-checked 2026-11-07

The §4 verdict above was written on 2026-11-05. Re-running the §1 test eight days later,
the spending-enforcement half has moved from "commodity in principle" to "shipped, twice,
on NEAR":

| Product | What it already does | Where |
|---|---|---|
| [NEAR Intents Agent API](https://docs.agentsonintents.com/integration/agent-api/overview) | owner-signed rules (actions, assets, limits, destinations, USD budget, delays, time windows, emergency stop), attested TEE execution with a per-execution proof, typed refusals (`policy_action_denied`, `wallet_frozen`), policy `revision` + `policy_hash` | NEAR, house product |
| [Probarion](https://github.com/probarion/probarion) | owner-signed mandates in a NEAR contract, vault per owner, per-payment and total caps, payee allowlist, expiry, escalation threshold, signed hash-chained ledger anchored on the vault, attestation report bound by nonce | NEAR contract |
| [OutLayer](https://app.outlayer.ai/docs/agent-custody) | TEE custody, encrypted on-chain policy, per-tx / hourly / daily / monthly caps, approver-signed operations, on-chain freeze | NEAR + Intents |
| [Privy agent wallets](https://docs.privy.io/wallets/overview/solutions/agent-wallets) | policy engine: token/chain restrictions, per-tx and time-window caps, recipient allowlists, revocation | multi-chain wallets |
| [Kaspa agent-budget covenant](https://github.com/gordonmurray-coding/kaspa-covenants) | rolling budget, per-spend cap, destination allowlist, value conservation, owner recovery — enforced by consensus | Kaspa testnet |
| [zkmandate](https://libraries.io/npm/zkmandate) | caps, payee allowlist and expiry as a Poseidon2 commitment; escrow releases only on a Noir proof that the payment fits the hidden terms | npm / EVM escrow |
| AESP ([arXiv 2603.00318](https://arxiv.org/html/2603.00318v1)) | eight ordered policy checks, human review, privacy-preserving settlement | paper + tests |

**What this kills.** C4 ("the key cannot transfer"), C6 ("revoke makes the agent inert"),
C7 ("budget is a funded balance") and the general "scoped agent spending" headline are
not differentiators in November 2026 — the first three are shipped by the house, and the
fourth by six others. **Do not lead with them**, and do not describe the field as
"guards that run inside the agent's process": that sentence is now false in three places.

**What survives, narrowly.**

1. **Decision binding (C5).** The contract refuses a spend whose `decision_hash` does not
   match what the attestor recorded, even when every policy rule passes. Probarion binds
   an attestation report to a ledger *position*; the Intents Agent API attests the
   *execution*; neither refuses a policy-compliant payment because its stated reason
   differs from the attested one. This is the one mechanism claim left.
2. **Policy-revision binding (C15).** After `update_policy`, a decision taken under the
   previous revision is refused `policy_changed` rather than executed under new limits.
   The Intents API carries a `revision` for updates; refusing an in-flight decision on a
   stale revision is the part we could not find elsewhere.
3. **The evidence surface (C12, C13, C16, C22, C23, C24).** Every refusal code printed by
   the console is asserted by a contract test, re-derivable from a public snapshot, and two
   of them are real failed transactions against `mandate-hackaton-7c1a.testnet`. The repo
   also states what it does **not** verify (C24: the contract compares a hash, it does not
   check the attestation's signature). Of the seven products above, none publishes a
   re-runnable refusal corpus, and only one publishes that limitation.

**What was never built.** The §4 sentence about binding attestation to a *foreign-chain
threshold signature* describes the Pledge/Bond flow. Mandate's contract makes no
Chain Signatures or Read MPC call (`settle` stores a reference the attestor supplies).
Claims C1–C3 and C9 are retired in `CLAIMS.md` §1.1 for that reason.

**Consequence for copy:** the lead sentence is now "every refusal is a public, re-runnable
artefact, and a decision is bound to the policy revision it was made under" — not "the
agent's budget is enforced by the key".

### 4.2 The field, re-checked 2026-11-13 — the competitors are in this hackathon

§4.1 asked whether the product exists elsewhere. On 2026-11-13 the sharper question was
asked: does it exist **in this competition**?

The public directory at `GET https://nearhackathon.com/api/projects` reports **1043
submissions**. It pages eight at a time; **560 were collected** before the page cap, and
that sample is enough to stop guessing:

| Measurement (of the 560 collected) | Count |
|---|---|
| Track `security` (of the first 480 with track data) | **229** |
| Track `thesis` | 45 |
| Names containing `guard` | 39 |
| Names containing `leash` | 12 |
| Names containing `vault` | 11 |
| Names containing `spend` | 7 |
| Projects literally named **Mandate** (plus one "Mandate: Fireable Agent Wallet") | **4** |
| Names matching the spending-policy vocabulary | **74** |

A GitHub search separately returned repositories building the same mechanic, several
created inside the hackathon window (2026-11-01 → 11-14). Their own READMEs describe:

| Repository | The same mechanism, in their words | What they add |
|---|---|---|
| `Cubiczan/near-aegis-vault` | per-tx cap, velocity limit, vendor allowlist, kill switch | duplicate-invoice rule, CFO-facing explainer, Vercel dashboard, video |
| `0xNexuz/agentshield` | owner-signed **mandate**, allowlist, per-payment/day/total caps, expiry, MCP tool | rechecks its own transactions against public RPC in the browser |
| `Bronxydrone/Veto` | per-tx, daily and 30-day caps, allow/deny lists, approval threshold | policy-as-data, hash-chained audit, reason codes |
| `talibot-agent/leash`, `mesh-pch/leash-near`, `BeautyBenedict/leash` | per-tx + daily cap, allowlist, approval queue, pause | function-call key scope, NEP-141 caps, events |
| `aselolee99/agent-vault` | daily limit, approval threshold, allowlist | attack-blocked demo script |
| `ritesh59697/allowance-ai` | per-payment + rolling 24 h cap, payee allowlist | Face ID approval, X demo video |
| `thesithunyein/kyrona` | allowlist, per-payment + daily cap, lock | deployed on mainnet |
| `hahahahahahahahah6/near-agent-guard` | caps, allowlist, signed intents | offline prototype |
| `0xileri/SpactVault`, `CEOClaw/agent-economy-near` | same family | submission scaffolds |

**Verdict.** "A contract holds the funds, a scoped key can only ask it to pay, and the
contract enforces cap + allowlist + approval + pause" is not a differentiator in this
competition. It is the default entry: roughly half of the sampled field is in the
`security` track, a fourth of the sample uses the same vocabulary in its *name*, and four
entries are already called **Mandate**. Several include a dashboard and a video that this
repository does not have yet.

**What this does not change.** The surviving claims in §4.1 stand — decision-hash binding
(C5), policy-revision binding (C15) and the evidence surface are still the narrowest and
least-copied sentences we have. But they are **narrow**, and a judge only sees them by
reading the refusal corpus, not by looking at the page.

**What it changes.** No new features go into Mandate. The spend the field does not make
is **measurement**: not one of the twelve publishes a re-runnable matrix over its own
policy surface, and none publishes a defect found in the standard architecture. That is
submission #2's entire reason to exist, and F-1 (a daily ceiling 86.4 ms long, found by the
matrix, fixed and re-measured on chain) is the one artefact here that a competing team
cannot produce by writing more of the same contract.

**Consequence for copy.** Mandate's README must not open with "an agent gets a budget and
an allowlist". It opens with the two bindings and the evidence, and concedes the field —
which §4.1 already requires.

### 4.4 What the comparable vaults do not have — README audit, 2026-11-13

Eleven READMEs fetched and scored mechanically (`.tools/audit-clones.mjs`; the matrix is
cached at `.tools/clone-matrix.json`). Presence means the README claims the mechanism, not
that the code is good.

| Mechanism | Entries claiming it (of 11) |
|---|---|
| function-call key scoping | 11 |
| approval queue / escalation | 11 |
| daily or rolling cap | 10 |
| allowlist | 9 |
| events | 8 |
| NEP-141 / per-token limits | 8 |
| deterministic replay | 8 |
| pause / freeze | 7 |
| cross-chain | 7 |
| video demo | 7 |
| hosted dashboard | 6 |
| per-tx cap | 5 |
| attestation (TEE) | 5 |
| expiry | 5 |
| per-counterparty cap | 3 |
| MCP server | 3 |
| hash-chained ledger | 3 |
| e2e / Playwright | 3 |
| risk scoring | 3 |
| **policy revision binding** | **2** |
| **decision-hash binding** | **1** |
| **experiment / refusal corpus** | **2** |
| **passkey approval** | **1** |
| **HTTP API** | **1** |
| **delete the agent key on revoke** | **0** |

**Ten mechanisms are absent or near-absent.** Four matter, and only one is worth building
now:

1. **Revoking removes the key (0 of 11).** Every vault documents pause, freeze or suspend;
   none deletes the key. Pause is a policy flag: the key still reaches the contract and is
   refused there. `DeleteKey` moves the refusal to the protocol, which is a different and
   stronger statement — and NEAR makes it a one-action promise. **Built 2026-11-13**
   (`revoke_key`, C25, D-022).
2. **Refusal corpus (2 of 11).** Already ours: that is submission #2.
3. **Decision-hash binding (1 of 11).** Already ours (C5); the single hit is Veto's
   hash-chained audit, which chains records rather than binding a decision to a payment.
4. **HTTP API (1 of 11).** Already ours (`tools/api-server.mjs`, scoped bearer keys).

Passkey approval (1 of 11) is the only attractive gap deliberately *not* built: it needs a
WebAuthn verifier on chain or a relayer, which is a day of work and a new trust surface,
and it weakens nothing we claim.

### 4.7 Full-field census, 2026-11-13 (all 1,098 entries)

Method: `GET /api/projects` paged 138 times (the API fixes `pageSize` at 8) until every
record was collected → `.tools/projects-all.json`. The endpoint exposes only `id`,
`project_name`, `tracks` and `demo_url` — **no description** — so every count below is a
count of *names*, and "absent" means "no name says it". That is a weaker test than reading
1,098 READMEs, and it is stated rather than glossed.

**Tracks across the whole field:** security 495 · agents 465 · open 257 · realworld 250 ·
privacy 219 · business 193 · defi 185 · swarms 127 · social 117 · games 111 · nfts 110 ·
memecoins 86 · thesis 71.

| Overlap | Entries |
|---|---|
| `security` ∧ `agents` | **299** |
| `security` names using vault/guard/limit/budget vocabulary | **146 of 495** |
| `thesis` | **71** |
| `thesis` ∧ `security` | **8** |

Submission #1 sits inside 299 same-shaped entries, 146 of which use its own vocabulary.
Submission #2 sits in an 8-entry overlap. That is the whole case for which one is the
duplicate, in four numbers.

**Mechanisms with no name in the field** (name search over all 1,098): scheduled or
recurring authority (0), dispute or arbitration (0), shadow/fork/sandbox execution (0),
diff or drift detection (0), refusal ledger or record of denials (0).

**Mechanisms I expected to be free, and were not — each checked against a README:**

| Idea | Verdict |
|---|---|
| Authority that expires by itself | **Taken.** `mesh-pch/leash-near`: per-key `expires_at` in nanoseconds (`0 = never`) plus a `paused` kill switch. |
| Pre-flight typed refusal | **Taken.** `0xNexuz/agentshield` `agentshield_check_payment` (ALLOW/WARN/BLOCK, read-only). |
| Insurance for agents | **Taken, 3 entries** (`AgSurance`, `CoveredMarket`, `Agent Undercover`). |
| Escrow with conditions | **Taken, 3 entries**; milestones 6. |
| A budget with a ceiling | **Taken, 9 names**; the vocabulary of 146. |

**What actually survives** as unclaimed and buildable on what already works: a **policy diff
over real history** — replay the payments an agent has already made through a *proposed*
policy and show which ones would now be refused, before the rule change ships. No new trust
surface, no second contract, and it answers a question no entry in 1,098 names poses: not
"will this payment pass?" but "what would my rule change have done to last month?".

### 4.6 Pre-flight dry runs are already shipped — the Refusal Gym is not new

On 2026-11-13 the idea of a "Refusal Gym" was proposed in this conversation: a pre-flight
service where an agent submits an intent and gets the typed refusal before money moves.
It was described as something nobody offers. **That was wrong, and this section is the
correction.**

| Evidence | What it shows |
|---|---|
| `0xNexuz/agentshield` README: `agentshield_check_payment` "Dry-runs a payment: the vault's rules plus the counterparty check. Returns `ALLOW`, `WARN` or `BLOCK` with reasons. Read-only." | The pre-flight half, as an MCP tool, is shipped. |
| The same README: "Vault preflight: the same rules as the contract, read from the live mandate." | It reads the live mandate, not a fixed fixture. |
| The submission directory contains a project named **Private Preflight** | Even the vocabulary is taken. |

**What is left unclaimed**, and it is not a new product: a **cross-implementation**
conformance suite (does *your* vault refuse the same nine cases?) and a **public record of
refusals**. A per-vault dry run answers "would this payment pass?"; nobody answers "which
of the field's implementations actually refuse what they say". That is submission #2's
subject, so the honest move is to deepen `baseline` (F-2 coverage) rather than open a third
repository that would repeat one shipped feature and one existing product.

**Consequence.** No Refusal Gym. The idea is recorded here so it is not re-proposed as
novel in the submission copy.

### 4.3 Submission #2's field, re-checked 2026-11-13

The security side is crowded (§4.2). The thesis side is thinner, but it is not empty:

| Entry | What it publishes | Overlap with baseline |
|---|---|---|
| `semilla1lab/semilla1-near-thesis` | `run_all.sh` regenerates every figure into `data/findings.json`; `THESIS.md` names the metrics that would kill the thesis; a short-window noise study | The **pattern** — re-runnable, falsifiable, regenerated numbers — is the same. The subject is network activity and Intents fees. |
| `bomanaps/-near-intents-thesis` | a Hugging Face dataset of ~223k decoded `intents.near` events, refreshed every 25 minutes | Data publication, not enforcement measurement. |

**Verdict.** Baseline is not duplicated. "Re-runnable evidence" as a *style* is claimed by at
least one thesis entry, so it is not the differentiator; the differentiator is the **subject**:
nobody in either track measures whether the spending policy that twelve security entries
shipped actually refuses, and nobody publishes a defect found that way. Two consequences:

1. Baseline's copy must say "we measured the enforcement the rest of this track ships", not
   "we are the first re-runnable NEAR thesis" — the second is false.
2. The matrix's coverage gap (F-2: 7 of 17 refusal codes) matters more than its length. A
   thesis entry wins on evidence, and an incomplete refusal surface is the first thing a
   judge who reads `FINDINGS.md` will notice.

---

## 5. The design trap we avoided

IACR ePrint 2026/2176 (*Budgeted Threshold Signatures*, received 2026-09-23) proves that gating a threshold signature on a passively-secure MPC comparison admits a **deterministic bypass**: for linear gate-in-combination protocols, "every member signs over-budget transactions with probability one." The natural implementation of an agent budget — enclave compares amount to limit, then signs — is therefore unsound.

**Our design:** a mandate is a funded derived address per chain. Budget is a **balance**, not a comparison. Policy is enforced by the contract on a request the agent is structurally unable to replace. This is cheaper to build, correct by construction, and lets us cite the paper in the README — which almost no other team will do.

---

## 6. Alternatives considered and rejected

| # | Idea | Uniqueness | Why rejected |
|---|---|---|---|
| A | **Bond** — attested SLA/performance bonds, auto-payout on proven failure | ~~high~~ → **low (revised 2026-11-07, see §6.1)** | Runner-up on build risk, not on uniqueness. Held as the **Nov 3 swap** if Mandate's attestation binding proves flaky. |
| B | Sealed-bid cross-chain launchpad | low | CoW Protocol already runs uniform-price batch auctions; memecoin track is crowded and disliked by this panel. |
| C | Private OTC / private orderflow | low | On Illia's public "others will build this" list. Instant disqualification in the room. |
| D | Cross-chain fact oracle as a product | medium | Pure infrastructure, no user, no revenue story in 14 days. |
| E | Confidential underwriting for RWA lenders | medium | Needs a licensed counterparty; unbuildable as a demo. |
| F | Crypto inheritance / dead-man switch | none | NEAR Business ships treasury continuity; the buyer is dead by construction. |
| G | Verified-eligibility aid disbursement | medium | Procurement cycle makes it a poor venture bet; kept as a `realworld` pitch only. |

### 6.1 Bond, revised — the same test that killed Pledge kills it too

Re-checked 2026-11-07 with the method in §1 ("who else ships each required mechanism?").
Stake-money-against-verified-work is not unclaimed; it is a crowded category, and one
entrant is on NEAR and run by the house:

| Product | Where | State |
|---|---|---|
| [NEAR AI Agent Market](https://near.ai/near-ai-agent-market-terms-of-service) | NEAR | escrow on bid acceptance, `Verification Hash` per deliverable, 5% dispute deposit, automated/human `Resolver` ruling on escrowed funds, reputation system |
| [Covenant](https://www.covenantagents.com/) | Base | "surety bonds for autonomous agents"; agent locks USDC, acceptance test hashed before work, bond paid to client on failure; 14 contracts, claims bytecode matched to an audited commit |
| [AgentBond](https://agentbond.online/) | Solana | bonded agents, verifier panel, slashing, reserve + burn; live programme state |
| [Escrix](https://github.com/EscrixInc/escrix) | Base | escrow + deterministic task verification; "fail → refunded to A, bond slashed" |
| [CallGuard](https://arcsla.vercel.app/app) | Arc | on-chain SLA marketplace: per-call escrow, provider stake, signed receipts, slash on breach |
| [x402 Hub](https://docs.x402hub.ai/docs/intro) | — | stake-to-claim runs, timeout slash, trust ladder, recurring runs |
| [BlindOracle](https://craigmbrown.com/blindoracle/agents) | Base | slashable bond per tier, typed proof-of-delivery, ESCROW |

**Verdict.** "Escrow plus a slash on a failed acceptance test" is a commodity in 2026;
four of the seven are live on a mainnet or devnet. Bond's surviving wedge would have to
be the two things the list above does not do — **the payout lands on the client's own
chain**, and **the SLA verdict is a quorum-verified read rather than a resolver's
opinion** — which is exactly the Chain Signatures + Read MPC dependency whose
availability is still open at `PENDING-HUMAN.md` H-7.

**So:** do not present Bond as the low-risk alternative to Pledge. It is the same
signing dependency with a fraction of the differentiation. Any Bond submission must
lead with the cross-chain payout and the quorum verdict, and must never claim novelty
in the bond itself. The open record for submission #2 is `DECISIONS.md` D-011; whatever
is chosen there supersedes §6 row A and this note.

---

## 7. Decision

**Build Pledge + Mandate**, against the surviving claims in §3 and §4.

- Gate G2 (2026-11-03): if `decision_hash == attested_hash` cannot be enforced end-to-end, swap Mandate → **Bond (A)**. That swap is pre-approved; do not re-litigate it at 23:00 on 13 Nov.
- Every claim in either README must be traceable to a row in this document. If a claim is not in here, it does not go in the README.

*(Status: 🔵 live document — amended at each gate, see `../PM-PACK/16-project-review.md`.)*
