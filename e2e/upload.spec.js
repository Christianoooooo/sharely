const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers');

test.describe('Upload Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('shows clipboard paste hint', async ({ page }) => {
    await page.goto('/upload');
    await expect(page.getByText(/ctrl\+v|clipboard/i)).toBeVisible();
  });

  test('shows folder drop hint', async ({ page }) => {
    await page.goto('/upload');
    await expect(page.getByText(/drag.*drop|drop.*folder/i)).toBeVisible();
  });

  test('file upload flow completes', async ({ page }) => {
    await page.goto('/upload');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'e2e-upload.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('E2E upload test'),
    });
    await expect(page.getByText(/1 file selected/i)).toBeVisible();
    await page.getByRole('button', { name: /upload/i }).first().click();
    await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 15_000 });
  });
});
