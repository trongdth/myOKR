import { test, expect } from '@playwright/test';

async function waitForApp(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
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
  test('verifies review week picker, wizard entry/cancel, and start button visibility by week state', async ({ page }) => {
    await waitForApp(page);

    // Go to Review section — headerless inside the Progress shell
    await page.locator('button[title="Progress"]').click();
    await page.locator('button[title="Weekly review"]').click();
    await expect(page.locator('.review-start-card')).toBeVisible();

    // 1. Seed two cycles (June active with an objective + KR) — the review
    // falls back to the active cycle when today's week has no cycle.
    await page.evaluate(async () => {
      const updateDoc = (window as any).__updateAutomergeDoc;
      if (!updateDoc) throw new Error('Automerge test hooks not exposed');

      await updateDoc('Seed regression test data', (d: any) => {
        const cycleMay = {
          id: 'cycle-may',
          name: 'May 2026',
          month: 4,
          year: 2026,
          isActive: false,
          createdAt: new Date().toISOString(),
        };
        const cycleJune = {
          id: 'cycle-june',
          name: 'June 2026',
          month: 5,
          year: 2026,
          isActive: true,
          createdAt: new Date().toISOString(),
        };
        d.cycles = [cycleMay, cycleJune];

        const objective = {
          id: 'obj-test',
          cycleId: 'cycle-june',
          title: 'Core Work',
          order: 0,
          createdAt: new Date().toISOString(),
        };
        d.objectives = [objective];

        const keyResult = {
          id: 'kr-test',
          objectiveId: 'obj-test',
          title: 'Regression KR',
          targetValue: 10,
          currentValue: 0,
          unit: '%',
          confidence: 'on_track',
          completionMode: 'manual',
          order: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        d.keyResults = [keyResult];
        d.reviews = [];
      });

      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });

    // The review week Select lists the June cycle's weeks
    const weekSelect = page.locator('[aria-label="Review week"]');
    await expect(weekSelect).toBeVisible();
    await weekSelect.click();
    const weekRows = await page.locator('.sel-panel .sel-row').allTextContents();
    await page.keyboard.press('Escape'); // close before interacting further
    expect(weekRows.length).toBeGreaterThan(0);
    for (const rowText of weekRows) {
      // June 2026 weeks start 2026-06-01 at the earliest
      expect(rowText).toMatch(/2026-0[567]/);
    }

    // 2. Select a completed week in June (2026-06-01 to 2026-06-07) and open
    // the wizard, then cancel back out
    await pickSelectRow(page, 'Review week', '2026-06-01 to 2026-06-07');

    const startBtn = page.locator('button:has-text("Start Weekly Review")');
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    // The wizard should be open
    await expect(page.locator('text=Step 1 of')).toBeVisible();

    // Cancel the wizard to return
    await page.locator('button:has-text("Cancel")').click();
    await expect(startBtn).toBeVisible();

    // 3. Start Weekly Review must not appear if the week is current or future
    // Let's populate the active cycle to be the current month/year
    await page.evaluate(async () => {
      const updateDoc = (window as any).__updateAutomergeDoc;
      await updateDoc('Seed current cycle data', (d: any) => {
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        const cycleCurrent = {
          id: 'cycle-current',
          name: 'Current Cycle',
          month: currentMonth,
          year: currentYear,
          isActive: true,
          createdAt: new Date().toISOString(),
        };
        d.cycles = [cycleCurrent];
      });
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });

    // Calculate current week start date (Monday)
    const currentWeekStart = (() => {
      const d = new Date();
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      const yyyy = monday.getFullYear();
      const mm = String(monday.getMonth() + 1).padStart(2, '0');
      const dd = String(monday.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    })();

    // Find and categorize available week rows (labels start with the Monday)
    await weekSelect.click();
    const weekRowTexts = await page.locator('.sel-panel .sel-row').allTextContents();
    await page.keyboard.press('Escape');
    let currentWeekValue = '';
    let pastWeekValue = '';
    let futureWeekValue = '';

    for (const text of weekRowTexts) {
      const val = text.split(' to ')[0].trim();
      if (val === currentWeekStart) {
        currentWeekValue = val;
      } else if (val && val < currentWeekStart) {
        pastWeekValue = val;
      } else if (val && val > currentWeekStart) {
        futureWeekValue = val;
      }
    }

    // 1. If the current week is selected, the start button must be hidden and "Week is still in progress" visible
    if (currentWeekValue) {
      await pickSelectRow(page, 'Review week', currentWeekValue);
      await expect(page.locator('button:has-text("Start Weekly Review")')).toBeHidden();
      await expect(page.locator('text=Week is still in progress')).toBeVisible();
    }

    // 2. If a past week is selected, the start button must be visible
    if (pastWeekValue) {
      await pickSelectRow(page, 'Review week', pastWeekValue);
      await expect(page.locator('button:has-text("Start Weekly Review")')).toBeVisible();
      await expect(page.locator('text=Week is still in progress')).toBeHidden();
    }

    // 3. If a future week is selected, the start button must be hidden and "Week has not started yet" visible
    if (futureWeekValue) {
      await pickSelectRow(page, 'Review week', futureWeekValue);
      await expect(page.locator('button:has-text("Start Weekly Review")')).toBeHidden();
      await expect(page.locator('text=Week has not started yet')).toBeVisible();
    }
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
