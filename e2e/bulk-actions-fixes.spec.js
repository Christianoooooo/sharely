const { test, expect } = require('@playwright/test');
const { uploadFileViaApi, loginAsUser } = require('./helpers');

// All tests tagged with the PR that introduced these fixes for easy filtering.
// Default storageState = admin session (set in playwright.config.js).

test.describe('Bulk action fixes — PR #143', () => {
  // ── Fix 3: removeTag input bounds ─────────────────────────────────────────
  test('removeTag: tag at index 20 is not processed (array capped at 20)', async ({ page }) => {
    const shortId = await uploadFileViaApi(page.request);
    // Tag the file with 'survives' only
    await page.request.patch(`/api/file/${shortId}`, { data: { tags: ['survives'] } });

    // Build a 21-tag array where 'survives' sits at index 20 (beyond the .slice(0,20) cap)
    const twentyOneTags = [
      ...Array.from({ length: 20 }, (_, i) => `no-op-${i}`),
      'survives',
    ];
    const r = await page.request.post('/api/files/bulk', {
      data: { action: 'removeTag', shortIds: [shortId], tags: twentyOneTags },
    });
    expect(r.status()).toBe(200);

    // 'survives' was at index 20 — it must still be on the file
    const meta = await page.request.get(`/api/file/${shortId}`);
    const { file } = await meta.json();
    expect(file.tags).toContain('survives');
  });

  // ── Fix 1: moveToCollection owner scoping ─────────────────────────────────
  test('moveToCollection: does not remove file from another users collection', async ({ page, playwright }) => {
    const PORT = process.env.E2E_PORT || '3099';
    // Create an isolated API context for the regular user (browser.newContext() does not
    // inherit baseURL from playwright.config.js, but playwright.request.newContext() does
    // when baseURL is passed explicitly).
    const userApi = await playwright.request.newContext({
      baseURL: `http://localhost:${PORT}`,
    });

    try {
      // Authenticate as regular user via API
      const loginR = await userApi.post('/api/auth/login', {
        data: { username: process.env.E2E_USER, password: process.env.E2E_PASS },
      });
      expect(loginR.ok()).toBe(true);

      // Regular user uploads the file that the admin will also curate
      const shortId = await uploadFileViaApi(userApi);

      // Admin (page.request) creates a collection and adds that file to it
      const adminCollR = await page.request.post('/api/collections', {
        data: { name: `admin-coll-${Date.now()}` },
      });
      const { shortId: adminCollId } = await adminCollR.json();
      await page.request.post(`/api/collections/${adminCollId}/files`, {
        data: { shortId },
      });

      // Regular user creates a destination collection for the move
      const targetR = await userApi.post('/api/collections', {
        data: { name: `user-target-${Date.now()}` },
      });
      const { shortId: targetCollId } = await targetR.json();

      // Regular user moves the file to their own collection
      const moveR = await userApi.post('/api/files/bulk', {
        data: { action: 'moveToCollection', shortIds: [shortId], collectionId: targetCollId },
      });
      expect(moveR.ok()).toBe(true);

      // Admin's collection must still contain the file — the pull was scoped to the user's own
      const adminColl = await page.request.get(`/api/collections/${adminCollId}`);
      const { files: adminFiles } = await adminColl.json();
      expect(adminFiles.some((f) => f.shortId === shortId)).toBe(true);

      // User's destination collection must now contain the file
      const targetColl = await userApi.get(`/api/collections/${targetCollId}`);
      const { files: targetFiles } = await targetColl.json();
      expect(targetFiles.some((f) => f.shortId === shortId)).toBe(true);
    } finally {
      await userApi.dispose();
    }
  });

  // ── Fix 4: atomic $addToSet — file already in destination stays there ─────
  test('moveToCollection: file already in destination collection is not lost', async ({ page }) => {
    const shortId = await uploadFileViaApi(page.request);

    const collR = await page.request.post('/api/collections', {
      data: { name: `atomic-test-${Date.now()}` },
    });
    const { shortId: collId } = await collR.json();

    // Put the file in the collection first
    await page.request.post(`/api/collections/${collId}/files`, { data: { shortId } });

    // Move the file to the same collection (the $pull then $addToSet must round-trip cleanly)
    const moveR = await page.request.post('/api/files/bulk', {
      data: { action: 'moveToCollection', shortIds: [shortId], collectionId: collId },
    });
    expect(moveR.ok()).toBe(true);

    // File must still be present — the old stale-read path would have left it if lucky,
    // but only the atomic path guarantees it regardless of concurrency.
    const coll = await page.request.get(`/api/collections/${collId}`);
    const { files } = await coll.json();
    expect(files.some((f) => f.shortId === shortId)).toBe(true);
  });

  // ── Fix 2: remove-tag dropdown uses selected files' tags only ─────────────
  test('remove-tag dropdown lists only tags present on selected files', async ({ page }) => {
    const ts = Date.now();
    const tagA = `sel-${ts}`;   // tag on the selected file
    const tagB = `nsel-${ts}`;  // tag on a different file (must not appear)

    // Upload file A and tag it
    const rA = await page.request.post('/api/web-upload', {
      multipart: { files: { name: 'file-a.txt', mimeType: 'text/plain', buffer: Buffer.from(`A-${ts}`) } },
    });
    const [fileA] = (await rA.json()).files;
    await page.request.patch(`/api/file/${fileA.shortId}`, { data: { tags: [tagA] } });

    // Upload file B and tag it with a different tag
    const rB = await page.request.post('/api/web-upload', {
      multipart: { files: { name: 'file-b.txt', mimeType: 'text/plain', buffer: Buffer.from(`B-${ts}`) } },
    });
    const [fileB] = (await rB.json()).files;
    await page.request.patch(`/api/file/${fileB.shortId}`, { data: { tags: [tagB] } });

    // Clear predefined tags so the add-tag section renders a plain button (not a combobox),
    // leaving the remove-tag combobox as the only select in the bulk toolbar.
    await page.request.patch('/api/user/predefined-tags', { data: { tags: [] } });

    // Navigate filtered to file A only — Select All will select only this file
    await page.goto(`/gallery?tag=${tagA}`);
    await page.getByRole('button', { name: /^select$/i }).click();
    await page.getByRole('button', { name: 'Select all', exact: true }).click();
    await expect(page.locator('text=/1 selected/')).toBeVisible();

    // Open the remove-tag combobox (identified by its placeholder text)
    const removeTagCombobox = page.locator('[role="combobox"]').filter({ hasText: /Remove tag/i });
    await removeTagCombobox.click();

    // tagA must be an option — it's on the selected file
    await expect(page.getByRole('option', { name: tagA })).toBeVisible({ timeout: 5_000 });
    // tagB must NOT be an option — it belongs only to the unselected file
    await expect(page.getByRole('option', { name: tagB })).not.toBeVisible();
  });

  // ── Fix 5: add-to-collection disabled when user has no collections ─────────
  test('add-to-collection and move-to-collection are both disabled with no collections', async ({ browser, playwright }) => {
    const PORT = process.env.E2E_PORT || '3099';
    const baseURL = `http://localhost:${PORT}`;

    // API context for the regular user (inherits cookies across requests)
    const userApi = await playwright.request.newContext({ baseURL });
    const loginR = await userApi.post('/api/auth/login', {
      data: { username: process.env.E2E_USER, password: process.env.E2E_PASS },
    });
    expect(loginR.ok()).toBe(true);

    // Browser context with explicit baseURL so page.goto('/gallery') resolves correctly
    const userCtx = await browser.newContext({ baseURL });
    const userPage = await userCtx.newPage();
    await loginAsUser(userPage);

    try {
      // Delete all collections belonging to this user
      const collsR = await userApi.get('/api/collections');
      const { collections } = await collsR.json();
      for (const c of collections) {
        await userApi.delete(`/api/collections/${c.shortId}`);
      }

      // Upload a file so the gallery isn't empty and a file can be selected
      await uploadFileViaApi(userApi);

      await userPage.goto('/gallery');
      await userPage.getByRole('button', { name: /^select$/i }).click();
      await userPage.locator('[role="checkbox"]').first().click();
      await expect(userPage.locator('text=/1 selected/')).toBeVisible();

      // Both collection buttons must be disabled when no collections exist
      const addBtn = userPage.getByRole('button', { name: /add to collection/i });
      const moveBtn = userPage.getByRole('button', { name: /move to collection/i });
      await expect(addBtn).toBeDisabled();
      await expect(moveBtn).toBeDisabled();
    } finally {
      await userApi.dispose();
      await userCtx.close();
    }
  });
});
