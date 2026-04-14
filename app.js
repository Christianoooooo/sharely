require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const connectDB = require('./src/config/db');
const uploadMiddleware = require('./src/middleware/upload');
const { requireApiKey } = require('./src/middleware/auth');
const File = require('./src/models/File');

const app = express();

connectDB();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'changeme',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 },
}));

// ShareX upload endpoint — multer runs first so req.body.token is available for auth
app.post('/upload', uploadMiddleware.single('upload'), requireApiKey, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  const file = await File.create({
    originalName: req.file.originalname,
    storedName: req.file.filename,
    mimeType: req.file.mimetype,
    size: req.file.size,
    uploader: req.apiUser._id,
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
app.listen(PORT, () => {
  console.log(`instant-sharing-tool running on http://localhost:${PORT}`);
});
