#!/usr/bin/env node
// Doc conformance checker. Run: node tools/check-docs.mjs
// Verifies: file presence, IAPM epigraphs, banned vocabulary, cross-references, fence balance.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const errors = [];
const warnings = [];

const REQUIRED = [
  'README.md',
  'AGENTS.md',
  'BUILD_PLAN.md',
  'docs/ARCHITECTURE.md',
  'docs/UNIQUENESS-AUDIT.md',
  'docs/CLAIMS.md',
  'docs/USER_STORIES.md',
  'docs/SKILLS.md',
  'docs/BRAND_GUIDELINES.md',
  'docs/BUSINESS_VALUE.md',
  'docs/DECISIONS.md',
  'docs/PENDING-HUMAN.md',
  'PM-PACK/README.md',
  ...Array.from({ length: 17 }, (_, i) => `PM-PACK/${String(i + 1).padStart(2, '0')}-X.md`),
];

// PM-PACK is the internal project pack. A published repository ships without it,
// so its absence is a skip, not a failure: a checker that crashes on a missing
// internal folder cannot be run by anyone outside this machine.
const hasPm = existsSync(join(ROOT, 'PM-PACK'));
const PM_EPIGRAPH_EXEMPT = new Set(['PM-PACK/README.md']);
const BANNED = /trustless|unhackable|impossible|bulletproof|fully secure|guaranteed|bank-grade/i;
const BANNED_EXEMPT = new Set(['docs/CLAIMS.md', 'AGENTS.md']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    // Vendored/cached trees are not our documentation. `.tools` holds the cargo
    // registry cache (D-008); scanning it turns every crate README into a false
    // positive, which is how this checker first reported 74 errors.
    // `publish` holds the two generated repositories (`.tools/publish-split.mjs`).
    // Scanning build output reports the copies' paths as broken references in the
    // source tree, which is noise, not a finding.
    if (['node_modules', '.git', '.freebuff', '.tools', 'target', 'test-results', 'playwright-report', 'publish'].includes(entry)) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (entry.endsWith('.md')) out.push(p);
  }
  return out;
}

const files = walk(ROOT);
const rel = (p) => relative(ROOT, p).replaceAll('\\', '/');
const rels = new Set(files.map(rel));

// 1. required files (PM-PACK glob check)
for (const r of REQUIRED) {
  if (r.includes('-X.md')) continue;
  if (!hasPm && r.startsWith('PM-PACK/')) continue;
  if (!rels.has(r)) errors.push(`missing required file: ${r}`);
}
const pmDocs = [...rels].filter((r) => /^PM-PACK\/\d{2}-/.test(r)).sort();
if (hasPm && pmDocs.length !== 17) errors.push(`PM-PACK has ${pmDocs.length} numbered docs, expected 17`);

// 2. IAPM epigraph + structure
for (const f of files) {
  const r = rel(f);
  const text = readFileSync(f, 'utf8');
  const lines = text.split(/\r?\n/);
  if (/^PM-PACK\/\d{2}-/.test(r) && !PM_EPIGRAPH_EXEMPT.has(r)) {
    const head = lines.slice(0, 6).join('\n');
    if (!/> IAPM:/.test(head)) errors.push(`${r}: missing "> IAPM:" epigraph in first 6 lines`);
    if (!/^# /.test(lines[0] ?? '')) errors.push(`${r}: first line must be an H1 title`);
  }
  // 3. banned vocabulary
  if (!BANNED_EXEMPT.has(r)) {
    lines.forEach((line, i) => {
      const ruleLine = /banned|forbidden|never claim|replace|grep|absolute word/i.test(line);
      const quotedExample = /"[^"]*(trustless|unhackable|impossible|bulletproof|guaranteed)[^"]*"/i.test(line);
      if (BANNED.test(line) && !ruleLine && !quotedExample) errors.push(`${r}:${i + 1}: banned vocabulary -> ${line.trim().slice(0, 90)}`);
    });
  }
  // 4. fence balance
  const fences = (text.match(/^```/gm) ?? []).length;
  if (fences % 2 !== 0) errors.push(`${r}: unbalanced code fences (${fences})`);
  // 5. cross-references resolve
  // `docs/X.md`, `PM-PACK/X.md`, and prefixed forms like `mandate/docs/X.md`.
  // Absolute URLs are not relative references: an `https://…/docs/X.md` link is
  // correct precisely because it does not resolve in this tree, so URLs are
  // removed before the scan instead of being reported as broken paths.
  const localText = text.replace(/https?:\/\/\S+/g, '');
  const refs = new Set(localText.match(/(?:[A-Za-z0-9._-]+\/)?(?:docs|PM-PACK)\/[A-Za-z0-9._\-\/]+\.md/g) ?? []);
  for (const ref of refs) {
    // A published repository ships without the internal pack, so its references
    // are skipped instead of reported as broken.
    if (!hasPm && ref.includes('PM-PACK/')) continue;
    const fromRoot = join(ROOT, ref);
    const fromFile = join(dirname(f), ref);
    if (!existsSync(fromRoot) && !existsSync(fromFile)) errors.push(`${r}: broken reference -> ${ref}`);
  }
  // 6. no empty sections
  if (text.trim().length < 400) warnings.push(`${r}: suspiciously short (${text.trim().length} chars)`);
}

// 7. anchor consistency: dates must match the canonical file, when it ships
if (hasPm) {
  const canon = readFileSync(join(ROOT, 'PM-PACK/02-project-file.md'), 'utf8');
  for (const date of ['2026-11-14 18:00', '2026-11-11']) {
    if (!canon.includes(date)) errors.push(`02-project-file.md lost canonical date ${date}`);
  }
}

// 8. claims referenced by AGENTS must exist in CLAIMS
const claims = readFileSync(join(ROOT, 'docs/CLAIMS.md'), 'utf8');
for (const id of ['C1', 'C4', 'C5', 'C7', 'C9']) {
  if (!new RegExp(`\\| ${id} \\|`).test(claims)) errors.push(`CLAIMS.md missing row ${id}`);
}

console.log(`scanned ${files.length} markdown files, ${pmDocs.length} PM docs`);
for (const w of warnings) console.log(`WARN  ${w}`);
for (const e of errors) console.log(`FAIL  ${e}`);
console.log(errors.length === 0 ? '\nOK — docs conformant' : `\n${errors.length} error(s)`);
process.exit(errors.length === 0 ? 0 : 1);
