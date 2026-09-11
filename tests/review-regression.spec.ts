import { test, expect } from '@playwright/test';

async function waitForApp(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
}


async function openReview(page: import('@playwright/test').Page) {
  const item = page.locator('button[title="Weekly review"]').first();
  if (!(await item.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Progress', exact: true }).click();
  }
  await item.click();
  await page.waitForTimeout(300);
}

/** Open a Select and click the row matching text (custom-select ticket 05). */
async function pickSelectRow(page: import('@playwright/test').Page, triggerText: string, rowText: string) {
  await page.locator(`[aria-label="${triggerText}"]`).click();
  await page.locator('.sel-panel .sel-row', { hasText: rowText }).first().click();
}

test.describe('Weekly Review Regressions & UI Enhancements', () => {
  // The Progress revamp embedded the review in the Progress shell: the
  // header and its cycle picker are gone (cycle comes from the active
  // cycle / inferred from the selected week). This test now covers the
  // week picker, wizard entry/exit, and start-button visibility by week
  // state — the surfaces that still exist.
  test('review tab runs on the CycleWeekPicker; unfinished weeks unreachable', async ({ page }) => {
    await waitForApp(page);
    await page.locator('button[title="Progress"]').click();
    await page.locator('button[title="Weekly review"]').click();

    await page.evaluate(async () => {
      const updateDoc = (window as any).__updateAutomergeDoc;
      if (!updateDoc) throw new Error('Automerge test hooks not exposed');
      await updateDoc('Seed regression test data', (d: any) => {
        d.cycles = [
          { id: 'cycle-may', name: 'May 2026', month: 4, year: 2026, isActive: false, createdAt: new Date().toISOString() },
          { id: 'cycle-june', name: 'June 2026', month: 5, year: 2026, isActive: true, createdAt: new Date().toISOString() },
        ];
        d.objectives = [{
          id: 'obj-test', cycleId: 'cycle-june', title: 'Core Work', order: 0,
          createdAt: new Date().toISOString(),
        }];
        d.keyResults = [{
          id: 'kr-test', objectiveId: 'obj-test', title: 'Regression KR', targetValue: 10,
          currentValue: 0, unit: '%', confidence: 'on_track', completionMode: 'manual',
          order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        }];
        d.reviews = [];
      });
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await openReview(page);

    // One selector per tab: the picker, not the strip week Select.
    const trigger = page.locator('[aria-label="Review cycle and week"]');
    await expect(trigger).toBeVisible();
    await expect(page.locator('.progress-week-select')).toHaveCount(0);

    // Default selection = the newest cycle's most recent finished week —
    // every June 2026 week is finished today, so week 4 of 4 (22–28 Jun).
    await expect(trigger).toHaveText(/June 2026 · week 4 of 4/);
    await expect(page.locator('.rw-wizard .rw-step-heading h2')).toBeVisible();

    // Selecting week 1 opens its wizard directly — no start button, no cancel.
    await trigger.click();
    await page.locator('.cwp-panel .cwp-cycle-row').nth(1).click(); // June (newest is July-less; nth(1)=June? newest-first: June then May)
    await page.locator('.cwp-panel .cwp-week-row').nth(0).click();
    await page.waitForTimeout(300);
    await expect(page.locator('.rw-wizard .rw-step-heading h2')).toBeVisible();
    await expect(page.locator('button:has-text("Cancel")')).toHaveCount(0);
    await expect(page.locator('.rw-save-indicator')).toHaveText('Nothing to save yet');

    // A future cycle's weeks are listed but disabled — the wizard can never
    // land on an unfinished week, and the old guard cards are gone.
    await page.evaluate(async () => {
      const updateDoc = (window as any).__updateAutomergeDoc;
      await updateDoc('Seed future-only cycle', (d: any) => {
        const now = new Date();
        d.cycles = [{
          id: 'cycle-next', name: 'Next Cycle',
          month: (now.getMonth() + 1) % 12,
          year: now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear(),
          isActive: true, createdAt: new Date().toISOString(),
        }];
        d.objectives = [];
        d.keyResults = [];
        d.reviews = [];
      });
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await openReview(page);

    // No finished week exists anywhere → the nothing-to-review state, never
    // a wizard on an unfinished week.
    await expect(page.locator('.review-start-card-title')).toHaveText('Nothing to review yet');
    await expect(page.locator('.rw-wizard')).toHaveCount(0);
    await trigger.click();
    // Every listed week is unfinished — none selectable.
    await expect(page.locator('.cwp-panel .cwp-week-row:not(.cwp-disabled)')).toHaveCount(0);
    await page.keyboard.press('Escape');
  });

  test('renders gracefully and does not crash when cycle data contains null or invalid month/year', async ({ page }) => {
    await waitForApp(page);

    await page.evaluate(async () => {
      const updateDoc = (window as any).__updateAutomergeDoc;
      await updateDoc('Seed corrupted cycle', (d: any) => {
        d.cycles = [
          { id: 'corrupt-cycle', name: 'Corrupt Cycle', month: null, year: null, isActive: true },
        ];
        d.objectives = [];
        d.keyResults = [];
        d.reviews = [];
      });
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });

    // Navigate to Review screen (headerless inside the Progress shell)
    await page.locator('button[title="Progress"]').click();
    await page.locator('button[title="Weekly review"]').click();

    // The review must render without throwing RangeError: Invalid time value
    await expect(page.locator('.review-container')).toBeVisible();
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
  });
});
