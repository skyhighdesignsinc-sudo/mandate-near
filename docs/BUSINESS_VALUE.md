# BUSINESS VALUE — Pledge & Mandate

> Written as an angel looking at a two-week artefact with a 24-month question: *what is this worth if it works, and what would make me say no?*
> Every number labelled **[assumption]** is an assumption, not data. Every number labelled **[source]** is linked in `UNIQUENESS-AUDIT.md`.

---

## 1. One-paragraph thesis

Crypto's collateral and its agents both fail the same way: to act, they must hand over a key they cannot bound. Bridges solve it by inventing a second asset; smart-wallet policies solve it one chain at a time. NEAR is the first stack where a contract can **hold native keys on 35+ chains, verify foreign state through the same quorum that signs, and settle against competing solver liquidity** — so the bound can be real and cross-chain at once. Pledge monetises the collateral side; Mandate monetises the authority side. The hackathon is a distribution event for both, not a business.

## 2. SWOT

### Pledge
| | |
|---|---|
| **Strengths** | Only flow where read + attest + sign + settle are one quorum; liquidation is a signature, not a keeper with a private key; Intents gives 35-chain liquidity without a lender BD cycle; a 45-second demo that cannot be faked. |
| **Weaknesses** | Testnet collateral, self-funded pool; no underwriting model; single-asset risk; needs a real lender or a vault to be a business; DeFi track is crowded. |
| **Opportunities** | RWA and BTC holders who refuse to bridge; treasury desks that want liquidity without selling; Intents volume rebates; the 0.15% Intents capture rate is a template for a fee line. |
| **Threats** | ICP ships the same product with Chain Fusion; Aave/Compound add cross-chain collateral via GMP; a solver outage breaks the demo; liquidation disputes invite regulation. |

### Mandate
| | |
|---|---|
| **Strengths** | Enforcement at the key, not the app; attestation bound to signature (nobody else does this); instant revocation; fits the organisers' own "give AI money without giving it the keys" framing. |
| **Weaknesses** | Spending limits alone are commodity (ERC-7715); requires an attested-inference dependency; enterprise sales are slow; value depends on agents actually holding money. |
| **Opportunities** | Agent payments passed 100M transfers on one chain in under a year [source: ePrint 2026/2176]; every agent framework needs this; compliance buyers have budget authority. |
| **Threats** | ERC-7715 + Safe modules close the gap on EVM; NEAR Business could add agent policies itself (most likely killer); a TEE finding dents the attestation story. |

## 3. Market sizing (bottom-up, deliberately small)

| Layer | Definition | Size | Basis |
|---|---|---|---|
| **TAM** | On-chain credit + agent payment infrastructure | large, unhelpful | — |
| **SAM** | Cross-chain borrowers holding ≥$50k native assets off their borrowing chain | ~$8–15B collateral **[assumption]** | BTC/ETH/SOL holders who refuse to bridge |
| **SOM** (Y3) | 0.05% of SAM routed through Pledge | $4–7M collateral, ~$1.5M revenue **[assumption]** | one design-partner lender + one vault |
| **Mandate SOM** (Y3) | 300 orgs × $6k ACV | ~$1.8M ARR **[assumption]** | mid-market agent deployments |

Framing rule: never quote a TAM above $100B for a testnet product. It reads as unserious to this specific panel (a16z, Dragonfly, Electric Capital all price bottom-up).

## 4. Unit economics

**Pledge** — origination 1.5% of principal + 10% of lender yield + 0.15% Intents rebate.
- Average loan $25,000, 45-day term, 1.5% origination = **$375 per loan**.
- Cost to serve ≈ $40 (RPC, MPC, compute, support) → **~89% gross margin [assumption]**.
- Break-even: ~110 loans/month covers 2 engineers at $180k fully loaded. Plausible by month 18, not month 6.

**Mandate** — $299/mo base (5 agents, $50k aggregate cap) + $0.02 per authorised spend + $1,500/mo enterprise (SSO, audit export).
- 300 orgs at blended $6k = **$1.8M ARR**, ~85% gross margin.
- Expansion is structural: caps and agent count grow with usage, not with seats.

## 5. Porter's five forces (condensed)

| Force | Pledge | Mandate |
|---|---|---|
| Rivalry | high (Aave, Morpho, ICP) | medium-high (Safe modules, 7715 vendors) |
| New entrants | medium — forking is cheap, liquidity is not | high — a policy engine is a weekend |
| Substitutes | bridges + wrapped assets (dominant, worse) | "just watch the agent" (human review) |
| Buyer power | medium (lenders want yield) | high (enterprise procurement) |
| Supplier power | high (MPC quorum, Intents solvers) | high (NEAR AI Cloud) |

Read: **both are supplier-dependent**. That is the honest risk, and it is also why an ecosystem-aligned investor (this panel) is the right first cheque — the suppliers are their portfolio.

## 6. Moat, ranked by durability

1. **Composition, not code** — a competitor must acquire read-verification + native multi-chain keys + solver liquidity simultaneously. Forking the repo gives none of it.
2. **Proof artefacts as trust** — every claim ships with a hash and an executed attack. Trust compounds with each audit.
3. **Data on failure modes** — the red-team corpus becomes the sales asset to compliance buyers.
4. **NOT the moat:** UI, the idea, the contract code, the demo video. All copyable in a week. Say so out loud; judges respect the honesty more than a fake moat.

## 7. Go-to-market (90 days post-hackathon)

| Week | Pledge | Mandate |
|---|---|---|
| 1–2 | 3 design-partner borrowers from NEAR ecosystem treasuries | 5 agent builders from the hackathon Discord |
| 3–4 | one vault/LP as liquidity partner; publish liquidation track record | publish the red-team corpus as a public benchmark |
| 5–8 | mainnet beta, one asset (SOL), $250k cap | paid pilot with one mid-market ops team |
| 9–12 | second asset (BTC); fee switch on | SOC2-lite evidence pack; enterprise tier |

Wedge: **one asset, one chain, one lender.** Every failed crypto lending launch tried three of each at once.

## 8. Three scenarios (Y3)

| | Bear | Base | Bull |
|---|---|---|---|
| Pledge collateral | $1M | $5M | $25M |
| Pledge revenue | $90k | $450k | $2.4M |
| Mandate orgs | 40 | 300 | 1,200 |
| Mandate ARR | $240k | $1.8M | $7.2M |
| Combined | **$330k** | **$2.25M** | **$9.6M** |
| Verdict | acqui-hire | seedable on traction | Series A candidate |

## 9. What would make me say no (as the angel)

1. **Two half-products.** If both repos are 70% working, I assume neither team can finish. One flawless repo beats two.
2. **Unfalsifiable security language.** One "unhackable" in a README and I stop reading.
3. **No named buyer in the room.** "Protocols" and "agents" are not buyers; a person with a budget is.
4. **Supplier dependency unacknowledged.** If the pitch does not name the MPC/Intents dependency, I assume the founder has not read their own stack.
5. **TAM inflation.** A $13T slide for a testnet demo ends the meeting.

## 10. Scorecard vs the incumbent pitch book (for the sponsor's decision)

| Dimension | Pitch book (SafePassage + PoE) | This plan (Pledge + Mandate) |
|---|---|---|
| Legal exposure | high (estates, escrow, lending licences) | medium (lending only) |
| Buyer exists today | weak (the customer is dead / whitehats) | strong (treasuries, agent operators) |
| Demo unfakeable | partly (scripted heartbeat) | yes (refusal + cross-chain seizure) |
| Build risk | high (anvil in a TEE) | medium (quorum reads, fixtures) |
| Collides with NEAR Business | yes, fatally | no (adjacent by design) |
| Investor legibility | "portfolio bet" (red flag) | two products, one thesis |
| Reuses house primitives | yes | yes, plus Read MPC (unclaimed) |

## 11. Investor memo (one page)

> **Ask:** $500–750k pre-seed SAFE into a single entity, post-judging, milestone-gated.
> **Why now:** Chain Signatures moved fully into TDX on 23 Oct 2026; Read MPC shipped alongside it; Intents did $35B+ with $52M+ in fees. The stack became sufficient in the last 30 days.
> **What we prove in 14 days:** a loan collateralised by an asset the borrower never moved, liquidated by signature; and an agent whose spending authority cannot be exceeded, with an attested reason for every payment.
> **Use of funds:** 60% engineering (2 FTE, 9 months), 15% audits, 15% design partners, 10% legal.
> **18-month milestones:** $5M collateral originated with zero bridge incidents; 50 paying mandate orgs; one audited attestation pipeline.
> **Risk we disclose first:** we depend on NEAR's MPC quorum and Intents solvers. We chose that dependency deliberately: it is the only way to make the claim true.

## 12. Hackathon economics (reality check)

Prize pool is $250k across 13 tracks ($15k per track, $55k grand). Expected value of two submissions is low five figures at best; the real return is the demo reel, the judge relationships and the repo a fund can inspect. Treat prize money as runway, never as revenue. **[source: nearhackathon.com/HACKATHON.md]**
