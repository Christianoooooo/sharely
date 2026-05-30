const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DOCS_DOMAIN = 'sharely.christian.pizza';

// Simple but solid markdown → HTML converter for the DOCUMENTATION.md structure.
function mdToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  let inCodeBlock = false;
  let codeLang = '';
  let codeLines = [];
  let inTable = false;
  let tableHeader = false;
  let inList = false;

  function flushList() {
    if (inList) { out.push('</ul>'); inList = false; }
  }
  function flushTable() {
    if (inTable) { out.push('</tbody></table>'); inTable = false; tableHeader = false; }
  }
  function inline(text) {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  }

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        flushList(); flushTable();
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
        codeLines = [];
      } else {
        const escaped = codeLines.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        out.push(`<pre><code${codeLang ? ` class="language-${codeLang}"` : ''}>${escaped}</code></pre>`);
        inCodeBlock = false; codeLang = ''; codeLines = [];
      }
      i++; continue;
    }
    if (inCodeBlock) { codeLines.push(line); i++; continue; }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      flushList(); flushTable();
      out.push('<hr>'); i++; continue;
    }

    // Headings
    const hm = line.match(/^(#{1,6})\s+(.*)/);
    if (hm) {
      flushList(); flushTable();
      const level = hm[1].length;
      const text = inline(hm[2]);
      const anchor = hm[2].toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
      out.push(`<h${level} id="${anchor}">${text}</h${level}>`);
      i++; continue;
    }

    // Table row
    if (line.startsWith('|')) {
      flushList();
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      // Separator row (---|---|---)
      if (cells.every(c => /^:?-+:?$/.test(c))) {
        tableHeader = false; i++; continue;
      }
      if (!inTable) {
        out.push('<table><thead>'); inTable = true; tableHeader = true;
      } else if (tableHeader) {
        out.push('</thead><tbody>'); tableHeader = false;
      }
      const tag = tableHeader ? 'th' : 'td';
      out.push(`<tr>${cells.map(c => `<${tag}>${inline(c)}</${tag}>`).join('')}</tr>`);
      i++; continue;
    } else {
      flushTable();
    }

    // Unordered list
    const lm = line.match(/^[-*]\s+(.*)/);
    if (lm) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(lm[1])}</li>`);
      i++; continue;
    } else {
      flushList();
    }

    // Blank line
    if (line.trim() === '') { out.push(''); i++; continue; }

    // Block quote / comment lines starting with >
    if (line.startsWith('>')) {
      out.push(`<blockquote>${inline(line.slice(1).trim())}</blockquote>`);
      i++; continue;
    }

    // Regular paragraph line
    out.push(`<p>${inline(line)}</p>`);
    i++;
  }
  flushList(); flushTable();
  return out.join('\n');
}

router.get('/', (req, res) => {
  const host = (req.headers.host || '').split(':')[0];
  if (host !== DOCS_DOMAIN) {
    return res.status(404).send('Not found');
  }

  let md;
  try {
    md = fs.readFileSync(path.resolve(__dirname, '../../DOCUMENTATION.md'), 'utf8');
  } catch {
    return res.status(500).send('Documentation not available');
  }

  // Strip the H1 title so we can put it in the <title> separately
  const titleMatch = md.match(/^#\s+(.+)/m);
  const pageTitle = titleMatch ? titleMatch[1] : 'Sharely Documentation';
  const body = mdToHtml(md);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${pageTitle}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0f1117;
    --surface: #161b22;
    --border: #30363d;
    --text: #e6edf3;
    --muted: #8b949e;
    --accent: #58a6ff;
    --accent-dim: #1f3a5f;
    --code-bg: #1e2530;
    --table-alt: #161b22;
    --hr: #21262d;
    --radius: 8px;
    --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    --mono: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  }

  html { font-size: 16px; scroll-behavior: smooth; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font);
    line-height: 1.7;
    display: flex;
    min-height: 100vh;
  }

  /* Sidebar TOC */
  #sidebar {
    width: 260px;
    min-width: 260px;
    background: var(--surface);
    border-right: 1px solid var(--border);
    padding: 24px 0;
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
    flex-shrink: 0;
  }
  #sidebar .logo {
    display: block;
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--text);
    padding: 0 20px 16px;
    border-bottom: 1px solid var(--border);
    text-decoration: none;
    letter-spacing: -0.02em;
  }
  #sidebar .logo span { color: var(--accent); }
  #toc { list-style: none; padding: 12px 0; }
  #toc li a {
    display: block;
    padding: 4px 20px;
    color: var(--muted);
    text-decoration: none;
    font-size: 0.85rem;
    line-height: 1.5;
    transition: color 0.15s, background 0.15s;
    border-left: 2px solid transparent;
  }
  #toc li a:hover { color: var(--text); background: rgba(88,166,255,0.06); }
  #toc li a.active { color: var(--accent); border-left-color: var(--accent); }
  #toc li.h3 a { padding-left: 32px; font-size: 0.8rem; }

  /* Main content */
  #content {
    flex: 1;
    max-width: 900px;
    padding: 48px 56px;
    min-width: 0;
  }

  h1 { font-size: 2rem; font-weight: 700; letter-spacing: -0.03em; color: var(--text); margin-bottom: 8px; }
  h2 {
    font-size: 1.35rem; font-weight: 600; color: var(--text);
    margin: 48px 0 16px; padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }
  h3 { font-size: 1.1rem; font-weight: 600; color: var(--text); margin: 28px 0 12px; }
  h4 { font-size: 0.95rem; font-weight: 600; color: var(--muted); margin: 20px 0 8px; text-transform: uppercase; letter-spacing: 0.06em; }

  p { margin-bottom: 12px; color: var(--text); }

  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }

  code {
    font-family: var(--mono);
    font-size: 0.85em;
    background: var(--code-bg);
    color: #e6b655;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid var(--border);
  }

  pre {
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px 24px;
    overflow-x: auto;
    margin: 16px 0;
    font-size: 0.85rem;
    line-height: 1.6;
  }
  pre code {
    background: none; border: none; padding: 0;
    color: #e6edf3; font-size: inherit;
  }

  table {
    width: 100%; border-collapse: collapse;
    margin: 16px 0; font-size: 0.9rem;
    border: 1px solid var(--border); border-radius: var(--radius);
    overflow: hidden;
  }
  thead { background: var(--surface); }
  th {
    padding: 10px 14px; text-align: left;
    font-weight: 600; color: var(--muted);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  td {
    padding: 9px 14px;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:nth-child(even) { background: var(--table-alt); }

  ul { padding-left: 22px; margin: 10px 0; }
  li { margin-bottom: 4px; }

  blockquote {
    border-left: 3px solid var(--accent-dim);
    background: rgba(88,166,255,0.05);
    padding: 12px 16px;
    border-radius: 0 var(--radius) var(--radius) 0;
    color: var(--muted);
    margin: 12px 0;
    font-size: 0.9rem;
  }

  hr { border: none; border-top: 1px solid var(--hr); margin: 40px 0; }

  strong { font-weight: 600; color: var(--text); }

  /* Anchor offset for sticky header */
  h2, h3, h4 { scroll-margin-top: 24px; }

  @media (max-width: 768px) {
    #sidebar { display: none; }
    #content { padding: 24px 20px; }
    table { font-size: 0.8rem; }
    th, td { padding: 7px 10px; }
  }
</style>
</head>
<body>
<nav id="sidebar">
  <a class="logo" href="/docs"><span>sharely</span> docs</a>
  <ul id="toc"></ul>
</nav>
<main id="content">
${body}
</main>
<script>
  // Build TOC from headings
  const toc = document.getElementById('toc');
  document.querySelectorAll('h2, h3').forEach(h => {
    const li = document.createElement('li');
    if (h.tagName === 'H3') li.className = 'h3';
    const a = document.createElement('a');
    a.href = '#' + h.id;
    a.textContent = h.textContent;
    li.appendChild(a);
    toc.appendChild(li);
  });

  // Active TOC link on scroll
  const headings = Array.from(document.querySelectorAll('h2, h3'));
  const links = Array.from(toc.querySelectorAll('a'));
  function updateActive() {
    let active = null;
    for (const h of headings) {
      if (h.getBoundingClientRect().top <= 80) active = h.id;
    }
    links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + active));
  }
  window.addEventListener('scroll', updateActive, { passive: true });
  updateActive();
</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(html);
});

module.exports = router;
