const { defineConfig } = require('@playwright/test');

const PORT = process.env.E2E_PORT || '3099';
// Must include credentials so db.js credential-check passes
const MONGO = process.env.MONGODB_URI || 'mongodb://ciuser:cipassword123@localhost:27017/sharely_e2e?authSource=admin';

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // All tests run as logged-in admin by default (set in globalSetup)
    storageState: 'e2e/.auth/admin.json',
  },

  webServer: {
    command: 'node app.js',
    url: `http://localhost:${PORT}/api/install/status`,
    reuseExistingServer: !process.env.CI,
    timeout: 25_000,
    env: {
      MONGODB_URI: MONGO,
      SESSION_SECRET: process.env.SESSION_SECRET || 'e2e-test-secret-that-is-long-enough-12345',
      PORT,
      BASE_URL: `http://localhost:${PORT}`,
      UPLOAD_DIR: '/tmp/sharely-e2e-uploads',
      NODE_ENV: 'test',
    },
  },

  globalSetup: './e2e/global-setup.js',
});
