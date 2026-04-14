require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const fs = require('fs');
const connectDB = require('./src/config/db');
const uploadMiddleware = require('./src/middleware/upload');
const { requireApiKey } = require('./src/middleware/auth');
const File = require('./src/models/File');

const migrateUserFolders = require('./src/migrations/migrateUserFolders');

const UPLOAD_DIR = path.join(__dirname, 'uploads');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'changeme',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 },
}));

// ShareX upload endpoint — multer runs first so req.body.token is available for auth.
// Because auth runs after multer, the file lands in the root uploads dir initially;
// we move it into the user's subfolder once the user identity is known.
app.post('/upload', uploadMiddleware.single('upload'), requireApiKey, async (req, res) => {
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
    originalName: req.file.originalname,
    storedName,
    mimeType: req.file.mimetype,
    size: req.file.size,
    uploader: user._id,
  });
  const base = process.env.BASE_URL || 'http://localhost:3000';
  res.json({ url: `${base}/f/${file.shortId}` });
});

// JSON API routes
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api', require('./src/routes/api'));

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
  app.listen(PORT, () => {
    console.log(`instant-sharing-tool running on http://localhost:${PORT}`);
  });
})();
