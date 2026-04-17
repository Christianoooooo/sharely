'use strict';

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) {
  // For values embedded in onclick="..." single-quoted JS string literals
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Tab switching ─────────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    if (tab.dataset.tab === 'history') renderHistory();
  });
});

// ── Drop zone ─────────────────────────────────────────────────────────────────

// Prevent accidental navigation when dropping outside the zone
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop',     (e) => e.preventDefault());

const dropZone = document.getElementById('drop-zone');

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', (e) => {
  if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const paths = Array.from(e.dataTransfer.files)
    .map((f) => f.path)
    .filter(Boolean);
  if (paths.length) await triggerUpload(paths);
});

document.getElementById('choose-files-btn').addEventListener('click', async () => {
  const paths = await window.sharely.openFileDialog();
  if (paths.length) await triggerUpload(paths);
});

async function triggerUpload(paths) {
  setStatus(`Uploading ${paths.length} file${paths.length > 1 ? 's' : ''}…`, true);
  await window.sharely.uploadFiles(paths);
}

// ── Upload event handlers ─────────────────────────────────────────────────────

const uploadStatus  = document.getElementById('upload-status');
const uploadResults = document.getElementById('upload-results');

function setStatus(text, visible) {
  uploadStatus.textContent = text;
  uploadStatus.classList.toggle('hidden', !visible);
}

window.sharely.onUploadStarted((name) => {
  setStatus(`Uploading ${name}…`, true);
});

window.sharely.onUploadComplete((result) => {
  setStatus('', false);
  prependResultItem(result.filename, result.url, null);
});

window.sharely.onUploadError((msg) => {
  setStatus('', false);
  prependResultItem('Upload failed', null, msg);
});

function prependResultItem(name, url, errorMsg) {
  const div = document.createElement('div');
  div.className = `result-item${errorMsg ? ' error' : ''}`;

  const nameSpan = `<span class="result-name${errorMsg ? ' err' : ''}">${esc(errorMsg || name)}</span>`;

  const actions = url
    ? `<div class="result-actions">
        <button class="btn-icon" title="Copy URL" onclick="copyUrl('${escAttr(url)}')">
          ${iconCopy()}
        </button>
        <button class="btn-icon" title="Open in browser" onclick="openUrl('${escAttr(url)}')">
          ${iconOpen()}
        </button>
       </div>`
    : '';

  div.innerHTML = nameSpan + actions;
  uploadResults.prepend(div);
}

// ── History ───────────────────────────────────────────────────────────────────

async function renderHistory() {
  const history = await window.sharely.getHistory();
  const list    = document.getElementById('history-list');
  const count   = document.getElementById('history-count');

  count.textContent = `${history.length} upload${history.length !== 1 ? 's' : ''}`;

  if (!history.length) {
    list.innerHTML = '<div class="empty-state">No uploads yet</div>';
    return;
  }

  list.innerHTML = history.map((item) => `
    <div class="history-item">
      <div class="history-info">
        <div class="history-name">${esc(item.filename)}</div>
        <div class="history-time">${formatTime(item.timestamp)}</div>
      </div>
      <div class="history-actions">
        <button class="btn-icon" title="Copy URL" onclick="copyUrl('${escAttr(item.url)}')">
          ${iconCopy()}
        </button>
        <button class="btn-icon" title="Open in browser" onclick="openUrl('${escAttr(item.url)}')">
          ${iconOpen()}
        </button>
      </div>
    </div>
  `).join('');
}

document.getElementById('clear-history-btn').addEventListener('click', async () => {
  await window.sharely.clearHistory();
  renderHistory();
});

// ── Settings ──────────────────────────────────────────────────────────────────

async function loadSettings() {
  const s = await window.sharely.getSettings();
  document.getElementById('server-url').value = s.serverUrl || '';
  document.getElementById('api-token').value  = s.apiToken  || '';
}

document.getElementById('save-settings-btn').addEventListener('click', async () => {
  const settings = {
    serverUrl: document.getElementById('server-url').value.trim(),
    apiToken:  document.getElementById('api-token').value.trim(),
  };
  const msg = document.getElementById('settings-msg');
  try {
    await window.sharely.saveSettings(settings);
    msg.textContent = 'Settings saved!';
    msg.className   = 'settings-msg success';
    setTimeout(() => msg.classList.add('hidden'), 3000);
  } catch {
    msg.textContent = 'Failed to save settings.';
    msg.className   = 'settings-msg error';
  }
});

// ── Global helpers (called from onclick attributes) ───────────────────────────

function copyUrl(url) { window.sharely.copyToClipboard(url); }
function openUrl(url) { window.sharely.openUrl(url); }

// ── SVG icons ─────────────────────────────────────────────────────────────────

function iconCopy() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
  </svg>`;
}

function iconOpen() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
    <polyline points="15 3 21 3 21 9"/>
    <line x1="10" y1="14" x2="21" y2="3"/>
  </svg>`;
}

// ── Init ──────────────────────────────────────────────────────────────────────

loadSettings();
