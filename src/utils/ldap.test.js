process.env.LDAP_URL = 'ldap://ldap.example.com';
const { searchFilter, normalizeDn } = require('./ldap');

const cases = [
  { username: 'alice',           expect: '(uid=alice)' },
  // RFC 4515 special characters in the username must be escaped, not interpreted.
  { username: 'a*b',             expect: '(uid=a\\2ab)' },
  { username: 'a)(cn=admin)',    expect: '(uid=a\\29\\28cn=admin\\29)' },
  { username: 'a\\b',            expect: '(uid=a\\5cb)' },
];

console.log('Running ldap searchFilter tests...\n');
let passed = 0;
let failed = 0;

for (const { username, expect } of cases) {
  const result = searchFilter(username);
  const ok = result === expect;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] "${username}" → ${result}${ok ? '' : ` (expected ${expect})`}`);
  if (ok) passed++; else failed++;
}

// A custom filter template with multiple placeholders is fully substituted.
process.env.LDAP_SEARCH_FILTER = '(&(objectClass=person)(sAMAccountName={{username}}))';
const multi = searchFilter('bob');
const multiOk = multi === '(&(objectClass=person)(sAMAccountName=bob))';
console.log(`[${multiOk ? 'PASS' : 'FAIL'}] custom template → ${multi}`);
if (multiOk) passed++; else failed++;

// Filter.escape passes array elements through unescaped, so non-strings must be refused.
for (const bad of [['a)(uid=*', 'b'], { a: 1 }, 42]) {
  let threw = false;
  try { searchFilter(bad); } catch (e) { threw = e instanceof TypeError; }
  console.log(`[${threw ? 'PASS' : 'FAIL'}] non-string ${JSON.stringify(bad)} is rejected`);
  if (threw) passed++; else failed++;
}

const dnOk = normalizeDn(' UID=Bob,OU=People,DC=Example,DC=Com ') === 'uid=bob,ou=people,dc=example,dc=com';
console.log(`[${dnOk ? 'PASS' : 'FAIL'}] DN is normalized for comparison`);
if (dnOk) passed++; else failed++;

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
