const { test, expect } = require('@playwright/test');

test.describe('Upload Page', () => {
  test('shows clipboard paste hint', async ({ page }) => {
    await page.goto('/upload');
    await expect(page.getByText(/ctrl\+v|clipboard/i)).toBeVisible();
  });

  test('shows folder drag-and-drop hint', async ({ page }) => {
    await page.goto('/upload');
    await expect(page.getByText(/drag|drop|folder/i).first()).toBeVisible();
  });

  test('file upload flow: select → upload → success toast', async ({ page }) => {
    await page.goto('/upload');
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'e2e-upload-test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('E2E upload test content'),
    });
    await expect(page.getByText(/1 file selected/i)).toBeVisible();
    await page.getByRole('button', { name: /upload \d/i }).click();
    await expect(page.locator('[role="status"]').filter({ hasText: /uploaded/i })).toBeVisible({ timeout: 15_000 });
  });
});
