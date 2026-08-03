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

async function openAnalytics(page: Page) {
  const btn = page.locator('button[title="Analytics"]').first();
  if (!(await btn.isVisible())) await page.locator('button[title="Progress"]').first().click();
  await btn.click();
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

    // Import a JSON bundle whose cycles include a far-future (newest) cycle.
    const payload = {
      settings: {
        focusDuration: 25, shortBreakDuration: 5, longBreakDuration: 15,
        pomosBeforeLongBreak: 4, autoStartBreaks: false, autoStartFocus: false,
        focusMusicEnabled: false,
      },
      tasks: [],
      history: [],
      cycles: [
        { id: 'c-imp', name: 'Imported Future Cycle', month: 11, year: 2099, isActive: true, createdAt: '2099-12-01T00:00:00Z' },
      ],
    };

    await openAnalytics(page);
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('button:has-text("Import JSON")').click(),
    ]);
    await fileChooser.setFiles({
      name: 'import.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(payload)),
    });

    // Confirm the import.
    await expect(page.locator('.confirm-modal')).toBeVisible();
    await page.locator('.confirm-modal button:has-text("Import")').click();
    await expect(page.locator('.confirm-modal')).toHaveCount(0);

    // Back on the Plan group, the active cycle must reflect the import — no
    // reload needed. (RED before the fix: still "Seed Past Cycle".)
    await openTasksTab(page);
    await expect(page.locator('.plan-group-shell')).toContainText('Imported Future Cycle');
  });
});
