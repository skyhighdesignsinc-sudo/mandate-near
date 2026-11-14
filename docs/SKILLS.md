# SKILLS — reusable procedures for coding agents

> A skill is a procedure an agent can execute without re-deriving it. Each has a trigger, numbered steps, and a verification the agent must run before claiming success.
> Convention: skills are invoked by name (`/skill add-policy-rule`). Keep them short enough to fit in one context window.

---

## `skill: screener-proof-readme`

**Trigger:** before any commit that changes the demo path, and on 2026-11-12.
**Why:** the first gate is an AI agent (Claude Code / Codex) that clones the repo and follows the README literally. It has no context and no patience.

1. `git clone <repo> /tmp/screener && cd /tmp/screener` — from a *fresh* clone, never your working tree.
2. Read only `README.md`. Do not consult memory. Any step you cannot perform from the file alone is a defect.
3. Run each command in the order written. Record the exact output.
4. For every claim in the README, find its `do X → see Y` line. If missing, write it.
5. Check: no secret required; no manual dashboard click required before the demo path; versions pinned; failure output documented.
6. Fix the README, not the runbook in your head. Re-clone and repeat.
**Verify:** a second agent, with the repo path but no other context, reaches the demo in under 10 minutes.

## `skill: add-policy-rule`

**Trigger:** a new constraint on agent spend (e.g. category caps, time windows, counterparty groups).
1. Add the field to the policy JSON schema in `docs/ARCHITECTURE.md` §5.2 first — schema is the source of truth.
2. Add the check in `mandate::spend`, returning a typed error `PolicyViolation{rule, limit, actual}`. Never `panic!`, never a bare string.
3. Add a red-team row in `docs/ARCHITECTURE.md` §7 that this rule is supposed to block.
4. Add the attack to `demo/` and assert `BLOCKED` in `make demo`.
5. Add the rule to `MANDATE.md` sample and to the console's human-readable policy view.
6. Add a `do X → see Y` line in `SCREENER.md`.
**Verify:** `make test && make demo` — the new attack must fail closed, and the pre-existing 9 attacks must still pass.

## `skill: add-chain`

**Trigger:** extending Pledge or Mandate to a new foreign chain.
1. Confirm Chain Signatures supports the curve on testnet (Ed25519 for Solana/Sui/Aptos, secp256k1 for EVM/BTC). Write the result in `docs/DECISIONS.md`.
2. Add the derivation path segment `m/{product}/{id}/{chain}` — never reuse a path across products.
3. Add 3 independent RPC endpoints to `.env.example` (the quorum needs 3 or the claim is false).
4. Extend `reader` with a per-chain adapter; return `{tx_ref, amount, asset, confirmations, rpc_hashes[3]}`.
5. Add a fixture for `make demo` — the demo must never depend on a live third-party endpoint.
6. Update the footer feature list and `docs/CLAIMS.md` (the number of supported chains is a claim; count only chains with a passing demo).
**Verify:** one deposit verified, one seizure signed, on the new chain, in `make demo`.

## `skill: attest-and-bind`

**Trigger:** any flow where a TEE decision must authorise a signature.
1. Worker returns `{decision_hash, code_hash, quote, inputs_hash}`; never return the raw prompt or raw credentials.
2. Contract stores `code_hash` at deploy and pins it in a view function.
3. `spend`/`liquidate` take `decision_hash` and reject unless `decision_hash == attested[proof_id].decision_hash`.
4. Mark the proof used (`used_proofs`) in the same transaction — a replay must be rejected.
5. Console `verifier` page recomputes the quote in the browser. If it only displays a JSON blob, it is theatre.
**Verify:** tamper the hash in transit → `attestation_mismatch`; replay the same proof → `proof_already_used`.

## `skill: claims-discipline`

**Trigger:** writing any README, UI copy, video script or pitch.
1. Open `docs/CLAIMS.md`. Find the claim.
2. If absent, it may not be written. Add it there first, with the artefact that proves it and the doc section that justifies it.
3. Replace banned vocabulary (`unhackable`, `trustless`, `impossible`, `nobody can read`) with the precise mechanism sentence.
4. Attach the proof: tx hash, test name, or doc anchor.
**Verify:** `grep -niE "trustless|unhackable|impossible|fully secure|guaranteed" -r .` → zero hits outside this file.

## `skill: demo-replay`

**Trigger:** before recording a video, and after any contract change.
1. `DEMO_SEED=42 make demo` — twice. Output must be byte-identical apart from timestamps and hashes.
2. Every step prints `STEP n — expected: <state> — actual: <state>`, and fails loudly on mismatch.
3. No step depends on network latency or a third-party uptime; fixtures first, live second.
4. Total runtime under 90 seconds for Pledge, under 70 for Mandate.
**Verify:** run on a clean checkout with the network cable unplugged for the fixture path (documented in `SCREENER.md` as offline mode).

## `skill: gate-review`

**Trigger:** a gate date in `PM-PACK/09-phase-model.md` (G1 01 Nov, G2 03 Nov, G3 06 Nov, G4 09 Nov, G5 11 Nov, G6 14 Nov).
1. Read the gate criteria from `09-phase-model.md`.
2. For each: PASS / FAIL with the artefact that proves it. No "mostly".
3. Any FAIL → apply the pre-approved fallback from `docs/UNIQUENESS-AUDIT.md` §6 or the risk register's mitigation. Do not invent a new plan at the gate.
4. Append to `PM-PACK/16-project-review.md` (live doc): date, criteria, verdict, decision, docs touched.
5. If the decision retires a term or changes identity, `grep -rn "<retired-term>"` the whole pack and fix every hit in the same batch (IAPM anti-drift rule).
**Verify:** conformance checklist in `../PM-PACK/README.md` still passes after the amendment.
