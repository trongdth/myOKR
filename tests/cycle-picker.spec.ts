import { test, expect } from '@playwright/test';

// CycleWeekPicker — the Weekly review tab's two-level selector (second
// grilling round, .scratch/review-cycle-picker/spec.md). Tested in isolation
// on the dev fixture (?fixture=cycle-picker) with deterministic 2026 data:
// today = 2026-05-08 (Fri). Exclusive weeks (ADR-0019 rule):
//   Jan 5w · Feb 3w · Mar 5w · Apr 4w (ends 26 Apr) · May 5w (w1 finished,
//   w2 May 4–10 in progress). Scenario B adds Oct–Dec 2025 (8 cycles).

const BASE = '/?fixture=cycle-picker';

test.describe('CycleWeekPicker', () => {
  test('trigger reads the full path and the panel lists cycles newest-first with review meta', async ({ page }) => {
    await page.goto(BASE);
    const picker = page.locator('#cwp-a');
    await expect(picker.locator('.sel-trigger')).toHaveText(/April 2026 · week 4 of 4/);

    await picker.locator('.sel-trigger').click();
    const panel = page.locator('.cwp-panel');
    await expect(panel).toBeVisible();

    const cycleRows = panel.locator('.cwp-cycle-row');
    await expect(cycleRows).toHaveCount(5);
    await expect(cycleRows.nth(0)).toContainText('May 2026');
    await expect(cycleRows.nth(0).locator('.cwp-meta')).toHaveText('no reviews');
    await expect(cycleRows.nth(1)).toContainText('April 2026');
    await expect(cycleRows.nth(1).locator('.cwp-meta')).toHaveText('2 of 4');
    await expect(cycleRows.nth(2).locator('.cwp-meta')).toHaveText('5 reviews');
    await expect(cycleRows.nth(3).locator('.cwp-meta')).toHaveText('2 of 4');
    await expect(cycleRows.nth(4)).toContainText('January 2026');
    await expect(cycleRows.nth(4).locator('.cwp-meta')).toHaveText('no reviews');
    // Zero-review cycles are dimmed but selectable.
    await expect(cycleRows.nth(4)).toHaveClass(/cwp-dim/);
    // Check on the selected cycle row.
    await expect(cycleRows.nth(1)).toHaveClass(/cwp-selected/);
  });

  test('weeks section: date spans, selected check, draft hint, disabled unfinished weeks', async ({ page }) => {
    await page.goto(BASE);
    const picker = page.locator('#cwp-a');
    await picker.locator('.sel-trigger').click();
    const panel = page.locator('.cwp-panel');

    await expect(panel.locator('.cwp-weeks-label')).toHaveText('Week in April 2026');
    const weekRows = panel.locator('.cwp-week-row');
    await expect(weekRows).toHaveCount(4);
    await expect(weekRows.nth(0)).toContainText('30 Mar–5 Apr');
    await expect(weekRows.nth(3)).toContainText('20–26 Apr');
    await expect(weekRows.nth(3)).toHaveClass(/cwp-selected/);

    // May: week 1 finished (draft → hint instead of check), week 2 disabled.
    await panel.locator('.cwp-cycle-row').nth(0).click();
    await expect(panel.locator('.cwp-weeks-label')).toHaveText('Week in May 2026');
    const mayRows = panel.locator('.cwp-week-row');
    await expect(mayRows).toHaveCount(5);
    await expect(mayRows.nth(0)).toContainText('27 Apr–3 May');
    await expect(mayRows.nth(0).locator('.cwp-draft')).toHaveText('Draft');
    await expect(mayRows.nth(1)).toHaveClass(/cwp-disabled/);
    await expect(mayRows.nth(4)).toHaveClass(/cwp-disabled/);
  });

  test('cycle rows navigate, week rows commit and close', async ({ page }) => {
    await page.goto(BASE);
    const picker = page.locator('#cwp-a');
    await picker.locator('.sel-trigger').click();
    const panel = page.locator('.cwp-panel');

    // March week 2 (2–8 Mar) commits.
    await panel.locator('.cwp-cycle-row').nth(2).click();
    await panel.locator('.cwp-week-row').nth(1).click();
    await expect(panel).toHaveCount(0);
    await expect(picker.locator('.sel-trigger')).toHaveText(/March 2026 · week 2 of 5/);
    await expect(page.locator('#cwp-a-commit')).toHaveText('2026-03-02');

    // A disabled week never commits — force past Playwright's own
    // aria-disabled actionability gate so the handler's guard is what's
    // under test.
    await picker.locator('.sel-trigger').click();
    await panel.locator('.cwp-cycle-row').nth(0).click();
    await panel.locator('.cwp-week-row').nth(1).click({ force: true });
    await expect(panel).toBeVisible();
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
    await expect(panel.locator('.cwp-cycle-row')).toHaveCount(8);

    // "14 Apr" finds the April week containing Apr 14 (13–19 Apr).
    await panel.locator('.cwp-search input').fill('14 Apr');
    await expect(panel.locator('.cwp-cycle-row')).toHaveCount(1);
    await expect(panel.locator('.cwp-cycle-row')).toContainText('April 2026');
    await expect(panel.locator('.cwp-week-row')).toHaveCount(1);
    await expect(panel.locator('.cwp-week-row')).toContainText('13–19 Apr');

    // "April" matches the cycle by name (all weeks listed).
    await panel.locator('.cwp-search input').fill('April');
    await expect(panel.locator('.cwp-cycle-row')).toHaveCount(1);
    await expect(panel.locator('.cwp-week-row')).toHaveCount(4);

    await panel.locator('.cwp-search input').fill('xyzzy');
    await expect(page.locator('.cwp-empty')).toHaveText(/No cycle or week matches/);
  });
});

test('C1 keyboard: Home/End rove; Esc closes and returns focus to the trigger', async ({ page }) => {
  await page.goto(BASE);
  const picker = page.locator('#cwp-a');
  await picker.locator('.sel-trigger').click();
  const panel = page.locator('.cwp-panel');

  // End lands on the last interactive row of the flattened list — the
  // January cycle row (only the expanded cycle contributes week rows).
  await page.keyboard.press('End');
  await expect(panel.locator('.cwp-cycle-row').last()).toHaveClass(/sel-active/);
  // Home wraps to the first cycle row.
  await page.keyboard.press('Home');
  await expect(panel.locator('.cwp-cycle-row').first()).toHaveClass(/sel-active/);

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
