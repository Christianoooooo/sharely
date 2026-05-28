const { test, expect } = require('@playwright/test');

// storageState (admin session) applied globally via playwright.config.js

test.describe('Predefined Tag Management', () => {
  test('add predefined tags in Settings', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('tab', { name: /preferences/i }).click();

    await expect(page.getByText(/tag management/i)).toBeVisible();

    await page.getByPlaceholder(/new tag/i).fill('Design');
    await page.getByRole('button', { name: /^add$/i }).click();
    await expect(page.getByText('Design')).toBeVisible();

    await page.getByPlaceholder(/new tag/i).fill('Code');
    await page.getByRole('button', { name: /^add$/i }).click();
    await expect(page.getByText('Code')).toBeVisible();
  });

  test('remove predefined tag', async ({ page }) => {
    // Add via API first to avoid depending on previous test state
    await page.request.patch('/api/user/predefined-tags', {
      data: { tags: ['RemoveMe', 'KeepMe'] },
    });

    await page.goto('/settings');
    await page.getByRole('tab', { name: /preferences/i }).click();
    await expect(page.getByText('RemoveMe')).toBeVisible();

    // Click the X button inside the RemoveMe badge
    const badge = page.locator('text=RemoveMe').locator('..');
    await badge.getByRole('button').click();
    await expect(page.getByText('RemoveMe')).not.toBeVisible();
    await expect(page.getByText('KeepMe')).toBeVisible();
  });

  test('tag dropdown appears in FileView after defining tags', async ({ page }) => {
    // Set predefined tags via API
    await page.request.patch('/api/user/predefined-tags', {
      data: { tags: ['Design', 'Code'] },
    });

    // Upload a test file
    await page.goto('/upload');
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'tag-test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('tag test content'),
    });
    await page.getByRole('button', { name: /upload \d/i }).click();
    await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 10_000 });

    // Go to the file
    await page.goto('/gallery');
    await page.locator('a[href^="/f/"]').first().click();
    await page.waitForURL(/\/f\//);

    // Tag select dropdown should appear
    const tagSelect = page.locator('[data-radix-select-trigger]');
    await expect(tagSelect.first()).toBeVisible({ timeout: 5_000 });
    await tagSelect.first().click();
    await expect(page.getByRole('option', { name: 'Design' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Code' })).toBeVisible();

    // Select "Design"
    await page.getByRole('option', { name: 'Design' }).click();
    await expect(page.locator('text=Design').first()).toBeVisible();
  });
});
