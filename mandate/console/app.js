// Mandate console — reads one contract snapshot and renders it.
//
// No framework, no build step, no dependency. Every figure on screen comes from
// a contract view captured in `data/snapshot.json` by `make demo` (the Rust
// scenario runs the real contract in near-sdk's test VM). This file formats
// amounts and derives state labels; it never computes a balance, a limit, or a
// decision. The Verify page recomputes hashes and compares them, which is the
// opposite of trusting the page.

const SPEED = 1150;

const CODES = [
  'amount_zero', 'asset_mismatch', 'attestation_mismatch', 'attestation_required',
  'attestor_only', 'budget_exhausted', 'chain_not_enabled', 'counterparty_not_allowed',
  'decision_replayed', 'mandate_expired', 'mandate_suspended', 'access_key_missing',
  'not_found', 'owner_only', 'per_counterparty_day_exceeded', 'per_day_exceeded',
  'per_tx_exceeded', 'policy_changed', 'policy_invalid', 'request_not_pending', 'unauthorized',
];

const CODE_NOTES = {
  amount_zero: 'A spend of zero is not a spend; refused before any counter moves.',
  asset_mismatch: 'The mandate spends one asset. Another one is a different mandate.',
  attestation_mismatch: 'The attested intent and the call disagree on amount, vendor or chain.',
  attestation_required: 'The policy demands an attestation and none was presented.',
  attestor_only: 'Only the attestor may write a foreign transaction reference.',
  budget_exhausted: 'The funded balance, not a comparison, is the ceiling (D-002).',
  chain_not_enabled: 'No allowlist entry names this chain.',
  counterparty_not_allowed: 'Vendor is absent from the allowlist for this chain.',
  decision_replayed: 'A decision authorises one spend, once; a settled intent cannot be reclaimed.',
  mandate_expired: 'Block height passed the policy expiry.',
  mandate_suspended: 'The owner pulled the kill switch. Checked before anything else.',
  access_key_missing: 'Account-level: the agent key was removed, so no call can arrive.',
  not_found: 'No mandate or request with that id.',
  owner_only: 'Only the owner account may fund, suspend, resume, approve or re-policy.',
  per_counterparty_day_exceeded: 'Daily ceiling for one vendor on one chain would be crossed.',
  per_day_exceeded: 'Daily ceiling for the whole mandate would be crossed.',
  per_tx_exceeded: 'Single-transaction ceiling would be crossed.',
  policy_changed: 'The decision was attested under a different policy revision than the one now in force.',
  policy_invalid: 'The policy object fails validation: version, empty allowlist, inverted limits.',
  request_not_pending: 'The escalation was already answered or never existed.',
  unauthorized: 'Caller is not permitted to perform this action.',
};

// Categories the filters group by. A refusal is its own category: the typed code,
// not the step's label, decides what a row counts as.
const KIND_LABEL = {
  authorised: 'authorised', refused: 'refused', escalated: 'escalated',
  settled: 'settled', resumed: 'resumed', repolicy: 're-policied',
};

const state = {
  snap: null, docs: null, chain: null, cursor: 0, route: 'desk', playing: false, timer: null, routed: false,
  filter: 'all', chainFilter: 'all', chainMandate: 'all',
};

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (v) =>
  String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const dec = () => state.snap.decimals;

/** Format an integer amount for display. String math only: no float, no rounding. */
function units(raw, decimals = dec(), show = 2) {
  const s = String(raw ?? '0').replace('-', '').padStart(decimals + 1, '0');
  const whole = s.slice(0, s.length - decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = s.slice(s.length - decimals);
  return `${String(raw ?? '').startsWith('-') ? '−' : ''}${whole}${show > 0 ? `.${frac.slice(0, show)}` : ''}`;
}

function full(raw, decimals = dec()) {
  const s = String(raw ?? '0').padStart(decimals + 1, '0');
  return `${s.slice(0, s.length - decimals)}.${s.slice(s.length - decimals)}`;
}

function short(h, head = 10, tail = 6) {
  const s = String(h ?? '');
  if (!s) return '—';
  return s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function glyphFor(s) {
  return { ok: '✓', fail: '✗', flight: '·', warn: '!', idle: '—' }[s] ?? '—';
}

function tag(s, word) {
  return `<span class="state" data-state="${s}"><span class="glyph" aria-hidden="true">${glyphFor(s)}</span>${esc(word)}</span>`;
}

function stat(label, value, note = '') {
  return `<div><dt>${esc(label)}</dt><dd>${value}${note ? `<span class="rail-sub">${esc(note)}</span>` : ''}</dd></div>`;
}

function views() {
  return state.cursor === 0 ? state.snap.initial : state.snap.steps[state.cursor - 1].views;
}

function step() {
  return state.cursor === 0 ? null : state.snap.steps[state.cursor - 1];
}

function mandate() {
  return views().mandates[0];
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ------------------------------------------------------------------ views

function deskHtml() {
  const v = views();
  const s = step();
  const m = v.mandates[0];
  const a = s && s.authorization;

  const rows = v.mandates
    .map(
      (x) => `<tr>
        <td><a href="#/mandate">${esc(x.id)}</a><div class="mono">${esc(short(x.policy_hash))}</div></td>
        <td class="mono">${esc(x.agent)}</td>
        <td class="num">${units(x.balance)} <span class="rail-sub">${esc(x.asset)}</span></td>
        <td class="num">${units(x.spent_day)} <span class="rail-sub">of ${units(x.per_day)}</span></td>
        <td>${x.suspended ? tag('fail', 'suspended') : tag('ok', 'active')}</td>
      </tr>`,
    )
    .join('');

  const pendingRows = v.pending.length
    ? v.pending
        .map(
          (p) => `<tr>
            <td class="mono">${esc(p.request_id)}</td>
            <td class="num">${units(p.amount)} <span class="rail-sub">${esc(p.asset)}</span></td>
            <td class="mono">${esc(short(p.intent_hash))}</td>
            <td>${tag('warn', 'awaiting owner')}</td>
          </tr>`,
        )
        .join('')
    : `<tr><td colspan="4">No request is waiting for a human. Every spend under the threshold debits in the same receipt.</td></tr>`;

  // Readability, not decoration: the run is fifteen events and the refusals are
  // what a reader comes for. The counts come from the snapshot, so a chip cannot
  // advertise a category the run does not contain.
  const kindOf = (x) => (x.code ? 'refused' : x.kind);
  const counts = state.snap.steps.reduce((acc, x) => {
    const k = kindOf(x);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const chips = [['all', 'all events', state.snap.steps.length],
    ...Object.keys(counts).sort((a, b) => counts[b] - counts[a]).map((k) => [k, KIND_LABEL[k] ?? k, counts[k]])]
    .map(
      ([k, label, n]) => `<button type="button" class="chip" data-filter="${esc(k)}" aria-pressed="${state.filter === k}">${esc(label)}<span class="chip-n">${n}</span></button>`,
    )
    .join('');

  const timeline = state.snap.steps
    .map(
      (x) => `<li data-current="${x.index === state.cursor}" data-kind="${esc(kindOf(x))}">
        <button type="button" data-step="${x.index}" ${x.index === state.cursor ? 'aria-current="true"' : ''}>
          <span class="idx">${String(x.index).padStart(2, '0')}</span>
          <span class="what">${esc(x.label)}${x.code ? ` · <span class="mono">${esc(x.code)}</span>` : ''}<small>${esc(x.detail)}</small></span>
          <span>${x.code ? tag('fail', 'refused') : x.kind === 'settled' ? tag('ok', 'settled') : x.kind === 'escalated' ? tag('warn', 'pending') : tag('ok', x.kind)}</span>
        </button>
      </li>`,
    )
    .join('');

  return `
    <dl class="strip">
      ${stat('balance held', `${units(m.balance)} <span class="unit">${esc(m.asset)}</span>`, `exact ${full(m.balance)}`)}
      ${stat('authorised today', units(m.spent_day), `ceiling ${units(m.per_day)}`)}
      ${stat('spent in total', units(m.spent_total), `${m.settled_count} settled`)}
      ${stat('mandates', String(v.stats.total_mandates), `${v.stats.total_pending} pending`)}
    </dl>

    <h2>${state.cursor === 0 ? 'Start of the run' : `Event ${state.cursor} of ${state.snap.steps.length}`}</h2>
    ${
      s
        ? `<section class="card" aria-labelledby="event-title">
            <h3 id="event-title">${esc(s.label)}</h3>
            <p>${esc(s.detail)}</p>
            ${s.code ? `<p>${tag('fail', s.code)} <span class="mono">PolicyViolation: ${esc(s.code)}</span></p>` : ''}
            ${a ? `<p class="mono">intent ${esc(short(a.intent_hash))} · decision ${esc(short(a.decision_hash))} · policy ${esc(short(a.policy_hash))} · status ${esc(a.status)}</p>` : ''}
          </section>`
        : `<section class="card"><h3>Before the first call</h3><p>The mandate exists because 100.00 USDC was deposited with <code>create_mandate</code>. No balance, no mandate.</p></section>`
    }

    <div class="actions">
      <button class="btn ghost" type="button" data-action="prev" ${state.cursor === 0 ? 'disabled' : ''}>← Previous</button>
      <button class="btn ghost" type="button" data-action="next" ${state.cursor === state.snap.steps.length ? 'disabled' : ''}>Next →</button>
      <button class="btn" type="button" data-action="${state.playing ? 'pause' : 'play'}">${state.playing ? 'Pause replay' : 'Play replay'}</button>
      <button class="btn ghost" type="button" data-action="replay">Back to start</button>
      <button class="btn ghost" type="button" data-action="export">Export rows (CSV)</button>
    </div>

    <h2>Mandates the contract serves</h2>
    <div class="table-wrap">
      <table>
        <caption>list_mandates() — every row is a contract view</caption>
        <thead><tr><th scope="col">mandate</th><th scope="col">agent</th><th scope="col" class="num">balance</th><th scope="col" class="num">spent today</th><th scope="col">state</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <h2>Escalation queue</h2>
    <div class="table-wrap">
      <table>
        <caption>list_pending() — approval is a stored request, never a paused call (D-005)</caption>
        <thead><tr><th scope="col">request</th><th scope="col" class="num">amount</th><th scope="col">intent</th><th scope="col">state</th></tr></thead>
        <tbody>${pendingRows}</tbody>
      </table>
    </div>

    <h2>The run, event by event</h2>
    <div class="filters" role="group" aria-label="Filter events by outcome">${chips}</div>
    <p class="rail-sub" id="event-filter-status" role="status"></p>
    <ol class="timeline">${timeline}</ol>
  `;
}

function mandateHtml() {
  const m = mandate();
  const policy = JSON.parse(state.snap.policyJson);
  // All four limits must come from the revision this event was judged under.
  // Taking per-counterparty from the file's final policy would print revision 1's
  // per-transaction beside revision 2's per-counterparty ceiling.
  const rev = (views().policy_history ?? []).find((r) => r.rev === m.policy_rev);
  const perCounterparty = rev ? rev.per_counterparty_day : policy.per_counterparty_day;
  const allow = policy.allow
    .map(
      (e) => `<tr><td class="mono">${esc(e.chain)}</td><td class="mono">${esc(short(e.to, 12, 6))}</td><td>${esc(e.label)}</td><td>${tag('ok', 'allowed')}</td></tr>`,
    )
    .join('');

  // The history is a contract view, one row per revision. The console does not
  // diff policies; it prints the limits each revision carried.
  const revisions = (views().policy_history ?? [])
    .map(
      (r) => `<tr>
        <td class="mono">${esc(r.rev)}</td>
        <td class="mono">${esc(short(r.hash, 10, 6))}</td>
        <td class="num">${units(r.per_tx)}</td>
        <td class="num">${units(r.per_day)}</td>
        <td class="num">${units(r.per_counterparty_day)}</td>
        <td class="num">${units(r.escalate_over)}</td>
        <td class="mono num">${esc(r.at_block)}</td>
        <td>${r.rev === m.policy_rev ? tag('ok', 'current') : tag('idle', 'superseded')}</td>
      </tr>`,
    )
    .join('');

  return `
    <section class="card">
      <p class="eyebrow">funded balance held by the contract</p>
      <p class="figure"><span class="amount">${units(m.balance)}</span><span class="unit">${esc(m.asset)}</span></p>
      <p class="rail-sub">Exact: <span class="mono">${full(m.balance)}</span> in the smallest unit. Budget is this balance, not a comparison.</p>
    </section>

    <dl class="strip" style="margin-top:12px">
      ${stat('per transaction', units(m.per_tx))}
      ${stat('per day', units(m.per_day))}
      ${stat('per counterparty / day', units(perCounterparty))}
      ${stat('escalate over', units(m.escalate_over))}
    </dl>

    <h2>Boundaries</h2>
    <div class="table-wrap">
      <table>
        <caption>policy ${esc(short(m.policy_hash, 12, 6))} · rev ${esc(m.policy_rev)} · version ${esc(policy.version)} · expires at block ${esc(m.expires_at_block || 'never')}</caption>
        <thead><tr><th scope="col">chain</th><th scope="col">counterparty</th><th scope="col">label</th><th scope="col">state</th></tr></thead>
        <tbody>${allow}</tbody>
      </table>
    </div>

    <h2>Policy revisions</h2>
    <div class="table-wrap">
      <table>
        <caption>get_policy_history() — every revision this mandate has had, oldest first</caption>
        <thead><tr><th scope="col">rev</th><th scope="col">hash</th><th scope="col" class="num">per tx</th><th scope="col" class="num">per day</th><th scope="col" class="num">per counterparty</th><th scope="col" class="num">escalate over</th><th scope="col" class="num">at block</th><th scope="col">state</th></tr></thead>
        <tbody>${revisions}</tbody>
      </table>
    </div>

    <h2>Attestation</h2>
    <section class="card">
      <p>Every spend above the threshold must present a decision. The contract compares the decision hash, requires that it has not been used, and recomputes the intent hash from the amount, vendor, asset and chain it was called with.</p>
      <p class="mono">code hash allowed: ${esc(state.snap.attestationCodeHash)}</p>
      <p class="rail-sub">A decision also names the policy revision it was made under. After <code>update_policy</code> the revision moves, and a decision for the old one is refused with <code>policy_changed</code> — event 14.</p>
      <p class="rail-sub">The contract compares a hash; it does not verify the hardware signature. That separation is stated in the README and is not blurred here.</p>
    </section>

    <h2>Settlement</h2>
    <section class="card">
      <p>${m.settled_count > 0 ? tag('ok', `${m.settled_count} intent settled`) : tag('idle', 'no foreign tx yet')}</p>
      <p class="rail-sub">An authorisation with no settlement is visibly unfinished — that is what the fourth rail cell is for. Only the attestor account may write a transaction reference.</p>
    </section>

    <h2>Policy document</h2>
    <details class="card">
      <summary>Canonical JSON the hash is taken over</summary>
      <pre class="mono" style="overflow-x:auto">${esc(state.snap.policyJson)}</pre>
      <p class="rail-sub">Recompute: sha256 of the exact bytes above must equal <span class="mono">${esc(m.policy_hash)}</span>. <a href="#/verify">Verify does it in this browser</a>.</p>
    </details>

    <div class="actions">
      <button class="btn ghost" type="button" data-action="export">Export rows (CSV)</button>
      <button class="btn ghost" type="button" data-action="print">Print receipt</button>
      <button class="btn ghost" type="button" data-action="copy" data-copy="${esc(m.policy_hash)}">Copy policy hash</button>
    </div>
  `;
}

function refusalsHtml() {
  const observed = new Set(state.snap.steps.map((s) => s.code).filter(Boolean));
  const rows = CODES.map(
    (c) => `<tr>
      <td class="mono">${esc(c)}</td>
      <td>${esc(CODE_NOTES[c] ?? '')}</td>
      <td>${observed.has(c) ? tag('fail', 'seen in this run') : tag('idle', 'not in this run')}</td>
    </tr>`,
  ).join('');

  return `
    <p class="lede">The contract's refusal vocabulary is frozen: ${CODES.length} codes, one per failure path, each asserted by a unit test. A judge can grep the failed receipt for the exact word.</p>
    <div class="table-wrap">
      <table>
        <caption>PolicyViolation codes — ${observed.size} of ${CODES.length} appear in the replay</caption>
        <thead><tr><th scope="col">code</th><th scope="col">what it means</th><th scope="col">this run</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function aboutHtml() {
  return `
    <section class="card">
      <h3>What this page is</h3>
      <p>A console over one mandate contract. It renders the four things the contract will tell anyone: the mandate view, the escalation queue, the counters, and the settlement record. In this build the data is a <strong>replay</strong>: a fixed scenario executed against the real contract in near-sdk's test VM, serialised by <code>make demo</code>. The page cannot invent a number, because it has no arithmetic about money in it.</p>
    </section>

    <section class="card">
      <h3>What it is not</h3>
      <p>Not a wallet. It holds no key and signs nothing. With a deployed contract address it becomes a read-only view of testnet; writes belong to a signing tool, never to a page that renders a receipt.</p>
      <p class="rail-sub">The replay switches are a player, not a simulation: each step was a real call, recorded with the views it produced.</p>
    </section>

    <section class="card">
      <h3>The claim this exists to support</h3>
      <p>"A spend is rejected unless its decision hash matches the attested hash." Event 7 is that refusal, and the Verify page recomputes the intent hash in your browser so the check does not depend on our word.</p>
      <p class="rail-sub">Other sentences we are allowed to say, and what proves each, live in <code>docs/CLAIMS.md</code>. Testnet only; no mainnet funds are at risk.</p>
    </section>

    <section class="card">
      <h3>Keyboard</h3>
      <p><kbd>d</kbd> desk · <kbd>m</kbd> mandate · <kbd>v</kbd> verify · <kbd>x</kbd> refusals · <kbd>w</kbd> paper · <kbd>[</kbd> <kbd>]</kbd> step · <kbd>p</kbd> play · <kbd>e</kbd> export · <kbd>?</kbd> help</p>
    </section>
  `;
}

// Testnet evidence, if this build has any. `make chain-demo` appends to
// chain.json on every run; without the file the card says so instead of
// pretending a deployment exists.
function chainRuns() {
  const c = state.chain;
  if (!c) return [];
  if (Array.isArray(c.runs) && c.runs.length) return c.runs;
  // Older builds wrote one run with its transactions at the top level.
  return [{ at: c.captured_at, block_height: c.block_height, mandate: c.mandate, txs: c.txs ?? [], verified: c.verified }];
}

const TX_LABEL = { success: 'created', authorised: 'authorised', refused: 'refused', settled: 'settled' };
const txCategory = (t) => (t.code ? 'refused' : t.outcome);

function chainCard() {
  const c = state.chain;
  if (!c) {
    return `<section class="card"><h3>On chain</h3><p>No testnet run is recorded in this build. <code>make chain-demo ACCOUNT=&lt;id.testnet&gt;</code> performs one matching spend, one tampered spend and one settlement, then appends to <code>data/chain.json</code>; this card renders that file and nothing else.</p></section>`;
  }

  const runs = chainRuns().slice().reverse(); // newest first
  const all = runs.flatMap((r) => r.txs ?? []);
  const counts = all.reduce((acc, t) => {
    const k = txCategory(t);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  // Only categories that occurred get a chip, so no chip can read zero.
  const chips = [['all', 'all transactions', all.length],
    ...Object.keys(TX_LABEL).filter((k) => counts[k]).map((k) => [k, TX_LABEL[k], counts[k]])]
    .map(
      ([k, label, n]) => `<button type="button" class="chip" data-chain-filter="${esc(k)}" aria-pressed="${state.chainFilter === k}">${esc(label)}<span class="chip-n">${n}</span></button>`,
    )
    .join('');

  const ids = [...new Set([...runs.map((r) => r.mandate), ...(c.views?.mandates ?? []).map((m) => m.id)].filter(Boolean))];
  const select = `<select id="chain-mandate" class="field" aria-label="Filter transactions by mandate">
      <option value="all">all mandates</option>
      ${ids.map((id) => `<option value="${esc(id)}"${state.chainMandate === id ? ' selected' : ''}>${esc(id)}</option>`).join('')}
    </select>`;

  const blocks = runs
    .map((r, i) => {
      const rows = (r.txs ?? [])
        .map(
          (t) => `<tr data-tx-outcome="${esc(txCategory(t))}" data-tx-mandate="${esc(r.mandate ?? '')}">
            <td>${esc(t.label)}</td>
            <td class="mono">${esc(short(t.hash, 14, 8))}</td>
            <td>${t.code ? tag('fail', t.code) : tag('ok', t.outcome)}</td>
            <td><a href="${esc(t.explorer)}" rel="noreferrer noopener" target="_blank">open</a></td>
          </tr>`,
        )
        .join('');
      return `<details class="run" data-run ${i === 0 ? 'open' : ''}>
        <summary>
          <span class="run-title">run ${runs.length - i}</span>
          <span class="mono">${esc(r.mandate ?? '—')}</span>
          <span class="run-meta">${(r.txs ?? []).length} txs · block ${esc(String(r.block_height ?? '—'))}${r.at ? ` · ${esc(String(r.at).slice(0, 16).replace('T', ' '))} UTC` : ''}</span>
        </summary>
        <div class="table-wrap">
          <table>
            <caption>run ${runs.length - i}, ${(r.txs ?? []).length} testnet transactions</caption>
            <thead><tr><th scope="col">step</th><th scope="col">transaction</th><th scope="col">result</th><th scope="col">verify</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </details>`;
    })
    .join('');

  const stats = c.views?.stats;
  const latest = c.views?.mandates?.find((m) => m.id === c.mandate) ?? c.views?.mandates?.[0];
  return `<section class="card">
    <h3>On chain — testnet</h3>
    <p>Contract <code>${esc(c.contract)}</code>, read at block ${esc(String(c.block_height))}. ${runs.length} run${runs.length === 1 ? '' : 's'} recorded, ${all.length} transactions${stats ? `; the contract serves ${esc(String(stats.total_mandates))} mandates and holds ${latest ? `${units(latest.balance)} <span class="unit">${esc(latest.asset)}</span>` : '—'}` : ''}. Each row opens on the block explorer.</p>
    <div class="filters" role="group" aria-label="Filter testnet transactions">${chips}${select}</div>
    <p class="rail-sub" id="chain-filter-status" role="status"></p>
    ${blocks}
    <p class="rail-sub">The refused row is a failed transaction on purpose: its attestation named a different amount, so the contract logged <code>violation: ${esc(c.verified?.refused_code ?? 'policy_violation')}</code> and trapped. Settlement is a foreign tx reference recorded by <code>settle</code>, not a bridged transfer.</p>
  </section>`;
}

function verifyHtml() {
  return `
    ${chainCard()}
    <p class="lede">The checks below run in this browser, over the snapshot on disk. If any of them disagreed with the contract, the page would say so.</p>
    <p id="verify-status" role="status">Recomputing…</p>
    <div class="table-wrap" id="verify-rows"><table><caption>checks</caption><tbody><tr><td>Reading the snapshot…</td></tr></tbody></table></div>
  `;
}

async function renderVerify() {
  const host = $('#verify-rows');
  const status = $('#verify-status');
  if (!host) return;
  const snap = state.snap;
  const rows = [];
  try {
    const policyHash = await sha256Hex(snap.policyJson);
    rows.push({ label: 'policy_hash = sha256(canonical policy JSON)', expected: snap.policyHash, actual: policyHash });

    for (const s of snap.steps) {
      const a = s.authorization;
      if (!a) continue;
      const json = JSON.stringify({ amount: String(a.amount), asset: a.asset, chain: a.chain, vendor: a.vendor });
      const h = await sha256Hex(json);
      rows.push({ label: `event ${s.index} · intent = (chain, amount, vendor, asset)`, expected: a.intent_hash, actual: h, note: json });
    }

    // One decision, one intent. Step 3 and step 4 share a decision on purpose:
    // approval answers the stored request, it is not a second decision (D-005).
    const byDecision = new Map();
    for (const s of snap.steps) {
      if (!s.authorization) continue;
      if (!byDecision.has(s.authorization.decision_hash)) byDecision.set(s.authorization.decision_hash, new Set());
      byDecision.get(s.authorization.decision_hash).add(s.authorization.intent_hash);
    }
    const multiIntent = [...byDecision.values()].filter((set) => set.size > 1).length;
    rows.push({
      label: 'each decision authorises exactly one intent',
      expected: `${byDecision.size} decisions`,
      actual: `${multiIntent} reused`,
      ok: multiIntent === 0,
    });

    const m = snap.final.mandates[0];
    rows.push({ label: 'settled intents on the mandate view', expected: '1', actual: String(m.settled_count), ok: m.settled_count === 1 });

    // A decision is only good for the policy revision it names, so every
    // authorisation's policy hash must be one the mandate actually had.
    const history = snap.final.policy_history ?? [];
    const hashes = new Set(history.map((r) => r.hash));
    const stale = snap.steps.filter((s) => s.authorization && !hashes.has(s.authorization.policy_hash));
    rows.push({
      label: 'every decision names a stored policy revision',
      expected: `${history.length} revisions`,
      actual: `${stale.length} unknown`,
      ok: stale.length === 0,
    });

    const latest = history[history.length - 1];
    const head = snap.final.mandates[0];
    rows.push({
      label: 'mandate policy_hash is the latest revision',
      expected: String(head.policy_hash),
      actual: String(latest ? latest.hash : 'none'),
    });
    rows.push({
      label: 'policy_rev equals the length of the history',
      expected: String(history.length),
      actual: String(head.policy_rev),
      ok: head.policy_rev === history.length,
    });

    const sum = snap.final.mandates.reduce((n, x) => n + BigInt(x.spent_total), 0n);
    rows.push({
      label: 'stats.total_authorised equals the sum of spent_total',
      expected: String(snap.final.stats.total_authorised),
      actual: String(sum),
      ok: String(sum) === String(snap.final.stats.total_authorised),
    });
  } catch (err) {
    status.textContent = `Could not recompute: ${err.message}`;
    return;
  }

  const failed = rows.filter((r) => (r.ok === undefined ? r.expected !== r.actual : !r.ok));
  status.innerHTML = failed.length
    ? `${tag('fail', `${failed.length} of ${rows.length} checks disagree`)}`
    : `${tag('ok', `${rows.length} of ${rows.length} agree`)}`;

  host.innerHTML = `<table>
    <caption>recomputed in this browser with WebCrypto</caption>
    <thead><tr><th scope="col">check</th><th scope="col">contract</th><th scope="col">recomputed</th><th scope="col">result</th></tr></thead>
    <tbody>${rows
      .map((r) => {
        const ok = r.ok === undefined ? r.expected === r.actual : r.ok;
        return `<tr>
          <td>${esc(r.label)}${r.note ? `<div class="mono">${esc(r.note)}</div>` : ''}</td>
          <td class="mono">${esc(short(r.expected, 14, 8))}</td>
          <td class="mono">${esc(short(r.actual, 14, 8))}</td>
          <td>${ok ? tag('ok', 'agrees') : tag('fail', 'disagrees')}</td>
        </tr>`;
      })
      .join('')}</tbody></table>`;
}

// The paper route renders the markdown this repository ships, converted at build
// time by tools/build-docs.mjs. No renderer is loaded here, and every document
// was escaped before it was written.
function paperHtml() {
  if (!state.docs) {
    return `<section class="card"><h3>The documents were not built</h3><p>Run <code>make docs</code> (or <code>node tools/build-docs.mjs</code>) and reload. The console reads the same markdown the repository ships.</p></section>`;
  }
  // Buttons, not anchors: the console routes on the hash, so href="#doc-paper"
  // would be read as a route and bounce the reader back to the desk.
  const toc = state.docs.docs
    .map((d) => `<button type="button" class="jump" data-jump="doc-${esc(d.id)}">${esc(d.title)}</button>`)
    .join('');
  const bodies = state.docs.docs
    .map(
      (d) => `<article class="paper" id="doc-${esc(d.id)}">
        <p class="eyebrow">${esc(d.path)}</p>
        ${d.html.replace(/id="/g, `id="${esc(d.id)}-`)}
      </article>`,
    )
    .join('');
  return `<nav class="paper-toc" aria-label="Documents">${toc}</nav>${bodies}`;
}

// The control plane: the same views, for a program instead of a person. The
// page describes the two surfaces that exist in this repository — a scoped HTTP
// API and an MCP stdio server — and probes the API so "running" is observed,
// not asserted.
function apiHtml() {
  const routes = [
    ['GET /v1/status', 'read:views', 'network, contract, asset, decimals, event count'],
    ['GET /v1/mandates', 'read:views', 'balance held, limits in force, settled count'],
    ['GET /v1/pending', 'read:views', 'spends waiting for the owner'],
    ['GET /v1/stats', 'read:views', 'the counters the footer prints'],
    ['GET /v1/policy', 'read:views', 'policy JSON, its hash, every revision'],
    ['GET /v1/events?limit=&from=', 'read:events', 'the event log with refusal codes'],
    ['GET /v1/events/:index', 'read:events', 'one event, including its authorisation'],
    ['GET /v1/verify', 'read:verify', 'recomputed hashes and a stable inputsHash'],
  ]
    .map(
      (r) => `<tr><td><code>${esc(r[0])}</code></td><td><code>${esc(r[1])}</code></td><td>${esc(r[2])}</td></tr>`,
    )
    .join('');

  return `
    <section class="card">
      <p class="eyebrow">for machines, not people</p>
      <p>The console is one client. The same contract views are served two other ways, both read-only: an HTTP API with scoped keys, and an MCP server an assistant can call as tools. Neither holds a key that can spend, and neither is a chain connection — they read <code>data/snapshot.json</code>, the replay <code>make demo</code> wrote.</p>
    </section>

    <section class="card">
      <h3>Issue a key, then ask</h3>
      <p>The secret is printed once and stored only as a SHA-256 hash. A key names the scopes it may use; <code>make keys</code> lists them without revealing anything reusable.</p>
      <pre class="code">node tools/keys.mjs issue --label claude --scopes read:views,read:events
export MANDATE_KEY=&lt;the key&gt;
make api
curl -s -H "Authorization: Bearer $MANDATE_KEY" \\
  http://127.0.0.1:4174/v1/mandates</pre>
      <div class="table-wrap">
        <table>
          <caption>Routes and the one scope each requires</caption>
          <thead><tr><th>Route</th><th>Scope</th><th>Returns</th></tr></thead>
          <tbody>${routes}</tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h3>Or hand it to an assistant</h3>
      <p>Six tools over stdio, no network, no dependency: <code>mandate_status</code>, <code>mandate_list</code>, <code>mandate_pending</code>, <code>mandate_events</code>, <code>mandate_event</code>, <code>mandate_verify</code>. Add this to your MCP client's config:</p>
      <pre class="code">{
  "mcpServers": {
    "mandate": { "command": "node", "args": ["tools/mcp-server.mjs"] }
  }
}</pre>
      <p class="rail-sub">A tool result says <code>replay of a contract run, never deployed</code> in every payload, so an assistant cannot quote it as a live balance by accident.</p>
    </section>

    <section class="card">
      <h3>Is it running?</h3>
      <p id="api-probe" data-state="idle">Not checked. This page sends no request until you ask, so opening it cannot fail on a server you have not started.</p>
      <p><button class="btn" type="button" data-action="probe">Check 127.0.0.1:4174</button></p>
      <p class="rail-sub">The check is a real <code>GET /health</code>. If the API is not running it says so, and the table above stays a description rather than a claim.</p>
    </section>`;
}

async function probeApi() {
  const el = document.getElementById('api-probe');
  if (!el) return;
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 1500);
  try {
    const res = await fetch('http://127.0.0.1:4174/health', { signal: stop.signal, cache: 'no-store' });
    const body = await res.json();
    el.dataset.state = 'ok';
    el.textContent = `Running. /health answered with ${body.routes.length} routes; every one of them needs a bearer key.`;
  } catch {
    el.dataset.state = 'idle';
    el.textContent = 'Not running. `make api` starts it on 127.0.0.1:4174. Until then this page is the specification, not a live check.';
  } finally {
    clearTimeout(timer);
  }
}

const ROUTES = {
  desk: { title: 'The desk', eyebrow: 'record of authority', lede: 'One mandate, one balance, a recorded run of fifteen events. Step through them and watch the rail; every figure is a contract view.', html: deskHtml },
  mandate: { title: 'The mandate', eyebrow: 'instrument of authority', lede: 'What the agent may do, what it may spend, and what the contract holds on its behalf.', html: mandateHtml },
  verify: { title: 'Verify', eyebrow: 'do not trust this page', lede: '', html: verifyHtml, after: renderVerify },
  refusals: { title: 'Refusals', eyebrow: 'typed, never prose', lede: '', html: refusalsHtml },
  api: { title: 'Control plane', eyebrow: 'for machines, not people', lede: '', html: apiHtml },
  paper: { title: 'Paper', eyebrow: 'the argument, in full', lede: 'The whitepaper, the architecture and the diagrams, rendered from the markdown this repository ships.', html: paperHtml },
  about: { title: 'About', eyebrow: 'scope and limits', lede: '', html: aboutHtml },
};

// ------------------------------------------------------------------ rail

function renderRail() {
  const v = views();
  const m = v.mandates[0];
  const s = step();
  const a = s && s.authorization;
  const code = s && s.code;

  const cells = [
    {
      n: '①', name: 'POLICY',
      state: m ? 'ok' : 'idle',
      value: m ? short(m.policy_hash, 8, 4) : '—',
      sub: m ? `rev ${m.policy_rev} · v1 · ${m.chains.length} chain${m.chains.length === 1 ? '' : 's'} allowed` : 'no read yet',
    },
    {
      n: '②', name: 'ATTEST',
      state: a ? 'ok' : code ? 'fail' : 'idle',
      value: a ? short(a.decision_hash, 8, 4) : code ? 'refused' : '—',
      sub: a ? 'decision hash not seen before' : code ? code : 'not reached',
    },
    {
      n: '③', name: 'AUTHORISE',
      state: a ? (a.status === 'authorised' ? 'ok' : 'flight') : code ? 'fail' : 'idle',
      value: a ? `${units(a.amount)} ${a.asset}` : code ? 'refused' : '—',
      sub: a ? a.status : code ? code : 'not reached',
    },
    {
      n: '④', name: 'SETTLE',
      state: m && m.settled_count > 0 ? 'ok' : 'idle',
      value: m && m.settled_count ? `${m.settled_count} settled` : '—',
      sub: m && m.settled_count ? 'foreign tx reference recorded' : 'no foreign tx yet',
    },
  ];

  $('#rail').innerHTML = cells
    .map(
      (c) => `<li data-state="${c.state}">
        <div class="rail-head">
          <span class="rail-name"><span aria-hidden="true">${c.n}</span> ${esc(c.name)}</span>
          <span class="state" data-state="${c.state}"><span class="glyph" aria-hidden="true">${glyphFor(c.state)}</span>${c.state === 'ok' ? 'done' : c.state === 'fail' ? 'refused' : c.state === 'flight' ? 'in flight' : 'not reached'}</span>
        </div>
        <p class="rail-value">${esc(c.value)}</p>
        <p class="rail-sub">${esc(c.sub)}</p>
      </li>`,
    )
    .join('');
  $('#rail-foot').textContent = `event ${state.cursor} of ${state.snap.steps.length} · rail follows the selected event, not the last one`;
}

// ------------------------------------------------------------------ routing

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ---------------------------------------------------------------- filters
//
// A filter is a view over the same snapshot: it hides rows and never recomputes
// a figure, moves the cursor, or changes what the CSV export contains.

function applyEventFilter(key = state.filter) {
  state.filter = key;
  const items = [...document.querySelectorAll('.timeline li[data-kind]')];
  let shown = 0;
  for (const li of items) {
    const match = key === 'all' || li.dataset.kind === key;
    li.hidden = !match;
    if (match) shown += 1;
  }
  for (const chip of document.querySelectorAll('[data-filter]')) {
    chip.setAttribute('aria-pressed', String(chip.dataset.filter === key));
  }
  const status = document.getElementById('event-filter-status');
  if (status) {
    status.textContent = items.length
      ? `Showing ${shown} of ${items.length} events${key === 'all' ? '' : `: ${KIND_LABEL[key] ?? key}`}. The replay controls still step the whole run.`
      : '';
  }
}

function applyChainFilter(key = state.chainFilter, mandate = state.chainMandate) {
  state.chainFilter = key;
  state.chainMandate = mandate;
  let shown = 0;
  let total = 0;
  for (const row of document.querySelectorAll('[data-tx-outcome]')) {
    total += 1;
    const match = (key === 'all' || row.dataset.txOutcome === key) && (mandate === 'all' || row.dataset.txMandate === mandate);
    row.hidden = !match;
    if (match) shown += 1;
  }
  // A run with nothing left to show collapses out of the way instead of staying
  // an empty disclosure.
  for (const run of document.querySelectorAll('details[data-run]')) {
    run.hidden = [...run.querySelectorAll('[data-tx-outcome]')].every((r) => r.hidden);
  }
  for (const chip of document.querySelectorAll('[data-chain-filter]')) {
    chip.setAttribute('aria-pressed', String(chip.dataset.chainFilter === key));
  }
  const status = document.getElementById('chain-filter-status');
  if (status && total) {
    status.textContent = `Showing ${shown} of ${total} transactions${mandate === 'all' ? '' : ` for ${mandate}`}${key === 'all' ? '' : ` (${TX_LABEL[key] ?? key})`}.`;
  }
}

function render() {
  const r = ROUTES[state.route];
  setText('view-eyebrow', r.eyebrow);
  setText('view-title', r.title);
  setText('view-lede', r.lede);
  // Each route gets its own title, so a tab, a bookmark and a shared link say
  // where they point instead of all reading "console".
  document.title = `${r.title} — Mandate console`;
  $('#view').innerHTML = r.html();
  renderRail();
  // The footer names the revision of the selected event, not the file's last
  // one, so the context bar can never contradict the card above it.
  const m = mandate();
  setText('foot-right', `${state.snap.steps.length} events · rev ${m.policy_rev} · policy ${short(m.policy_hash, 12, 6)} · schema ${state.snap.schema}`);
  if (r.after) r.after();
  // Filters survive a step: the DOM is rebuilt on every render, so re-apply the
  // chosen view instead of silently resetting it.
  if (state.route === 'desk') applyEventFilter(state.filter);
  if (state.route === 'verify') applyChainFilter(state.chainFilter, state.chainMandate);
}

// In-page document jumps. The target is focused so a keyboard or screen-reader
// reader continues from the section they asked for, not from the top again.
document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-jump]');
  if (!trigger) return;
  const target = document.getElementById(trigger.dataset.jump);
  if (!target) return;
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
});

function route() {
  const name = (location.hash.replace(/^#\/?/, '') || 'desk').split('/')[0];
  state.route = ROUTES[name] ? name : 'desk';
  for (const a of document.querySelectorAll('.tabs a')) {
    if (a.dataset.route === state.route) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  render();
  if (state.routed) {
    const h1 = $('#view-title');
    h1.setAttribute('tabindex', '-1');
    h1.focus({ preventScroll: true });
  }
  state.routed = true;
}

function setStep(next) {
  const max = state.snap.steps.length;
  const clamped = Math.max(0, Math.min(max, next));
  if (clamped === state.cursor) return;
  state.cursor = clamped;
  render();
  announce();
}

function announce() {
  const s = step();
  const live = $('#live');
  const m = mandate();
  live.textContent = s
    ? `Event ${s.index} of ${state.snap.steps.length}. ${s.label}. ${s.code ? `Refused with ${s.code}.` : s.detail} Balance ${full(m.balance)} ${m.asset}.`
    : `Start of the run. Balance ${full(m.balance)} ${m.asset}, nothing spent.`;
}

// ------------------------------------------------------------------ actions

function exportCsv() {
  const v = views();
  const head = ['mandate', 'owner', 'agent', 'asset', 'balance', 'spent_total', 'spent_day', 'per_tx', 'per_day', 'escalate_over', 'suspended', 'settled_count'];
  const rows = v.mandates.map((m) => [
    m.id, m.owner, m.agent, m.asset, full(m.balance), full(m.spent_total), full(m.spent_day),
    full(m.per_tx), full(m.per_day), full(m.escalate_over), String(m.suspended), String(m.settled_count),
  ]);
  const csv = [head, ...rows].map((r) => r.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([`${csv}\n`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `mandate-${state.snap.mandateId}-event-${state.cursor}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  $('#live').textContent = `Exported ${rows.length} mandate row${rows.length === 1 ? '' : 's'} as CSV.`;
}

function togglePlay() {
  if (state.playing) {
    state.playing = false;
    clearInterval(state.timer);
    render();
    return;
  }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    setStep(state.snap.steps.length);
    return;
  }
  state.playing = true;
  if (state.cursor >= state.snap.steps.length) state.cursor = 0;
  render();
  state.timer = setInterval(() => {
    if (state.cursor >= state.snap.steps.length) {
      state.playing = false;
      clearInterval(state.timer);
      render();
      return;
    }
    setStep(state.cursor + 1);
  }, SPEED);
}

document.addEventListener('click', async (e) => {
  const filterChip = e.target.closest('[data-filter]');
  if (filterChip) {
    applyEventFilter(filterChip.dataset.filter);
    return;
  }
  const chainChip = e.target.closest('[data-chain-filter]');
  if (chainChip) {
    applyChainFilter(chainChip.dataset.chainFilter, state.chainMandate);
    return;
  }
  const stepBtn = e.target.closest('[data-step]');
  if (stepBtn) {
    setStep(Number(stepBtn.dataset.step));
    return;
  }
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'next') setStep(state.cursor + 1);
  else if (action === 'prev') setStep(state.cursor - 1);
  else if (action === 'replay') {
    state.playing = false;
    clearInterval(state.timer);
    setStep(0);
    render();
  } else if (action === 'play' || action === 'pause') togglePlay();
  else if (action === 'export') exportCsv();
  else if (action === 'probe') probeApi();
  else if (action === 'print') window.print();
  else if (action === 'copy') {
    const value = e.target.closest('[data-action]').dataset.copy;
    await navigator.clipboard.writeText(value);
    $('#live').textContent = 'Policy hash copied.';
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'chain-mandate') applyChainFilter(state.chainFilter, e.target.value);
});

document.addEventListener('keydown', (e) => {
  const help = $('#help');
  if (e.key === 'Escape' && help.open) {
    help.close();
    return;
  }
  if (help.open) return;
  if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  const routes = { d: 'desk', m: 'mandate', v: 'verify', x: 'refusals', c: 'api', w: 'paper', a: 'about' };
  if (routes[e.key]) {
    location.hash = `#/${routes[e.key]}`;
    return;
  }
  if (e.key === ']') { e.preventDefault(); setStep(state.cursor + 1); }
  else if (e.key === '[') { e.preventDefault(); setStep(state.cursor - 1); }
  else if (e.key === 'p') togglePlay();
  else if (e.key === 'e') exportCsv();
  else if (e.key === '?') help.showModal();
});

// ------------------------------------------------------------------ boot

async function boot() {
  const res = await fetch('./data/snapshot.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`snapshot not found (${res.status}). Run \`make demo\` first.`);
  const snap = await res.json();
  if (snap.schema !== 1) throw new Error(`unsupported snapshot schema ${snap.schema}`);
  state.snap = snap;

  // The paper is optional: without docs.json every other route still works and
  // #/paper explains how to build it.
  try {
    const docsRes = await fetch('./data/docs.json', { cache: 'no-store' });
    if (docsRes.ok) {
      const docs = await docsRes.json();
      if (docs.schema === 1) state.docs = docs;
    }
  } catch {
    state.docs = null;
  }

  // Optional, like docs.json: the page works without a testnet run recorded.
  try {
    const chainRes = await fetch('./data/chain.json', { cache: 'no-store' });
    if (chainRes.ok) {
      const chain = await chainRes.json();
      if (chain.schema === 1) state.chain = chain;
    }
  } catch {
    state.chain = null;
  }

  setText('ctx-network', snap.network);
  setText('ctx-contract', snap.contract);
  // The page is a replay, and says so: the contract id beside it is the fixture
  // id the replay ran against, not the deployed account. The deployed account and
  // its transactions are on Verify, where chain.json puts them.
  setText('ctx-mode', 'replay of a contract run, not a chain read');
  setText('ctx-asset', `amounts in ${snap.asset}`);
  setText('foot-left', `testnet only · no mainnet funds · ${snap.network}`);
  setText('foot-right', `${snap.steps.length} events · policy ${short(snap.policyHash, 12, 6)} · schema ${snap.schema}`);

  window.addEventListener('hashchange', route);
  route();
  announce();
}

boot().catch((err) => {
  $('#view').innerHTML = `<section class="card"><h3>The console could not start</h3><p>${esc(err.message)}</p><p class="rail-sub">From the repository root: <code>make demo</code>, then reload. No secrets are needed.</p></section>`;
  $('#view').setAttribute('aria-busy', 'false');
  console.error(err);
});
