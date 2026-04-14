/**
 * Executed by mongosh on first container start via docker-entrypoint-initdb.d.
 * Creates the application database user with least-privilege access.
 */

const appUser = process.env.MONGO_APP_USER || 'appuser';
const appPass = process.env.MONGO_APP_PASSWORD;

if (!appPass) {
  throw new Error('MONGO_APP_PASSWORD is not set – cannot create app user.');
}

db.getSiblingDB('instant-sharing-tool').createUser({
  user: appUser,
  pwd: appPass,
  roles: [{ role: 'readWrite', db: 'instant-sharing-tool' }],
});

print(`MongoDB: created user '${appUser}' on database 'instant-sharing-tool'.`);
