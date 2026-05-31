const { validateEmail } = require('./validateEmail');

const cases = [
  { email: 'user@example.com',  expectValid: true },
  { email: 'invalid',           expectValid: false },
  { email: 'user@.com',         expectValid: false },
  { email: 'user@gmail.com',    expectValid: true },
  { email: 'bad@@domain.com',   expectValid: false },
  { email: 'no-at-sign',        expectValid: false },
  { email: 'a@b.c',             expectValid: false }, // b.c has no MX records
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
