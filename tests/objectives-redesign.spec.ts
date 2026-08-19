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
    const kr = page.locator('.kr-row', { hasText: 'Complete 15 feature tickets' });
    await expect(kr).toBeVisible();

    // Column 2: current value in the outlined badge
    await expect(kr.locator('.kr-value-badge')).toHaveText('9');
    // Column 3: "/ 15" target + bar + percent
    await expect(kr.locator('.kr-target-text')).toHaveText('/ 15');
    await expect(kr.locator('.kr-progress-percent')).toContainText('60.0%');
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

  test('add-KR row: toggle expands, helper text follows the type, Esc collapses, Add keeps the row open', async ({ page }) => {
    const card = page.locator('.objective-card', { hasText: 'Ship myOKR v2.0' });
    await card.locator('.kr-add-toggle').click();

    const row = card.locator('.kr-add-row');
    await expect(row).toBeVisible();
    await expect(row.locator('.kr-add-helper')).toContainText('Manual');

    await row.locator('.kr-mode-select').selectOption({ label: 'Focus Hours' });
    await expect(row.locator('.kr-add-helper')).toContainText('Nothing to update by hand');
    // Focus Hours is derived — the current input locks to 0, target takes the default
    await expect(row.locator('.kr-num-input').first()).toBeDisabled();
    await expect(row.locator('.kr-num-input').last()).toHaveValue('10');

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
    await expect(form.locator('.kr-num-input').first()).toBeDisabled();
    await expect(form.locator('.kr-num-input').last()).toHaveValue('10');
    await form.locator('.okr-new-obj-create-btn').click();
    await expect(form).toHaveCount(0);

    const card = page.locator('.objective-card', { hasText: 'Grow the design practice' });
    await expect(card).toBeVisible();
    await expect(card.locator('.objective-reward-pill:not(.ghost)')).toContainText('A new mechanical keyboard');
    const kr = card.locator('.kr-row', { hasText: 'Hold 40 focus hours a month' });
    await expect(kr.locator('.kr-subtitle')).toContainText('Focus Hours');
    await expect(kr.locator('.kr-target-text')).toHaveText('/ 10');
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
