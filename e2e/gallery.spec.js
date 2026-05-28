const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers');

test.describe('Gallery – UI & Bulk Actions', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('Upload and Select buttons are the same height', async ({ page }) => {
    await page.goto('/gallery');
    const uploadBtn = page.getByRole('link', { name: /upload/i });
    const selectBtn = page.getByRole('button', { name: /^select$/i });

    await expect(uploadBtn).toBeVisible();
    await expect(selectBtn).toBeVisible();

    const uploadBox = await uploadBtn.boundingBox();
    const selectBox = await selectBtn.boundingBox();
    expect(Math.abs(uploadBox.height - selectBox.height)).toBeLessThanOrEqual(2);
  });

  test('Search input, All Types select and Search button are the same height', async ({ page }) => {
    await page.goto('/gallery');
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    const typeSelect = page.locator('[data-radix-select-trigger]').first();
    const searchBtn = page.getByRole('button', { name: /^search$/i });

    const inputBox = await searchInput.boundingBox();
    const selectBox = await typeSelect.boundingBox();
    const btnBox = await searchBtn.boundingBox();

    expect(Math.abs(inputBox.height - selectBox.height)).toBeLessThanOrEqual(2);
    expect(Math.abs(inputBox.height - btnBox.height)).toBeLessThanOrEqual(2);
  });

  test('select mode shows checkboxes and toolbar', async ({ page }) => {
    await page.goto('/gallery');
    // Upload a file first to have something to select
    await page.goto('/upload');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({ name: 'bulk-test.txt', mimeType: 'text/plain', buffer: Buffer.from('bulk') });
    await page.getByRole('button', { name: /upload/i }).first().click();
    await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 10_000 });

    await page.goto('/gallery');
    await page.getByRole('button', { name: /^select$/i }).click();

    // Toolbar should appear
    await expect(page.getByText(/select all/i)).toBeVisible();
    await expect(page.getByText(/deselect all/i)).toBeVisible();

    // Select all
    await page.getByRole('button', { name: /select all/i }).click();
    const selectedText = page.locator('text=/\\d+ selected/');
    await expect(selectedText).toBeVisible();
  });

  test('bulk delete removes selected files', async ({ page }) => {
    // Upload a file specifically for deletion
    await page.goto('/upload');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({ name: 'delete-me.txt', mimeType: 'text/plain', buffer: Buffer.from('to delete') });
    await page.getByRole('button', { name: /upload/i }).first().click();
    await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 10_000 });

    await page.goto('/gallery');
    await page.getByRole('button', { name: /^select$/i }).click();

    // Select the first file
    await page.locator('[data-radix-checkbox-root]').first().click();

    // Click delete
    await page.getByRole('button', { name: /^delete$/i }).click();

    // Confirm in AlertDialog
    await page.getByRole('button', { name: /delete/i }).last().click();

    await expect(page.getByText(/files deleted/i)).toBeVisible({ timeout: 10_000 });
  });
});
