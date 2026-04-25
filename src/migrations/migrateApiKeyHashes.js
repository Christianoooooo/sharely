const crypto = require('crypto');
const User = require('../models/User');

module.exports = async function migrateApiKeyHashes() {
  const users = await User.find({
    apiKey: { $exists: true, $ne: '' },
    apiKeyHash: { $exists: false },
  });

  if (users.length === 0) return;

  console.log(`[migration] Hashing plaintext API keys for ${users.length} user(s)…`);
  let migrated = 0;

  for (const user of users) {
    try {
      user.apiKeyHash = crypto.createHash('sha256').update(user.apiKey).digest('hex');
      user.apiKeyPrefix = user.apiKey.slice(0, 8);
      user.apiKey = undefined;
      await user.save();
      migrated++;
    } catch (err) {
      console.error(`[migration] Failed to hash API key for ${user.username}:`, err.message);
    }
  }

  console.log(`[migration] done — hashed: ${migrated}, errors: ${users.length - migrated}`);
};
