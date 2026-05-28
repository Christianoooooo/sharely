const { test, expect } = require('@playwright/test');

test.describe('Gallery – UI & Bulk Actions', () => {
  test('Upload and Select buttons are the same height', async ({ page }) => {
    await page.goto('/gallery');
    const uploadBtn = page.getByRole('link', { name: /^upload$/i });
    const selectBtn = page.getByRole('button', { name: /^select$/i });

    await expect(uploadBtn).toBeVisible();
    await expect(selectBtn).toBeVisible();

    const uploadBox = await uploadBtn.boundingBox();
    const selectBox = await selectBtn.boundingBox();
    expect(Math.abs(uploadBox.height - selectBox.height)).toBeLessThanOrEqual(2);
  });

  test('Search input, All Types and Search button are the same height', async ({ page }) => {
    await page.goto('/gallery');
    const searchInput = page.locator('input[placeholder*="earch"]').first();
    const typeSelect = page.locator('[data-radix-select-trigger]').first();
    const searchBtn = page.getByRole('button', { name: /^search$/i });

    const inputBox = await searchInput.boundingBox();
    const selectBox = await typeSelect.boundingBox();
    const btnBox = await searchBtn.boundingBox();

    expect(Math.abs(inputBox.height - selectBox.height)).toBeLessThanOrEqual(2);
    expect(Math.abs(inputBox.height - btnBox.height)).toBeLessThanOrEqual(2);
  });

  test('select mode toolbar appears with Select all / Deselect all', async ({ page }) => {
    // Upload a file to have something to select
    await page.goto('/upload');
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'gallery-test.txt', mimeType: 'text/plain', buffer: Buffer.from('gallery test'),
    });
    await page.getByRole('button', { name: /upload \d/i }).click();
    await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 10_000 });

    await page.goto('/gallery');
    await page.getByRole('button', { name: /^select$/i }).click();

    await expect(page.getByRole('button', { name: /select all/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /deselect all/i })).toBeVisible();

    await page.getByRole('button', { name: /select all/i }).click();
    await expect(page.locator('text=/\\d+ selected/')).toBeVisible();
  });

  test('bulk delete removes selected files', async ({ page }) => {
    // Upload a dedicated file for deletion
    await page.goto('/upload');
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'to-delete.txt', mimeType: 'text/plain', buffer: Buffer.from('delete me'),
    });
    await page.getByRole('button', { name: /upload \d/i }).click();
    await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 10_000 });

    await page.goto('/gallery');
    await page.getByRole('button', { name: /^select$/i }).click();

    // Check the first checkbox
    await page.locator('[data-radix-checkbox-root]').first().click();
    await expect(page.locator('text=/1 selected/')).toBeVisible();

    // Bulk delete
    await page.getByRole('button', { name: /^delete$/i }).click();
    // Confirm in the AlertDialog
    await page.getByRole('button', { name: /delete/i }).last().click();

    await expect(page.getByText(/files deleted|deleted/i)).toBeVisible({ timeout: 10_000 });
  });
});
