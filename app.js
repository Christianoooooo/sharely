require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const fs = require('fs');
const { rateLimit } = require('express-rate-limit');
const connectDB = require('./src/config/db');
const SiteSettings = require('./src/models/SiteSettings');
const uploadMiddleware = require('./src/middleware/upload');
const { requireApiKey } = require('./src/middleware/auth');
const File = require('./src/models/File');

const migrateUserFolders = require('./src/migrations/migrateUserFolders');
const migrateApiKeyHashes = require('./src/migrations/migrateApiKeyHashes');
const sanitizeFilename = require('./src/utils/sanitizeFilename');
const { logAudit } = require('./src/utils/audit');
const { runRetentionCleanup } = require('./src/jobs/retentionCleanup');

if (!process.env.SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET environment variable is not set.');
  process.exit(1);
}

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');

const app = express();

// Trust the first proxy (nginx / Cloudflare) so that express-rate-limit can
// read the real client IP from the X-Forwarded-For header without throwing
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
app.set('trust proxy', 1);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Security-Policy',
    // static.cloudflareinsights.com is allowed in script-src so the Cloudflare
    // Web Analytics beacon (injected by the Cloudflare proxy) can load.
    // cloudflareinsights.com is allowed in connect-src so the beacon can report
    // back to Cloudflare's collection endpoint.
    // frame-ancestors 'self' allows the PDF viewer iframe (same-origin) to work.
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://cloudflareinsights.com; frame-ancestors 'self';",
  );
  next();
});

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  },
}));

// Dynamically apply session duration from SiteSettings (cached for 60 s).
let _cachedSessionMs = null;
let _sessionCacheTs = 0;
async function getSessionMaxAge() {
  const now = Date.now();
  if (_cachedSessionMs !== null && now - _sessionCacheTs < 60_000) return _cachedSessionMs;
  try {
    const s = await SiteSettings.get();
    _cachedSessionMs = (s.sessionDurationDays || 7) * 24 * 60 * 60 * 1000;
  } catch {
    _cachedSessionMs = 7 * 24 * 60 * 60 * 1000;
  }
  _sessionCacheTs = Date.now();
  return _cachedSessionMs;
}
app.use(async (req, _res, next) => {
  if (req.session) req.session.cookie.maxAge = await getSessionMaxAge();
  next();
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many uploads, please try again later.' },
});

// ShareX upload endpoint — multer runs first so req.body.token is available for auth.
// Because auth runs after multer, the file lands in the root uploads dir initially;
// we move it into the user's subfolder once the user identity is known.
app.post('/upload', uploadLimiter, uploadMiddleware.single('upload'), requireApiKey, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  const user = req.apiUser;
  const folder = user.folderName || user.username;
  let storedName = req.file.filename;

  if (folder) {
    const userDir = path.join(UPLOAD_DIR, folder);
    fs.mkdirSync(userDir, { recursive: true });
    const newPath = path.join(userDir, req.file.filename);
    fs.renameSync(req.file.path, newPath);
    storedName = path.join(folder, req.file.filename);
  }

  const file = await File.create({
    originalName: sanitizeFilename(req.file.originalname),
    storedName,
    mimeType: req.file.mimetype,
    size: req.file.size,
    uploader: user._id,
  });
  await logAudit(req, 'upload', { fileName: file.originalName, fileSize: file.size, shortId: file.shortId });
  const base = process.env.BASE_URL || 'http://localhost:3000';
  res.json({
    url: `${base}/f/${file.shortId}`,
    delete_url: `${base}/f/${file.shortId}/delete/${file.deleteToken}`,
  });
});

// CSRF protection: reject cross-origin requests by comparing Origin to Host.
// sameSite:'strict' cookies already block most CSRF; this is an additional layer.
function requireSameOrigin(req, res, next) {
  const origin = req.headers.origin;
  if (!origin) return next(); // no Origin header → same-origin or non-browser request
  try {
    if (new URL(origin).host !== req.headers.host) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  } catch {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

// JSON API routes
app.use('/api/auth', requireSameOrigin, require('./src/routes/auth'));
app.use('/api/admin/import', require('./src/routes/import'));
app.use('/api', requireSameOrigin, require('./src/routes/api'));

// Raw file serving (not JSON)
app.use('/f', require('./src/routes/files'));

// Serve React SPA in production
const clientDist = path.join(__dirname, 'client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

(async () => {
  await connectDB();
  await migrateUserFolders();
  await migrateApiKeyHashes();
  await runRetentionCleanup();
  setInterval(runRetentionCleanup, 24 * 60 * 60 * 1000);
  app.listen(PORT, () => {
    console.log(`sharely running on http://localhost:${PORT}`);
  });
})();
