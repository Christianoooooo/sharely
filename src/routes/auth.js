const express = require('express');
const router = express.Router();
const User = require('../models/User');

const allowRegistration = () => process.env.ALLOW_REGISTRATION !== 'false';

// GET /auth/login
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/gallery');
  res.render('login', { error: null });
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.render('login', { error: 'Username and password are required' });
  }

  const user = await User.findOne({ username });
  if (!user || !user.isActive) {
    return res.render('login', { error: 'Invalid credentials' });
  }

  const valid = await user.comparePassword(password);
  if (!valid) {
    return res.render('login', { error: 'Invalid credentials' });
  }

  req.session.user = { id: user._id, username: user.username, role: user.role };
  res.redirect('/gallery');
});

// GET /auth/register
router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/gallery');
  if (!allowRegistration()) {
    return res.status(403).render('error', { code: 403, message: 'Registration is disabled' });
  }
  res.render('register', { error: null });
});

// POST /auth/register
router.post('/register', async (req, res) => {
  if (!allowRegistration()) {
    return res.status(403).render('error', { code: 403, message: 'Registration is disabled' });
  }

  const { username, password, confirmPassword } = req.body;

  if (!username || !password) {
    return res.render('register', { error: 'Username and password are required' });
  }
  if (password !== confirmPassword) {
    return res.render('register', { error: 'Passwords do not match' });
  }
  if (username.length < 3 || username.length > 32) {
    return res.render('register', { error: 'Username must be 3–32 characters' });
  }
  if (password.length < 6) {
    return res.render('register', { error: 'Password must be at least 6 characters' });
  }

  const exists = await User.findOne({ username });
  if (exists) {
    return res.render('register', { error: 'Username already taken' });
  }

  // First user ever becomes admin
  const count = await User.countDocuments();
  const role = count === 0 ? 'admin' : 'user';

  const user = await User.create({ username, password, role });
  req.session.user = { id: user._id, username: user.username, role: user.role };
  res.redirect('/gallery');
});

// GET /auth/logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/auth/login'));
});

module.exports = router;
