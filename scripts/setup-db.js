/**
 * MongoDB user setup script.
 *
 * Run once on the MongoDB host to create a dedicated application user:
 *   mongosh < scripts/setup-db.js
 *
 * After running, set MONGODB_URI in your .env to:
 *   mongodb://appuser:<password>@localhost:27017/instant-sharing-tool?authSource=instant-sharing-tool
 */

const DB_NAME = 'instant-sharing-tool';
const APP_USER = 'appuser';

// Change this before running!
const APP_PASSWORD = 'CHANGE_ME_PASSWORD';

const db = db.getSiblingDB(DB_NAME);

// Check if user already exists
const existing = db.getUser(APP_USER);
if (existing) {
  print(`User '${APP_USER}' already exists on database '${DB_NAME}'. No changes made.`);
  quit(0);
}

db.createUser({
  user: APP_USER,
  pwd: APP_PASSWORD,
  roles: [
    { role: 'readWrite', db: DB_NAME },
  ],
});

print(`User '${APP_USER}' created on database '${DB_NAME}'.`);
print('');
print('Next steps:');
print('  1. Enable authentication in /etc/mongod.conf:');
print('       security:');
print('         authorization: enabled');
print('  2. Restart MongoDB: sudo systemctl restart mongod');
print(`  3. Set MONGODB_URI in .env:`);
print(`       mongodb://${APP_USER}:${APP_PASSWORD}@localhost:27017/${DB_NAME}?authSource=${DB_NAME}`);
print('  4. Replace the password above with a strong, unique value.');
