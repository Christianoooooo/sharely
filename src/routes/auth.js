const express = require('express');
const router = express.Router();
const User = require('../models/User');

const allowRegistration = () => process.env.ALLOW_REGISTRATION !== 'false';

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user: req.session.user });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const user = await User.findOne({ username });
  if (!user || !user.isActive) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const valid = await user.comparePassword(password);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  req.session.user = { id: user._id, username: user.username, role: user.role };
  res.json({ user: req.session.user });
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  if (!allowRegistration()) {
    return res.status(403).json({ error: 'Registration is disabled' });
  }
  const { username, password, confirmPassword } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }
  if (username.length < 3 || username.length > 32) {
    return res.status(400).json({ error: 'Username must be 3–32 characters' });
  }
  if (password.length < 12) {
    return res.status(400).json({ error: 'Password must be at least 12 characters' });
  }
  const exists = await User.findOne({ username });
  if (exists) {
    return res.status(409).json({ error: 'Username already taken' });
  }
  const count = await User.countDocuments();
  const role = count === 0 ? 'admin' : 'user';
  const user = await User.create({ username, password, role });
  req.session.user = { id: user._id, username: user.username, role: user.role };
  res.status(201).json({ user: req.session.user });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

module.exports = router;
