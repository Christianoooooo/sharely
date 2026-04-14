const User = require('../models/User');

// Require session-based login
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  next();
}

// Require admin role
function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).render('error', { code: 403, message: 'Admin access required' });
  }
  next();
}

// Require API key (Authorization: Bearer <key>, ?api_key=<key>, x-api-key header, or body token field)
async function requireApiKey(req, res, next) {
  let key = null;

  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) {
    key = auth.slice(7).trim();
  } else if (req.query.api_key) {
    key = req.query.api_key;
  } else if (req.headers['x-api-key']) {
    key = req.headers['x-api-key'];
  } else if (req.body && req.body.token) {
    key = req.body.token;
  }

  if (!key) {
    return res.status(401).json({ error: 'API key required' });
  }

  const user = await User.findOne({ apiKey: key, isActive: true });
  if (!user) {
    return res.status(401).json({ error: 'Invalid or inactive API key' });
  }

  req.apiUser = user;
  next();
}

module.exports = { requireLogin, requireAdmin, requireApiKey };
