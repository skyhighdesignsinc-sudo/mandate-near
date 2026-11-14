# AGENTS.md — operating instructions for coding agents

Read this before touching the repo. It is the contract between the human sponsor and every agent (Claude Code, Codex, Cursor, Buffy).

## 1. What we are building

Two **independent** NEAR HACKATHON 2026 submissions, in two **separate public repos**:

| Repo | Product | Tracks | One-liner |
|---|---|---|---|
| `baseline` | measured enforcement | `thesis`, `security` | We ran the experiment: what agent-payment policies can and cannot refuse, every hash published and every figure re-derived from RPC. |
| `mandate` | agent authority | `security`, `agents`, `business` | An agent gets a budget and an allowlist enforced by the key itself, with an attested reason for every spend and an instant kill switch. |

One repo = one submission. `projectUrl` is unique per submission. **Never** merge them, never share a package import across them, never open a PR that touches both.

## 2. Non-negotiables

1. **Deadline:** code frozen 2026-11-11; submitted by 2026-11-14 18:00 UTC.
2. **The AI screener runs the repo.** A fresh clone must reach the demo with `make dev` and no secrets. If it does not, the submission is dead regardless of quality.
3. **Testnet only.** No mainnet deployment, no key signing on mainnet, no spending. Intents mainnet is `dry: true` quotes only, from a dedicated account, tiny.
4. **No secrets in the repo.** `.env.example` only. Never print a key, never echo `.env`.
5. **No absolute security words** in code comments, UI copy or docs: *trustless, impossible, unhackable, nobody can read it, guaranteed*. Use the precise claim: "verified by a 3-of-3 RPC quorum", "requires 11-of-17", "bound to the attested code hash".
6. **Do not build NEAR Business.** No confidential multisig treasury, no payroll, no escrowed invoicing, no inheritance/dead-man-switch custody. It shipped 2026-10-20 and the judges know it. See `docs/UNIQUENESS-AUDIT.md` §4.
7. **Do not implement budgets as an MPC comparison.** Budget = funded balance. ePrint 2026/2176 proves comparison-gating is bypassable.

## 3. Commands (must all work from a fresh clone)

```bash
make dev        # console + local sandbox + workers, seeded demo data
make test       # contract unit tests + worker tests
make demo       # deterministic end-to-end replay, prints expected output
make verify     # attestation + proof verification self-test
make doctor     # prints which feature flags are ACTIVE vs FALLBACK
```

If a command is added, it is added to `README.md` and `SCREENER.md` in the same commit.

## 4. Definition of done (per feature)

A feature is done when **all seven** hold:

- [ ] It runs in a fresh clone via `make dev`.
- [ ] It has a `do X → see Y` line in `SCREENER.md`.
- [ ] Failure paths are implemented and produce a typed error, not a panic.
- [ ] The UI shows the real on-chain state (hash/tx/address), not a mock label.
- [ ] A judge can verify it without trusting our server (explorer link or attestation page).
- [ ] `make demo` still passes.
- [ ] The claim it supports appears, word for word, in `docs/CLAIMS.md`.

## 5. File ownership and edit discipline

- Contracts: one owner per repo. Do not reformat files you are not changing.
- Migrate config in one place (`.env.example` + `make doctor`), never hardcode RPCs.
- Keep files under ~400 lines; split by responsibility, not by layer.
- UI never computes money. Every amount rendered comes from a contract view.
- Prefer deleting a feature over shipping a mocked one. A mocked feature that looks real is a credibility loss in front of investors.

## 6. Verification loop (run before every handoff)

```bash
make test && make demo && make verify && git diff --stat
```

Then read `SCREENER.md` as if you were a hostile reviewer with no context. If a step needs knowledge that is not in the file, the file is wrong, not the reviewer.

## 7. When blocked

- Swarm/MPC/Read-MPC unavailable → flip the feature flag to the documented fallback, print it in the UI footer, and log the decision in `docs/DECISIONS.md` with the date.
- A claim cannot be verified → **delete the claim**. Never soften it into vagueness; vagueness reads as dishonesty to judges who know the stack.
- Conflict between `BUILD_PLAN.md` and a newer decision → `docs/DECISIONS.md` wins, then update `BUILD_PLAN.md` in the same batch.

## 8. Escalation

The human is away. Do not wait. Decide, record in `docs/DECISIONS.md` (ID, date, options, choice, why, revisit trigger), and continue. Anything irreversible or outward-facing (publishing, posting, mainnet) is **not** yours to do — leave a written request in `docs/PENDING-HUMAN.md`.
