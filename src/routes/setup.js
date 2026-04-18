const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');

function getEnvFilePath() {
  switch (process.platform) {
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', 'Sharely', '.env');
    case 'win32':
      return path.join(process.env.APPDATA || os.homedir(), 'Sharely', '.env');
    default:
      return path.join(
        process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'),
        'sharely',
        '.env',
      );
  }
}

// GET /api/setup/status — returns whether setup is needed
router.get('/status', (_req, res) => {
  const envPath = getEnvFilePath();
  const configured = fs.existsSync(envPath) && !!process.env.MONGODB_URI;
  res.json({ configured });
});

// POST /api/setup — write config and restart signal
router.post('/', (req, res) => {
  const { mongoUri, port, baseUrl } = req.body;
  if (!mongoUri || !port) {
    return res.status(400).json({ error: 'mongoUri and port are required' });
  }
  if (!/^mongodb(\+srv)?:\/\/.+/.test(mongoUri)) {
    return res.status(400).json({ error: 'Invalid MongoDB URI' });
  }
  const portNum = parseInt(port, 10);
  if (isNaN(portNum) || portNum < 1024 || portNum > 65535) {
    return res.status(400).json({ error: 'Port must be between 1024 and 65535' });
  }

  const envPath = getEnvFilePath();
  const dir = path.dirname(envPath);
  fs.mkdirSync(dir, { recursive: true });

  // Read existing env to preserve SESSION_SECRET
  let existingSecret = process.env.SESSION_SECRET || '';
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    const secretLine = lines.find(l => l.startsWith('SESSION_SECRET='));
    if (secretLine) existingSecret = secretLine.replace('SESSION_SECRET=', '').trim();
  }
  if (!existingSecret) {
    const crypto = require('crypto');
    existingSecret = crypto.randomBytes(32).toString('hex');
  }

  const contents = [
    `PORT=${portNum}`,
    `MONGODB_URI=${mongoUri}`,
    `SESSION_SECRET=${existingSecret}`,
    `MAX_FILE_SIZE_MB=${process.env.MAX_FILE_SIZE_MB || '500'}`,
    `BASE_URL=${baseUrl || `http://localhost:${portNum}`}`,
    `NODE_ENV=production`,
  ].join('\n');

  fs.writeFileSync(envPath, contents, 'utf8');
  res.json({ ok: true, message: 'Config saved. Please restart the app.' });
});

module.exports = router;
