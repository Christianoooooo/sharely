const fs = require('fs');
const path = require('path');

// Self-update is driven by a separate, privileged updater container. The web app
// never touches the Docker socket: it only drops a request file into a shared
// control volume, and the updater performs the actual git pull + rebuild. These
// two files are the whole contract between the two containers.
const CONTROL_DIR = process.env.UPDATE_CONTROL_DIR || path.join(__dirname, '../../control');
const REQUEST_FILE = path.join(CONTROL_DIR, 'update.request');
const STATE_FILE = path.join(CONTROL_DIR, 'update.state');
const LOG_FILE = path.join(CONTROL_DIR, 'update.log');

function readState() {
  try {
    return fs.readFileSync(STATE_FILE, 'utf8').trim() || 'idle';
  } catch {
    return 'idle';
  }
}

function readLog() {
  try {
    // Only the tail is relevant and the full log can grow large.
    return fs.readFileSync(LOG_FILE, 'utf8').slice(-4000);
  } catch {
    return '';
  }
}

/**
 * Signals the updater container to apply the latest release.
 * @throws {Error} code RUNNING if an update is already queued/running, or a filesystem error (e.g. EACCES) if the control volume is not writable
 */
async function requestUpdate() {
  const state = readState();
  if (state === 'queued' || state === 'running') {
    const err = new Error('An update is already in progress');
    err.code = 'RUNNING';
    throw err;
  }
  await fs.promises.mkdir(CONTROL_DIR, { recursive: true });
  await fs.promises.writeFile(STATE_FILE, 'queued');
  await fs.promises.writeFile(REQUEST_FILE, new Date().toISOString());
}

function getApplyStatus() {
  return { state: readState(), log: readLog() };
}

// Clears a terminal state so it does not stick across page reloads. Best-effort:
// a running/queued update is left untouched.
async function ackState() {
  const state = readState();
  if (state === 'success' || state === 'error') {
    await fs.promises.writeFile(STATE_FILE, 'idle').catch(() => {});
  }
}

module.exports = { requestUpdate, getApplyStatus, ackState };
