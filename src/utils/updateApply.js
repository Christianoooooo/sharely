const fs = require('fs');
const path = require('path');

// Self-update is driven by a separate, privileged updater container. The web app
// never touches the Docker socket: it only drops a request file into a shared
// control volume, and the updater performs the actual git pull + rebuild.
const CONTROL_DIR = process.env.UPDATE_CONTROL_DIR || path.join(__dirname, '../../control');
const REQUEST_FILE = path.join(CONTROL_DIR, 'update.request');
const STATE_FILE = path.join(CONTROL_DIR, 'update.state');
const LOG_FILE = path.join(CONTROL_DIR, 'update.log');
const HEARTBEAT_FILE = path.join(CONTROL_DIR, 'update.heartbeat');
// The updater touches the heartbeat every few seconds; treat it as offline if the
// file is missing or older than this.
const HEARTBEAT_MAX_AGE_MS = 30_000;

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

// True only when the updater container is running and has recently checked in.
function isUpdaterReady() {
  try {
    return Date.now() - fs.statSync(HEARTBEAT_FILE).mtimeMs < HEARTBEAT_MAX_AGE_MS;
  } catch {
    return false;
  }
}

/**
 * Signals the updater container to apply the latest release.
 * @throws {Error} code NO_UPDATER if the updater container is not running, RUNNING if an update is already queued/running, or a filesystem error (e.g. EACCES) if the control volume is not writable
 */
async function requestUpdate() {
  if (!isUpdaterReady()) {
    const err = new Error('Updater container is not running');
    err.code = 'NO_UPDATER';
    throw err;
  }
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
  return { state: readState(), log: readLog(), ready: isUpdaterReady() };
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
