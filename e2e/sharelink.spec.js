const { test, expect } = require('@playwright/test');

test.describe('Share Links – download limit', () => {
  test('browser redirect to share page when limit reached', async ({ page }) => {
    // Upload a file
    await page.goto('/upload');
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'share-limit-test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('share link limit test'),
    });
    await page.getByRole('button', { name: /upload \d/i }).click();
    await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 10_000 });

    // Get the file shortId from the gallery
    await page.goto('/gallery');
    const fileLink = page.locator('a[href^="/f/"]').first();
    const href = await fileLink.getAttribute('href');
    const shortId = href?.split('/f/')[1];
    expect(shortId).toBeTruthy();

    // Create share link with downloadLimit=1 via API
    const linkR = await page.request.post(`/api/file/${shortId}/share-links`, {
      data: { downloadLimit: 1 },
    });
    expect(linkR.ok()).toBeTruthy();
    const linkData = await linkR.json();
    // API returns { token, url, ... } directly — not wrapped in { link: { token } }
    const token = linkData.token;
    expect(token).toBeTruthy();

    // First download via API (simulate non-browser client)
    const dl1 = await page.request.get(`/s/${token}/download`);
    expect(dl1.ok()).toBeTruthy();

    // Second visit via browser — should redirect to share view, not raw JSON
    await page.goto(`/s/${token}/download`);
    await expect(page).toHaveURL(new RegExp(`/s/${token}$`));
    await expect(page.getByText(/limit reached|download limit/i)).toBeVisible();
  });
});
