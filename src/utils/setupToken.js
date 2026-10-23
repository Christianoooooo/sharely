const crypto = require('crypto');

// Without it, whoever reaches a fresh public instance first becomes admin. Unless
// INSTALL_TOKEN is set, a random token is created per process start and printed
// to the log, so only someone with access to the server can finish the setup.
const TOKEN = process.env.INSTALL_TOKEN || crypto.randomBytes(16).toString('hex');

/**
 * Checks a client-supplied setup token in constant time.
 * @param {*} candidate - Token from the setup request.
 * @returns {boolean} true if it matches.
 */
function checkSetupToken(candidate) {
  if (typeof candidate !== 'string') return false;
  const a = Buffer.from(candidate.trim());
  const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Logs where to find the setup token; call only while no user exists. */
function announceSetupToken() {
  if (process.env.INSTALL_TOKEN) {
    console.log('[install] Not installed yet. Open the site and enter the token from INSTALL_TOKEN.');
  } else {
    console.log(`[install] Not installed yet. Setup token: ${TOKEN}`);
  }
}

module.exports = { checkSetupToken, announceSetupToken };
