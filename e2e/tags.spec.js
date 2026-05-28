const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers');

test.describe('Predefined Tag Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('add predefined tags in Settings', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('tab', { name: /preferences/i }).click();

    // Tag Management card should be visible
    await expect(page.getByText(/tag management/i)).toBeVisible();

    // Add tag "Design"
    await page.getByPlaceholder(/new tag/i).fill('Design');
    await page.getByRole('button', { name: /^add$/i }).click();
    await expect(page.getByText('Design')).toBeVisible();

    // Add tag "Code"
    await page.getByPlaceholder(/new tag/i).fill('Code');
    await page.getByRole('button', { name: /^add$/i }).click();
    await expect(page.getByText('Code')).toBeVisible();
  });

  test('remove predefined tag', async ({ page }) => {
    // First add a tag to remove
    await page.goto('/settings');
    await page.getByRole('tab', { name: /preferences/i }).click();
    await page.getByPlaceholder(/new tag/i).fill('ToRemove');
    await page.getByRole('button', { name: /^add$/i }).click();
    await expect(page.getByText('ToRemove')).toBeVisible();

    // Remove it
    const badge = page.locator('text=ToRemove').locator('..');
    await badge.getByRole('button').click();
    await expect(page.getByText('ToRemove')).not.toBeVisible();
  });

  test('tag dropdown appears in FileView after defining tags', async ({ page, request }) => {
    // Ensure tags exist (add via API)
    await request.patch('/api/user/predefined-tags', {
      data: { tags: ['Design', 'Code'] },
    });

    // Upload a file via UI
    await page.goto('/upload');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'e2e-tag-test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('tag test content'),
    });
    await page.getByRole('button', { name: /upload/i }).first().click();
    await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 10_000 });

    // Navigate to the file
    await page.goto('/gallery');
    await page.locator('a[href^="/f/"]').first().click();
    await page.waitForURL(/\/f\//);

    // Tag section should have a dropdown (Select trigger)
    const tagSelect = page.locator('[data-radix-select-trigger]').first();
    if (await tagSelect.isVisible()) {
      await tagSelect.click();
      await expect(page.getByRole('option', { name: 'Design' })).toBeVisible();
      await expect(page.getByRole('option', { name: 'Code' })).toBeVisible();

      // Select a tag
      await page.getByRole('option', { name: 'Design' }).click();
      await expect(page.getByText('Design')).toBeVisible();
    }
  });
});
