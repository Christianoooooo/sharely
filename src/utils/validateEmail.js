const dns = require('dns').promises;

// Local part kept permissive; domain must be dot-separated labels with an
// alphabetic TLD, which rejects trailing/double dots (e.g. "x@foo.de.").
const EMAIL_REGEX = /^[^\s@]+@([A-Za-z0-9](-?[A-Za-z0-9])*\.)+[A-Za-z]{2,}$/;

/**
 * Validates an email's format and that its domain has MX records.
 * @param {string} email the address to check
 * @returns {Promise<{valid: boolean, reason?: string, mxRecords?: string[]}>} performs a DNS MX lookup (network)
 */
async function validateEmail(email) {
  if (typeof email !== 'string') return { valid: false, reason: 'not a string' };

  if (email.length > 254 || !EMAIL_REGEX.test(email)) {
    return { valid: false, reason: 'invalid format' };
  }

  const domain = email.split('@')[1];

  try {
    const records = await dns.resolveMx(domain);
    if (!records || records.length === 0) {
      return { valid: false, reason: 'no MX records' };
    }
    return { valid: true, mxRecords: records.map(r => r.exchange) };
  } catch {
    return { valid: false, reason: 'MX lookup failed' };
  }
}

module.exports = { validateEmail };
