const { WebSocketServer } = require('ws');
const proxyaddr = require('proxy-addr');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const File = require('./models/File');
const User = require('./models/User');
const SiteSettings = require('./models/SiteSettings');
const AuditLog = require('./models/AuditLog');
const { deleteThumbnail, thumbPath } = require('./utils/generateThumbnail');
const { UPLOAD_DIR, resolveUploadPath, escapeRegex } = require('./utils/uploadPath');
const { validateEmail } = require('./utils/validateEmail');
const mailer = require('./utils/mailer');
const ldap = require('./utils/ldap');
const { deleteUserData } = require('./utils/deleteUserData');

const clients = new Set();
const REVALIDATE_INTERVAL_MS = 30_000;
// Largest legitimate action payload is a few hundred bytes; ws defaults to 100 MiB.
const MAX_PAYLOAD_BYTES = 64 * 1024;
const MAX_CONNECTIONS_PER_IP = 20;
// Per-connection token bucket: bursts of 30 messages, refilled at 5 per second.
const MSG_BURST = 30;
const MSG_REFILL_PER_MS = 5 / 1000;
// Actions that check the password or send mail; limited per user across connections.
const SENSITIVE_ACTIONS = new Set([
  'user:change-password', 'user:change-username', 'user:change-email',
  'user:delete-account', 'user:resend-verification',
]);
const SENSITIVE_MAX = 10;
const SENSITIVE_WINDOW_MS = 15 * 60 * 1000;

const connectionsPerIp = new Map();
const sensitiveHits = new Map();
let wss = null;

// Same rule as the HTTP requireSameOrigin check; browsers always send Origin on
// WebSocket handshakes, so a cross-site page cannot open a socket with our cookie.
function isSameOrigin(origin, host) {
  if (!origin) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function allowSensitive(userId) {
  const now = Date.now();
  const hits = (sensitiveHits.get(userId) || []).filter((t) => now - t < SENSITIVE_WINDOW_MS);
  if (hits.length >= SENSITIVE_MAX) {
    sensitiveHits.set(userId, hits);
    return false;
  }
  hits.push(now);
  sensitiveHits.set(userId, hits);
  return true;
}

/**
 * Attaches the WebSocket server to the HTTP server.
 * @param {import('http').Server} server - HTTP server to handle upgrades on.
 * @param {Function} sessionMiddleware - express-session middleware used to authenticate the handshake.
 * @param {Function} trustProxy - Express 'trust proxy fn', used to derive the client IP.
 */
function initWS(server, sessionMiddleware, trustProxy) {
  wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: MAX_PAYLOAD_BYTES,
    verifyClient: ({ origin, req }, done) => {
      if (!isSameOrigin(origin, req.headers.host)) return done(false, 403);
      req.clientIp = proxyaddr(req, trustProxy);
      if ((connectionsPerIp.get(req.clientIp) || 0) >= MAX_CONNECTIONS_PER_IP) return done(false, 429);
      done(true);
    },
  });

  wss.on('connection', (ws, req) => {
    const ip = req.clientIp;
    connectionsPerIp.set(ip, (connectionsPerIp.get(ip) || 0) + 1);
    ws.on('close', () => {
      const n = (connectionsPerIp.get(ip) || 1) - 1;
      if (n > 0) connectionsPerIp.set(ip, n);
      else connectionsPerIp.delete(ip);
    });

    sessionMiddleware(req, {}, () => {
      const user = req.session?.user;
      if (!user) {
        ws.close(1008, 'Unauthorized');
        return;
      }

      const client = {
        ws,
        userId: String(user.id),
        isAdmin: user.role === 'admin',
        session: req.session,
        sessionId: req.sessionID,
        sessionStore: req.sessionStore,
        ip,
        alive: true,
      };
      clients.add(client);

      let tokens = MSG_BURST;
      let lastRefill = Date.now();
      ws.on('pong', () => { client.alive = true; });
      ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }
        const now = Date.now();
        tokens = Math.min(MSG_BURST, tokens + (now - lastRefill) * MSG_REFILL_PER_MS);
        lastRefill = now;
        if (tokens < 1) {
          if (typeof msg?.id === 'string') sendTo(client, msg.id, null, 'Too many requests', 429);
          return;
        }
        tokens -= 1;
        if (msg && typeof msg.id === 'string' && typeof msg.action === 'string') {
          handleAction(client, msg).catch((e) => {
            sendTo(client, msg.id, null, 'Internal server error', 500);
            console.error(`[ws] unhandled error in action ${msg.action}:`, e.message);
          });
        }
      });

      ws.on('close', () => clients.delete(client));
      ws.on('error', () => clients.delete(client));
    });
  });

  // Push-only clients never send a message, so logout, deactivation and role
  // changes must also be picked up here or admin broadcasts keep flowing.
  setInterval(() => {
    for (const client of clients) {
      if (!client.alive) {
        client.ws.terminate();
        clients.delete(client);
        continue;
      }
      client.alive = false;
      client.ws.ping();
      revalidateClient(client)
        .then((valid) => { if (!valid) closeClient(client); })
        .catch(() => { /* transient DB/store error: keep connection, retry next sweep */ });
    }
  }, REVALIDATE_INTERVAL_MS);
}

/**
 * Re-checks that the client's session still exists and its user is active,
 * and refreshes the cached admin flag.
 * @param {object} client - Connected client entry.
 * @returns {Promise<boolean>} false if the connection must be closed.
 * @throws {Error} on session store or database errors.
 */
async function revalidateClient(client) {
  const session = await loadStoredSession(client);
  if (!session?.user || String(session.user.id) !== client.userId) return false;
  const dbUser = await User.findById(client.userId).select('role isActive sessionVersion').lean();
  if (!dbUser || !dbUser.isActive) return false;
  if ((dbUser.sessionVersion || 0) !== (session.user.sv || 0)) return false;
  client.isAdmin = dbUser.role === 'admin';
  return true;
}

function loadStoredSession(client) {
  return new Promise((resolve, reject) => {
    client.sessionStore.get(client.sessionId, (e, s) => (e ? reject(e) : resolve(s)));
  });
}

// Writes the new sessionVersion into the stored session (not the handshake copy,
// which may be stale) so the caller stays logged in after changing the password.
async function keepOwnSession(client, sessionVersion) {
  const session = await loadStoredSession(client);
  if (!session?.user) return;
  session.user.sv = sessionVersion;
  await new Promise((resolve, reject) => {
    client.sessionStore.set(client.sessionId, session, (e) => (e ? reject(e) : resolve()));
  });
}

function closeClient(client) {
  clients.delete(client);
  client.ws.close(1008, 'Unauthorized');
}

/**
 * Broadcast an event to all connected clients matching the optional filter.
 * @param {string} event
 * @param {object} data
 * @param {(client: {userId: string, isAdmin: boolean}) => boolean} [filter]
 */
function broadcast(event, data, filter) {
  const msg = JSON.stringify({ event, data });
  for (const client of clients) {
    if (client.ws.readyState !== 1 /* OPEN */) continue;
    if (!filter || filter(client)) client.ws.send(msg);
  }
}

/** Send a response to one specific client. */
function sendTo(client, id, data, error, status) {
  if (client.ws.readyState !== 1) return;
  client.ws.send(JSON.stringify(error ? { id, error, status } : { id, data }));
}

/**
 * Inline audit helper — avoids a circular require with utils/audit.js
 * (audit.js imports broadcast from this module).
 */
async function wsAudit(client, action, meta = {}) {
  try {
    const userId = client.session?.user?.id ?? null;
    const username = client.session?.user?.username ?? meta.username ?? null;
    const log = await AuditLog.create({ userId, username, action, ip: client.ip, meta });
    broadcast('audit:log', log.toObject(), (c) => c.isAdmin);
  } catch (err) {
    console.error('[audit] write failed:', err.message);
  }
}

async function deleteFileRecord(client, file) {
  const fp = resolveUploadPath(file.storedName);
  try { fs.unlinkSync(fp); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  deleteThumbnail(file.shortId);
  await wsAudit(client, 'delete_file', { fileName: file.originalName, shortId: file.shortId });
  await file.deleteOne();
}

// ── Action dispatcher ────────────────────────────────────────────────────────

async function handleAction(client, { id, action, payload = {} }) {
  const ok  = (data)            => sendTo(client, id, data, null, null);
  const err = (msg, status = 400) => sendTo(client, id, null, msg, status);

  // Permissions are re-read per message: the handshake snapshot goes stale on
  // logout, deactivation or role change.
  if (!(await revalidateClient(client))) {
    err('Not authenticated', 401);
    closeClient(client);
    return;
  }
  const { userId, isAdmin } = client;
  if (SENSITIVE_ACTIONS.has(action) && !allowSensitive(userId)) {
    return err('Too many attempts, please try again later.', 429);
  }

  switch (action) {

    // ── Public ──────────────────────────────────────────────────────────────
    case 'site-settings:get': {
      const s = await SiteSettings.get();
      return ok({
        operatorName: s.operatorName,
        operatorAddress: s.operatorAddress,
        operatorEmail: s.operatorEmail,
        cloudflareAnalytics: s.cloudflareAnalytics,
        fileRetentionDays: s.fileRetentionDays,
        encryptionAtRest: s.encryptionAtRest,
        sessionDurationDays: s.sessionDurationDays ?? 7,
      });
    }

    // ── Auth ────────────────────────────────────────────────────────────────
    case 'auth:me': {
      const dbUser = await User.findById(userId)
        .select('username role avatarExt embedMode email emailVerified language');
      if (!dbUser) return err('Not authenticated', 401);
      return ok({
        user: {
          id: dbUser._id,
          username: dbUser.username,
          role: dbUser.role,
          avatarUrl: dbUser.avatarExt ? `/api/user/avatar/${dbUser._id}` : null,
          embedMode: dbUser.embedMode || 'embed',
          email: dbUser.email || null,
          emailVerified: dbUser.emailVerified || false,
          language: dbUser.language || 'en',
        },
      });
    }

    // ── File actions ─────────────────────────────────────────────────────────
    case 'file:get': {
      const { shortId } = payload;
      // Must be a plain string: an object would be passed to Mongo as a query operator.
      if (typeof shortId !== 'string' || !shortId) return err('shortId required');
      const file = await File.findOneAndUpdate(
        { shortId },
        { $inc: { views: 1 } },
        { returnDocument: 'after' },
      ).populate('uploader', 'username avatarExt');
      if (!file) return err('File not found', 404);
      const viewOwnerId = String(file.uploader?._id ?? file.uploader);
      broadcast('file:view', { shortId, views: file.views },
        (c) => c.userId === viewOwnerId || c.isAdmin);
      const obj = file.toObject();
      if (obj.uploader?.avatarExt) obj.uploader.avatarUrl = `/api/user/avatar/${obj.uploader._id}`;
      return ok({ file: obj });
    }

    case 'file:list': {
      const { q, type, page: pageRaw } = payload;
      const page = Math.max(1, parseInt(pageRaw || '1', 10));
      const PAGE_SIZE = 24;
      const filter = {};
      if (!isAdmin) filter.uploader = userId;
      if (q) filter.originalName = { $regex: escapeRegex(q), $options: 'i' };
      if (type && type !== 'all') {
        const typeMap = { image: /^image\//, video: /^video\//, audio: /^audio\//, pdf: /^application\/pdf$/ };
        if (typeMap[type]) {
          filter.mimeType = typeMap[type];
        } else if (type === 'code') {
          const codeExts = ['js','ts','jsx','tsx','py','rb','go','rs','java','c','cpp','h','hpp',
            'cs','php','sh','bash','zsh','fish','yml','yaml','toml','ini','conf','json','xml',
            'html','htm','css','scss','less','md','sql','dockerfile','makefile','r','swift',
            'kt','lua','pl','ex','exs','hs','clj','vue','svelte'];
          const typeCondition = {
            $or: [
              { originalName: { $regex: `\\.(${codeExts.join('|')})$`, $options: 'i' } },
              { mimeType: { $regex: '^text/' } },
            ],
          };
          if (q) {
            filter.$and = [{ originalName: filter.originalName }, typeCondition];
            delete filter.originalName;
          } else {
            Object.assign(filter, typeCondition);
          }
        }
      }
      const total = await File.countDocuments(filter);
      const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const files = await File.find(filter)
        .populate('uploader', 'username avatarExt')
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE);
      return ok({
        files: await Promise.all(files.map(async (f) => {
          const obj = f.toObject();
          obj.hasThumbnail = await fs.promises.access(thumbPath(f.shortId)).then(() => true).catch(() => false);
          if (obj.uploader?.avatarExt) obj.uploader.avatarUrl = `/api/user/avatar/${obj.uploader._id}`;
          return obj;
        })),
        total, page, pages,
      });
    }

    case 'file:delete': {
      const { shortId } = payload;
      if (typeof shortId !== 'string' || !shortId) return err('shortId required');
      const file = await File.findOne({ shortId });
      if (!file) return err('File not found', 404);
      const isOwner = file.uploader.toString() === userId;
      if (!isOwner && !isAdmin) return err('Forbidden', 403);
      const ownerId = file.uploader.toString();
      await deleteFileRecord(client, file);
      broadcast('file:deleted', { shortId, uploaderId: ownerId }, (c) => c.userId === ownerId);
      broadcast('stats:invalidate', {}, (c) => c.isAdmin);
      return ok({ success: true });
    }

    // ── User self-management ─────────────────────────────────────────────────
    case 'user:get-key': {
      const user = await User.findById(userId).select('apiKeyPrefix');
      if (!user) return err('Not found', 404);
      return ok({ prefix: user.apiKeyPrefix });
    }

    case 'user:regen-key': {
      const user = await User.findById(userId);
      if (!user) return err('Not found', 404);
      const plaintext = await user.regenerateApiKey();
      await wsAudit(client, 'regen_api_key');
      return ok({ apiKey: plaintext, prefix: user.apiKeyPrefix });
    }

    case 'user:change-password': {
      const { currentPassword, newPassword } = payload;
      if (!currentPassword || !newPassword) return err('Current and new password required');
      if (newPassword.length < 12) return err('New password must be at least 12 characters');
      const user = await User.findById(userId);
      if (!user) return err('Not found', 404);
      if (user.authProvider === 'ldap') return err('Password is managed by the directory');
      const valid = await user.comparePassword(currentPassword);
      if (!valid) return err('Current password is incorrect', 401);
      user.password = newPassword;
      user.sessionVersion = (user.sessionVersion || 0) + 1;
      await user.save();
      await keepOwnSession(client, user.sessionVersion);
      await wsAudit(client, 'change_password');
      return ok({ success: true });
    }

    case 'user:change-username': {
      const { newUsername, password } = payload;
      if (!newUsername || !password) return err('New username and current password required');
      const trimmed = newUsername.trim();
      if (trimmed.length < 3 || trimmed.length > 32) return err('Username must be between 3 and 32 characters');
      if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
        return err('Username may only contain letters, numbers, dashes and underscores');
      }
      const user = await User.findById(userId);
      if (!user) return err('Not found', 404);
      const valid = await user.comparePassword(password);
      if (!valid) return err('Password is incorrect', 401);
      const conflict = await User.findOne({ username: trimmed, _id: { $ne: user._id } });
      if (conflict) return err('Username already taken', 409);
      // Directory names stay reserved for their LDAP owners, who would otherwise be locked out.
      try {
        if (await ldap.isDirectoryUsername(trimmed)) return err('Username already taken', 409);
      } catch (e) {
        console.error('LDAP username check failed:', e.message);
        return err('Directory unavailable, please try again later', 503);
      }
      const oldUsername = user.username;
      user.username = trimmed;
      await user.save();
      client.session.user = { ...client.session.user, username: trimmed };
      await wsAudit(client, 'change_username', { oldUsername, newUsername: trimmed });
      broadcast('user:updated', { id: user._id.toString(), username: trimmed }, (c) => c.isAdmin);
      return ok({ success: true, username: trimmed });
    }

    case 'user:change-email': {
      const { email, password } = payload;
      if (!password) return err('Password required');
      const user = await User.findById(userId);
      if (!user) return err('Not found', 404);
      const valid = await user.comparePassword(password);
      if (!valid) return err('Password is incorrect', 401);
      const trimmed = (email || '').toLowerCase().trim();
      if (trimmed) {
        if (!(await validateEmail(trimmed)).valid) {
          return err('Invalid email address');
        }
        const conflict = await User.findOne({ email: trimmed, _id: { $ne: user._id } });
        if (conflict) return err('Email already in use', 409);
      }
      const token = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      user.email = trimmed || null;
      user.emailVerified = false;
      user.emailVerificationToken = trimmed ? hash : null;
      user.emailVerificationExpires = trimmed ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;
      await user.save();
      if (trimmed) {
        const verifyUrl = `${process.env.BASE_URL || ''}/api/auth/verify-email?token=${token}`;
        mailer.sendEmailVerificationEmail(trimmed, user.username, verifyUrl, user.language || 'en')
          .catch((e) => console.error('Failed to send verification email:', e.message));
      }
      await wsAudit(client, 'change_email');
      return ok({ success: true });
    }

    case 'user:change-language': {
      const { language } = payload;
      const allowed = ['en', 'de', 'fr', 'es', 'it', 'pt', 'ja', 'zh'];
      if (!language || !allowed.includes(language)) return err('Invalid language');
      await User.findByIdAndUpdate(userId, { language });
      return ok({ success: true });
    }

    case 'user:change-embed-mode': {
      const { embedMode } = payload;
      if (!['embed', 'raw'].includes(embedMode)) return err('Invalid embed mode');
      const user = await User.findByIdAndUpdate(userId, { embedMode }, { returnDocument: 'after' });
      if (!user) return err('User not found', 404);
      return ok({ embedMode: user.embedMode });
    }

    case 'user:resend-verification': {
      const user = await User.findById(userId);
      if (!user) return err('Not found', 404);
      if (!user.email || user.emailVerified) return err('No unverified email');
      const token = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      user.emailVerificationToken = hash;
      user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await user.save();
      const verifyUrl = `${process.env.BASE_URL || ''}/api/auth/verify-email?token=${token}`;
      mailer.sendEmailVerificationEmail(user.email, user.username, verifyUrl, user.language || 'en')
        .catch((e) => console.error('Failed to resend verification email:', e.message));
      return ok({ success: true });
    }

    case 'user:export': {
      const user = await User.findById(userId).select('username role createdAt embedMode');
      if (!user) return err('Not found', 404);
      const files = await File.find({ uploader: user._id })
        .select('originalName mimeType size views createdAt shortId')
        .sort({ createdAt: -1 });
      await wsAudit(client, 'export_data');
      const base = process.env.BASE_URL || 'http://localhost:3000';
      return ok({
        exportedAt: new Date().toISOString(),
        user: {
          username: user.username,
          role: user.role,
          createdAt: user.createdAt,
          embedMode: user.embedMode,
        },
        files: files.map((f) => ({
          name: f.originalName,
          type: f.mimeType,
          size: f.size,
          views: f.views,
          uploadedAt: f.createdAt,
          url: `${base}/f/${f.shortId}`,
        })),
      });
    }

    case 'user:delete-account': {
      const { password } = payload;
      if (!password) return err('Password required');
      const user = await User.findById(userId);
      if (!user) return err('Not found', 404);
      const valid = await user.comparePassword(password);
      if (!valid) return err('Password is incorrect', 401);
      // GDPR Art. 17: files, links, pastes, collections, avatar; audit log anonymized
      await deleteUserData(user);
      await wsAudit(client, 'delete_account');
      const selfDeleteId = user._id.toString();
      await user.deleteOne();
      broadcast('user:deleted', { id: selfDeleteId }, (c) => c.isAdmin);
      broadcast('stats:invalidate', {}, (c) => c.isAdmin);
      client.session.destroy?.(() => {});
      client.ws.close(1000, 'Account deleted');
      return;
    }

    // ── Admin: stats ─────────────────────────────────────────────────────────
    case 'admin:stats': {
      if (!isAdmin) return err('Admin access required', 403);
      const [userCount, fileCount] = await Promise.all([
        User.countDocuments(),
        File.countDocuments(),
      ]);
      const agg = await File.aggregate([{ $group: { _id: null, total: { $sum: '$size' } } }]);
      const totalSize = agg[0]?.total || 0;
      const recentFiles = await File.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('uploader', 'username avatarExt');
      return ok({
        userCount, fileCount, totalSize,
        recentFiles: recentFiles.map((f) => {
          const obj = f.toObject();
          if (obj.uploader?.avatarExt) obj.uploader.avatarUrl = `/api/user/avatar/${obj.uploader._id}`;
          return obj;
        }),
      });
    }

    // ── Admin: site settings ──────────────────────────────────────────────────
    case 'admin:settings:get': {
      if (!isAdmin) return err('Admin access required', 403);
      const s = await SiteSettings.get();
      return ok({
        operatorName: s.operatorName,
        operatorAddress: s.operatorAddress,
        operatorEmail: s.operatorEmail,
        cloudflareAnalytics: s.cloudflareAnalytics,
        fileRetentionDays: s.fileRetentionDays,
        encryptionAtRest: s.encryptionAtRest,
        sessionDurationDays: s.sessionDurationDays ?? 7,
      });
    }

    case 'admin:settings:update': {
      if (!isAdmin) return err('Admin access required', 403);
      const {
        operatorName, operatorAddress, operatorEmail,
        cloudflareAnalytics, fileRetentionDays, encryptionAtRest, sessionDurationDays,
      } = payload;
      const s = await SiteSettings.get();
      if (typeof operatorName === 'string') s.operatorName = operatorName.trim();
      if (typeof operatorAddress === 'string') s.operatorAddress = operatorAddress.trim();
      if (typeof operatorEmail === 'string') {
        const trimmed = operatorEmail.trim();
        if (trimmed !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
          return err('Invalid email address');
        }
        s.operatorEmail = trimmed;
      }
      if (typeof cloudflareAnalytics === 'boolean') s.cloudflareAnalytics = cloudflareAnalytics;
      if (typeof fileRetentionDays === 'number' && fileRetentionDays >= 0) {
        s.fileRetentionDays = Math.floor(fileRetentionDays);
      }
      if (typeof encryptionAtRest === 'boolean') s.encryptionAtRest = encryptionAtRest;
      if (typeof sessionDurationDays === 'number' && sessionDurationDays >= 1) {
        s.sessionDurationDays = Math.floor(sessionDurationDays);
      }
      await s.save();
      const result = {
        operatorName: s.operatorName,
        operatorAddress: s.operatorAddress,
        operatorEmail: s.operatorEmail,
        cloudflareAnalytics: s.cloudflareAnalytics,
        fileRetentionDays: s.fileRetentionDays,
        encryptionAtRest: s.encryptionAtRest,
        sessionDurationDays: s.sessionDurationDays,
      };
      broadcast('settings:updated', result, (c) => c.isAdmin);
      return ok(result);
    }

    // ── Admin: users ──────────────────────────────────────────────────────────
    case 'admin:users:list': {
      if (!isAdmin) return err('Admin access required', 403);
      const users = await User.find().sort({ createdAt: 1 });
      const counts = await File.aggregate([
        { $group: { _id: '$uploader', count: { $sum: 1 }, size: { $sum: '$size' } } },
      ]);
      const statsMap = {};
      counts.forEach((c) => { statsMap[c._id.toString()] = c; });
      return ok({
        users: users.map((u) => ({
          ...u.toObject(),
          password: undefined, apiKey: undefined, apiKeyHash: undefined,
          emailVerificationToken: undefined, emailVerificationExpires: undefined,
          passwordResetToken: undefined, passwordResetExpires: undefined,
          avatarUrl: u.avatarExt ? `/api/user/avatar/${u._id}` : undefined,
          fileCount: statsMap[u._id.toString()]?.count || 0,
          storageUsed: statsMap[u._id.toString()]?.size || 0,
        })),
      });
    }

    case 'admin:users:create': {
      if (!isAdmin) return err('Admin access required', 403);
      const { username, password, role } = payload;
      if (!username || !password) return err('Username and password required');
      if (username.length < 3 || username.length > 32) return err('Username must be 3–32 characters');
      if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        return err('Username may only contain letters, numbers, dashes and underscores');
      }
      if (password.length < 12) return err('Password must be at least 12 characters');
      const exists = await User.findOne({ username });
      if (exists) return err('Username already taken', 409);
      const user = await User.create({ username, password, role: role === 'admin' ? 'admin' : 'user' });
      await wsAudit(client, 'admin_create_user', { targetUsername: username, role: user.role });
      broadcast('user:created', { id: user._id.toString(), username: user.username, role: user.role, folderName: user.folderName, isActive: user.isActive, createdAt: user.createdAt, apiKeyPrefix: user.apiKeyPrefix }, (c) => c.isAdmin);
      broadcast('stats:invalidate', {}, (c) => c.isAdmin);
      return ok({ user: { id: user._id, username: user.username, role: user.role } });
    }

    case 'admin:users:toggle': {
      if (!isAdmin) return err('Admin access required', 403);
      const { id } = payload;
      if (!id) return err('id required');
      const user = await User.findById(id);
      if (!user) return err('Not found', 404);
      if (user._id.toString() === userId) return err('Cannot deactivate yourself');
      user.isActive = !user.isActive;
      await user.save();
      await wsAudit(client, 'admin_toggle_user', { targetUsername: user.username, isActive: user.isActive });
      broadcast('user:updated', { id: user._id.toString(), isActive: user.isActive }, (c) => c.isAdmin);
      return ok({ isActive: user.isActive });
    }

    case 'admin:users:role': {
      if (!isAdmin) return err('Admin access required', 403);
      const { id, role } = payload;
      if (!['admin', 'user'].includes(role)) return err('Invalid role');
      if (!id) return err('id required');
      const user = await User.findById(id);
      if (!user) return err('Not found', 404);
      if (user._id.toString() === userId) return err('Cannot change your own role');
      user.role = role;
      await user.save();
      await wsAudit(client, 'admin_change_role', { targetUsername: user.username, role });
      broadcast('user:updated', { id: user._id.toString(), role: user.role }, (c) => c.isAdmin);
      return ok({ role: user.role });
    }

    case 'admin:users:delete': {
      if (!isAdmin) return err('Admin access required', 403);
      const { id } = payload;
      if (!id) return err('id required');
      const user = await User.findById(id);
      if (!user) return err('Not found', 404);
      if (user._id.toString() === userId) return err('Cannot delete yourself');
      await deleteUserData(user);
      await wsAudit(client, 'admin_delete_user', { targetUsername: user.username });
      const deletedUserId = user._id.toString();
      await user.deleteOne();
      broadcast('user:deleted', { id: deletedUserId }, (c) => c.isAdmin);
      broadcast('stats:invalidate', {}, (c) => c.isAdmin);
      return ok({ success: true });
    }

    case 'admin:users:regen-key': {
      if (!isAdmin) return err('Admin access required', 403);
      const { id } = payload;
      if (!id) return err('id required');
      const user = await User.findById(id);
      if (!user) return err('Not found', 404);
      const plaintext = await user.regenerateApiKey();
      await wsAudit(client, 'admin_regen_key', { targetUsername: user.username });
      return ok({ apiKey: plaintext, prefix: user.apiKeyPrefix });
    }

    case 'admin:users:password': {
      if (!isAdmin) return err('Admin access required', 403);
      const { id, password } = payload;
      if (!id) return err('id required');
      if (!password || typeof password !== 'string') return err('Password required');
      if (password.length < 12) return err('Password must be at least 12 characters');
      const user = await User.findById(id);
      if (!user) return err('Not found', 404);
      user.password = password;
      user.sessionVersion = (user.sessionVersion || 0) + 1;
      await user.save();
      if (user._id.toString() === userId) await keepOwnSession(client, user.sessionVersion);
      await wsAudit(client, 'admin_change_password', { targetUsername: user.username });
      return ok({ success: true });
    }

    case 'admin:users:folder': {
      if (!isAdmin) return err('Admin access required', 403);
      const { id, folderName } = payload;
      if (!id) return err('id required');
      if (!folderName || typeof folderName !== 'string') return err('folderName required');
      const trimmed = folderName.trim();
      if (!/^[a-zA-Z0-9_-]+$/.test(trimmed) || trimmed.length > 64) {
        return err('Folder name may only contain letters, numbers, dashes and underscores (max 64 chars)');
      }
      const conflict = await User.findOne({ folderName: trimmed, _id: { $ne: id } });
      if (conflict) return err('Folder name already taken', 409);
      const user = await User.findById(id);
      if (!user) return err('Not found', 404);
      const oldFolderName = user.folderName;
      if (oldFolderName !== trimmed) {
        const oldPath = path.join(UPLOAD_DIR, oldFolderName);
        const newPath = path.join(UPLOAD_DIR, trimmed);
        if (fs.existsSync(oldPath)) await fs.promises.rename(oldPath, newPath);
        const filesToUpdate = await File.find({
          uploader: user._id,
          storedName: { $regex: `^${escapeRegex(oldFolderName)}/` },
        });
        if (filesToUpdate.length > 0) {
          await File.bulkWrite(filesToUpdate.map((f) => ({
            updateOne: {
              filter: { _id: f._id },
              update: { $set: { storedName: trimmed + f.storedName.slice(oldFolderName.length) } },
            },
          })));
        }
        user.folderName = trimmed;
        await user.save();
        broadcast('user:updated', { id: user._id.toString(), folderName: trimmed }, (c) => c.isAdmin);
      }
      return ok({ folderName: user.folderName });
    }

    // ── Admin: files ──────────────────────────────────────────────────────────
    case 'admin:files:list': {
      if (!isAdmin) return err('Admin access required', 403);
      const { q, page: pageRaw } = payload;
      const page = Math.max(1, parseInt(pageRaw || '1', 10));
      const PAGE_SIZE = 30;
      const filter = q ? { originalName: { $regex: escapeRegex(q), $options: 'i' } } : {};
      const total = await File.countDocuments(filter);
      const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const files = await File.find(filter)
        .populate('uploader', 'username avatarExt')
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE);
      return ok({
        files: await Promise.all(files.map(async (f) => {
          const obj = f.toObject();
          obj.hasThumbnail = await fs.promises.access(thumbPath(f.shortId)).then(() => true).catch(() => false);
          if (obj.uploader?.avatarExt) obj.uploader.avatarUrl = `/api/user/avatar/${obj.uploader._id}`;
          return obj;
        })),
        total, page, pages,
      });
    }

    // ── Admin: audit log ──────────────────────────────────────────────────────
    case 'admin:audit-log:list': {
      if (!isAdmin) return err('Admin access required', 403);
      const { user: userFilter, action: actionFilter, page: pageRaw } = payload;
      const page = Math.max(1, parseInt(pageRaw || '1', 10));
      const PAGE_SIZE = 50;
      const filter = {};
      if (userFilter) filter.username = { $regex: escapeRegex(userFilter), $options: 'i' };
      if (actionFilter) filter.action = actionFilter;
      const total = await AuditLog.countDocuments(filter);
      const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const logs = await AuditLog.find(filter)
        .sort({ timestamp: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE);
      return ok({ logs: logs.map((l) => l.toObject()), total, page, pages });
    }

    default:
      return err(`Unknown action: ${action}`, 400);
  }
}

module.exports = { initWS, broadcast };
