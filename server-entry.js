/**
 * Tauri sidecar entry point for the Sharely desktop app.
 *
 * Resolves data paths to the user's app-data directory so the server
 * works correctly when launched as a bundled binary.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// Determine user data directory (platform-aware)
function getAppDataDir() {
  switch (process.platform) {
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', 'Sharely');
    case 'win32':
      return path.join(process.env.APPDATA || os.homedir(), 'Sharely');
    default:
      return path.join(
        process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'),
        'sharely',
      );
  }
}

const APP_DATA = getAppDataDir();
const ENV_FILE = path.join(APP_DATA, '.env');
const UPLOADS_DIR = path.join(APP_DATA, 'uploads');

// Create app data directory structure on first run
fs.mkdirSync(APP_DATA, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(path.join(UPLOADS_DIR, '.thumbnails'), { recursive: true });

// Write a default .env if none exists
if (!fs.existsSync(ENV_FILE)) {
  const crypto = require('crypto');
  const secret = crypto.randomBytes(32).toString('hex');
  const defaults = [
    `PORT=3579`,
    `MONGODB_URI=mongodb://localhost:27017/sharely`,
    `SESSION_SECRET=${secret}`,
    `MAX_FILE_SIZE_MB=500`,
    `BASE_URL=http://localhost:3579`,
    `NODE_ENV=production`,
  ].join('\n');
  fs.writeFileSync(ENV_FILE, defaults, 'utf8');
}

// Load env from app data dir
require('dotenv').config({ path: ENV_FILE });

// Override UPLOAD_DIR so Express stores files in app data
process.env.UPLOAD_DIR = UPLOADS_DIR;

// Boot the Express server (app.js uses __dirname-relative paths which point
// to the same directory as this entry file when bundled with pkg)
require('./app.js');
