const User = require('../models/User');

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

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

  const user = await User.findByApiKey(key);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or inactive API key' });
  }

  req.apiUser = user;
  next();
}

module.exports = { requireLogin, requireAdmin, requireApiKey };
