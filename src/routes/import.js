/**
 * XBackBone import endpoint.
 *
 * POST /api/admin/import/xbackbone
 *   multipart fields:
 *     db          - XBackBone's database.db file (required)
 *     storagePath - absolute path to XBackBone's storage directory on this
 *                   server (required, e.g. /xbackbone/storage)
 *     defaultUser - our username to assign files when no XBackBone user can
 *                   be matched by username (optional)
 *
 * XBackBone user matching: tries to find a local user whose username matches
 * the XBackBone user's username (case-insensitive). Files belonging to
 * unmatched users are assigned to defaultUser; if no defaultUser is given
 * those files are skipped.
 *
 * File discovery: looks for {storagePath}/{xbb_filename}, then searches one
 * level of subdirectories as fallback (covers user-token-bucketed layouts).
 *
 * The operation is idempotent: files with the same originalName + size +
 * uploader are skipped if already present.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const initSqlJs = require('sql.js');
const mime = require('mime-types');
const { requireAdmin } = require('../middleware/auth');
const File = require('../models/File');
const User = require('../models/User');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');

// ── SQLite helpers ────────────────────────────────────────────────────────────

/** Resolve a SQL.js result-set to an array of plain objects. */
function rowsToObjects(result) {
  if (!result || result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row) =>
    Object.fromEntries(columns.map((col, i) => [col, row[i]])),
  );
}

/** Return all table names present in the SQLite database. */
function getTableNames(db) {
  const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  return rowsToObjects(result).map((r) => r.name);
}

/** Return the column names of a table using PRAGMA. */
function getColumnNames(db, table) {
  const result = db.exec(`PRAGMA table_info(${table})`);
  return rowsToObjects(result).map((r) => r.name);
}

/**
 * Detect the media table name and validate required tables exist.
 * Returns { error, mediaTable }.
 */
function detectSchema(tables) {
  const hasUsers = tables.includes('users');
  const mediaTable = tables.includes('media') ? 'media'
    : tables.includes('uploads') ? 'uploads'
    : null;

  if (!hasUsers || !mediaTable) {
    const found = tables.length ? tables.join(', ') : '(none)';
    return {
      error: `Not a valid XBackBone database. Expected tables: users, media. Found: ${found}`,
      mediaTable: null,
    };
  }
  return { error: null, mediaTable };
}

/**
 * Build a SELECT query for the media table that adapts to the actual columns
 * present. XBackBone's schema varies between versions.
 * Always selects: id, user_id, filename
 * Optional with fallbacks: mimetype, name, created_at, download_count
 */
function buildMediaSelect(db, mediaTable) {
  const cols = new Set(getColumnNames(db, mediaTable));

  // Require the minimal columns
  for (const required of ['id', 'user_id', 'filename']) {
    if (!cols.has(required)) {
      throw new Error(
        `Media table is missing required column "${required}". ` +
        `Columns found: ${[...cols].join(', ')}`,
      );
    }
  }

  const parts = [
    'id',
    'user_id',
    'filename',
    // mimetype - some versions use 'type'
    cols.has('mimetype') ? 'mimetype'
      : cols.has('type') ? 'type AS mimetype'
      : "NULL AS mimetype",
    // original filename - some versions omit this
    cols.has('name') ? 'name'
      : cols.has('original_name') ? 'original_name AS name'
      : 'filename AS name',
    // creation timestamp
    cols.has('created_at') ? 'created_at'
      : cols.has('upload_date') ? 'upload_date AS created_at'
      : 'NULL AS created_at',
    // view/download counter
    cols.has('download_count') ? 'download_count'
      : cols.has('views') ? 'views AS download_count'
      : '0 AS download_count',
  ];

  return `SELECT ${parts.join(', ')} FROM ${mediaTable}`;
}

/**
 * Build a SELECT query for the users table, adapting to available columns.
 */
function buildUsersSelect(db) {
  const cols = new Set(getColumnNames(db, 'users'));
  const parts = [
    'id',
    cols.has('username') ? 'username' : "NULL AS username",
    cols.has('email') ? 'email' : "NULL AS email",
  ];
  return `SELECT ${parts.join(', ')} FROM users`;
}

// ── Filesystem helpers ────────────────────────────────────────────────────────

// Find a file in storagePath. Search order:
//   1. storage/<mediaId>/<filename>  - XBackBone's standard ID-bucketed layout
//   2. storage/<filename>            - flat layout (older installs)
//   3. storage/<subdir>/<filename>   - any other single-level subdirectory
function findFile(storagePath, mediaId, filename) {
  // 1. ID-bucketed (standard XBackBone layout)
  if (mediaId) {
    const bucketed = path.join(storagePath, mediaId, filename);
    if (fs.existsSync(bucketed)) return bucketed;
  }

  // 2. Flat
  const flat = path.join(storagePath, filename);
  if (fs.existsSync(flat)) return flat;

  // 3. Any subdirectory
  try {
    const entries = fs.readdirSync(storagePath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(storagePath, entry.name, filename);
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch { /* storagePath unreadable - handled by caller */ }
  return null;
}

// ── Import route ──────────────────────────────────────────────────────────────

router.post('/xbackbone', requireAdmin, async (req, res, next) => {
  let db = null;

  try {
    const dbPath = (req.body.dbPath || '').trim();
    if (!dbPath) {
      return res.status(400).json({ error: 'dbPath (path to database.db) is required' });
    }
    if (!fs.existsSync(dbPath)) {
      return res.status(400).json({ error: `dbPath not found: ${dbPath}` });
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
    const dbBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(new Uint8Array(dbBuffer));

    const tables = getTableNames(db);
    const { error: schemaError, mediaTable } = detectSchema(tables);
    if (schemaError) {
      db.close(); db = null;
      return res.status(400).json({ error: schemaError });
    }

    const xbbUsers = rowsToObjects(db.exec(buildUsersSelect(db)));
    const xbbMedia = rowsToObjects(db.exec(buildMediaSelect(db, mediaTable)));
    db.close(); db = null;

    // ── Build XBackBone userId → local User map ──────────────────────────────
    const localUsers = await User.find({}, 'username folderName');
    const localByUsername = new Map(
      localUsers.map((u) => [u.username.toLowerCase(), u]),
    );

    let defaultLocalUser = null;
    if (req.body.defaultUser) {
      defaultLocalUser = localByUsername.get(req.body.defaultUser.trim().toLowerCase()) || null;
    }

    const xbbUserMap = new Map();
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

      const srcPath = findFile(storagePath, String(media.id), media.filename);
      if (!srcPath) {
        results.skipped++;
        results.details.push({
          file: media.name || media.filename,
          status: 'skipped',
          reason: 'file not found in storagePath',
        });
        continue;
      }

      const folder = localUser.folderName || localUser.username;
      const destDir = path.join(UPLOAD_DIR, folder);
      const ext = path.extname(media.filename) || path.extname(media.name || '') || '';
      const newFilename = `${crypto.randomBytes(4).toString('hex')}${ext}`;
      const newStoredName = path.posix.join(folder, newFilename);
      const destPath = path.join(destDir, newFilename);

      // Idempotency: skip if already imported
      const srcStat = fs.statSync(srcPath);
      const existing = await File.findOne({
        uploader: localUser._id,
        originalName: media.name || media.filename,
        size: srcStat.size,
      });
      if (existing) {
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

        const mimeType =
          media.mimetype ||
          mime.lookup(media.filename) ||
          'application/octet-stream';

        await File.create({
          originalName: media.name || media.filename,
          storedName: newStoredName,
          mimeType,
          size: srcStat.size,
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
  } catch (err) {
    next(err);
  } finally {
    if (db) { try { db.close(); } catch { /* ignore */ } }
  }
});

// ── Preview route ─────────────────────────────────────────────────────────────

router.post('/xbackbone/preview', requireAdmin, async (req, res, next) => {
  let db = null;

  try {
    const dbPath = (req.body.dbPath || '').trim();
    if (!dbPath) {
      return res.status(400).json({ error: 'dbPath (path to database.db) is required' });
    }
    if (!fs.existsSync(dbPath)) {
      return res.status(400).json({ error: `dbPath not found: ${dbPath}` });
    }

    const SQL = await initSqlJs();
    const dbBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(new Uint8Array(dbBuffer));

    const tables = getTableNames(db);
    const { error: schemaError, mediaTable } = detectSchema(tables);
    if (schemaError) {
      db.close(); db = null;
      return res.status(400).json({ error: schemaError });
    }

    const xbbUsers = rowsToObjects(db.exec(buildUsersSelect(db)));
    const countResult = db.exec(
      `SELECT user_id, COUNT(*) AS cnt FROM ${mediaTable} GROUP BY user_id`,
    );
    db.close(); db = null;

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
      xbbEmail: xu.email || null,
      fileCount: fileCounts.get(xu.id) || 0,
      matchedLocalUser: xu.username
        ? (localByUsername.get(xu.username.toLowerCase()) || null)
        : null,
    }));

    res.json({ users, localUsers: localUsers.map((u) => u.username) });
  } catch (err) {
    next(err);
  } finally {
    if (db) { try { db.close(); } catch { /* ignore */ } }
  }
});

module.exports = router;
