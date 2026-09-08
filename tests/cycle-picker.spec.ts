import { test, expect } from '@playwright/test';

// CycleWeekPicker — the Weekly review tab's two-level selector (second
// grilling round; round-3 user feedback applied: accordion weeks, review
// statuses, disabled zero-finished cycles, reserved check slot, sans meta,
// scroll cap). Tested in isolation on the dev fixture
// (?fixture=cycle-picker) with deterministic 2026 data:
// today = 2026-05-08 (Fri). Exclusive weeks (ADR-0019 rule):
//   Jan 5w · Feb 4w · Mar 5w · Apr 4w (ends 26 Apr) · May 5w (w1 finished,
//   w2 May 4–10 in progress) · June 2026 fully future (disabled).
// Scenario B adds Oct–Dec 2025 (8 cycles → search visible).

const BASE = '/?fixture=cycle-picker';

test.describe('CycleWeekPicker', () => {
  test('trigger reads the full path; cycles newest-first with "N of M reviewed" meta', async ({ page }) => {
    await page.goto(BASE);
    const picker = page.locator('#cwp-a');
    await expect(picker.locator('.sel-trigger')).toHaveText(/April 2026 · week 4 of 4/);

    await picker.locator('.sel-trigger').click();
    const panel = page.locator('.cwp-panel');
    await expect(panel).toBeVisible();

    const cycleRows = panel.locator('.cwp-cycle-row');
    await expect(cycleRows).toHaveCount(6);
    await expect(cycleRows.nth(0)).toContainText('June 2026');
    await expect(cycleRows.nth(1)).toContainText('May 2026');
    await expect(cycleRows.nth(1).locator('.cwp-meta')).toHaveText('0 of 5 reviewed');
    await expect(cycleRows.nth(2)).toContainText('April 2026');
    await expect(cycleRows.nth(2).locator('.cwp-meta')).toHaveText('2 of 4 reviewed');
    await expect(cycleRows.nth(3).locator('.cwp-meta')).toHaveText('5 of 5 reviewed');
    await expect(cycleRows.nth(4).locator('.cwp-meta')).toHaveText('2 of 4 reviewed');
    await expect(cycleRows.nth(5)).toContainText('January 2026');
    await expect(cycleRows.nth(5).locator('.cwp-meta')).toHaveText('0 of 4 reviewed');

    // Check follows the SELECTED cycle; reserved check slot on every row
    // keeps labels on one baseline.
    await expect(cycleRows.nth(2)).toHaveClass(/cwp-selected/);
    for (let i = 0; i < 6; i++) {
      await expect(cycleRows.nth(i).locator('.cwp-check-slot')).toBeAttached();
    }

    // Meta is sans (not the mono face).
    const metaFont = await cycleRows.nth(1).locator('.cwp-meta').evaluate(el => getComputedStyle(el).fontFamily);
    expect(metaFont).not.toContain('mono');
  });

  test('accordion: weeks nest under the expanded cycle, marked when browsing another cycle', async ({ page }) => {
    await page.goto(BASE);
    const picker = page.locator('#cwp-a');
    await picker.locator('.sel-trigger').click();
    const panel = page.locator('.cwp-panel');

    // Default expansion = the selected cycle (April) → no browsing marker.
    await expect(panel.locator('.cwp-weeks-label')).toContainText('Weeks in April 2026');
    await expect(panel.locator('.cwp-browsing')).toHaveCount(0);

    // Expanding May (not the selected cycle) marks the block as browsing.
    await panel.locator('.cwp-cycle-row').nth(1).click();
    await expect(panel.locator('.cwp-weeks-label')).toContainText('Weeks in May 2026');
    await expect(panel.locator('.cwp-browsing')).toHaveText('browsing');

    // Week rows are numbered and carry review status.
    const mayRows = panel.locator('.cwp-week-row');
    await expect(mayRows).toHaveCount(5);
    await expect(mayRows.nth(0)).toContainText('Week 1 · 27 Apr–3 May');
    await expect(mayRows.nth(0).locator('.cwp-status')).toHaveText('Draft');
    await expect(mayRows.nth(1)).toContainText('Week 2 · 4–10 May');
    await expect(mayRows.nth(1)).toContainText('This week');
    await expect(mayRows.nth(1)).toHaveClass(/cwp-disabled/);
    await expect(mayRows.nth(2)).toHaveClass(/cwp-disabled/);

    // A disabled week never commits, even force-clicked (commitWeek guard).
    await mayRows.nth(1).click({ force: true });
    await expect(page.locator('#cwp-a-commit')).toHaveText('2026-04-20');

    // Back to April: the selected week shows its check; statuses flip.
    await panel.locator('.cwp-cycle-row').nth(2).click();
    const aprRows = panel.locator('.cwp-week-row');
    await expect(aprRows.nth(3)).toHaveClass(/cwp-selected/);
    await expect(aprRows.nth(0).locator('.cwp-status')).toHaveText('Reviewed');
    await expect(aprRows.nth(1).locator('.cwp-status')).toHaveText('Not reviewed');
  });

  test('zero-finished-week cycles are fully disabled: no expand, no arrow', async ({ page }) => {
    await page.goto(BASE);
    const picker = page.locator('#cwp-a');
    await picker.locator('.sel-trigger').click();
    const panel = page.locator('.cwp-panel');

    const june = panel.locator('.cwp-cycle-row').nth(0);
    await expect(june).toContainText('June 2026');
    await expect(june).toHaveClass(/cwp-disabled/);
    await expect(june.locator('.cwp-chevron')).toHaveCount(0);

    // Clicking it must not expand or steer the weeks section (force past
    // Playwright's aria-disabled actionability gate — the handler is the
    // thing under test).
    await june.click({ force: true });
    await expect(panel.locator('.cwp-weeks-label')).not.toHaveText('Weeks in June 2026');

    // Zero-REVIEWS cycles with finished weeks (January) stay expandable —
    // late completion depends on it.
    await panel.locator('.cwp-cycle-row').nth(5).click();
    await expect(panel.locator('.cwp-weeks-label')).toContainText('Weeks in January 2026');
    await expect(panel.locator('.cwp-week-row').first().locator('.cwp-status')).toHaveText('Not reviewed');
  });

  test('cycle rows navigate, week rows commit and close', async ({ page }) => {
    await page.goto(BASE);
    const picker = page.locator('#cwp-a');
    await picker.locator('.sel-trigger').click();
    const panel = page.locator('.cwp-panel');

    await panel.locator('.cwp-cycle-row').nth(3).click();
    await panel.locator('.cwp-week-row').nth(1).click();
    await expect(panel).toHaveCount(0);
    await expect(picker.locator('.sel-trigger')).toHaveText(/March 2026 · week 2 of 5/);
    await expect(page.locator('#cwp-a-commit')).toHaveText('2026-03-02');
  });

  test('search: absent at ≤6 cycles, present beyond, matches name and dates, empty state', async ({ page }) => {
    await page.goto(BASE);
    const a = page.locator('#cwp-a');
    await a.locator('.sel-trigger').click();
    await expect(page.locator('.cwp-panel .cwp-search')).toHaveCount(0);
    await page.keyboard.press('Escape');

    const b = page.locator('#cwp-b');
    await b.locator('.sel-trigger').click();
    const panel = page.locator('.cwp-panel');
    await expect(panel.locator('.cwp-search')).toBeVisible();
    await expect(panel.locator('.cwp-cycle-row')).toHaveCount(9);

    // "14 Apr" finds the April week containing Apr 14 (Week 3 · 13–19 Apr).
    await panel.locator('.cwp-search input').fill('14 Apr');
    await expect(panel.locator('.cwp-cycle-row')).toHaveCount(1);
    await expect(panel.locator('.cwp-cycle-row')).toContainText('April 2026');
    await expect(panel.locator('.cwp-week-row')).toHaveCount(1);
    await expect(panel.locator('.cwp-week-row')).toContainText('Week 3 · 13–19 Apr');

    await panel.locator('.cwp-search input').fill('xyzzy');
    await expect(page.locator('.cwp-empty')).toHaveText(/No cycle or week matches/);
  });

  test('panel scrolls with a height cap and stays aligned to the trigger', async ({ page }) => {
    await page.goto(BASE);
    const picker = page.locator('#cwp-a');
    await picker.locator('.sel-trigger').click();
    const panel = page.locator('.cwp-panel');
    await expect(panel).toBeVisible();

    const metrics = await panel.evaluate(el => {
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const trigger = document.querySelector('#cwp-a .sel-trigger')!.getBoundingClientRect();
      const scroll = el.querySelector('.cwp-scroll')!;
      const scrollCs = getComputedStyle(scroll);
      return {
        overflowY: scrollCs.overflowY,
        scrollCap: parseInt(scrollCs.maxHeight),
        leftAligned: Math.abs(rect.left - trigger.left) < 2,
        withinViewport: rect.right <= window.innerWidth,
      };
    });
    expect(metrics.overflowY).toBe('auto');
    expect(metrics.leftAligned).toBe(true);
    expect(metrics.withinViewport).toBe(true);

    // The selected row is scrolled into view on open (kept in view per
    // round-3 feedback).
    const inView = await panel.evaluate(el => {
      const selRow = el.querySelector('.cwp-week-row.cwp-selected');
      const box = el.querySelector('.cwp-scroll')!.getBoundingClientRect();
      const row = selRow!.getBoundingClientRect();
      return row.top >= box.top && row.bottom <= box.bottom;
    });
    expect(inView).toBe(true);
  });

  test('C1 keyboard: Home/End rove, Right expands, Left collapses, Esc closes with focus return', async ({ page }) => {
    await page.goto(BASE);
    const picker = page.locator('#cwp-a');
    await picker.locator('.sel-trigger').click();
    const panel = page.locator('.cwp-panel');

    // End lands on the last interactive row (June is disabled → skipped:
    // the last cycle row is January).
    await page.keyboard.press('End');
    await expect(panel.locator('.cwp-cycle-row').nth(5)).toHaveClass(/sel-active/);

    // Right expands the active cycle; Left collapses it.
    await page.keyboard.press('ArrowRight');
    await expect(panel.locator('.cwp-weeks-label')).toContainText('Weeks in January 2026');
    await page.keyboard.press('ArrowLeft');
    await expect(panel.locator('.cwp-weeks-label')).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(picker.locator('.sel-trigger')).toBeFocused();

    // With search focused (8-cycle scenario), Esc must still hand focus back.
    const b = page.locator('#cwp-b');
    await b.locator('.sel-trigger').click();
    await expect(page.locator('.cwp-panel .cwp-search input')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.cwp-panel')).toHaveCount(0);
    await expect(b.locator('.sel-trigger')).toBeFocused();
  });
});
