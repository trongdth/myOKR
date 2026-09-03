import { test, expect, type Page } from '@playwright/test';

// Regression: importing data that contains cycles never refreshed the
// `activeCycle` state in PomodoroApp. The cycles/objectives/KRs were saved and
// pushed into view state, but the cycle pill, PlanTabStrip, and cycle-scoped
// filtering kept showing the pre-import active cycle until a reload.
//
// getActiveCycle/resolveCurrentCycle ignores the `isActive` flag and picks the
// current-month cycle, else the NEWEST by date — so this test seeds a far-past
// cycle and imports a far-future one to make "newest" deterministic regardless
// of the real calendar month the suite runs in.

async function openTasksTab(page: Page) {
  const btn = page.locator('button[title="Tasks"]').first();
  if (!(await btn.isVisible())) await page.locator('button[title="Plan"]').first().click();
  await btn.click();
  await page.waitForTimeout(300);
}


test.describe('Import refreshes the active cycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
    // Seed a single far-past cycle and reload so the app mounts with it active.
    await page.evaluate(async () => {
      const okr = await import('/src/lib/okr-storage.ts');
      await okr.saveCycles([
        { id: 'c-seed', name: 'Seed Past Cycle', month: 0, year: 2020, isActive: true, createdAt: '2020-01-01T00:00:00Z' },
      ]);
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
  });

  test('importing cycles updates the cycle shown in the Plan group without a reload', async ({ page }) => {
    // Setup check: the seeded cycle is active.
    await openTasksTab(page);
    await expect(page.locator('.plan-group-shell')).toContainText('Seed Past Cycle');

    // Save a new far-future (newest) cycle directly (simulating sync/storage hydration).
    await page.evaluate(async () => {
      const okr = await import('/src/lib/okr-storage.ts');
      await okr.saveCycles([
        { id: 'c-imp', name: 'Imported Future Cycle', month: 11, year: 2099, isActive: true, createdAt: '2099-12-01T00:00:00Z' },
      ]);
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });

    // Back on the Plan group, the active cycle must reflect the import — no
    // reload needed. (RED before the fix: still "Seed Past Cycle".)
    await openTasksTab(page);
    await expect(page.locator('.plan-group-shell')).toContainText('Imported Future Cycle');
  });
});
