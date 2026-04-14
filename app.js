require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const connectDB = require('./src/config/db');

const app = express();

connectDB();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'changeme',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }, // 7 days
}));

// Expose user to all views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Routes
app.use('/auth', require('./src/routes/auth'));
app.use('/api', require('./src/routes/api'));
app.use('/admin', require('./src/routes/admin'));
app.use('/gallery', require('./src/routes/gallery'));
app.use('/', require('./src/routes/files'));

// 404
app.use((req, res) => {
  res.status(404).render('error', { code: 404, message: 'Page not found' });
});

// 500
app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).render('error', { code: 500, message: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`instant-sharing-tool running on http://localhost:${PORT}`);
});
