const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');

module.exports = async function migrateApiKeyHashes() {
  const collection = mongoose.connection.collection('users');

  // The old schema had a unique index on apiKey. Setting apiKey=null for
  // multiple users violates it. Drop the index first before touching any doc.
  try {
    await collection.dropIndex('apiKey_1');
    console.log('[migration] Dropped legacy apiKey_1 unique index');
  } catch (err) {
    // code 27 / IndexNotFound means it was already gone — that's fine
    if (err.code !== 27 && err.codeName !== 'IndexNotFound') {
      console.warn('[migration] Could not drop apiKey_1 index:', err.message);
    }
  }

  const users = await User.find({
    apiKey: { $exists: true, $ne: '' },
    apiKeyHash: { $exists: false },
  });

  if (users.length === 0) return;

  console.log(`[migration] Hashing plaintext API keys for ${users.length} user(s)…`);
  let migrated = 0;

  for (const user of users) {
    try {
      const hash = crypto.createHash('sha256').update(user.apiKey).digest('hex');
      const prefix = user.apiKey.slice(0, 8);

      // Use raw updateOne to bypass Mongoose's save() path entirely –
      // that path still triggers the (now-dropped) index on older builds.
      await collection.updateOne(
        { _id: user._id },
        {
          $set: { apiKeyHash: hash, apiKeyPrefix: prefix },
          $unset: { apiKey: '' },
        },
      );
      migrated++;
    } catch (err) {
      console.error(`[migration] Failed to hash API key for ${user.username}:`, err.message);
    }
  }

  console.log(`[migration] done — hashed: ${migrated}, errors: ${users.length - migrated}`);
};
