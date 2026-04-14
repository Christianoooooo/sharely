const mongoose = require('mongoose');

async function connectDB() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set. Configure it in your .env file with credentials.');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  const hasCredentials = /mongodb(\+srv)?:\/\/[^:]+:[^@]+@/.test(uri);
  if (!hasCredentials) {
    console.error('MONGODB_URI must include username and password (mongodb://user:password@host/db).');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
