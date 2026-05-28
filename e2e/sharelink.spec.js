const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers');

test.describe('Share Links', () => {
  let fileShortId;

  test.beforeEach(async ({ page, request }) => {
    await loginAsAdmin(page);

    // Upload a file via API to use for share link tests
    const r = await request.post('/api/web-upload', {
      multipart: {
        files: { name: 'share-test.txt', mimeType: 'text/plain', buffer: Buffer.from('share link test') },
      },
    });
    const data = await r.json();
    fileShortId = data.files?.[0]?.shortId;
  });

  test('download limit=1: second browser visit redirects to share page', async ({ page, request }) => {
    if (!fileShortId) test.skip();

    // Create share link with limit=1 via API
    const linkR = await request.post('/api/share', {
      data: { fileShortId, downloadLimit: 1 },
    });
    const { link } = await linkR.json();
    const token = link.token;

    // First download (use fetch to not navigate away)
    const dl1 = await request.get(`/s/${token}/download`);
    expect(dl1.ok()).toBeTruthy();

    // Second visit in browser — should redirect to share view, not show raw JSON
    const response = await page.goto(`/s/${token}/download`);
    // Should end up at the share view page, not a JSON error
    await expect(page).toHaveURL(new RegExp(`/s/${token}$`));
    await expect(page.getByText(/limit reached|download limit/i)).toBeVisible();
  });
});
