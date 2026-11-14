// tools/stitch-screens.mjs — the screen briefs fed to Stitch.
//
// Two products, one visual system (docs/BRAND_GUIDELINES.md). The brief is written from the
// brand document rather than from taste: the palette, the 2px radius, the two-zone layout and
// the four-cell proof rail are constraints, not suggestions. If a generated screen breaks the
// proof rail, it is wrong regardless of how it looks.
//
// Copy rules that matter more than aesthetics: every state carries a label and a glyph, never
// colour alone; no exclamation marks; no marketing adjectives; a refusal is a first-class screen.

export const BRAND = `
Design one screen of a web application called "Mandate": an agent-authority console on NEAR testnet. Some of the screens belong to its sister product "Bond", a cross-chain credit desk.

Design language: an instrument panel and a document of record (title deeds, survey instruments, chain-of-custody logs, notarial seals). It must NOT look like a crypto trading terminal, a SaaS analytics dashboard, or a startup landing page.

MANDATORY STYLE RULES
COLOUR DISCIPLINE — this matters more than anything else on this list. The ground is #E9EEF3, a cool blue-grey, and it must stay cool. Warm cream, beige, sand, ivory, terracotta tints or warm-grey grounds are WRONG and will be rejected. There are exactly four accent hues in the whole product (#2E6F5E, #2B5F8A, #A9660F, #A83A2C); do not introduce a fifth, do not tint panels with purple, teal-by-gradient or gold. Do not invent your own design system or theme: the tokens below are exhaustive.
- Ground #E9EEF3 (blueprint grey). Raised panels #F4F7FA. Primary text #0F1720. Secondary text #55636F. Hairlines #C3CDD6.
- Accent colour is data, never decoration: #2E6F5E = verified / settled / allowed; #2B5F8A = in flight / signing; #A9660F = requires a human; #A83A2C = refused / blocked. Never use red for anything except a refusal or failure.
- Corner radius 2px on every surface. No drop shadows, no gradients, no glassmorphism, no glow. Separate surfaces with hairline rules and the raised panel colour only.
- Type: Fraunces (serif, optical size) for the page title and for the single largest number on the screen, weight 500-600, never below 28px. Public Sans for all body text, labels and buttons. JetBrains Mono for every hash, account id, address, amount, block number and error code.
- All numbers use tabular figures and are right-aligned in tables. Addresses are truncated in the middle like 0x8f2c...41ae, with a small copy icon.
- Layout grid: max width 1200px, 12 columns, 24px gutter. The primary canvas spans 8 columns. The right 4 columns (minimum 320px) hold the PROOF RAIL and never move.
- CONTEXT BAR across the very top: the word MANDATE or BOND as a small mono wordmark, then "testnet", the contract id in mono (mandate.testnet), and the active verification path shown as "RPC_QUORUM 3/3".
- PROOF RAIL (the signature element, always present, always in this order and never decorative): four stacked cells numbered 1 READ, 2 ATTEST, 3 SIGN, 4 SETTLE. Each cell shows a state and a small mono artefact underneath. States are: an em dash alone for not reached; a pulsing dot with the words "in flight" in #2B5F8A; a check glyph with "verified" in #2E6F5E; an x glyph with "refused" in #A83A2C. Beneath READ show "3 of 3 RPCs" plus a short mono hash; beneath ATTEST the code hash; beneath SIGN "11 of 17" plus a short signature ref; beneath SETTLE the chain name and a short tx hash. If a stage did not happen, leave the cell visibly empty. Fake progress in this rail is the one unforgivable error.
- FOOTER strip: "active path: RPC_QUORUM · no mainnet · testnet only" in small mono, plus a 4-item keyboard hint row.
- Copy: sentence case, active voice, notarial and numeric. No exclamation marks. No words like secure, seamless, powerful, revolutionary. Errors state what happened, why, and the exact next action. Buttons label the action and the result repeats the same verb.
- Accessibility: every state has a text label and a glyph, never colour alone; focus rings are a 2px #2B5F8A outline on every interactive element; body text is at least 15px.
`;

const mandate = (body) => `${BRAND}\nSCREEN BRIEF — MANDATE\n${body}\n\nProduce a single desktop screen (1440x1024) with real content in every slot. Invent plausible account ids, hashes and amounts that look like real testnet data: ed25519: prefixes, 44-character base58 account ids, 64-character hex hashes, amounts to two decimals. Do not use lorem ipsum, placeholder text, or "Lorem", and do not draw a giant marketing headline.`;

const bond = (body) => `${BRAND.replace('MANDATE', 'BOND')}\nSCREEN BRIEF — BOND\n${body}\n\nProduce a single desktop screen (1440x1024) with real content in every slot. Invent plausible testnet data: BTC testnet txids (64 hex characters), Base Sepolia 0x addresses, Solana devnet base58 signatures, USDC amounts to two decimals. Do not use lorem ipsum or placeholder text.`;

export const APPS = [
  {
    slug: 'mandate',
    title: 'Mandate — agent authority console',
    screens: [
      {
        id: '01-overview',
        title: 'Console overview',
        prompt: mandate(`
Page title "Mandates", with the sentence "Two agents hold spending authority on testnet." beneath it in secondary text.
A strip of four statistics separated by vertical hairlines, each a small label above one large number in Fraunces: "Mandates" 2, "Authorised today" 34, "Refused today" 6 (number in #A83A2C), "Value under authority" 1,847.90 USDC.
Below, a table of the two mandates with columns AGENT, PURPOSE, FUNDED BALANCE, SPENT TODAY, PER-TX CAP, COUNTERPARTIES, STATE. Row 1: agent "loop.testnet", purpose "Procurement — freight and customs", funded 612.40 USDC, spent today 240.00, per-tx cap 250.00, 3 counterparties, state verified badge reading "active". Row 2: agent "scout.testnet", purpose "Market data subscriptions", funded 88.00 USDC, spent today 88.00, per-tx cap 20.00, 1 counterparty, state amber badge reading "suspended". Each row ends with a small mono line "last decision 0x41ae...9c02" and a chevron.
Above the table a filter row: a search field labelled "Filter by agent or counterparty", a segmented control All / Active / Suspended, and a right-aligned primary button "New mandate".
The proof rail shows the most recent authorisation: READ verified 3 of 3 RPCs with hash 0x8f2c...41ae, ATTEST verified with code hash 0x1c77...de19, SIGN verified 11 of 17 with sig ref 0x5b0e...77c1, SETTLE verified on NEAR with tx 0x9d31...0a44.
The primary canvas must feel like a register: dense rows, aligned numerals, hairlines between columns.`),
      },
      {
        id: '02-mandate-detail',
        title: 'Mandate detail and kill switch',
        prompt: mandate(`
Page title "loop.testnet" in mono, with a subtitle "Procurement — freight and customs · created 2026-11-02". A verified badge reading "active" sits beside the title.
Left canvas, top: a policy panel as a two-column definition list with hairline rules — "Per-transaction cap 250.00 USDC", "Daily cap 1,000.00 USDC", "Funded balance 612.40 USDC", "Counterparty allowlist" followed by three chips reading "Acme Freight", "Northwind Customs", "Harbor Logistics", and "Chain scope" reading "near-testnet only".
Below it a panel titled "The key cannot transfer" containing a mono line "ed25519:7Yb3...Qm2x" and the sentence "Function-call access. Method spend only. No transfer, no add_key, no delete_key." with a small copy icon and a link reading "view on explorer".
Below that, a decision log table titled "Decisions today" with columns TIME, COUNTERPARTY, AMOUNT, RESULT, DECISION HASH. Four rows: 14:02 Acme Freight 240.00 verified 0x41ae...9c02; 11:47 Harbor Logistics 180.00 verified 0x77b1...3f58; 09:15 "unlisted vendor" 95.00 refused in #A83A2C with code counterparty_not_allowed; 08:30 Northwind Customs 60.00 verified 0x2c90...ae71.
Bottom right of the canvas: a danger panel with a 1px #A83A2C border titled "Suspend mandate". Body text "Suspension is one transaction. The agent's next call is refused with mandate_suspended. Deleting the access key is a second, separate transaction." Buttons: a secondary "Suspend" and a text link "Delete access key".
Proof rail: READ verified, ATTEST verified, SIGN shows the pulsing dot and "in flight" with "11 of 17 collecting", SETTLE is an em dash.`),
      },
      {
        id: '03-spend-composer',
        title: 'Agent proposes a spend',
        prompt: mandate(`
This is the agent's own view, not the owner's. Page title "Propose a spend", subtitle "Everything below is signed by the agent key and checked by the contract before any signature is released."
Left canvas, top: a form panel with fields in a single column, each label above the field: "Counterparty" as a select showing "Acme Freight — allowlisted"; "Amount" a large mono input showing "240.00" with "USDC" as a suffix; "Intent" a mono line reading "freight:AE-2291:port-nlrtm"; "Reason" a four-line textarea containing the sentence "Container AE-2291 cleared customs; pay Acme Freight per invoice 2291."; and a read-only mono field "Decision hash" showing "0x41ae...9c02" with a caption "recomputed over the normalised fields above".
Below the form, a panel titled "Policy check" listing six rows, each with a glyph and a label: "Allowlist: Acme Freight is listed" verified; "Per-transaction cap: 240.00 of 250.00" verified; "Daily cap: 240.00 of 1,000.00" verified; "Funded balance: 612.40 available" verified; "Decision freshness: signed 2s ago" verified; "Key scope: spend only" verified. Use a hairline between rows and right-align the right-hand values in mono.
Bottom bar of the canvas, right-aligned: a primary button "Sign and submit", a secondary "Save draft", and a text link "Revoke this key".
Proof rail: READ verified 3 of 3; ATTEST shows the pulsing dot and "in flight" with the code hash 0x1c77...de19; SIGN and SETTLE are em dashes.`),
      },
      {
        id: '04-escalation',
        title: 'Escalation awaiting a human',
        prompt: mandate(`
Page title "Escalation" with an amber badge reading "requires a human" beside it, and the subtitle "1,480.00 USDC exceeds the 1,000.00 daily cap."
Left canvas, top: a summary panel, two columns: "Requested by loop.testnet", "Counterparty Northwind Customs", "Amount 1,480.00 USDC" in large mono, "Remaining daily budget 760.00 USDC", "Requested at block 214,893,102", "Expires in 168 blocks" with a thin horizontal countdown bar in amber.
Below it a panel titled "Attested reason" containing a quoted two-sentence paragraph in body type: "Bonded warehouse release for shipment NW-8814 requires full duty payment before 18:00 UTC. Splitting the payment would miss the customs window." Under the quote a mono line "decision 0xbe44...17f0 · attested code hash 0x1c77...de19 · signer 0x9a0c...3d21" with a link "open the raw attestation".
Below that a decision panel: the approving human is shown as "owner.testnet" with a mono key line, and the sentence "Approval is its own transaction. While the request is pending the agent cannot execute it, and cannot approve it." Buttons right-aligned: a primary "Approve" and a bordered secondary "Reject", plus a text link "Ask the agent why".
Proof rail: READ verified 3 of 3, ATTEST verified with the code hash, SIGN is an em dash with the caption "awaiting owner", SETTLE is an em dash.`),
      },
      {
        id: '05-refusal',
        title: 'Refusal — the most important screen',
        prompt: mandate(`
This screen must be as carefully composed as the happy path: a refusal is a first-class outcome, not an error toast.
Page title "Refused" in Fraunces, immediately followed by the error code "counterparty_not_allowed" set in JetBrains Mono at 28px inside a thin #A83A2C bordered box. Beneath, one sentence in body type: "The payment was refused before any signature existed. No funds moved and no key was used."
Left canvas, three stacked panels separated by rules: first, "What happened" with the sentence "loop.testnet proposed 95.00 USDC to vendor byte-bazaar.testnet at 09:15:04 UTC."; second, "Why" with "byte-bazaar.testnet is not on the counterparty allowlist. The allowlist is checked in the contract, after the decision hash is verified." plus a small mono row "policy: counterparties[3] · decision 0x2c90...ae71"; third, "What to do next" as three numbered options in a tight list: "Add byte-bazaar.testnet to the allowlist, then re-propose." with an inline text link "Open allowlist"; "Lower the amount and use an allowlisted vendor." ; "Leave it refused. The audit log keeps this attempt." 
A slim summary strip at the bottom of the canvas with four mono facts: "code counterparty_not_allowed · gas spent 0.0003 NEAR · signature released none · logged block 214,891,776".
Proof rail in its most expressive state: READ verified 3 of 3 with hash; ATTEST shows an x glyph and "refused" in #A83A2C with the code hash beneath; SIGN is an em dash with the caption "never signed"; SETTLE is an em dash with the caption "nothing to settle". The visual weight of the two empty cells is the point of the screen.`),
      },
      {
        id: '06-audit',
        title: 'Audit log and verification',
        prompt: mandate(`
Page title "Audit", subtitle "Every authorisation, every refusal, in order."
Left canvas: a filter bar with a date range reading "01 Nov — 05 Nov", three select chips reading "all agents", "all results", "all counterparties", and a right-aligned mono line "58 records".
Then a dense table with columns BLOCK, TIME, AGENT, COUNTERPARTY, AMOUNT, RESULT, DECISION HASH, SIGNERS, SETTLE TX. Seven rows with real-looking data, mixing verified rows (verdigris text reading "authorised") and two refused rows in #A83A2C (one reading "refused · counterparty_not_allowed", one reading "refused · over_per_tx_cap"). Amounts right-aligned in mono, hashes truncated in the middle, signers shown as "11/17".
Below the table, a panel titled "Verify this export" containing the sentence "Each row's decision hash can be recomputed from the attested payload, so the CSV is checkable without trusting this page." and a mono block with three lines: "sha256(export.csv) = 0x7d02...c118", "records 58", "recomputed 58/58 match". A primary button "Download CSV" and a secondary "Recompute hashes".
Proof rail: all four stages verified, representing the most recent record, with the settle tx hash under SETTLE.`),
      },
      {
        id: '07-first-run',
        title: 'First run — no mandates yet',
        prompt: mandate(`
An empty state that still looks like an instrument, not a blank page with a cartoon.
Page title "Mandates", subtitle "No agent holds authority on this contract yet."
Left canvas: a bordered panel with four numbered setup steps, each a row with a hairline: 1 "Create the mandate" with the mono caption "agent account, per-transaction cap, daily cap, allowlist"; 2 "Fund it" with "a funded balance per chain — the budget is money that exists, not a number the contract compares against"; 3 "Grant a spend-only key" with "function-call access, receiver this contract, method spend"; 4 "Watch the proof rail fill". None of the steps is ticked; each shows an em dash on the right.
Below the steps, a panel titled "Why the key comes last" with the sentence "Creating the mandate first means the agent has somewhere to spend from before it has the means to spend."
Right side of the canvas, a quiet illustration made only of hairlines: a ruled grid suggesting an empty register, with one measured line and the mono label "0 authorisations".
Primary button "Create mandate" bottom right, secondary "Read the setup guide".
Proof rail: all four cells are em dashes, and the README-style caption under the rail reads "nothing yet — this rail fills from real events only". That emptiness is the design, not a loading bug.`),
      },
      {
        id: '08-verify-drawer',
        title: 'Verify an attestation',
        prompt: mandate(`
The screen a sceptical judge needs: prove the decision without trusting the page.
Page title "Verify" with the subtitle "Decision 0x41ae...9c02 for mandate loop.testnet." A verified badge reading "recomputed" beside the title.
Left canvas: a three-step verification list, each a row with a hairlines separator and a check glyph: "1 Recompute the decision hash from the normalised payload" with a mono block showing four fields (counterparty, amount, intent, nonce) and the resulting hash; "2 Compare it to the hash the attestor signed" showing "attested 0x41ae...9c02" and "recomputed 0x41ae...9c02" and the verdict "match"; "3 Check the signature against the attested code hash" showing the signer key in mono and "code hash 0x1c77...de19 matches the registered attestor".
Below, a raw artefact panel titled "Raw response" in a mono block with 8-10 lines of plausible JSON (amount, counterparty, nonce, decision_hash, attested_by, signature, block) with a copy button and a small "open on explorer" link.
A footer strip inside the canvas: "These three steps are the whole trust story. Nothing here asks you to believe our server."
Proof rail: READ verified, ATTEST verified, SIGN verified, SETTLE verified — all with artefacts.`),
      },
      {
        id: '09-policy-editor',
        title: 'Edit caps and allowlist',
        prompt: mandate(`
A settings screen that treats a policy change as a document amendment.
Page title "Policy" with the subtitle "Changes apply to the next decision, never to one already signed."
Left canvas, top: a form panel in two columns. Left column fields labelled "Per-transaction cap" with a mono input "250.00 USDC", "Daily cap" with "1,000.00", "Escalation above" with "600.00". Right column: "Counterparty allowlist" as a list of three chips (Acme Freight, Northwind Customs, Harbor Logistics) each with a small remove cross, an input labelled "Add counterparty" with placeholder text "account id", and the caption "An unlisted counterparty is refused with counterparty_not_allowed before any signature."
Below the form, a panel titled "Pending change" showing a diff-like summary in mono with + and - marks: "+ byte-bazaar.testnet", "- per-transaction cap 250.00 → 300.00", "daily cap unchanged 1,000.00" and a line "effective from the next decision · current signature unaffected".
Bottom right: primary "Sign policy change", secondary "Discard", and a mono caption "signed by owner.testnet · 1 transaction".
Proof rail: READ verified, ATTEST verified with the policy hash, SIGN shows the pulsing dot and "in flight", SETTLE is an em dash.`),
      },
      {
        id: '10-kill-switch-confirm',
        title: 'Kill switch confirmation',
        prompt: mandate(`
A modal confirmation over a dimmed console, and the modal itself is the screen.
Behind the modal: the mandate detail page, visibly dimmed but still readable at the edges, with the rail partly visible.
The modal: 560px wide, #F4F7FA, 2px radius, a 1px #A83A2C top rule, no shadow — it sits above the page with a scrim of the ground colour at 60% opacity. Title "Suspend loop.testnet" with a mono subtitle "this is the first of two transactions".
Body: three statements, each with a glyph and a hairline: "What stops now" — "the agent's next call is refused with mandate_suspended"; "What keeps running" — "pending escalations stay pending, and the funded balance is untouched"; "The second transaction" — "deleting the access key makes the agent inert even if the contract allowed it".
A mono facts block: "mandate mandate-01 · funded 612.40 USDC · outstanding escalations 1 · key ed25519:7Yb3...Qm2x".
Buttons right-aligned: a bordered danger "Suspend" as primary, a secondary "Cancel", and a text link "Delete the key as well" with the caption "second transaction, cannot be undone".
Proof rail: READ verified, ATTEST verified, SIGN shows "in flight" — the suspension is being signed now; SETTLE em dash.`),
      },
    ],
  },
  {
    slug: 'bond',
    title: 'Bond — cross-chain credit desk',
    screens: [
      {
        id: '01-borrower-overview',
        title: 'Credit line overview',
        prompt: bond(`
Page title "Credit line", subtitle "Collateral stays on the chain you locked it on." A verified badge reading "current" sits beside the title.
Left canvas, top: a wide balance panel with four columns divided by hairlines: "Available to draw" 7,360.00 USDC as the largest number on the screen in Fraunces; "Outstanding" 5,140.00 USDC; "Collateral value" 12,480.00 USDC; "Loan-to-value" 41.2% with a thin horizontal health bar below it that is two-thirds filled in #2E6F5E and labelled "liquidation at 75%".
Below, a panel titled "Collateral by chain" containing three rows separated by hairlines, each with a chain mark, the asset, an amount in mono and a small verified line: "Bitcoin testnet · 0.42 BTC · 3 of 3 RPCs agree · tx 4f2a...9c1b", "Base Sepolia · 3.10 ETH · 3 of 3 RPCs agree · tx 0x88de...2f04", "Solana devnet · 18.00 SOL · 3 of 3 RPCs agree · sig 5Kq7...mXe2". Each row ends with the mono caption "locked on its own chain" and a small external-link icon.
Below that, a compact "Next payment" strip: "1,240.00 USDC due 14 Nov 2026", a progress rule showing 9 of 30 days elapsed, and a secondary button "Repay".
Bottom right of the canvas, two actions: primary "Draw" and secondary "Add collateral".
Proof rail: READ verified 3 of 3 with the BTC tx hash, ATTEST verified with the appraisal code hash, SIGN verified 11 of 17, SETTLE verified on NEAR testnet.`),
      },
      {
        id: '02-lock-collateral',
        title: 'Lock collateral with a 3-of-3 read',
        prompt: bond(`
Page title "Lock collateral", subtitle "0.15 BTC on Bitcoin testnet. Nothing is bridged; the UTXO stays where it is."
Left canvas, top: a form panel with a single large mono amount input showing "0.15" suffixed "BTC", a destination address field in mono reading "tb1q9x4...7ld2" with a copy icon, and a caption "The address is derived from the contract, not from a key this page holds."
Below, the centrepiece: a panel titled "Three independent reads" with three rows, one per RPC provider, each showing a provider name in mono ("provider-a", "provider-b", "provider-c"), a block height ("2,914,882", "2,914,882", "2,914,882"), a confirmation count, and a truncated txid that is identical in all three rows. Each row ends with a check glyph in #2E6F5E. Under the three rows a summary rule reading "3 of 3 agree · the deposit is verified" and a mono line "agreement hash 0x6b31...f792".
Below that, a panel titled "What did not happen" with three short lines, each preceded by an em dash: "No wrapped asset was minted." "No bridge contract was called." "The collateral did not leave Bitcoin." 
Bottom bar right-aligned: primary button "Confirm lock" and a secondary "Cancel", plus a text link "View the raw RPC responses".
Proof rail: READ verified with the agreement hash, ATTEST shows a pulsing dot and "in flight" as the appraisal is sealed, SIGN and SETTLE are em dashes.`),
      },
      {
        id: '03-draw',
        title: 'Draw against the line',
        prompt: bond(`
Page title "Draw", subtitle "2,000.00 USDC against 0.42 BTC of collateral on Bitcoin testnet."
Left canvas, top: an amount input in large mono showing "2,000.00" with "USDC" as a suffix, a secondary line reading "maximum 7,360.00 available", and a thin rule acting as a slider with the handle at roughly a quarter of its length.
Below, a quotation panel laid out as a two-column definition list with hairlines: "Rate 9.4% APR", "Origination fee 12.00 USDC", "Arrival in one NEAR block", "Collateral ratio after draw 48.6%", "Liquidation price 0.0312 BTC/USD". A mono caption under it: "quoted at block 214,893,401 · valid for 30 blocks".
Below that, a panel titled "Authorisation" with the sentence "The draw is signed by an 11-of-17 threshold, not by a keeper with a private key." and a compact row of seventeen small squares, eleven of them filled in #2B5F8A and six outlined, each square labelled with a tiny mono signer index. Under it a mono line "signature 0x5b0e...77c1".
Bottom bar right-aligned: primary "Confirm draw", secondary "Adjust amount", and a text link "Read the terms".
Proof rail: READ verified, ATTEST verified, SIGN shows the pulsing dot and "in flight" with "11 of 17 collected", SETTLE is an em dash.`),
      },
      {
        id: '04-statement',
        title: 'Loan statement',
        prompt: bond(`
Page title "Statement", subtitle "01 Oct — 05 Nov 2026 · line 0x8f2c...41ae", with a secondary button "Export PDF" on the right of the title row.
Left canvas: a compact summary strip of four figures separated by hairlines — "Drawn 5,140.00 USDC", "Repaid 1,860.00 USDC", "Interest accrued 96.40 USDC", "Next payment 1,240.00 on 14 Nov".
Then a table titled "Events" with columns DATE, EVENT, ASSET, AMOUNT, CHAIN, PROOF. Six rows: 01 Oct "collateral locked" BTC 0.42 "bitcoin-testnet" with a check and a truncated txid; 01 Oct "appraisal sealed" — 12,480.00 USDC "near-testnet"; 02 Oct "draw" USDC 2,000.00 "near-testnet"; 18 Oct "draw" USDC 3,140.00 "near-testnet"; 28 Oct "repayment" USDC 1,860.00 "near-testnet"; 04 Nov "collateral re-read" BTC 0.42 "bitcoin-testnet" with a second hash showing the price moved. Each PROOF cell shows a check glyph plus a short mono hash.
Under the table, a footnote panel with a 1px rule, small secondary text: "Every event above links to a transaction you can open. Interest is computed by the contract, not by this page."
Proof rail: all four stages verified, representing the most recent event.`),
      },
      {
        id: '05-closeout',
        title: 'Close-out by threshold signature',
        prompt: bond(`
Page title "Close-out" with a badge in #A83A2C reading "price breach", and the subtitle "Collateral ratio reached 78.4% at block 214,892,006. Liquidation at 75%."
Left canvas, top: a two-column panel of facts with hairlines: "Collateral 0.42 BTC", "Outstanding 5,140.00 USDC", "Collateral ratio 78.4%", "Trigger permissionless — anyone may call it", "Seizure 0.42 BTC to the desk address tb1qz8...k4f1", "Recourse the borrower keeps the surplus 1,180.00 USDC".
Below, the centrepiece panel titled "Seizure is a threshold signature" containing the sentence "The seizure is a signature from an 11-of-17 network. No keeper holds a key that could move this collateral." and the same seventeen-square signer row with eleven filled in #2B5F8A, plus a mono line "message hash 0x11c4...8ab0 · signature 0x7f3d...e019".
Below that a panel titled "What the borrower sees" with the sentence "An alert with this exact hash was emitted 4 blocks before execution, and the same hash is printed in the statement." plus a mono block of three lines showing the alert, the execution and the finality block heights.
Bottom bar right-aligned: primary "Execute close-out" in a bordered danger style, secondary "Read the liquidation rule", and a text link "Dispute with a fresh read".
Proof rail: READ verified with a fresh 3 of 3 read, ATTEST verified, SIGN verified 11 of 17, SETTLE shows the pulsing dot and "in flight".`),
      },
      {
        id: '06-desk-view',
        title: 'Desk operator view',
        prompt: bond(`
The lender's side of the same contract: this is the screen an operator watches all day.
Page title "Desk" with the subtitle "Four lines, one of them breaching, one awaiting a fresh read."
Left canvas, top: a four-figure strip divided by hairlines: "Lines open" 4, "Outstanding" 18,640.00 USDC, "Collateral" 47,200.00 USDC, "Breaches today" 1 in #A83A2C.
Then a table of lines with columns BORROWER, COLLATERAL, RATIO, OUTSTANDING, HEALTH, NEXT ACTION. Row 1 borrower "northwind.testnet", collateral "0.42 BTC", ratio 78.4% in #A83A2C, outstanding 5,140.00, health badge "breach", next action a text link "close-out queued". Row 2 "harbor.testnet" 3.10 ETH, 44.1%, 6,200.00, badge "current", link "none". Row 3 "acme-ops.testnet" 18.00 SOL, 39.8%, 4,800.00, badge "current", link "none". Row 4 "selene.testnet" 0.08 BTC, 61.2%, 2,500.00, badge in amber "stale read", link "re-read now".
Below the table, a queue panel titled "Awaiting execution" with two rows: "close-out northwind.testnet · 11 of 17 collected · 4 blocks remaining" with a thin progress rule, and "re-read selene.testnet · 2 of 3 RPCs responded" in amber.
Right of the canvas title row: a mono line "block 214,892,118 · 3s ago" and a secondary button "Export desk report".
Proof rail: READ verified with two of three providers named beneath, ATTEST verified, SIGN shows the pulsing dot with "11 of 17 collected", SETTLE em dash.`),
      },
    ],
  },
];
