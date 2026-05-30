const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DOCS_DOMAIN = 'sharely.christian.pizza';

// ── UI translations for all 8 sharely languages ─────────────────────────────
const I18N = {
  en: {
    docTitle:   'Documentation – sharely',
    badge:      'Documentation',
    onThisPage: 'On this page',
    github:     'GitHub',
    poweredBy:  'Powered by',
    license:    'Licensed under the MIT License',
    privacy:    'Privacy Policy',
    terms:      'Terms of Service',
    langLabel:  'Language',
  },
  de: {
    docTitle:   'Dokumentation – sharely',
    badge:      'Dokumentation',
    onThisPage: 'Auf dieser Seite',
    github:     'GitHub',
    poweredBy:  'Bereitgestellt von',
    license:    'Lizenziert unter der MIT-Lizenz',
    privacy:    'Datenschutzerklärung',
    terms:      'Nutzungsbedingungen',
    langLabel:  'Sprache',
  },
  fr: {
    docTitle:   'Documentation – sharely',
    badge:      'Documentation',
    onThisPage: 'Sur cette page',
    github:     'GitHub',
    poweredBy:  'Propulsé par',
    license:    'Sous licence MIT',
    privacy:    'Politique de confidentialité',
    terms:      'Conditions d\'utilisation',
    langLabel:  'Langue',
  },
  es: {
    docTitle:   'Documentación – sharely',
    badge:      'Documentación',
    onThisPage: 'En esta página',
    github:     'GitHub',
    poweredBy:  'Desarrollado por',
    license:    'Licenciado bajo MIT',
    privacy:    'Política de privacidad',
    terms:      'Términos de servicio',
    langLabel:  'Idioma',
  },
  it: {
    docTitle:   'Documentazione – sharely',
    badge:      'Documentazione',
    onThisPage: 'In questa pagina',
    github:     'GitHub',
    poweredBy:  'Offerto da',
    license:    'Licenza MIT',
    privacy:    'Informativa sulla privacy',
    terms:      'Termini di servizio',
    langLabel:  'Lingua',
  },
  pt: {
    docTitle:   'Documentação – sharely',
    badge:      'Documentação',
    onThisPage: 'Nesta página',
    github:     'GitHub',
    poweredBy:  'Desenvolvido por',
    license:    'Licenciado sob MIT',
    privacy:    'Política de privacidade',
    terms:      'Termos de serviço',
    langLabel:  'Idioma',
  },
  ja: {
    docTitle:   'ドキュメント – sharely',
    badge:      'ドキュメント',
    onThisPage: 'このページの内容',
    github:     'GitHub',
    poweredBy:  'Powered by',
    license:    'MITライセンス',
    privacy:    'プライバシーポリシー',
    terms:      '利用規約',
    langLabel:  '言語',
  },
  zh: {
    docTitle:   '文档 – sharely',
    badge:      '文档',
    onThisPage: '本页内容',
    github:     'GitHub',
    poweredBy:  '由',
    license:    'MIT 许可证',
    privacy:    '隐私政策',
    terms:      '服务条款',
    langLabel:  '语言',
  },
};

const LANG_NAMES = {
  en: 'English', de: 'Deutsch', fr: 'Français',
  es: 'Español', it: 'Italiano', pt: 'Português',
  ja: '日本語',  zh: '中文',
};

const SUPPORTED = Object.keys(I18N);

function detectLang(req) {
  // 1. Query param: ?lang=de
  const q = req.query.lang;
  if (q && SUPPORTED.includes(q)) return q;

  // 2. Accept-Language header
  const al = req.headers['accept-language'] || '';
  for (const part of al.split(',')) {
    const code = part.trim().split(/[-;]/)[0].toLowerCase();
    if (SUPPORTED.includes(code)) return code;
  }
  return 'en';
}

// ── Markdown → HTML ──────────────────────────────────────────────────────────
function mdToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let inCode = false, codeLang = '', codeLines = [];
  let inTable = false, tHeadDone = false;
  let inList = false;

  const flushList  = () => { if (inList)  { out.push('</ul>'); inList = false; } };
  const flushTable = () => {
    if (inTable) { out.push('</tbody></table></div>'); inTable = false; tHeadDone = false; }
  };

  function inline(t) {
    return t
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/`([^`]+)`/g,'<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2">$1</a>');
  }

  for (const line of lines) {
    // code fence
    if (line.startsWith('```')) {
      if (!inCode) {
        flushList(); flushTable();
        inCode = true; codeLang = line.slice(3).trim(); codeLines = [];
      } else {
        const esc = codeLines.join('\n').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        out.push(`<pre><code${codeLang?` class="lang-${codeLang}"`:''}>${esc}</code></pre>`);
        inCode = false;
      }
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }

    if (/^---+$/.test(line.trim())) { flushList(); flushTable(); out.push('<hr>'); continue; }

    const hm = line.match(/^(#{1,6})\s+(.*)/);
    if (hm) {
      flushList(); flushTable();
      const lvl = hm[1].length;
      const id  = hm[2].toLowerCase().replace(/[^\w\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-');
      out.push(`<h${lvl} id="${id}">${inline(hm[2])}</h${lvl}>`);
      continue;
    }

    if (line.startsWith('|')) {
      flushList();
      const cells = line.split('|').slice(1,-1).map(c=>c.trim());
      if (cells.every(c=>/^:?-+:?$/.test(c))) {
        out.push('</thead><tbody>'); tHeadDone = true; continue;
      }
      if (!inTable) { out.push('<div class="table-wrap"><table><thead>'); inTable = true; tHeadDone = false; }
      const tag = tHeadDone ? 'td' : 'th';
      out.push(`<tr>${cells.map(c=>`<${tag}>${inline(c)}</${tag}>`).join('')}</tr>`);
      continue;
    } else { flushTable(); }

    const lm = line.match(/^[-*]\s+(.*)/);
    if (lm) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(lm[1])}</li>`);
      continue;
    } else { flushList(); }

    if (line.startsWith('>')) { out.push(`<blockquote>${inline(line.slice(1).trim())}</blockquote>`); continue; }
    if (!line.trim()) { out.push('<div class="sp"></div>'); continue; }
    out.push(`<p>${inline(line)}</p>`);
  }
  flushList(); flushTable();
  return out.join('\n');
}

// ── Route handler ────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const host = (req.headers.host || '').split(':')[0];
  if (host !== DOCS_DOMAIN) return res.status(404).send('Not found');

  let md;
  try {
    md = fs.readFileSync(path.resolve(__dirname, '../../DOCUMENTATION.md'), 'utf8');
  } catch {
    return res.status(500).send('Documentation not available');
  }

  const lang = detectLang(req);
  const t    = I18N[lang];
  const body = mdToHtml(md);

  // Language switcher options
  const langOptions = SUPPORTED.map(code => {
    const selected = code === lang ? ' selected' : '';
    return `<option value="${code}"${selected}>${LANG_NAMES[code]}</option>`;
  }).join('');

  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="18" height="18" aria-hidden="true"><path fill="#3b82f6" d="M32 400C32 479.5 96.5 544 176 544L480 544C550.7 544 608 486.7 608 416C608 364.4 577.5 319.9 533.5 299.7C540.2 286.6 544 271.7 544 256C544 203 501 160 448 160C430.3 160 413.8 164.8 399.6 173.1C375.5 127.3 327.4 96 272 96C192.5 96 128 160.5 128 240C128 248 128.7 255.9 129.9 263.5C73 282.7 32 336.6 32 400z"/></svg>`;

  const ghIcon = `<svg width="14" height="14" viewBox="0 0 98 96" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"/></svg>`;

  // Globe icon for language selector
  const globeIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t.docTitle}</title>
<style>
:root {
  --bg:         hsl(222,47%,5%);
  --card:       hsl(222,47%,8%);
  --fg:         hsl(210,40%,96%);
  --muted:      hsl(217,33%,17%);
  --muted-fg:   hsl(215,20%,58%);
  --border:     hsl(217,33%,17%);
  --primary:    hsl(217,91%,60%);
  --radius:     0.5rem;
  --font: -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
  --mono: "SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{font-size:16px;scroll-behavior:smooth}
body{background:var(--bg);color:var(--fg);font-family:var(--font);font-feature-settings:"rlig" 1,"calt" 1;line-height:1.7;min-height:100vh;display:flex;flex-direction:column}

/* scrollbar */
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:var(--muted-fg)}

/* navbar */
#navbar{position:sticky;top:0;z-index:40;border-bottom:1px solid var(--border);background:hsla(222,47%,8%,.8);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
#nav-inner{max-width:90rem;margin:0 auto;padding:0 1rem;height:3.5rem;display:flex;align-items:center;justify-content:space-between;gap:1rem}
.brand{display:flex;align-items:center;gap:.5rem;text-decoration:none;font-size:.75rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--primary)}
.sep{width:1px;height:1.25rem;background:var(--border);margin:0 .5rem}
.badge{font-size:.7rem;font-weight:500;color:var(--muted-fg);letter-spacing:.04em}
.nav-right{display:flex;align-items:center;gap:.5rem}

/* language selector */
.lang-wrap{display:flex;align-items:center;gap:.35rem;font-size:.8rem;color:var(--muted-fg);padding:.3rem .6rem;border-radius:var(--radius);border:1px solid var(--border);cursor:pointer;transition:color .15s,border-color .15s,background .15s}
.lang-wrap:hover{color:var(--fg);border-color:var(--muted-fg);background:var(--muted)}
.lang-wrap select{background:transparent;border:none;color:inherit;font:inherit;font-size:.8rem;cursor:pointer;outline:none;-webkit-appearance:none;-moz-appearance:none;appearance:none}
.lang-wrap select option{background:hsl(222,47%,8%);color:hsl(210,40%,96%)}

/* github link */
.gh{display:flex;align-items:center;gap:.4rem;font-size:.8rem;color:var(--muted-fg);text-decoration:none;padding:.3rem .6rem;border-radius:var(--radius);border:1px solid var(--border);transition:color .15s,border-color .15s,background .15s}
.gh:hover{color:var(--fg);border-color:var(--muted-fg);background:var(--muted)}

/* shell */
#shell{flex:1;max-width:90rem;margin:0 auto;width:100%;padding:0 1rem;display:flex;gap:0}

/* sidebar */
#sidebar{width:240px;min-width:240px;padding:1.5rem 0 2rem;position:sticky;top:3.5rem;height:calc(100vh - 3.5rem);overflow-y:auto;flex-shrink:0;border-right:1px solid var(--border)}
.toc-label{font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--muted-fg);padding:0 .75rem .5rem}
#toc{list-style:none}
#toc a{display:block;padding:.3rem .75rem;font-size:.82rem;line-height:1.45;color:var(--muted-fg);text-decoration:none;border-radius:var(--radius);transition:color .15s,background .15s;margin:1px 0;border-left:2px solid transparent}
#toc a:hover{color:var(--fg);background:hsla(217,33%,17%,.5)}
#toc a.active{color:var(--primary);background:hsla(217,91%,60%,.08);border-left-color:var(--primary)}
#toc li.h3 a{padding-left:1.4rem;font-size:.78rem}

/* content */
#content{flex:1;min-width:0;padding:2.5rem 3rem 4rem}

/* typography */
h1{font-size:1.875rem;font-weight:700;letter-spacing:-.025em;color:var(--fg);margin-bottom:.5rem;line-height:1.2}
h2{font-size:1.25rem;font-weight:600;color:var(--fg);margin:2.5rem 0 .875rem;padding-bottom:.5rem;border-bottom:1px solid var(--border);scroll-margin-top:1.5rem}
h3{font-size:1rem;font-weight:600;color:var(--fg);margin:1.75rem 0 .5rem;scroll-margin-top:1.5rem}
h4{font-size:.8rem;font-weight:600;color:var(--muted-fg);text-transform:uppercase;letter-spacing:.08em;margin:1.25rem 0 .375rem}
p{margin-bottom:.6rem}
.sp{height:.4rem}
a{color:var(--primary);text-decoration:none}
a:hover{text-decoration:underline;text-underline-offset:3px}
strong{font-weight:600;color:var(--fg)}

/* code */
code{font-family:var(--mono);font-size:.82em;background:var(--muted);color:hsl(38,92%,68%);padding:.15em .4em;border-radius:calc(var(--radius) - 2px);border:1px solid var(--border)}
pre{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:1.125rem 1.25rem;overflow-x:auto;margin:.75rem 0;font-size:.82rem;line-height:1.65}
pre code{background:none;border:none;padding:0;color:var(--fg);font-size:inherit}

/* table */
.table-wrap{overflow-x:auto;margin:.75rem 0;border-radius:var(--radius);border:1px solid var(--border)}
table{width:100%;border-collapse:collapse;font-size:.875rem}
thead{background:var(--card)}
th{padding:.6rem .875rem;text-align:left;font-weight:600;font-size:.8rem;color:var(--muted-fg);border-bottom:1px solid var(--border);white-space:nowrap}
td{padding:.55rem .875rem;border-bottom:1px solid var(--border);vertical-align:top}
tbody tr:last-child td{border-bottom:none}
tbody tr:nth-child(even){background:hsla(222,47%,8%,.6)}

/* list */
ul{padding-left:1.375rem;margin:.5rem 0}
li{margin-bottom:.25rem}

/* blockquote */
blockquote{border-left:3px solid var(--primary);background:hsla(217,91%,60%,.06);padding:.75rem 1rem;border-radius:0 var(--radius) var(--radius) 0;color:var(--muted-fg);margin:.75rem 0;font-size:.9rem}

hr{border:none;border-top:1px solid var(--border);margin:2rem 0}

/* footer */
#footer{border-top:1px solid var(--border);padding:1rem;text-align:center;font-size:.72rem;color:var(--muted-fg)}
#footer a{color:var(--muted-fg);text-decoration:underline;text-underline-offset:3px}
#footer a:hover{color:var(--fg)}

@media(max-width:768px){
  #sidebar{display:none}
  #content{padding:1.5rem 1rem 3rem}
  h1{font-size:1.5rem}
  h2{font-size:1.1rem}
  .gh span{display:none}
}
</style>
</head>
<body>

<header id="navbar">
  <div id="nav-inner">
    <div style="display:flex;align-items:center">
      <a class="brand" href="/">${logoSvg} sharely</a>
      <div class="sep"></div>
      <span class="badge">${t.badge}</span>
    </div>
    <div class="nav-right">
      <!-- Language selector -->
      <label class="lang-wrap" title="${t.langLabel}">
        ${globeIcon}
        <select id="lang-select" aria-label="${t.langLabel}">${langOptions}</select>
      </label>
      <!-- GitHub -->
      <a class="gh" href="https://github.com/Christianoooooo/sharely" target="_blank" rel="noopener">
        ${ghIcon}<span>${t.github}</span>
      </a>
    </div>
  </div>
</header>

<div id="shell">
  <aside id="sidebar">
    <div class="toc-label">${t.onThisPage}</div>
    <ul id="toc"></ul>
  </aside>
  <article id="content">${body}</article>
</div>

<footer id="footer">
  ${t.poweredBy}&nbsp;<a href="https://github.com/Christianoooooo/sharely" target="_blank" rel="noopener">sharely</a>
  &nbsp;·&nbsp; ${t.license}
  &nbsp;·&nbsp; <a href="/privacy">${t.privacy}</a>
  &nbsp;·&nbsp; <a href="/terms">${t.terms}</a>
</footer>

<script>
  // Language switcher — reload with ?lang= query param
  document.getElementById('lang-select').addEventListener('change', function() {
    const url = new URL(window.location.href);
    url.searchParams.set('lang', this.value);
    window.location.href = url.toString();
  });

  // Build TOC
  const toc = document.getElementById('toc');
  document.querySelectorAll('#content h2, #content h3').forEach(h => {
    const li = document.createElement('li');
    if (h.tagName === 'H3') li.className = 'h3';
    const a  = document.createElement('a');
    a.href = '#' + h.id;
    a.textContent = h.textContent;
    li.appendChild(a); toc.appendChild(li);
  });

  // Active TOC link on scroll
  const headings = Array.from(document.querySelectorAll('#content h2, #content h3'));
  const links    = Array.from(toc.querySelectorAll('a'));
  function sync() {
    let cur = null;
    for (const h of headings) {
      if (h.getBoundingClientRect().top <= 72) cur = h.id;
    }
    links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + cur));
  }
  window.addEventListener('scroll', sync, { passive: true });
  sync();
</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(html);
});

module.exports = router;
