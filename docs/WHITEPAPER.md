# Mandate — attested, revisioned spending authority for autonomous agents

**Working title.** The name is contested: at least four other agent-authority
projects use "Mandate" (`docs.mandate.md`, `mandate.help`, `runmandate.xyz`,
`mandate-agent.com`). Decision D-015 records the collision and
`docs/PENDING-HUMAN.md` H-10 asks the sponsor to pick a new name before the repo
goes public. Nothing in this document depends on the name.

**Status: testnet prototype, not deployed.** One Rust contract, one static
console, one deterministic replay. No mainnet funds, no audit, no custody.
Section 9 lists exactly what is implemented and what is not.

---

## 1. Abstract

An autonomous agent needs the ability to spend. Giving it a funded wallet gives
it the ability to spend *everything*, on *anything*, for *any reason*. The usual
answers — session keys, spending caps, an allowlist checked inside the agent's
own process, a policy engine behind an API — all move the decision somewhere the
owner has to trust, and several of them move it into the same process the
attacker already controls.

This paper describes a different placement. The owner creates a **mandate**: a
policy object plus a funded balance held by a contract. The agent holds a NEAR
FunctionCall access key scoped to one method on that contract. Every spend is a
contract call. The contract checks the allowlist, the per-transaction,
per-day and per-counterparty ceilings, and the balance it already holds. Above a
threshold, the spend becomes a stored request a human answers later. Every spend
above zero must carry an **attestation**: the hash of the decision that produced
it, the measurement of the code that made the decision, and the policy revision
it was decided under. The contract refuses a spend whose intent does not hash to
the attested intent, whose decision hash was already used, whose code
measurement is not the one the policy allows, or whose policy revision is not the
one currently in force.

The claim is narrow and testable: *a spend is rejected unless its decision hash
matches the attested hash* (C5), and *a decision is bound to the policy revision
it was made under* (C15). Both are demonstrated by a deterministic replay of
fifteen events against the real contract, and both can be recomputed in a
browser without trusting our server.

---

## 2. The problem

### 2.1 Authority is not the same as a limit

A limit answers "how much". Authority answers "how much, to whom, on which chain,
under which rules, decided by which code, and can I see afterwards that it was
respected". Session keys and token allowances answer the first question. They do
not answer the rest, and they do not survive a policy amendment: a signed
allowance is valid until it is revoked, whatever the owner's intentions have
become since.

### 2.2 Comparison-gating is the wrong primitive

The intuitive design is to let a signing quorum compare the requested amount
against a budget before signing. IACR ePrint 2026/2176 shows that comparison
gating admits a deterministic bypass. This project therefore treats a budget as
**a funded balance**, not a comparison: the contract holds the money, so the
amount it can authorise is bounded by what it has, not by a number it agreed to
respect (D-002, C7).

### 2.3 The decision usually lives where the attacker lives

In an agent wallet that enforces policy in the agent's process, or in a library
the agent imports, prompt injection is not a policy bypass — it is a policy
*rewrite*. The attacker does not need to defeat the check; it only needs the
check to run with the attacker's inputs. Moving enforcement one layer out, into a
contract the agent cannot modify, changes the shape of the attack: the agent can
still be manipulated into asking for something, but the answer is decided by code
the owner deployed.

---

## 3. Where this sits relative to what exists

The idea is not new, and pretending otherwise would fail the first search a
security-literate judge runs. The distinction is *where the check runs* and *what
a third party can verify afterwards*.

| System | Enforces | Budget model | What the owner must trust | Attested reason per spend |
|---|---|---|---|---|
| NEAR Intents **Agent API** (official, 2026) | rules + grant signed by the owner, executed by an attested TEE service | USD accounting inside the service | the operator and its TEE attestation | yes, per execution |
| TEE agent wallets (enclave-signed) | policy inside the enclave | wallet balance | the enclave vendor | yes |
| `near-agent-guard` (offline prototype, same track) | a CLI guard over proposed actions | policy counters in the process | the process; no key is created | no chain enforcement |
| ERC-7715 session keys (Ethereum) | scoped key permissions | allowance | the account implementation | no |
| **Mandate (this repo)** | a NEAR contract, called by a scoped key | funded balance held by the contract | the contract code you can read | hash equality enforced on-chain |

Two honest conclusions follow. First, the Intents Agent API is more capable than
this prototype: it settles across 35+ chains, it has an owner-facing product, and
it runs in production infrastructure. Mandate is not a replacement for it and does
not claim to be. Second, the difference that survives is verifiability: here the
enforcement is a contract method a judge can call, every refusal is a typed code
a judge can grep, and the console recomputes the hashes in the browser. If the
question is "which one would an operator deploy tomorrow", the answer is the
Intents API. If the question is "which one can I check without trusting an
operator", this is the smaller, inspectable instance of the same idea.

---

## 4. Design

### 4.1 Objects

- **Mandate** — owner, agent account, policy, policy hash, revision counter,
  policy history, funded balance, spent totals, per-counterparty totals, day
  index, suspension flag, settlement map.
- **Policy** — version, asset, expiry block, allowlist of (chain, counterparty,
  label), per-transaction / per-day / per-counterparty-per-day ceilings, an
  escalation threshold, and whether an attestation is required (plus the code
  measurement allowed to decide).
- **Attestation** — decision hash, code hash, quote hash, policy hash, intent
  hash.
- **Authorization** — what `spend` returns: mandate id, intent hash, amount,
  asset, chain, counterparty, decision hash, policy hash, status.
- **PendingRequest** — an escalation: the same intent, held for a human.
- **PolicyRevision** — revision number, hash, block, and the four limits that
  were in force.

### 4.2 The funded balance

`create_mandate` is payable: the attached deposit becomes the balance. `fund` can
add to it. Nothing in the contract can create balance, and `spend` refuses an
amount above the balance. The owner's exposure is bounded by what they deposited,
which is a property of the ledger rather than of an arithmetic check.

### 4.3 The decision, hashed and bound

The intent hash is the SHA-256 of a canonical JSON tuple
`{amount, asset, chain, vendor}` with sorted keys. The attestation presents the
intent the enclave decided on. `spend` recomputes the tuple from its own
arguments and refuses a mismatch, so an agent cannot obtain a decision for a
cheap action and then widen the amount.

The decision hash is recorded in a used-set. A decision authorises one spend,
once. Escalation and approval deliberately share one decision (D-005): approval
answers the stored request, it is not a second decision.

### 4.4 Policy revisions

`update_policy` validates the new policy, increments `policy_rev`, appends a
`PolicyRevision`, and leaves balance and counters untouched — tightening a policy
cannot forgive past spend, and loosening one cannot create funds.

Because every attestation names the policy hash it was decided under, an
amendment invalidates decisions taken before it. The same rule applies to a
pending escalation: a request raised under revision *n* cannot be approved once
the mandate is at revision *n+1*; it must be asked again. This is the property
the demo's events 13–15 exist to show, and the reason `policy_changed` is a
refusal code rather than a warning.

### 4.5 Escalation

Above `escalate_over`, `spend` stores a `PendingRequest` and returns `pending`.
No debit happens at request time. The owner calls `approve` (debit now) or
`reject` (never). This is a stored request, not a paused call: the window for a
human is unbounded, and a timeout cannot corrupt state.

### 4.6 Settlement

An authorisation is not a transfer. A separate attestor account calls `settle`
with the intent hash and a foreign transaction reference; the contract records it
once. An authorisation with no settlement is visibly unfinished, which is what
the fourth stage of the proof rail represents.

---

## 5. Check order

The order is part of the specification, because it decides which code a judge
sees first.

1. suspension
2. expiry block
3. asset equality
4. chain enabled
5. counterparty allowed
6. amount non-zero
7. per-transaction ceiling
8. day rollover, then per-day ceiling
9. per-counterparty ceiling
10. funded balance
11. attestation: present, code hash, **policy revision**, decision unused,
    intent match
12. escalation threshold, or debit and authorise

Every failure panics with `PolicyViolation: <code>`; detail is logged separately
as `violation: <code>: <detail>`, so the machine-readable word is never buried in
prose. The vocabulary is frozen at 21 codes and each is asserted by a test.

---

## 6. Threat model

| Adversary | Capability | Result | Residual risk |
|---|---|---|---|
| Injected agent | can call `spend` with arbitrary arguments | cannot exceed the policy or the balance; cannot name a counterparty that is not allowlisted; cannot widen an attested intent | the agent can still spend *within* its authority on a bad reason; that is a policy question, not this contract's |
| Injected agent, key theft | holds the scoped key | the key cannot transfer, add keys, delete the account, or call another contract | a stolen key spends the remaining balance within the policy until the owner suspends |
| Agent replaying a decision | re-presents an old attestation | `decision_replayed` | none within one deployment |
| Agent riding an amendment | presents a decision made under an older policy | `policy_changed` | none; the decision must be re-made |
| Compromised attestor | can write arbitrary settlement references | cannot move funds; can mislabel which foreign tx settled an intent | settlement references are attestor-asserted, not proven on-chain |
| Lying operator | edits the console or the snapshot | the browser recomputes the policy and intent hashes; a mismatch is shown | a judge who reads only the screenshot is trusting the screenshot |
| Malicious owner | changes the policy mid-flight | revisions are recorded; old decisions stop working | the owner is trusted by definition |

Explicit non-goals: this contract does not verify a hardware quote, does not
bridge assets, does not hold a private key for another chain, and cannot prevent
an owner from suspending a mandate at an inconvenient moment.

---

## 7. Determinism and replay

`make demo` executes a fixed fifteen-event scenario against the real contract in
`near-sdk`'s test VM. Block height and timestamp are constants, amounts are
integers, and no wall clock is read, so the emitted JSON is byte-identical on any
machine. The snapshot hash is printed by `make demo`; the console reads that same
file and nothing else.

The replay is not a simulation of the contract; it is the contract, with a
recording of the views after each call. That distinction is what lets the console
show a refusal code that a test also asserts, and it is why the console contains
no arithmetic about money.

---

## 8. Evaluation

Measured, on 2026-11-06:

| Check | Result |
|---|---|
| contract unit tests (`cargo test` in `rust:1`) | 27 passed, 0 failed |
| replay events | 15, final balance 56.000000 USDC, 0 pending |
| `tools/verify.mjs` | 13 checks, `inputsHash` stable across runs |
| browser verification | 12 rows recomputed with WebCrypto, all agree |
| Playwright + axe | 14 tests, zero WCAG A/AA violations on all six routes, no horizontal overflow at 380px on any route |
| wasm build | 155 KB release artifact |

No latency or cost claims are made here: the contract has never been deployed, so
any number would be invented.

---

## 9. What is implemented, and what is not

Implemented: the contract and its views, the deterministic replay, the console
(six routes, replay player, in-browser hash recomputation, CSV, print receipt,
policy revision table), the refusal vocabulary, the docs pipeline, the e2e suite.

Not implemented, and labelled as such wherever it would otherwise appear: a
testnet deployment and a real transaction link (blocked on a funded FunctionCall
key, H-6), a hardware-quote verifier, the attestor worker, the cross-chain signer,
the Bond submission (deferred, D-011), self-hosted fonts (D-012).

---

## 10. Related work

- NEAR Intents Agent API — owner-signed rules and grant, TEE-attested execution.
- NEAR FunctionCall access keys — the key-scoping primitive this design relies on.
- ERC-7715 / ERC-7710 — scoped permissions and delegation on Ethereum.
- IACR ePrint 2026/2176 — the comparison-gating bypass that motivates balances.
- `near-agent-guard` — a same-track offline guard; useful as a policy-expression
  reference, not as enforcement.

---

## 11. Limitations

1. One asset per mandate in v1.
2. Per-counterparty totals are cleared on day rollover, which is correct for the
   limits but loses history; the console shows the current day only.
3. The used-decision set grows without bound; a production deployment needs
   pruning or a per-revision scope.
4. The policy hash covers the policy object, not the contract code. A code
   upgrade is a different trust question, addressed by the code hash for the
   deciding service.
5. Settlement is asserted by one attestor account. A quorum of attestors is the
   obvious next step and is not implemented.

---

## 12. Reproducing the claims

```bash
make dev      # console, no secrets, no network at runtime
make demo     # fifteen events, expected table printed before comparison
make verify   # recompute policy, intent and revision invariants
make test     # 27 contract tests (or make test-linux with Docker)
make e2e      # 14 Playwright + axe tests
make doctor   # ACTIVE / FALLBACK per module, honestly
```

Every claim in this paper maps to a row in `docs/CLAIMS.md` and to a command or a
test. If a claim loses its proof, the claim is deleted rather than softened.
