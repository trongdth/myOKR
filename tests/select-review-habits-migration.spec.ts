import { test, expect } from '@playwright/test';

/**
 * Ticket 05 — .scratch/custom-select/issues/05-review-habits-surfaces.md
 * The last native dropdowns: the Weekly Review week picker (date-range
 * labels) and the Habits matrix's per-row status picker — all on the shared
 * Select. (The review header's cycle picker was removed when the review
 * moved into the Progress shell, 2026-09; the wizard-disable coverage went
 * with it.)
 */
test.describe('Review & Habits Select migration', () => {
  test.beforeEach(async ({ page }) => {
    // Freeze to mid-June 2026 so the seeded June cycle is current and its
    // weeks split deterministically into past / current / future.
    await page.clock.setFixedTime(new Date('2026-06-15T12:00:00.000Z'));
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(async () => {
      const okr = await import('/src/lib/okr-storage.ts');
      const habitStorage = await import('/src/lib/habit-storage.ts');
      await okr.saveCycles([{ id: 'c-june', name: 'June 2026', month: 5, year: 2026, isActive: true, createdAt: '2026-06-01T00:00:00Z' }]);
      await habitStorage.saveHabits([
        { id: 'h1', name: 'Read before bed', status: 'want_to_form', createdAt: '2026-06-01T00:00:00Z', history: {}, reminders: [] },
      ]);
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('week picker runs on Select via the shared strip', async ({ page }) => {
    await page.evaluate(() => window.localStorage.setItem('myokr_active_section', 'weekly-review'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.review-container')).toBeVisible();

    // The review week picker is the Progress strip's shared Select
    // (ADR-0019 unified the week rule; date-range labels are gone).
    const trigger = page.locator('.progress-week-select .sel-trigger');
    await expect(trigger).toContainText('June 2026 · all weeks');
    await trigger.click();
    const rows = page.locator('.sel-panel .sel-row');
    await expect(rows.first()).toContainText('all weeks');
    const label = await rows.nth(1).textContent();
    await rows.nth(1).click();
    await page.waitForTimeout(300);
    await expect(trigger).toContainText(label!.trim());

    // Selecting a week lands the wizard on it.
    await expect(page.locator('.rw-wizard')).toBeVisible();
  });

    test('habit status picker runs on Select per matrix row', async ({ page }) => {
    await page.evaluate(() => window.localStorage.setItem('myokr_active_section', 'habits'));
    await page.reload();
    await page.waitForLoadState('networkidle');

    const row = page.locator('.habit-row', { hasText: 'Read before bed' });
    const status = row.locator('[aria-label^="Status of"]');
    await expect(status).toContainText('Want to form');
    await status.click();
    await page.locator('.sel-panel .sel-row', { hasText: 'Formed' }).click();
    await expect(status).toContainText('Formed');
    await status.click();
    await expect(page.locator('.sel-panel .sel-chosen')).toHaveText(/Formed/);
  });

  test('no native select remains on the review and habits screens', async ({ page }) => {
    await page.evaluate(() => window.localStorage.setItem('myokr_active_section', 'weekly-review'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('select')).toHaveCount(0);

    await page.evaluate(() => window.localStorage.setItem('myokr_active_section', 'habits'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('select')).toHaveCount(0);
  });
});
