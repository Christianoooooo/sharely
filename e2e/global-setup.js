const { chromium, request } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const PORT = process.env.E2E_PORT || '3099';
const BASE = `http://localhost:${PORT}`;

const ADMIN_USER = 'e2eadmin';
const ADMIN_PASS = 'E2eAdminPass123!';
const TEST_USER = 'e2euser';
const TEST_PASS = 'E2eUserPass123!';

// Expose to specs via env
process.env.E2E_ADMIN_USER = ADMIN_USER;
process.env.E2E_ADMIN_PASS = ADMIN_PASS;
process.env.E2E_USER = TEST_USER;
process.env.E2E_PASS = TEST_PASS;

module.exports = async function globalSetup() {
  // Ensure auth state directory exists
  const authDir = path.join(__dirname, '.auth');
  fs.mkdirSync(authDir, { recursive: true });

  const api = await request.newContext({ baseURL: BASE });

  // ── 1. Complete first-run wizard if needed ──────────────────────────────
  const statusR = await api.get('/api/install/status');
  const { installed } = await statusR.json();

  if (!installed) {
    const r = await api.post('/api/install/setup', {
      data: {
        username: ADMIN_USER,
        password: ADMIN_PASS,
        confirmPassword: ADMIN_PASS,
        operatorName: 'E2E Test',
        operatorAddress: 'Test Street 1',
        operatorEmail: 'e2e@test.local',
        allowRegistration: true,
      },
    });
    if (!r.ok()) throw new Error(`Install failed (${r.status()}): ${await r.text()}`);
    console.log('✅ App installed — admin created');
  }

  // ── 2. Ensure regular test user exists ─────────────────────────────────
  const loginCheck = await api.post('/api/auth/login', {
    data: { username: TEST_USER, password: TEST_PASS },
  });
  if (loginCheck.status() === 401) {
    const regR = await api.post('/api/auth/register', {
      data: { username: TEST_USER, password: TEST_PASS, confirmPassword: TEST_PASS },
    });
    if (!regR.ok()) throw new Error(`Register test user failed (${regR.status()}): ${await regR.text()}`);
    console.log('✅ Test user registered');
  }

  await api.dispose();

  // ── 3. Log in as admin with a real browser and save cookie state ────────
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(`${BASE}/auth/login`);
  await page.getByLabel(/username/i).fill(ADMIN_USER);
  // There are two password fields on the page potentially; target the first
  await page.locator('input[type="password"]').first().fill(ADMIN_PASS);
  await page.getByRole('button', { name: /^login$/i }).click();
  await page.waitForURL(/\/gallery/, { timeout: 10_000 });

  await ctx.storageState({ path: path.join(authDir, 'admin.json') });
  console.log('✅ Admin session saved');

  await browser.close();
};
