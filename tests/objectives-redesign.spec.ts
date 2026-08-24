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
    await expect(page.locator('.plan-header-title-row [aria-label="Cycle"]')).toContainText('May 2026');

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
    // Column 4: status picker far right (bare Select, fixed width)
    await expect(kr.locator('.kr-status-cell .sel-trigger')).toContainText('On Track');
    // Column 1: the bare mode Select carries the label for a manual KR
    await expect(kr.locator('[aria-label^="KR mode"]')).toContainText('Manual');

    // Mode switching via the bare Select; the served suffix shows the
    // linked-tasks count (seed: task-1 open and linked to kr-1)
    await kr.locator('[aria-label^="KR mode"]').click();
    await page.locator('.sel-panel .sel-row', { hasText: 'Completed Tasks' }).click();
    await expect(kr.locator('[aria-label^="KR mode"]')).toContainText('Completed Tasks');
    await expect(kr.locator('.kr-subtitle-served')).toHaveText(/1 task linked/);

    // A tasks-mode KR with no linked tasks shows the unserved warning instead
    const unserved = page.locator('.kr-row', { hasText: 'Complete 10 learning sessions' });
    await unserved.locator('[aria-label^="KR mode"]').click();
    await page.locator('.sel-panel .sel-row', { hasText: 'Completed Tasks' }).click();
    await expect(unserved.locator('.kr-subtitle-unserved')).toHaveText(/no tasks serving this KR/);
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
    // Focus Hours KR (seed kr-3, target 40): pressing the bar opens the popover
    // and adjusts the target — previously this mode had no popover at all and
    // its target was stuck at the creation value forever. (The current badge
    // is locked for derived modes — pressing it does nothing.)
    const kr = page.locator('.kr-row', { hasText: 'Complete 40 focus hours' });
    await kr.locator('.kr-progress-line').click();
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
    await pomo.locator('.kr-progress-line').click();
    await expect(popover.locator('.kr-popover-title')).toHaveText('Adjust Target');
    await expect(popover.locator('.kr-popover-field', { hasText: 'Current' })).toHaveCount(0);
  });

  test('add-KR row: toggle expands, helper text follows the type, Esc collapses, Add keeps the row open', async ({ page }) => {
    const card = page.locator('.objective-card', { hasText: 'Ship myOKR v2.0' });
    await card.locator('.kr-add-toggle').click();

    const row = card.locator('.kr-add-row');
    await expect(row).toBeVisible();
    await expect(row.locator('.kr-add-helper')).toContainText('Manual');

    await row.locator('[aria-label="Key result type"]').click();
    await page.locator('.sel-panel .sel-row', { hasText: 'Focus Hours' }).click();
    await expect(row.locator('.kr-add-helper')).toContainText('Nothing to update by hand');
    // Focus Hours is derived — the current box locks at 0, target takes the default
    await expect(row.locator('button[aria-label="Adjust current value"]')).toHaveClass(/locked/);
    await expect(row.locator('button[aria-label="Adjust current value"]')).toHaveText('0');
    await expect(row.locator('button[aria-label="Adjust target value"]')).toHaveText('10');

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
    await form.locator('[aria-label="Key result type"]').click();
    await page.locator('.sel-panel .sel-row', { hasText: 'Focus Hours' }).click();
    await expect(form.locator('button[aria-label="Adjust current value"]')).toHaveClass(/locked/);
    await expect(form.locator('button[aria-label="Adjust target value"]')).toHaveText('10');
    await form.locator('.okr-new-obj-create-btn').click();
    await expect(form).toHaveCount(0);

    const card = page.locator('.objective-card', { hasText: 'Grow the design practice' });
    await expect(card).toBeVisible();
    await expect(card.locator('.objective-reward-pill:not(.ghost)')).toContainText('A new mechanical keyboard');
    const kr = card.locator('.kr-row', { hasText: 'Hold 40 focus hours a month' });
    await expect(kr.locator('[aria-label^="KR mode"]')).toContainText('Focus Hours');
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
      const box = await page.locator('.kr-row', { hasText: rowText }).locator('.kr-status-cell .sel-trigger').boundingBox();
      return box!.width;
    };
    const onTrack = await pillWidth('Complete 15 feature tickets'); // seed: on_track
    const atRisk = await pillWidth('Achieve 90% test coverage');    // seed: at_risk
    const kr = page.locator('.kr-row', { hasText: 'Complete 15 feature tickets' });
    await kr.locator('[aria-label^="Confidence"]').click();
    await page.locator('.sel-panel .sel-row', { hasText: 'Off Track' }).click();
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
        const pill = row.querySelector('.kr-status-cell .sel-trigger')!.getBoundingClientRect();
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
        const pill = row.querySelector('.kr-status-cell .sel-trigger')!.getBoundingClientRect();
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

  test('UI polish: add-KR values adjust via the popover stepper (same as the KR row)', async ({ page }) => {
    await page.waitForTimeout(350);
    const card = page.locator('.objective-card', { hasText: 'Ship myOKR v2.0' });
    await card.locator('.kr-add-toggle').click();
    const row = card.locator('.kr-add-row');
    await expect(row).toBeVisible();

    // No inline steppers or number inputs — the boxes open the shared popover
    await expect(row.locator('.kr-num-input')).toHaveCount(0);
    await expect(row.locator('.kr-stepper')).toHaveCount(0);

    // Target box: click opens the same "Adjust Target" popover the KR row uses
    const targetBox = row.locator('button[aria-label="Adjust target value"]');
    await expect(targetBox).toHaveText('100'); // Manual mode's default target
    await targetBox.click();
    const popover = page.locator('.kr-value-popover');
    await expect(popover).toBeVisible();
    await expect(popover.locator('.kr-popover-title')).toHaveText('Adjust Target');
    await popover.locator('.kr-counter-btn', { hasText: '+' }).click();
    await popover.locator('.kr-popover-confirm').click();
    await expect(targetBox).toHaveText('101');

    // Current box: same popover for Manual ("Adjust Current")
    const currentBox = row.locator('button[aria-label="Adjust current value"]');
    await expect(currentBox).toHaveText('0');
    await currentBox.click();
    await expect(popover.locator('.kr-popover-title')).toHaveText('Adjust Current');
    await popover.locator('.kr-counter-btn', { hasText: '+' }).click();
    await popover.locator('.kr-popover-confirm').click();
    await expect(currentBox).toHaveText('1');

    // Focus Hours is derived — the current box locks, the target still pops
    await row.locator('[aria-label="Key result type"]').click();
    await page.locator('.sel-panel .sel-row', { hasText: 'Focus Hours' }).click();
    await expect(currentBox).toHaveClass(/locked/);
    await expect(currentBox).toHaveText('0');
    await expect(targetBox).toHaveText('10');
    await targetBox.click();
    await expect(popover.locator('.kr-popover-title')).toHaveText('Adjust Target');
  });

  test('PR #76: derived-mode value badge is locked; the bar opens Adjust Target', async ({ page }) => {
    await page.waitForTimeout(350);
    // Focus Hours KR — its current is derived, so the badge must not pretend
    // to be an editor; the target adjusts from the progress line instead
    const kr = page.locator('.kr-row', { hasText: 'Complete 40 focus hours' });
    const badge = kr.locator('.kr-value-badge');
    await expect(badge).toHaveClass(/locked/);
    await badge.click({ force: true }).catch(() => {}); // pointer-events:none — no popover
    await expect(page.locator('.kr-value-popover')).toHaveCount(0);

    await kr.locator('.kr-progress-line').click();
    const popover = page.locator('.kr-value-popover');
    await expect(popover).toBeVisible();
    await expect(popover.locator('.kr-popover-title')).toHaveText('Adjust Target');

    // Manual KR keeps the badge-as-editor behavior
    const manual = page.locator('.kr-row', { hasText: 'Complete 15 feature tickets' });
    await expect(manual.locator('.kr-value-badge')).not.toHaveClass(/locked/);
  });

  test('PR #76: lowering the draft target below its current clamps the current', async ({ page }) => {
    await page.waitForTimeout(350);
    const card = page.locator('.objective-card', { hasText: 'Ship myOKR v2.0' });
    await card.locator('.kr-add-toggle').click();
    const row = card.locator('.kr-add-row');
    const currentBox = row.locator('button[aria-label="Adjust current value"]');
    const targetBox = row.locator('button[aria-label="Adjust target value"]');

    // Current → 2 (Manual default target is 100)
    await currentBox.click();
    const popover = page.locator('.kr-value-popover');
    await popover.locator('.kr-counter-btn', { hasText: '+' }).click();
    await popover.locator('.kr-counter-btn', { hasText: '+' }).click();
    await popover.locator('.kr-popover-confirm').click();
    await expect(currentBox).toHaveText('2');

    // Target 100 → 1 (the stepper floors at 1) — one step per pointerdown
    await targetBox.click();
    await popover.locator('.kr-counter-btn').first().evaluate(async (btn) => {
      for (let i = 0; i < 99; i++) {
        btn.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
        btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      }
    });
    await popover.locator('.kr-popover-confirm').click();
    await expect(targetBox).toHaveText('1');
    // The current can no longer exceed its target — "2 / 1" must clamp to 1
    await expect(currentBox).toHaveText('1');
  });

  test('PR #76: add-KR toggle announces its expansion state (aria)', async ({ page }) => {
    const card = page.locator('.objective-card', { hasText: 'Ship myOKR v2.0' });
    const toggle = card.locator('.kr-add-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toHaveAttribute('aria-controls');
  });

  test('empty cycle: EmptyState starter action opens the creation form', async ({ page }) => {
    // Switch to a fresh blank cycle (June 2026 — future + empty)
    await page.locator('[aria-label="Cycle"]').click();
    await page.locator('.sel-panel .sel-row.sel-action', { hasText: 'New blank cycle' }).click();
    await expect(page.locator('.empty-state')).toBeVisible();
    await page.locator('.empty-state button', { hasText: 'New objective' }).click();
    await expect(page.locator('.okr-new-obj-form')).toBeVisible();
  });
});
