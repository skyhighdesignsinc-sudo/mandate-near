// tools/build-docs.mjs — markdown → one JSON document the console can render.
//
// The repository is the source of truth: the whitepaper, the architecture and the
// diagrams are written once as markdown, which GitHub renders, and this tool turns
// them into HTML for `#/paper` in the console. No markdown parser is installed, so
// the subset below is deliberate and small: headings, paragraphs, lists, tables,
// fenced code, blockquotes, rules, and inline code/bold/italic/links.
//
// Safety: every byte of input is escaped before any tag is produced. There is no
// HTML passthrough, so a document cannot inject markup into the console.
//
// Determinism: no timestamps, no paths outside the repo, stable key order. The
// output changes only when a source document changes.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

const OUT = process.argv[2] ?? 'mandate/console/data/docs.json';
// Pre-rendered diagrams live beside the JSON. `make diagrams` fills this folder;
// when it is empty the page falls back to the Mermaid source rather than a gap.
const DIAG_DIR = join(dirname(OUT), 'diagrams');

const SOURCES = [
  { id: 'paper', path: 'docs/WHITEPAPER.md' },
  { id: 'architecture', path: 'mandate/docs/ARCHITECTURE.md' },
  { id: 'diagrams', path: 'docs/UML.md' },
];

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Inline formatting over an already-escaped string. Code spans are protected. */
function inline(text) {
  const codes = [];
  let s = esc(text).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    // A link to another markdown file has no meaning on a static page and would
    // be a 404 on the site, so it renders as a reference instead of a dead link.
    if (/\.md(#.*)?$/i.test(href)) return `<span class="xref">${label}</span>`;
    const safe = /^(https?:|#)/.test(href) ? href : '#';
    return `<a href="${safe}">${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
  return s;
}

const isTableDivider = (line) => /^\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-');

function cells(line) {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function renderTable(lines) {
  const head = cells(lines[0]);
  const body = lines.slice(2).map(cells);
  return `<div class="table-wrap"><table>
    <thead><tr>${head.map((h) => `<th scope="col">${inline(h)}</th>`).join('')}</tr></thead>
    <tbody>${body
      .map((row) => `<tr>${row.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
      .join('')}</tbody>
  </table></div>`;
}

function render(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let title = '';
  let inFence = false;
  let fenceLang = '';
  let fence = [];
  let list = null;
  let lastHeading = '';

  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (inFence) {
      if (/^```/.test(line)) {
        const code = esc(fence.join('\n'));
        // Both kinds of block scroll horizontally, so both are tabbable: a
        // scrollable region that cannot take focus is unusable by keyboard.
        if (fenceLang === 'mermaid') {
          const name = `d-${createHash('sha1').update(fence.join('\n').trim()).digest('hex').slice(0, 8)}.svg`;
          if (existsSync(join(DIAG_DIR, name))) {
            out.push(
              // tabindex: the figure scrolls sideways on a narrow screen, and a
              // scrollable region that cannot take focus is unusable by keyboard.
              `<figure class="diagram" tabindex="0"><img src="./data/diagrams/${name}" alt="${esc(lastHeading || 'Diagram')}" loading="lazy" />` +
                `<figcaption>${esc(lastHeading)} — Mermaid source in docs/UML.md</figcaption>` +
                `<details class="src"><summary>Mermaid source</summary><pre tabindex="0">${code}</pre></details></figure>`,
            );
          } else {
            out.push(
              `<figure class="diagram"><figcaption>diagram source — run <code>make diagrams</code> to see it rendered</figcaption><pre class="mermaid" tabindex="0">${code}</pre></figure>`,
            );
          }
        } else {
          out.push(`<pre class="code" data-lang="${esc(fenceLang)}" tabindex="0"><code>${code}</code></pre>`);
        }
        inFence = false;
        fence = [];
        fenceLang = '';
      } else {
        fence.push(line);
      }
      i += 1;
      continue;
    }

    if (/^```/.test(line)) {
      closeList();
      inFence = true;
      fenceLang = line.slice(3).trim();
      i += 1;
      continue;
    }

    if (!line.trim()) {
      closeList();
      i += 1;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      closeList();
      out.push('<hr />');
      i += 1;
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1].length;
      lastHeading = heading[2].trim();
      if (level === 1 && !title) {
        title = heading[2].trim();
        i += 1;
        continue;
      }
      const id = heading[2]
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      out.push(`<h${level} id="${id}">${inline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (line.includes('|') && lines[i + 1] && isTableDivider(lines[i + 1])) {
      closeList();
      const block = [line, lines[i + 1]];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        block.push(lines[i]);
        i += 1;
      }
      out.push(renderTable(block));
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+\.\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const want = bullet ? 'ul' : 'ol';
      if (list !== want) {
        closeList();
        out.push(`<${want}>`);
        list = want;
      }
      out.push(`<li>${inline((bullet || numbered)[1])}</li>`);
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      closeList();
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      out.push(`<blockquote>${inline(quote.join(' '))}</blockquote>`);
      continue;
    }

    closeList();
    const para = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|```|>|[-*]\s|\d+\.\s|---+$)/.test(lines[i]) &&
      !(lines[i].includes('|') && lines[i + 1] && isTableDivider(lines[i + 1]))
    ) {
      para.push(lines[i]);
      i += 1;
    }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }

  closeList();
  if (inFence) out.push(`<pre class="code"><code>${esc(fence.join('\n'))}</code></pre>`);
  return { title, html: out.join('\n') };
}

const docs = [];
for (const source of SOURCES) {
  const md = readFileSync(source.path, 'utf8');
  const { title, html } = render(md);
  docs.push({ id: source.id, path: source.path, title: title || source.id, html });
}

const payload = { schema: 1, docs };
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(payload, null, 1)}\n`);

const bytes = JSON.stringify(payload).length;
console.log(`docs: ${docs.length} documents → ${OUT} (${bytes} bytes)`);
for (const d of docs) console.log(`  ${d.id.padEnd(13)} ${d.title}`);
