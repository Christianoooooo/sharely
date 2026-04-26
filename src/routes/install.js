const express = require('express');
const router = express.Router();
const User = require('../models/User');
const SiteSettings = require('../models/SiteSettings');
const { logAudit } = require('../utils/audit');

// GET /api/install/status
router.get('/status', async (_req, res) => {
  try {
    const count = await User.countDocuments();
    res.json({ installed: count > 0 });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/install/setup — only callable when no users exist yet
router.post('/setup', async (req, res) => {
  try {
    const count = await User.countDocuments();
    if (count > 0) {
      return res.status(403).json({ error: 'Already installed' });
    }

    const {
      username,
      password,
      confirmPassword,
      operatorName,
      operatorAddress,
      operatorEmail,
      sessionDurationDays,
      fileRetentionDays,
      allowRegistration,
      encryptionAtRest,
      cloudflareAnalytics,
    } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }
    if (username.length < 3 || username.length > 32) {
      return res.status(400).json({ error: 'Username must be 3–32 characters' });
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return res.status(400).json({ error: 'Username may only contain letters, numbers, underscores, and hyphens' });
    }
    if (password.length < 12) {
      return res.status(400).json({ error: 'Password must be at least 12 characters' });
    }

    const user = await User.create({ username, password, role: 'admin' });

    await SiteSettings.findByIdAndUpdate(
      'singleton',
      {
        operatorName: operatorName || '',
        operatorAddress: operatorAddress || '',
        operatorEmail: operatorEmail || '',
        sessionDurationDays: Math.max(1, Number(sessionDurationDays) || 7),
        fileRetentionDays: Math.max(0, Number(fileRetentionDays) || 0),
        allowRegistration: allowRegistration !== false,
        encryptionAtRest: !!encryptionAtRest,
        cloudflareAnalytics: !!cloudflareAnalytics,
      },
      { upsert: true, new: true },
    );

    req.session.user = { id: user._id, username: user.username, role: user.role };
    await logAudit(req, 'register');

    res.status(201).json({
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        avatarUrl: null,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
