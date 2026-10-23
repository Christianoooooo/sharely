const { test, expect } = require('@playwright/test');

test.describe('Login – input validation', () => {
  // Non-string credentials would reach the user query as operators and an LDAP filter unescaped.
  test('rejects non-string username and password', async ({ playwright, baseURL }) => {
    const anon = await playwright.request.newContext({ baseURL });
    for (const data of [
      { username: ['a)(uid=*', 'admin'], password: 'whatever-password' },
      { username: { $ne: null }, password: 'whatever-password' },
      { username: 'admin', password: ['x'] },
    ]) {
      const r = await anon.post('/api/auth/login', { data });
      expect(r.status()).toBe(400);
    }
    await anon.dispose();
  });
});
