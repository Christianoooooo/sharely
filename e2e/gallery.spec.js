const { test, expect } = require('@playwright/test');

test.describe('Gallery – UI & Bulk Actions', () => {
  test('Upload and Select buttons are the same height', async ({ page }) => {
    await page.goto('/gallery');
    // Scope to main content — nav also has an Upload link which causes strict-mode violation
    const uploadBtn = page.getByRole('main').getByRole('link', { name: /^upload$/i });
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
    // SelectTrigger renders with role="combobox", not data-radix-select-trigger
    const typeSelect = page.locator('[role="combobox"]').first();
    const searchBtn = page.getByRole('button', { name: /^search$/i });

    await expect(typeSelect).toBeVisible({ timeout: 10_000 });
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

    // Use exact: true — without it Playwright does substring match, so "Deselect all" also matches
    await expect(page.getByRole('button', { name: 'Select all', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Deselect all', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Select all', exact: true }).click();
    await expect(page.locator('text=/\\d+ selected/')).toBeVisible();
  });

  test('bulk toolbar shows disabled Tag button when no predefined tags', async ({ page }) => {
    // Ensure no predefined tags exist
    await page.request.patch('/api/user/predefined-tags', { data: { tags: [] } });

    // Upload a file to ensure the gallery isn't empty
    await page.goto('/upload');
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'bulk-notag.txt', mimeType: 'text/plain', buffer: Buffer.from('no tag test'),
    });
    await page.getByRole('button', { name: /upload \d/i }).click();
    await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 10_000 });

    await page.goto('/gallery');
    await page.getByRole('button', { name: /^select$/i }).click();

    // Without predefined tags the toolbar renders a plain disabled "Tag" button
    const tagBtn = page.getByRole('button', { name: /^tag$/i });
    await expect(tagBtn).toBeVisible({ timeout: 5_000 });
    await expect(tagBtn).toBeDisabled();
  });

  test('bulk tag applies a predefined tag to selected files', async ({ page }) => {
    // Set up predefined tags
    await page.request.patch('/api/user/predefined-tags', { data: { tags: ['BulkLabel'] } });

    // Upload a file
    await page.goto('/upload');
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'bulk-tag-test.txt', mimeType: 'text/plain', buffer: Buffer.from('bulk tag test'),
    });
    await page.getByRole('button', { name: /upload \d/i }).click();
    await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 10_000 });

    await page.goto('/gallery');
    await page.getByRole('button', { name: /^select$/i }).click();

    // Select the first file
    await page.locator('[role="checkbox"]').first().click();
    await expect(page.locator('text=/1 selected/')).toBeVisible();

    // Open the tag dropdown in the bulk toolbar and pick "BulkLabel"
    // The bulk toolbar tag trigger is a combobox (SelectTrigger) — last one on the page
    const tagSelects = page.locator('[role="combobox"]');
    const count = await tagSelects.count();
    await tagSelects.nth(count - 1).click();
    await page.getByRole('option', { name: 'BulkLabel' }).click();

    // Toast: "Tags added" — scope to the status container to avoid strict-mode violations
    // when both the toast root and the title element match the same text.
    await expect(page.locator('[role="status"]').filter({ hasText: /tags added/i })).toBeVisible({ timeout: 5_000 });
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

    // Radix Checkbox renders with role="checkbox", not data-radix-checkbox-root
    await page.locator('[role="checkbox"]').first().click();
    await expect(page.locator('text=/1 selected/')).toBeVisible();

    // Bulk delete
    await page.getByRole('button', { name: /^delete$/i }).click();
    // Confirm in the AlertDialog
    await page.getByRole('button', { name: /delete/i }).last().click();

    await expect(page.locator('[role="status"]').filter({ hasText: /files deleted/i })).toBeVisible({ timeout: 10_000 });
  });
});
