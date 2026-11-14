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
- Captions burned in for the two numbers that matter (86.4 ms; 6 of 10 refused).
- End on the repository URL for three seconds, so a screenshot of the last frame is a link.

## Script A — `baseline` (80s)

Voice: plain, no adjectives. The finding is the story; the product is the evidence.

| Time | On screen | Narration |
|---|---|---|
| 0:00–0:08 | Terminal, cursor blinking. Overlay: "Twelve teams shipped an agent spending cap. We measured one." | "Every entry in this track ships a spending cap. Almost nobody measures one. This is a contract on NEAR testnet, and a script that tries to break its caps." |
| 0:08–0:22 | `make thesis ACCOUNT=mandate-hackaton-7c1a.testnet` → `state.json` prints mandates, settled count, block height. | "First it reads the live contract, no signing, just views. Four settled mandates, and the block height it read them at." |
| 0:22–0:42 | `node thesis/tools/experiment.mjs --account …` → ten cases, each line `ok`, codes and hashes. | "Then four policy shapes, ten attempts: a transaction inside the cap, one over it, a zero amount, an unlisted vendor, a decision whose hash does not match, and a spend made under the previous policy revision. Six are refused, and every refusal has a typed code and a transaction hash." |
| 0:42–0:52 | Nearblocks tab: open one refused transaction. | "This is one of them, on the explorer. Same contract, same block, `per_day_exceeded`." |
| 0:52–1:08 | Split screen: the arithmetic `20,764,932,355 × 86,400,000 = 1,794,090,155,472,000,000 ns`, then the pre-fix row `authorised`, then the post-fix row `per_day_exceeded`. | "And here is why the matrix exists. The first run passed a spend it should have refused. The day counter divided nanoseconds by a millisecond constant, so a day was 86.4 milliseconds. A twenty-five dollar daily cap authorised thirty dollars across two blocks. We fixed it, redeployed, and re-measured." |
| 1:08–1:18 | `make thesis-e2e` → eight `ok` lines, `artefacts agree`. | "This command fails if the dataset, the JSON files and the numbers in the write-up ever stop matching. A measurement that cannot fail is marketing." |
| 1:18–1:26 | Repo URL, full screen. | "The failing transaction is public. So is the fix. Run it yourself." |

## Script B — `mandate` (78s)

Voice: the owner, not the developer.

| Time | On screen | Narration |
|---|---|---|
| 0:00–0:08 | Console at the desk, balance 100.00. | "An agent needs to pay suppliers. The usual answer is to give it a key, which means one bad instruction can move everything." |
| 0:08–0:20 | Point at `mandate.testnet`, the `list_mandates` table, the `replay` label. | "Here the money is a contract balance. The agent can only ask it to pay, and every figure on screen is a contract view, not a mock." |
| 0:20–0:34 | Step the replay to event 3: an authorised spend of 12 USDC, the reason and hash shown. | "A spend inside the policy executes. The reason it was made is an attested decision, and its hash is part of what the contract checks." |
| 0:34–0:48 | Step to event 7: `attestation_mismatch`, balance unchanged, rail says refused. | "This one has a matching amount and an allowed vendor, and still fails, because the attested decision does not match the payment. The balance does not move." |
| 0:48–1:00 | Verify route: hashes recomputed in the browser, `agree`. | "Every hash is recomputed in your browser, so you do not have to trust this page." |
| 1:00–1:12 | Chain card: open the real failed transaction on Nearblocks. | "This refusal is a real transaction on testnet. Open it." |
| 1:12–1:22 | Events 13 then 14: `policy_changed`. | "And when the owner changes the policy, a decision taken under the old one is refused rather than executed under the new limits." |
| 1:22–1:30 | `make dev` prompt and repo URL. | "One command, no keys. The contract is on testnet." |

## What neither script says

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
