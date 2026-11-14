# Demo video — scripts, shots and the rules they answer

Source: `https://nearhackathon.com/HACKATHON.md`, read 2026-11-13. Re-read it before
posting; dates and rules may change.

## What the rules actually require

| Rule | Text | Consequence here |
|---|---|---|
| Q-012 | "Local-only demo OK? Yes: public repo, reproducible README, X post with a video; screenshots are not enough when judges cannot open the demo." | A video is **mandatory** for both repos, because neither demo is hosted. |
| Step 3 | The post "says the project was built at NEAR HACKATHON, tags `@NEARProtocol` and `#NEARHackathon`, and has the demo video or screenshots attached." | The X post is the artefact. `demoUrl` is the post URL, not a video file. |
| Demo guidance | "Show one complete moment… from a real user action to a visible result. Skip long intros, architecture slides, and setup." | One journey per video, under ~90 seconds, no slide deck. |
| Demo guidance | "Say what NEAR enables in this product… Avoid a vague 'powered by NEAR'." | Each script names the mechanism: a contract-held balance and a decision hash for Mandate; the deployed contract's own refusal codes for Baseline. |
| Q-015 | One person may send two submissions only if "independent and disclosed: each README names the other project." | `README.md` must name the sibling. Checked below. |
| Q-014 | "add a LICENSE file." | Required at the repository root. |

No maximum length is stated. Target **80 seconds**; anything past two minutes is not
watched by a judge who has forty entries to read.

## Recording setup (once)

- 1280×720 minimum, 30 fps, no music, no intro card longer than one second.
- Terminal at 16–18 pt with a dark theme; browser at 100% zoom, one tab.
- Record the commands as typed, at human speed, and cut dead time; do not fake output.
- The yellow caption on each shot is the number or code that matters; the narration names the same thing.
- Keep the repository URL on screen as a watermark, so any pause is a link.

## Film A — `baseline`, 59 s

Voice: `en-US-AndrewNeural`, +3%. One pass over the public judge view; the yellow box
follows the sentence, and the repo URL is on screen for the whole film.

| Start | On screen, boxed | Line |
|---|---|---|
| 0:00.4 | the four counts: 24 / 8 / 16 / 24 resolving | "This is Baseline. We measured an agent spending policy instead of describing it: twenty-four spends against a contract on NEAR testnet. Eight execute. Sixteen are refused, each with a typed code inside a failed transaction." |
| 0:15.0 | the matrix header, "click any row" | "The matrix is the run, case by case. Click any row to see the amount, the code and the hash it left behind." |
| 0:22.8 | the counterparty row opened: 8.00, `per_counterparty_day_exceeded`, hash | "This is the counterparty ceiling: eight dollars to one vendor passes, the next eight is refused per counterparty day, and that refusal opens on the explorer." |
| 0:33.1 | the daily row opened: 10.00, `per_day_exceeded` | "The first run also passed a spend it should have refused. The day counter treated nanoseconds as milliseconds, so a day was eighty-six milliseconds, and a twenty-five dollar cap authorised thirty. We fixed it, redeployed, and re-measured." |
| 0:48.1 | the method section, both verifier commands | "The repository re-checks every hash and every figure, and fails when they drift. A policy you can test, not just read. That is the submission." |

## Film B — `mandate`, 55 s

Voice: same. The desk is a **replay of one recorded run** and says so on screen; the film
does not present it as a live chain read. Two passes: the desk (lines 1–4), then the verify
page (line 5), because a hash-route change can complete in the DOM before the recorder
finishes writing the old view.

| Start | On screen, boxed | Line |
|---|---|---|
| 0:00.4 | the desk at the start: 100.00 held, 0.00 authorised | "This is Mandate. An agent gets a budget held by a NEAR contract, and a key that can only ask it to pay, not your account key. Every spend has to match a policy and an attested decision." |
| 0:12.4 | the strip after the first spend: 88.00 left, 12.00 today | "The desk is one recorded run. Every figure is a contract view: eighty-eight dollars left, twelve authorised today, and the policy revision the agent is bound to." |
| 0:23.4 | the authorised event card: 12.00 USDC, intent/decision/policy hashes | "This spend is inside the policy, so it executes. The reason and the decision hash are part of the record, and the transaction is on testnet." |
| 0:32.7 | event 7: `attestation_mismatch`, "attested 8.00, call 7.00" | "This call asks for seven dollars against an attested eight. The hashes part company, so the contract refuses with attestation mismatch, and the balance does not move." |
| 0:43.0 | the verify table: every row recomputed, `AGREES` | "Verify recomputes the hashes in your browser from the committed run, and every row opens on the explorer. Four transactions, one refusal, no keys. That is the whole claim." |

## What neither film says

- Not "unhackable", "trustless", "guaranteed", or "only NEAR can". The field has twelve
  entries with the same mechanic (`UNIQUENESS-AUDIT.md` §4.2).
- Not "the agent cannot overspend" — Baseline exists precisely because one ceiling did not
  bind until it was measured.
- No claim about a hosted demo: there is none, and Q-012 covers that with the video.

## Publishing checklist (human)

1. Repository public, LICENSE present, README names the sibling project (Q-015).
2. Upload the video as a native X upload where possible; a link to a file is a weaker post.
3. Post text: `docs/PENDING-HUMAN.md`, H-14 drafts. Both tag `@NEARProtocol` and
   `#NEARHackathon`; optional `@NearLegion`, `@NearBuilders`.
4. Copy the post URL into the submission payload as `demoUrl`. Never put a video URL there.
5. Deadline is 2026-11-14T23:59:00Z. Treat 18:00Z as the real cutoff for buffer.
