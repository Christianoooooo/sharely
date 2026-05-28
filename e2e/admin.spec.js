const { test, expect } = require('@playwright/test');

// storageState (admin session) applied globally via playwright.config.js

test.describe('Admin – User Management', () => {
  test('create-user form inputs and button are the same height', async ({ page }) => {
    await page.goto('/admin/users');

    // Username input, Password input, Role select trigger, Create button all use h-10
    const usernameInput = page.locator('form input').nth(0);
    const passwordInput = page.locator('form input[type="password"]').first();
    const roleSelect = page.locator('form [role="combobox"]').first();
    const createBtn = page.getByRole('button', { name: /^create$/i });

    await expect(createBtn).toBeVisible({ timeout: 10_000 });

    const boxes = await Promise.all([
      usernameInput.boundingBox(),
      passwordInput.boundingBox(),
      roleSelect.boundingBox(),
      createBtn.boundingBox(),
    ]);

    const [uBox, pBox, rBox, bBox] = boxes;
    expect(Math.abs(uBox.height - pBox.height)).toBeLessThanOrEqual(2);
    expect(Math.abs(uBox.height - rBox.height)).toBeLessThanOrEqual(2);
    expect(Math.abs(uBox.height - bBox.height)).toBeLessThanOrEqual(2);
  });
});
