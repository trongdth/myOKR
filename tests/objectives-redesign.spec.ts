import { test, expect } from '@playwright/test';

/**
 * P7 revamp — Objectives screen redesign (grilling session 2026-08-19):
 * inline cycle selector + cycle-progress widget, objective-card header row with
 * reward pill, KR 4-column grid, expandable add-KR row, inline creation form.
 */
test.describe('Objectives screen redesign (P7 revamp)', () => {
  test.beforeEach(async ({ page }) => {
    // Fixed May 2026 so the seeded cycle is current and progress is deterministic (38%)
    await page.clock.setFixedTime(new Date('2026-05-15T12:00:00.000Z'));
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.locator('button[title="Plan"]').click();
    await page.locator('button[title="Objectives"]').click();
    await expect(page.locator('.okr-container h2.tasks-title', { hasText: 'PLAN' })).toBeVisible();
  });

  test('header: "{Mon} cycle" title, inline cycle selector, violet cycle progress, no search button, no bottom bar', async ({ page }) => {
    await expect(page.locator('.plan-header-title')).toHaveText('May cycle');
    // Cycle selector sits inline next to the title, not stacked underneath
    await expect(page.locator('.plan-header-title-row .cycle-selector-btn')).toContainText('May 2026');

    // Cycle progress: inline label + % above a violet bar (objective token —
    // the old boxed widget's logo-only gradient is gone)
    await expect(page.locator('.okr-cycle-progress-label')).toContainText('Cycle progress');
    await expect(page.locator('.okr-overall-text')).toHaveText('38%');
    await expect(page.locator('.okr-overall-fill')).toHaveCSS('background-color', 'rgb(168, 85, 247)');

    // Search button removed on this screen (Meta+K stays the keyboard path);
    // the bottom add-objective bar is gone
    await expect(page.locator('.okr-container .search-trigger-btn')).toHaveCount(0);
    await expect(page.locator('.okr-add-objective')).toHaveCount(0);

    // Countdown line kept under the title row
    await expect(page.locator('.okr-cycle-countdown')).toContainText('days left in cycle');
  });

  test('objective card: no accent border, violet dot + violet progress fill, ghost reward pill', async ({ page }) => {
    const card = page.locator('.objective-card', { hasText: 'Ship myOKR v2.0' });
    await expect(card).toBeVisible();

    // Uniform border — the 3px cyan accent stripe is removed
    expect(await card.evaluate(el => getComputedStyle(el).borderLeftWidth)).toBe('1px');

    // Static violet dot (objective semantic — no category field exists)
    await expect(card.locator('.objective-dot')).toBeVisible();
    const dotColor = await card.locator('.objective-dot').evaluate(el => getComputedStyle(el).backgroundColor);
    expect(dotColor).toBe('rgb(168, 85, 247)');

    // Progress fill is violet, never the logo-only gradient
    await expect(card.locator('.objective-progress-fill')).toHaveCSS('background-color', 'rgb(168, 85, 247)');

    // No standalone reward box in the body; the header shows the ghost pill
    await expect(card.locator('.objective-reward-container')).toHaveCount(0);
    await expect(card.locator('.objective-reward-pill.ghost')).toContainText('Add reward');
  });

  test('KR grid: value badge, / target, percent, status pill, subtitle linkage via mode popup', async ({ page }) => {
    // Let the objective-body slideDown entrance settle — popup anchors under
    // the subtitle mis-position if clicked mid-animation (same race as the
    // hover-reveal test below)
    await page.waitForTimeout(350);
    const kr = page.locator('.kr-row', { hasText: 'Complete 15 feature tickets' });
    await expect(kr).toBeVisible();

    // Column 2: current value in the outlined badge
    await expect(kr.locator('.kr-value-badge')).toHaveText('9');
    // Column 3: "/ 15" target + bar (no percent readout — UI-polish round dropped it)
    await expect(kr.locator('.kr-target-text')).toHaveText('/ 15');
    // Column 4: status pill far right
    await expect(kr.locator('.kr-confidence-pill')).toContainText('On Track');
    // Column 1 subtitle: mode label for a manual KR
    await expect(kr.locator('.kr-subtitle')).toContainText('Manual');

    // Subtitle click opens the mode popup; switching to Completed Tasks shows
    // the linked-tasks count (seed: task-1 open and linked to kr-1)
    await kr.locator('.kr-subtitle').click();
    await expect(kr.locator('.mode-popup')).toBeVisible();
    await kr.locator('.mode-popup .mode-option', { hasText: 'Completed Tasks' }).click();
    await expect(kr.locator('.kr-subtitle')).toContainText('Completed Tasks · 1 task linked');

    // A tasks-mode KR with no linked tasks shows the unserved warning instead
    const unserved = page.locator('.kr-row', { hasText: 'Complete 10 learning sessions' });
    await unserved.locator('.kr-subtitle').click();
    await unserved.locator('.mode-popup .mode-option', { hasText: 'Completed Tasks' }).click();
    await expect(unserved.locator('.kr-subtitle')).toContainText('Completed Tasks · no tasks serving this KR');
    await expect(unserved.locator('.kr-subtitle')).toHaveClass(/unserved/);
  });

  test('KR delete ✕ is hover-reveal, then visible', async ({ page }) => {
    const kr = page.locator('.kr-row', { hasText: 'Complete 15 feature tickets' });
    const del = kr.locator('.kr-delete-btn');
    expect(await del.evaluate(el => getComputedStyle(el).opacity)).toBe('0');
    // Let the objective-body slideDown entrance settle first — hovering mid-animation
    // leaves the cursor on a point the row then slides away from, losing :hover
    await page.waitForTimeout(350);
    await kr.hover();
    // The reveal is a 200ms opacity transition — poll past it
    await expect.poll(() => del.evaluate(el => getComputedStyle(el).opacity)).toBe('1');
  });

  test('value badge opens the value popover (manual mode adjusts current)', async ({ page }) => {
    const kr = page.locator('.kr-row', { hasText: 'Complete 15 feature tickets' });
    await kr.locator('.kr-value-badge').click();
    const popover = page.locator('.kr-value-popover');
    await expect(popover).toBeVisible();
    await expect(popover.locator('.kr-popover-title')).toHaveText('Adjust Current');
    await popover.locator('.kr-counter-btn', { hasText: '+' }).click(); // 9 → 10
    await popover.locator('.kr-popover-confirm').click();
    await expect(kr.locator('.kr-value-badge')).toHaveText('10');
  });

  test('derived modes adjust the target only — current stays automatic (Focus Hours included)', async ({ page }) => {
    // Focus Hours KR (seed kr-3, target 40): the popover opens and adjusts the
    // target — previously this mode had no popover at all and its target was
    // stuck at the creation value forever.
    const kr = page.locator('.kr-row', { hasText: 'Complete 40 focus hours' });
    await kr.locator('.kr-value-badge').click();
    const popover = page.locator('.kr-value-popover');
    await expect(popover).toBeVisible();
    await expect(popover.locator('.kr-popover-title')).toHaveText('Adjust Target');
    // No Current field — the current value is derived from linked tasks, never hand-set
    await expect(popover.locator('.kr-popover-field', { hasText: 'Current' })).toHaveCount(0);
    await popover.locator('.kr-counter-btn', { hasText: '+' }).click(); // 40 → 41
    await popover.locator('.kr-popover-confirm').click();
    await expect(kr.locator('.kr-target-text')).toHaveText('/ 41');
    // The current badge is untouched by a target change
    await expect(kr.locator('.kr-value-badge')).toHaveText('0');

    // Same posture for Pomodoros (seed kr-4, target 25)
    const pomo = page.locator('.kr-row', { hasText: 'Finish 25 Pomodoro sessions' });
    await pomo.locator('.kr-value-badge').click();
    await expect(popover.locator('.kr-popover-title')).toHaveText('Adjust Target');
    await expect(popover.locator('.kr-popover-field', { hasText: 'Current' })).toHaveCount(0);
  });

  test('add-KR row: toggle expands, helper text follows the type, Esc collapses, Add keeps the row open', async ({ page }) => {
    const card = page.locator('.objective-card', { hasText: 'Ship myOKR v2.0' });
    await card.locator('.kr-add-toggle').click();

    const row = card.locator('.kr-add-row');
    await expect(row).toBeVisible();
    await expect(row.locator('.kr-add-helper')).toContainText('Manual');

    await row.locator('.kr-mode-select').selectOption({ label: 'Focus Hours' });
    await expect(row.locator('.kr-add-helper')).toContainText('Nothing to update by hand');
    // Focus Hours is derived — the current stepper locks at 0, target takes the default
    await expect(row.locator('.kr-stepper[data-part="current"]')).toHaveClass(/disabled/);
    await expect(row.locator('.kr-stepper[data-part="current"] .kr-counter-value')).toHaveText('0');
    await expect(row.locator('.kr-stepper[data-part="target"] .kr-counter-value')).toHaveText('10');

    // Esc collapses back to the plain text button
    await row.locator('input[type="text"]').press('Escape');
    await expect(card.locator('.kr-add-toggle')).toBeVisible();
    await expect(row).toHaveCount(0);

    // Add keeps the row open (rapid multi-KR entry) and clears the title
    await card.locator('.kr-add-toggle').click();
    await row.locator('input[type="text"]').fill('Added via expanded row');
    await row.locator('button:text-is("Add")').click();
    await expect(card.locator('.kr-row', { hasText: 'Added via expanded row' })).toBeVisible();
    await expect(row.locator('input[type="text"]')).toHaveValue('');
  });

  test('new-objective form: validation hint, Esc discards, Create adds objective + first KR + reward', async ({ page }) => {
    await page.locator('.okr-new-objective-btn').click();
    const form = page.locator('.okr-new-obj-form');
    await expect(form).toBeVisible();
    await expect(form.locator('.okr-new-obj-create-btn')).toBeDisabled();
    await expect(form.locator('.okr-new-obj-hint')).toContainText('Needs a name and one key result');

    // Esc anywhere in the form discards it
    await form.locator('.okr-new-obj-title-input').fill('Transient objective');
    await form.locator('.okr-new-obj-title-input').press('Escape');
    await expect(form).toHaveCount(0);

    // Full create with a reward
    await page.locator('.okr-new-objective-btn').click();
    await form.locator('.okr-new-obj-title-input').fill('Grow the design practice');
    await form.locator('.okr-new-obj-reward-wrap input').fill('A new mechanical keyboard');
    await form.locator('.okr-new-obj-kr-input').fill('Hold 40 focus hours a month');
    await form.locator('.kr-mode-select').selectOption({ label: 'Focus Hours' });
    await expect(form.locator('.kr-stepper[data-part="current"]')).toHaveClass(/disabled/);
    await expect(form.locator('.kr-stepper[data-part="target"] .kr-counter-value')).toHaveText('10');
    await form.locator('.okr-new-obj-create-btn').click();
    await expect(form).toHaveCount(0);

    const card = page.locator('.objective-card', { hasText: 'Grow the design practice' });
    await expect(card).toBeVisible();
    await expect(card.locator('.objective-reward-pill:not(.ghost)')).toContainText('A new mechanical keyboard');
    const kr = card.locator('.kr-row', { hasText: 'Hold 40 focus hours a month' });
    await expect(kr.locator('.kr-subtitle')).toContainText('Focus Hours');
    await expect(kr.locator('.kr-target-text')).toHaveText('/ 10');
  });

  test('UI polish: tab strip to first card keeps the Plan-group gap', async ({ page }) => {
    // Tasks/Done space their content with the container's 1.25rem (20px) flex
    // gap — Objectives must not glue the first card to the tab strip
    const strip = await page.locator('.okr-container .plan-tab-strip').boundingBox();
    const card = await page.locator('.objective-card').first().boundingBox();
    expect(strip).not.toBeNull();
    expect(card).not.toBeNull();
    const gap = card!.y - (strip!.y + strip!.height);
    expect(gap).toBeGreaterThanOrEqual(18);
  });

  test('UI polish: KR rows drop the percent; pills and bars are equal-width', async ({ page }) => {
    await page.waitForTimeout(350); // settle the slideDown entrance (popup positioning)

    // No percentage text after the bar
    await expect(page.locator('.kr-progress-percent')).toHaveCount(0);

    // Status pills are equal-width regardless of label (On Track / At Risk / Off Track)
    const pillWidth = async (rowText: string) => {
      const box = await page.locator('.kr-row', { hasText: rowText }).locator('.kr-confidence-pill').boundingBox();
      return box!.width;
    };
    const onTrack = await pillWidth('Complete 15 feature tickets'); // seed: on_track
    const atRisk = await pillWidth('Achieve 90% test coverage');    // seed: at_risk
    const kr = page.locator('.kr-row', { hasText: 'Complete 15 feature tickets' });
    await kr.locator('.kr-confidence-pill').click();
    await page.locator('.confidence-popup .confidence-option', { hasText: 'Off Track' }).click();
    const offTrack = await pillWidth('Complete 15 feature tickets');
    expect(Math.abs(onTrack - atRisk)).toBeLessThanOrEqual(1);
    expect(Math.abs(onTrack - offTrack)).toBeLessThanOrEqual(1);

    // Progress bars are the same width in every KR row
    const bars = page.locator('.kr-row .kr-progress-bar');
    const n = await bars.count();
    expect(n).toBeGreaterThanOrEqual(6);
    const first = (await bars.first().boundingBox())!.width;
    for (let i = 1; i < n; i++) {
      expect(Math.abs((await bars.nth(i).boundingBox())!.width - first)).toBeLessThanOrEqual(1);
    }
  });

  test('UI polish: bar-to-pill gap is uniform across KR rows', async ({ page }) => {
    await page.waitForTimeout(350); // settle the slideDown entrance
    // Removing the percent left the bar ending wherever the target text ends —
    // the bar must hug the pill column so the gap is the grid gap on every row
    const gaps = await page.evaluate(() => {
      return [...document.querySelectorAll('.kr-row')].map(row => {
        const bar = row.querySelector('.kr-progress-bar')!.getBoundingClientRect();
        const pill = row.querySelector('.kr-confidence-pill')!.getBoundingClientRect();
        return pill.left - bar.right;
      });
    });
    expect(gaps.length).toBeGreaterThanOrEqual(6);
    for (const g of gaps) {
      expect(Math.abs(g - gaps[0])).toBeLessThanOrEqual(1);
    }
    // And it's a sensible gap, not a glued-together one
    expect(gaps[0]).toBeGreaterThanOrEqual(8);
  });

  test('UI polish: badge → target → bar → pill share one uniform gap', async ({ page }) => {
    await page.waitForTimeout(350); // settle the slideDown entrance
    // The current pomos (badge), target pomos ("/ N"), progress bar and status
    // pill form one display group — every adjacent gap must be the same width
    const gaps = await page.evaluate(() => {
      return [...document.querySelectorAll('.kr-row')].map(row => {
        const badge = row.querySelector('.kr-value-badge')!.getBoundingClientRect();
        const text = row.querySelector('.kr-target-text')!.getBoundingClientRect();
        const bar = row.querySelector('.kr-progress-bar')!.getBoundingClientRect();
        const pill = row.querySelector('.kr-confidence-pill')!.getBoundingClientRect();
        return {
          badgeToText: text.left - badge.right,
          textToBar: bar.left - text.right,
          barToPill: pill.left - bar.right,
        };
      });
    });
    expect(gaps.length).toBeGreaterThanOrEqual(6);
    for (const g of gaps) {
      expect(Math.abs(g.badgeToText - g.textToBar)).toBeLessThanOrEqual(1);
      expect(Math.abs(g.textToBar - g.barToPill)).toBeLessThanOrEqual(1);
    }
    // And a sensible gap, not glued
    expect(gaps[0].textToBar).toBeGreaterThanOrEqual(8);
  });

  test('UI polish: current/target pomos render at the compact mono scale', async ({ page }) => {
    await page.waitForTimeout(350);
    // The badge and the "/ N" target must share one small mono scale — the
    // first polish pass left the badge at the larger 0.85rem
    const sizes = await page.evaluate(() => {
      const badge = getComputedStyle(document.querySelector('.kr-value-badge')!);
      const target = getComputedStyle(document.querySelector('.kr-target-text')!);
      return { badge: badge.fontSize, target: target.fontSize };
    });
    expect(sizes.badge).toBe('12px');
    expect(sizes.target).toBe('12px');
  });

  test('UI polish: add-KR current/target editors are steppers, current locked for derived modes', async ({ page }) => {
    await page.waitForTimeout(350);
    const card = page.locator('.objective-card', { hasText: 'Ship myOKR v2.0' });
    await card.locator('.kr-add-toggle').click();
    const row = card.locator('.kr-add-row');
    await expect(row).toBeVisible();

    // No plain number inputs — the − value + stepper is the editor
    await expect(row.locator('.kr-num-input')).toHaveCount(0);

    // Manual default: current stepper active, target starts at the mode default (100)
    const current = row.locator('.kr-stepper[data-part="current"]');
    const target = row.locator('.kr-stepper[data-part="target"]');
    await expect(current).not.toHaveClass(/disabled/);
    await expect(target.locator('.kr-counter-value')).toHaveText('100');
    await current.locator('.kr-counter-btn', { hasText: '+' }).click();
    await expect(current.locator('.kr-counter-value')).toHaveText('1');

    // Focus Hours is derived — the current stepper locks at 0, target still steppers
    await row.locator('.kr-mode-select').selectOption({ label: 'Focus Hours' });
    await expect(current).toHaveClass(/disabled/);
    await expect(current.locator('.kr-counter-value')).toHaveText('0');
    await expect(target.locator('.kr-counter-value')).toHaveText('10');
    await target.locator('.kr-counter-btn', { hasText: '+' }).click();
    await expect(target.locator('.kr-counter-value')).toHaveText('11');
  });

  test('empty cycle: EmptyState starter action opens the creation form', async ({ page }) => {
    // Switch to a fresh blank cycle (June 2026 — future + empty)
    await page.locator('.cycle-selector-btn').click();
    await page.locator('button:has-text("New blank cycle")').click();
    await expect(page.locator('.empty-state')).toBeVisible();
    await page.locator('.empty-state button', { hasText: 'New objective' }).click();
    await expect(page.locator('.okr-new-obj-form')).toBeVisible();
  });
});
