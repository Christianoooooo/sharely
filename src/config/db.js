const mongoose = require('mongoose');

const RECONNECT_DELAY_MS = 5000;

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

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err.message);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected — driver will keep retrying.');
  });
  mongoose.connection.on('reconnected', () => {
    console.log('MongoDB reconnected');
  });

  // Retry the initial connect instead of exiting. A transient outage (DNS not
  // ready yet, mongo restarting) otherwise crashes the process, and the
  // container restart policy turns that into a crash-loop that floods the logs.
  for (;;) {
    try {
      await mongoose.connect(uri);
      console.log('MongoDB connected');
      return;
    } catch (err) {
      console.error(`MongoDB connection failed: ${err.message} — retrying in ${RECONNECT_DELAY_MS / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS));
    }
  }
}

module.exports = connectDB;
