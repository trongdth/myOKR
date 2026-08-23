import { test, expect } from '@playwright/test';

/**
 * Ticket 04 — .scratch/custom-select/issues/04-okr-surfaces.md
 * The OKR screen's pickers run on the shared Select: the KR draft type picker
 * (mode icons), the habit link (clear row + "+ Create new habit…" action row
 * that navigates), the KR row's mode/confidence pickers as bare variants, and
 * the CycleSelector rebuilt on Select (tick replaces the "current" badge,
 * per-row remove ×, New/Clone footer actions).
 */
test.describe('OKR Select migration', () => {
  test.beforeEach(async ({ page }) => {
    // Freeze to mid-May so May 2026 resolves as the current cycle (the app
    // picks by date, not by the isActive seed flag) and Dec stays deletable.
    await page.clock.setFixedTime(new Date('2026-05-15T12:00:00.000Z'));
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_active_section', 'objectives');
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(async () => {
      const okr = await import('/src/lib/okr-storage.ts');
      const habitStorage = await import('/src/lib/habit-storage.ts');
      await okr.saveCycles([
        { id: 'c-active', name: 'May cycle', month: 4, year: 2026, isActive: true, createdAt: '2026-05-01T00:00:00Z' },
        { id: 'c-future', name: 'Dec cycle', month: 11, year: 2026, isActive: false, createdAt: '2026-05-01T00:00:00Z' },
      ]);
      await okr.saveObjectives([
        { id: 'o1', cycleId: 'c-active', title: 'Migration Objective', createdAt: '2026-05-01T00:00:00Z' },
      ]);
      await okr.saveKeyResults([
        { id: 'kr-1', objectiveId: 'o1', title: 'Manual KR', targetValue: 10, currentValue: 2, unit: '%', completionMode: 'manual' },
      ]);
      await habitStorage.saveHabits([
        { id: 'h1', name: 'Read before bed', status: 'want_to_form', createdAt: '2026-05-01T00:00:00Z', history: {}, reminders: [] },
      ]);
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.okr-container')).toBeVisible();
  });

  test('draft type picker runs on Select with mode options', async ({ page }) => {
    await page.locator('.okr-new-objective-btn').click();
    const form = page.locator('.okr-new-obj-form');
    await expect(form).toBeVisible();

    const typePicker = form.locator('[aria-label="Key result type"]');
    await typePicker.click();
    await expect(page.locator('.sel-panel .sel-row', { hasText: 'Habit Ticks' })).toBeVisible();
    await page.locator('.sel-panel .sel-row', { hasText: 'Focus Hours' }).click();
    await expect(typePicker).toContainText('Focus Hours');
  });

  test('habit link: imperative placeholder, tick, clear row, create-new action navigates', async ({ page }) => {
    await page.locator('.okr-new-objective-btn').click();
    const form = page.locator('.okr-new-obj-form');
    await form.locator('.okr-new-obj-title-input').fill('Habit Objective');
    await form.locator('.okr-new-obj-kr-input').fill('Habit KR');
    const typePicker = form.locator('[aria-label="Key result type"]');
    await typePicker.click();
    await page.locator('.sel-panel .sel-row', { hasText: 'Habit Ticks' }).click();
    await form.locator('.okr-new-obj-create-btn').click();

    const krCard = page.locator('.kr-row', { hasText: 'Habit KR' });
    const habitLink = krCard.locator('[aria-label="Linked habit"]');
    await expect(habitLink.locator('.sel-text')).toHaveText('Link a habit');

    await habitLink.click();
    await page.locator('.sel-panel .sel-row', { hasText: 'Read before bed' }).click();
    await expect(habitLink).toContainText('Read before bed');
    await habitLink.click();
    await expect(page.locator('.sel-panel .sel-chosen')).toHaveText(/Read before bed/);
    await page.locator('.sel-panel .sel-row.sel-clear', { hasText: 'No habit' }).click();
    await expect(habitLink.locator('.sel-text')).toHaveText('Link a habit');

    // The create-new action row navigates without changing the value
    await habitLink.click();
    await page.locator('.sel-panel .sel-row.sel-action', { hasText: 'Create new habit' }).click();
    await expect(page.locator('.habits-title')).toBeVisible();
  });

  test('KR row mode and confidence are bare Selects', async ({ page }) => {
    const kr = page.locator('.kr-row', { hasText: 'Manual KR' });

    const mode = kr.locator('[aria-label^="KR mode"]');
    await expect(mode).toHaveClass(/bare/);
    await expect(mode.locator('.sel-chevron')).toHaveCount(0);
    await mode.click();
    await page.locator('.sel-panel .sel-row', { hasText: 'Completed Tasks' }).click();
    await expect(mode).toContainText('Completed Tasks');

    const confidence = kr.locator('[aria-label^="Confidence"]');
    await expect(confidence).toHaveClass(/bare/);
    await confidence.click();
    await expect(page.locator('.sel-panel .sel-tick')).toHaveCount(0); // not_set is not a menu row
    await page.locator('.sel-panel .sel-row', { hasText: 'At Risk' }).click();
    await expect(confidence).toContainText('At Risk');
    await confidence.click();
    await expect(page.locator('.sel-panel .sel-chosen')).toHaveText(/At Risk/);
  });

  test('cycle selector: tick on the active cycle, remove × on deletable rows, footer actions', async ({ page }) => {
    const trigger = page.locator('[aria-label="Cycle"]');
    await expect(trigger).toContainText('May cycle');
    await trigger.click();
    const panel = page.locator('.sel-panel');
    await expect(panel).toBeVisible();

    await expect(panel.locator('.sel-chosen')).toHaveText(/May cycle/);
    await expect(panel.locator('.sel-tick')).toHaveCount(1);

    // Future + empty cycle is deletable: hover reveals ×, confirm the deletion
    const decRow = panel.locator('.sel-row', { hasText: 'Dec cycle' });
    await decRow.hover();
    await decRow.locator('.sel-remove').click();
    await page.locator('button:has-text("Delete")').click();
    await expect(panel.locator('.sel-row', { hasText: 'Dec cycle' })).toHaveCount(0);

    // Footer actions render below the divider; acting closes the panel
    await trigger.click(); // the delete-confirm click closed the panel — reopen
    await expect(panel.locator('.sel-row.sel-action', { hasText: 'New blank cycle' })).toBeVisible();
    await panel.locator('.sel-row.sel-action', { hasText: 'Clone this cycle' }).click();
    await expect(page.locator('.sel-panel')).toHaveCount(0);
  });

  test('no native select or legacy dropdown code remains on Objectives', async ({ page }) => {
    // Open the creation form — its type picker is the last native select
    await page.locator('.okr-new-objective-btn').click();
    await expect(page.locator('.okr-new-obj-form')).toBeVisible();
    await expect(page.locator('.okr-container select')).toHaveCount(0);
    await expect(page.locator('.cycle-dropdown, .mode-popup, .confidence-popup')).toHaveCount(0);
  });
});
