// Stub DNS so the test is hermetic and does not depend on network / real MX records.
const MX_FIXTURES = {
  'example.com': [{ exchange: 'mx.example.com', priority: 10 }],
  'gmail.com': [{ exchange: 'gmail-smtp-in.l.google.com', priority: 5 }],
  'b.c': [],
};
require('dns').promises.resolveMx = async (domain) => {
  if (domain in MX_FIXTURES) return MX_FIXTURES[domain];
  throw new Error('ENOTFOUND');
};

const { validateEmail } = require('./validateEmail');

const cases = [
  { email: 'user@example.com',  expectValid: true },
  { email: 'invalid',           expectValid: false },
  { email: 'user@.com',         expectValid: false },
  { email: 'user@gmail.com',    expectValid: true },
  { email: 'bad@@domain.com',   expectValid: false },
  { email: 'no-at-sign',        expectValid: false },
  { email: 'a@b.c',             expectValid: false }, // b.c resolves but has no MX records
];

(async () => {
  console.log('Running validateEmail tests...\n');
  let passed = 0;
  let failed = 0;

  for (const { email, expectValid } of cases) {
    const result = await validateEmail(email);
    const ok = result.valid === expectValid;
    const status = ok ? 'PASS' : 'FAIL';
    const detail = result.valid
      ? `MX: ${result.mxRecords?.join(', ')}`
      : `reason: ${result.reason}`;
    console.log(`[${status}] "${email}" → valid=${result.valid} (${detail})`);
    if (ok) passed++; else failed++;
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
