# USER STORIES — Pledge & Mandate

> Format: `As a <persona>, I want <capability>, so that <outcome>.` Each has Gherkin acceptance criteria and a demo act it belongs to.
> Priority: **M**ust / **S**hould / **C**ould (MoSCoW). Anything marked `C` is cut at G5 (11 Nov) without discussion.

---

## 1. Personas

| ID | Persona | Context | What convinces them |
|---|---|---|---|
| **P1** | **Dana, treasury operator** (small company, 8 people, paid in USDC across 3 chains) | Holds SOL and ETH, doesn't want to bridge or sell to cover a 30-day gap | "I borrowed without moving my assets, and I can see exactly why I'd be liquidated." |
| **P2** | **Ravi, agent operator** (builds a procurement agent for a mid-size company) | His agent holds real money and he cannot audit what it decided | "If the agent goes rogue, the key can't spend, and I can prove what it was thinking." |
| **P3** | **Nadia, risk & compliance** (big company, signs off on autonomous spend) | Needs a kill switch and an audit trail before approving any agent with money | "One transaction makes it harmless, and every spend carries an attested reason." |
| **P4** | **Judge / auditor** (a16z, Dragonfly, Helion-adjacent) | Has 6 minutes and a hostile instinct for unverifiable claims | "Every claim has a hash I can click." |
| **P5** | **Agent (untrusted software)** | May be prompt-injected or compromised at any time | *Not a user to satisfy — an adversary to bound.* |

---

## 2. Pledge — cross-chain credit

### E1 Collateral that stays put (P1) — **M**
- **US-1.1 (M)** As Dana, I want to post SOL as collateral **without bridging or selling it**, so that I keep my position while covering a short-term gap.
  - *Given* I have 100 SOL on devnet, *when* I open a loan with `ltv=6000`, *then* I am shown a deposit address the contract derives, and *the UI states no human holds its key*.
- **US-1.2 (M)** As Dana, I want the deposit **verified by three independent sources**, so that a single lying RPC cannot fake my collateral.
  - *Given* a deposit tx, *when* I call `record_deposit`, *then* the proof shows `rpc_hashes[3]` with 3/3 agreement, and a 2/3 case is rejected with `quorum_failed`.
- **US-1.3 (S)** As Dana, I want to top up collateral, so that I can rescue a position before liquidation.
  - *Given* health 0.68, *when* I top up 20 SOL, *then* health recomputes and the `pending_liquidation` warning clears.

### E2 Borrow and repay (P1) — **M**
- **US-2.1 (M)** As Dana, I want to borrow USDC against that collateral at a stated LTV, so that I have liquidity today.
  - *Given* verified collateral of 100 SOL at price P, *when* I borrow, *then* the amount is capped at `collateral_value × ltv − outstanding` and the tx reverts above it.
- **US-2.2 (S)** As Dana, I want to repay from **any chain**, so that I don't have to bridge my own repayment.
  - *Given* USDC on Base, *when* I repay via an Intents quote, *then* the loan balance drops and the receipt shows the solver and the settled amount.

### E3 Honest liquidation (P1, P3) — **M**
- **US-3.1 (M)** As Dana, I want liquidation to be **automatic and provable**, so that I know the rules are not discretionary.
  - *Given* health < 0.65 and a price fresher than `max_price_age`, *when* anyone calls `liquidate`, *then* exactly the required SOL is signed away to the lender and `Seized{tx}` is emitted.
- **US-3.2 (M)** As Nadia, I want liquidation **blocked on stale price**, so that a dead oracle cannot take a healthy position.
  - *Given* a price older than the limit, *when* `liquidate` is called, *then* it fails with `price_stale` and nothing moves.
- **US-3.3 (S)** As Dana, I want to see the **exact seizure transaction on the foreign explorer**, so that I can verify it without trusting the app.
  - *Given* a completed liquidation, *then* the console links the Solana signature and the NEAR tx that caused it, side by side.

### E4 Safety of the pool (P1, P4) — **S**
- **US-4.1 (S)** As a lender, I want a hard cap per collateral asset, so that one asset's crash cannot empty the pool.
- **US-4.2 (C)** As Dana, I want a liquidation preview ("at what price do I get liquidated?"), so that I can manage the position.

---

## 3. Mandate — agent authority

### E5 Bounded authority (P2, P3) — **M**
- **US-5.1 (M)** As Ravi, I want my agent to receive **only** a key that can call `spend`, so that a compromised agent cannot move funds by any other route.
  - *Given* a mandate, *when* the agent attempts a direct transfer, *then* no key grants it and the attempt fails at the protocol level (not in app code).
- **US-5.2 (M)** As Ravi, I want the mandate to have a **budget per chain**, so that a runaway loop cannot drain one chain.
  - *Given* a 1200 USDC Base budget, *when* cumulative Base spend reaches 1200, *then* the next spend fails `budget_exhausted` even if `per_tx` allows it.
- **US-5.3 (M)** As Ravi, I want a **vendor allowlist**, so that the agent can only pay parties I named.
  - *Given* allowlist [Acme], *when* the agent pays `evil.eth`, *then* it fails `counterparty_not_allowed` and the refusal is recorded on-chain.

### E6 Attested reason (P3, P4) — **M**
- **US-6.1 (M)** As Nadia, I want the spend to require an **attested decision hash**, so that no payment exists without a recorded reason produced by pinned code.
  - *Given* a spend with `decision_hash`, *when* the hash does not match the attestation, *then* it fails `attestation_mismatch`.
- **US-6.2 (S)** As Nadia, I want to **verify the attestation in my browser**, so that I don't have to trust the console.
  - *Given* a proof id, *when* I open `/verify/:id`, *then* the page recomputes and shows `quote valid` or the specific mismatch.
- **US-6.3 (S)** As Ravi, I want the raw prompt **never stored**, so that my prompts and customer data stay private.
  - *Given* any spend, *then* the on-chain record contains only hashes and amounts; `grep` of the DB for prompt text returns nothing.

### E7 Control (P3) — **M**
- **US-7.1 (M)** As Nadia, I want a **one-transaction kill switch**, so that I can neutralise an agent in seconds.
  - *Given* an active mandate, *when* I call `revoke_key`, *then* the next agent call fails with `access_key_missing` and funds are untouched.
- **US-7.2 (S)** As Nadia, I want **escalation for over-cap requests**, so that the agent isn't useless for legitimate large purchases.
  - *Given* a request above `escalate_over`, *when* it is created, *then* it sits `pending`; approval executes it, rejection leaves a reason on-chain.
- **US-7.3 (C)** As Ravi, I want to run **two agents under one mandate with separate caps**, so that I can A/B a cheap and an expensive model.

### E8 Proof of the claims (P4) — **M**
- **US-8.1 (M)** As a judge, I want a **red-team panel** that runs real attacks, so that I can see the failure modes instead of reading about them.
  - *Given* the panel, *when* I run all 9 attacks, *then* each returns BLOCKED with a tx hash, and no attack succeeds.
- **US-8.2 (S)** As a judge, I want a **deterministic replay**, so that my run matches the video.
  - *Given* `DEMO_SEED=42`, *when* I run `make demo` twice, *then* the state sequence is identical.

---

## 4. Trade-offs decided (do not reopen)

| Decision | Why |
|---|---|
| No human approval inside yield/resume | the window is ~200 blocks; a human takes longer, and a timeout would corrupt state. Approval is its own on-chain flow. |
| Budget = balance, not a comparison | ePrint 2026/2176 proves comparison-gating is bypassable. |
| Fixtures before live networks in `make demo` | a demo that dies when Solana devnet hiccups is not a demo. |
| Refusals are first-class UI states | the refusal *is* the product; it must look deliberate, not like a bug. |
| No "trustless"/"unhackable" anywhere | falsifiable in one search; costs more credibility than it buys. |

## 5. Traceability

| Epic | Demo act | WBS (see `PM-PACK/10-wbs.md`) | Gate |
|---|---|---|---|
| E1, E2 | Pledge acts 1–2 | WP-4.1–4.4 | G4 (09 Nov) |
| E3 | Pledge act 3 | WP-4.5 | G4 |
| E5, E6 | Mandate acts 1–2 | WP-3.2–3.4 | G3 (06 Nov) |
| E7 | Mandate act 4 | WP-3.5 | G4 |
| E8 | both | WP-5.1 | G5 (11 Nov) |
