const path = require('path');
const fs = require('fs');

async function login(page, username, password) {
  await page.goto('/auth/login');
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /^login$/i }).click();
  await page.waitForURL(/\/gallery/);
}

async function loginAsAdmin(page) {
  await login(page, process.env.E2E_ADMIN_USER, process.env.E2E_ADMIN_PASS);
}

async function loginAsUser(page) {
  await login(page, process.env.E2E_USER, process.env.E2E_PASS);
}

// Upload a small text file via the API and return its shortId
async function uploadFileViaApi(request, baseURL, cookie) {
  const content = `E2E test file ${Date.now()}`;
  const blob = Buffer.from(content);
  const form = new FormData();
  form.append('files', new Blob([blob], { type: 'text/plain' }), 'e2e-test.txt');

  const r = await request.post('/api/web-upload', {
    multipart: { files: { name: 'e2e-test.txt', mimeType: 'text/plain', buffer: Buffer.from(content) } },
  });
  if (!r.ok()) throw new Error(`Upload failed: ${await r.text()}`);
  const data = await r.json();
  return data.files[0].shortId;
}

module.exports = { login, loginAsAdmin, loginAsUser, uploadFileViaApi };
