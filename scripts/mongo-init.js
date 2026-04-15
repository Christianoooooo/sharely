/**
 * Executed by mongosh on first container start via docker-entrypoint-initdb.d.
 * Creates the application database user with least-privilege access.
 */

const appUser = process.env.MONGO_APP_USER || 'appuser';
const appPass = process.env.MONGO_APP_PASSWORD;
const dbName = process.env.MONGO_DB_NAME || 'sharely';

if (!appPass) {
  throw new Error('MONGO_APP_PASSWORD is not set – cannot create app user.');
}

db.getSiblingDB(dbName).createUser({
  user: appUser,
  pwd: appPass,
  roles: [{ role: 'readWrite', db: dbName }],
});

print(`MongoDB: created user '${appUser}' on database '${dbName}'.`);
