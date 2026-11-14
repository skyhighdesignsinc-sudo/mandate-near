# PLAN v2 — after the NEAR-ecosystem check (2026-11-05)

> Supersedes the Pledge half of `BUILD_PLAN.md`. The Mandate half survives, repositioned.
> Read this file first; `BUILD_PLAN.md` is now the *execution* detail for Mandate only.

## 0. What changed and why

The v1 test asked "can this be built anywhere else?" — the wrong question, and one that
fails for almost all software. The right question is: **does it already exist on NEAR,
and does the NEAR stack make it cheaper here than anywhere else?**

Two findings, both verifiable:

1. **Pledge exists on NEAR as a production protocol.** [Templar](https://docs.templarfi.org/guide/architecture.html)
   is "the first Cypher Lending protocol": borrow stablecoins against BTC or any
   chain's asset, markets at `<collateral>-<borrow>.v1.tmplr.near`, Chain Signatures
   custody with 11-of-16 TEE operators, permissionless liquidation, audited by Hacken,
   Guvenkaya, zkSecurity and Aurora Labs. Rhea Finance (Burrow + Ref, merged Feb 2025)
   ships over-collateralised lending with the same cross-chain access. Pledge as
   specified is a re-implementation of a live, audited competitor. **Dropped.**
2. **Mandate's mechanism is partly occupied.** NEAR function-call access keys give
   `receiver_id` + `method_names` + `allowance` at protocol level, so "scoped agent
   spending" is a primitive, not a product. A prior NEAR hackathon submission
   (`near-agent-guard`) implements caps + allowlists + audit log in an offline Python
   prototype; `tee-receipts` anchors NEAR AI Cloud signatures on-chain. **Kept, but only
   for the part nothing else has: an attested *decision* bound to a *spend*, enforced
   by a contract, with the receipt re-checkable by a third party.**

Corollary for claims: never write "unique to NEAR". Write what is checkable —
"the first contract on NEAR that refuses a spend whose attestation does not match the
intent", and let a judge try to break it.

## 1. The two submissions

| # | Working name | Tracks | One line | Buyer |
|---|---|---|---|---|
| A | **Mandate** | `security`, `agents`, `business` | An agent's budget is a contract balance and its reason is an attestation; a spend that does not match the attested intent is refused with a typed code. | SMB ops, enterprise procurement, grant programmes |
| B | **Bond** | `agents`, `business`, `realworld` | An agent stakes a bond before taking work; a failed, independently verified SLA slashes it and pays the client on the client's own chain. | Agent marketplaces, businesses hiring agents |

Why these two and not others: they are the only candidates that (a) use at least two
NEAR primitives that have no EVM equivalent in one flow, (b) have a buyer who already
spends money on the problem, and (c) can be demonstrated end-to-end on testnet in the
time left. Bond exists because Mandate prevents; Bond pays when prevention fails. They
are different contracts, different buyers, different failure modes — not one product
split in two, which the rules would rightly punish.

## 2. What is already built (Verboo, 2026-11-04)

| Path | State | Note |
|---|---|---|
| `scaffold/signer/**` | works, 4 tests pass | paths, EVM RLP, BTC segwit body, SOL; `requestSignature` returns a typed `credentials_missing`, never a fake hash |
| `scaffold/workers/attest` | works | canonical JSON hashing, mock + TDX modes, mode surfaced |
| `scaffold/workers/reader` | works | Read MPC primary, 3-of-3 RPC quorum fallback, refuses fewer than three |
| `scaffold/bin/doctor.mjs` | works | prints ACTIVE/FALLBACK per module, exits 1 on any fallback |
| `mandate/contracts/mandate` | **completed 2026-11-05** | was an empty `pub struct Contract {}`; now full state machine (below) |

## 3. Mandate — what is done, what remains

Done (compiles to `wasm32-unknown-unknown`, `lib.rs` 470 lines, 5 modules):
- `create_mandate` (deposit funds it — budget is a balance, never an MPC comparison, D-002)
- `spend` with ordered typed failures: `mandate_suspended`, `mandate_expired`,
  `asset_mismatch`, `chain_not_enabled`, `counterparty_not_allowed`, `amount_zero`,
  `per_tx_exceeded`, `per_day_exceeded`, `per_counterparty_day_exceeded`,
  `budget_exhausted`, `attestation_required`, `attestation_mismatch`, `decision_replayed`
- `settle` (attestor only) records the foreign tx reference against the intent hash
- owner flow: `fund`, `suspend`, `resume`, `approve`, `reject` — approval is a stored
  request, not a paused call (D-005)
- views: `get_mandate`, `get_pending`, `get_settlement`, `stats`, `held`

Remaining:
| Task | File | Acceptance | Command |
|---|---|---|---|
| M1 | run unit tests | **done** — 17 tests green | `make test` (`make test-linux` on this host, see §6) |
| M2 | agent key script | **done** — emits a `spend`-only function-call key, self-verified, `--full-access` exits 2 | `node mandate/bin/key.mjs --account <agent> --contract <contract>` |
| M3 | console | reads `get_mandate` + `stats`, renders the proof rail, links every hash to testnet explorer. Screens: `design/mandate/` (gallery: `node tools/serve-design.mjs`) | `make dev` |
| M4 | demo replay | 6 scripted spends, each with expected code, deterministic | `make demo` |
| M5 | deploy | contract on testnet with a real tx in SCREENER.md | `make deploy` |

## 4. Bond — build order

| Task | File | Acceptance |
|---|---|---|
| B1 | `contracts/bond/src/lib.rs` | `open_bond`, `accept_job`, `submit_work`, `verify` (attestor), `slash`, `release` |
| B2 | SLA hashing | `sla_hash` recomputed in the console and in the contract from the same JSON |
| B3 | reader hook | `verify` consumes `workers/reader` output; a failed proof leaves the job unverified, never auto-releases |
| B4 | payout | `slash` emits an intent the signer turns into a transfer on the client's chain |
| B5 | console | one screen: job, bond, SLA, verdict, payout tx |

## 5. Order of work (deadline: freeze 2026-11-11)

| Day | Work |
|---|---|
| Nov 5 (today) | M1, M2. Nothing else until tests are green. |
| Nov 6 | M3 console shell + M4 demo skeleton. Gate: can a stranger run `make demo`? |
| Nov 7 | M5 deploy to testnet, real tx in SCREENER.md |
| Nov 8 | B1–B2 Bond contract, unit tests |
| Nov 9 | B3–B5 Bond wiring, second deploy |
| Nov 10 | SCREENER.md polish on both, video scripts, `make doctor` on a clean copy |
| Nov 11 | freeze. Only copy edits after this. |

If Nov 8 arrives and Bond's contract is not compiling, drop Bond and ship Mandate alone,
well. One finished submission scores; two half-finished ones do not.

## 6. Known environment blocker

`cargo test` on this machine fails before compiling the crate: the Windows GNU toolchain
has no `dlltool.exe`, and `getrandom` (pulled in by `near-sdk`'s `unit-testing` feature)
needs it to build an import library. The WASM build is unaffected and passes.

**Resolved 2026-11-05 (D-008).** The `dlltool` error was the visible half. Fixing it exposed
the real blocker: `near-sdk`'s `unit-testing` feature pulls `near-crypto` → `aws-lc-rs`
(cmake, perl, nasm) and `secp256k1-sys` (a C compiler). The wasm build compiles neither,
so the host machine only ever failed at link time.

Run the tests on Linux instead:

```bash
make test-linux
# docker run --rm -v "$(pwd):/w" -w /w/mandate/contracts/mandate rust:1 cargo test
```

The Windows host stays a wasm build machine. If you do want the host path, it needs all
four of gcc, cmake, perl and nasm — not just one of them:

1. real ucrt64 binutils on PATH (exported from `.tools/ucrt-binutils/ucrt64/bin`)
2. `choco install mingw cmake nasm strawberryperl -y` (needs elevation), then `cargo test`
3. Visual Studio Build Tools + `rustup default stable-x86_64-pc-windows-msvc`

Do not paper over this by deleting tests. The tests are the only thing that proves the
typed codes in SCREENER.md are real.

## 7. Rules for whoever executes this (including a weaker model)

1. Every number on screen comes from a contract view. If it is computed in the UI, it is wrong.
2. Every claim in a README must exist in `docs/CLAIMS.md`. If it is not there, delete the sentence.
3. A failure path returns a typed code, never a bare panic string.
4. If a primitive is unreachable, set the flag to the documented fallback and let
   `make doctor` print `FALLBACK`. Never label a mock as live.
5. Stop and ask only for: credentials, mainnet actions, publishing. Everything else: decide,
   record in `docs/DECISIONS.md`, continue.
