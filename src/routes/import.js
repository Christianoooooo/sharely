/**
 * XBackBone import endpoint.
 *
 * POST /api/admin/import/xbackbone
 *   multipart fields:
 *     db          — XBackBone's database.db file (required)
 *     storagePath — absolute path to XBackBone's storage directory on this
 *                   server (required, e.g. /xbackbone/storage)
 *     defaultUser — our username to assign files when no XBackBone user can
 *                   be matched by username (optional)
 *
 * XBackBone user matching: the import tries to find a local user whose
 * username matches the XBackBone user's username (case-insensitive).
 * Files belonging to unmatched XBackBone users are assigned to defaultUser;
 * if no defaultUser is given those files are skipped.
 *
 * File discovery: looks for {storagePath}/{xbb_filename}, then searches one
 * level of subdirectories as fallback (covers user-token-bucketed layouts).
 *
 * The operation is idempotent with respect to shortId: if a File document
 * with the same storedName already exists it is skipped.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const initSqlJs = require('sql.js');
const mime = require('mime-types');
const { requireAdmin } = require('../middleware/auth');
const File = require('../models/File');
const User = require('../models/User');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');

// Multer for the SQLite DB upload — temp file, deleted after processing
const dbUpload = multer({ dest: '/tmp/xbb-import/' });

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Resolve a SQL.js result-set row to a plain object using column names. */
function rowsToObjects(result) {
  if (!result || result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row) =>
    Object.fromEntries(columns.map((col, i) => [col, row[i]])),
  );
}

/**
 * Find a file in storagePath.
 * Checks flat layout first (storagePath/filename), then one subdirectory deep.
 */
function findFile(storagePath, filename) {
  const flat = path.join(storagePath, filename);
  if (fs.existsSync(flat)) return flat;

  // Search one level of subdirectories (user-token-bucketed layouts)
  try {
    const entries = fs.readdirSync(storagePath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(storagePath, entry.name, filename);
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {
    // storagePath unreadable — handled by caller
  }
  return null;
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.post('/xbackbone', requireAdmin, dbUpload.single('db'), async (req, res) => {
  const tmpDbPath = req.file?.path;

  try {
    // ── Validate inputs ──────────────────────────────────────────────────────
    if (!req.file) {
      return res.status(400).json({ error: 'database.db file is required' });
    }

    const storagePath = (req.body.storagePath || '').trim();
    if (!storagePath) {
      return res.status(400).json({ error: 'storagePath is required' });
    }
    if (!fs.existsSync(storagePath)) {
      return res.status(400).json({ error: `storagePath not found: ${storagePath}` });
    }

    // ── Parse SQLite ─────────────────────────────────────────────────────────
    const SQL = await initSqlJs();
    const dbBuffer = fs.readFileSync(tmpDbPath);
    const db = new SQL.Database(new Uint8Array(dbBuffer));

    const xbbUsers = rowsToObjects(db.exec('SELECT id, username, email FROM users'));
    const xbbMedia = rowsToObjects(
      db.exec('SELECT id, user_id, filename, mimetype, name, created_at, download_count FROM media'),
    );
    db.close();

    // ── Build XBackBone userId → local User map ──────────────────────────────
    const localUsers = await User.find({}, 'username folderName');
    const localByUsername = new Map(
      localUsers.map((u) => [u.username.toLowerCase(), u]),
    );

    // Optional fallback user
    let defaultLocalUser = null;
    if (req.body.defaultUser) {
      defaultLocalUser = localByUsername.get(req.body.defaultUser.trim().toLowerCase()) || null;
    }

    const xbbUserMap = new Map(); // xbbUserId (number) → local User doc
    for (const xu of xbbUsers) {
      const match = xu.username ? localByUsername.get(xu.username.toLowerCase()) : null;
      xbbUserMap.set(xu.id, match || defaultLocalUser);
    }

    // ── Import files ─────────────────────────────────────────────────────────
    const results = { imported: 0, skipped: 0, errors: 0, details: [] };

    for (const media of xbbMedia) {
      const localUser = xbbUserMap.get(media.user_id);

      if (!localUser) {
        results.skipped++;
        results.details.push({
          file: media.name || media.filename,
          status: 'skipped',
          reason: 'no matching local user and no defaultUser set',
        });
        continue;
      }

      // Locate file on disk
      const srcPath = findFile(storagePath, media.filename);
      if (!srcPath) {
        results.skipped++;
        results.details.push({
          file: media.name || media.filename,
          status: 'skipped',
          reason: 'file not found in storagePath',
        });
        continue;
      }

      // Determine target folder
      const folder = localUser.folderName || localUser.username;
      const destDir = path.join(UPLOAD_DIR, folder);

      // Generate a new unique stored filename
      const ext = path.extname(media.filename) || path.extname(media.name || '') || '';
      const newFilename = `${crypto.randomBytes(4).toString('hex')}${ext}`;
      const newStoredName = path.posix.join(folder, newFilename);
      const destPath = path.join(destDir, newFilename);

      // Skip if already imported (same storedName pattern check via original name + size)
      const existingCheck = await File.findOne({
        uploader: localUser._id,
        originalName: media.name || media.filename,
        size: fs.statSync(srcPath).size,
      });
      if (existingCheck) {
        results.skipped++;
        results.details.push({
          file: media.name || media.filename,
          status: 'skipped',
          reason: 'already imported',
        });
        continue;
      }

      try {
        fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(srcPath, destPath);

        const stat = fs.statSync(destPath);
        const mimeType =
          media.mimetype ||
          mime.lookup(media.filename) ||
          'application/octet-stream';

        await File.create({
          originalName: media.name || media.filename,
          storedName: newStoredName,
          mimeType,
          size: stat.size,
          uploader: localUser._id,
          views: media.download_count || 0,
          createdAt: media.created_at ? new Date(media.created_at) : new Date(),
        });

        results.imported++;
        results.details.push({
          file: media.name || media.filename,
          status: 'imported',
          user: localUser.username,
        });
      } catch (err) {
        results.errors++;
        results.details.push({
          file: media.name || media.filename,
          status: 'error',
          reason: err.message,
        });
      }
    }

    res.json(results);
  } finally {
    // Always clean up the temp SQLite file
    if (tmpDbPath) {
      try { fs.unlinkSync(tmpDbPath); } catch { /* ignore */ }
    }
  }
});

// ── Preview: return XBackBone users + match status ───────────────────────────

router.post('/xbackbone/preview', requireAdmin, dbUpload.single('db'), async (req, res) => {
  const tmpDbPath = req.file?.path;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'database.db file is required' });
    }

    const SQL = await initSqlJs();
    const dbBuffer = fs.readFileSync(tmpDbPath);
    const db = new SQL.Database(new Uint8Array(dbBuffer));

    const xbbUsers = rowsToObjects(db.exec('SELECT id, username, email FROM users'));
    const countResult = db.exec(
      'SELECT user_id, COUNT(*) as cnt FROM media GROUP BY user_id',
    );
    db.close();

    const fileCounts = new Map(
      rowsToObjects(countResult).map((r) => [r.user_id, r.cnt]),
    );

    const localUsers = await User.find({}, 'username');
    const localByUsername = new Map(
      localUsers.map((u) => [u.username.toLowerCase(), u.username]),
    );

    const users = xbbUsers.map((xu) => ({
      xbbId: xu.id,
      xbbUsername: xu.username || null,
      xbbEmail: xu.email,
      fileCount: fileCounts.get(xu.id) || 0,
      matchedLocalUser: xu.username
        ? (localByUsername.get(xu.username.toLowerCase()) || null)
        : null,
    }));

    res.json({ users, localUsers: localUsers.map((u) => u.username) });
  } finally {
    if (tmpDbPath) {
      try { fs.unlinkSync(tmpDbPath); } catch { /* ignore */ }
    }
  }
});

module.exports = router;
