const dns = require('dns').promises;

const EMAIL_REGEX = /^[^\s@]+@[^@.\s][^@\s]*\.[^@\s]+$/;

async function validateEmail(email) {
  if (typeof email !== 'string') return { valid: false, reason: 'not a string' };

  if (!EMAIL_REGEX.test(email)) {
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
