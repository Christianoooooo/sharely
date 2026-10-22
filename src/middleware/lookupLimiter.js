const { rateLimit } = require('express-rate-limit');

// Unlisted files, pastes, collections and share links are protected only by
// their ID or token. One shared counter of failed lookups (404/410/401…) across
// all of them throttles enumeration, while normal browsing, which almost only
// hits existing content, is unaffected.
const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

module.exports = { lookupLimiter };
