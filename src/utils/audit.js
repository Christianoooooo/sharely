const AuditLog = require('../models/AuditLog');

async function logAudit(req, action, meta = {}) {
  try {
    const userId = req.session?.user?.id ?? req.apiUser?._id ?? null;
    const username = req.session?.user?.username ?? req.apiUser?.username ?? meta.username ?? null;
    await AuditLog.create({ userId, username, action, ip: req.ip ?? null, meta });
  } catch (err) {
    // Audit logging must never break the request
    console.error('[audit] write failed:', err.message);
  }
}

module.exports = { logAudit };
