const { request } = require('@playwright/test');

const PORT = process.env.E2E_PORT || '3099';
const BASE = `http://localhost:${PORT}`;

// Credentials reused across all spec files via process.env
process.env.E2E_ADMIN_USER = 'e2eadmin';
process.env.E2E_ADMIN_PASS = 'E2eAdminPass123!';
process.env.E2E_USER = 'e2euser';
process.env.E2E_PASS = 'E2eUserPass123!';

module.exports = async function globalSetup() {
  const api = await request.newContext({ baseURL: BASE });

  // Complete first-run wizard (no-op if already done)
  const status = await api.get('/api/install/status');
  const { installed } = await status.json();

  if (!installed) {
    const r = await api.post('/api/install/setup', {
      data: {
        username: process.env.E2E_ADMIN_USER,
        password: process.env.E2E_ADMIN_PASS,
        confirmPassword: process.env.E2E_ADMIN_PASS,
        operatorName: 'E2E Test',
        operatorAddress: 'Test Street 1',
        operatorEmail: 'e2e@test.local',
        allowRegistration: true,
      },
    });
    if (!r.ok()) throw new Error(`Install failed: ${await r.text()}`);
    console.log('✅ App installed (admin created)');
  }

  // Ensure regular test user exists (register if not)
  const loginR = await api.post('/api/auth/login', {
    data: { username: process.env.E2E_USER, password: process.env.E2E_PASS },
  });
  if (loginR.status() === 401) {
    const regR = await api.post('/api/auth/register', {
      data: { username: process.env.E2E_USER, password: process.env.E2E_PASS },
    });
    if (!regR.ok()) throw new Error(`Register test user failed: ${await regR.text()}`);
    console.log('✅ Test user created');
  }

  await api.dispose();
};
