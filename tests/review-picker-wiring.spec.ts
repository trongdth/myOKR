import { test, expect, type Page } from '@playwright/test';

// Review-tab picker wiring (ticket 02, .scratch/review-cycle-picker): the
// Weekly review tab owns a CycleWeekPicker; analytics/objectives keep the
// strip Select; defaults land on the most recent finished week with a
// previous-cycle fallback; past cycles show the derived closed badge.

async function seedTwoCycles(page: Page) {
  await page.evaluate(async () => {
    const okr = await import('/src/lib/okr-storage.ts');
    const mk = (id: string, name: string, month: number, year: number, isActive: boolean) =>
      ({ id, name, month, year, isActive, createdAt: new Date().toISOString() });
    await okr.saveCycles([mk('c-may', 'May 2026', 4, 2026, true), mk('c-apr', 'April 2026', 3, 2026, false)]);
    await okr.saveObjectives([]);
    await okr.saveKeyResults([]);
    window.dispatchEvent(new CustomEvent('myokr-data-synced'));
  });
}

async function openReview(page: Page) {
  const item = page.locator('button[title="Weekly review"]').first();
  if (!(await item.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Progress', exact: true }).click();
  }
  await item.click();
  await page.waitForTimeout(400);
}

test.describe('review tab picker wiring', () => {
  test('defaults to the calendar cycle’s most recent finished week; badge on past cycles', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-05-08T12:00:00.000Z'));
    await page.addInitScript(() => window.localStorage.setItem('myokr_walkthrough_state', '"seen"'));
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await seedTwoCycles(page);
    await page.reload();
    await page.waitForLoadState('networkidle');

    await openReview(page);
    const trigger = page.locator('.cwp-panel, .sel-trigger[aria-label="Review cycle and week"]').first()
      ? page.locator('[aria-label="Review cycle and week"]')
      : page.locator('[aria-label="Review cycle and week"]');

    // May w1 (27 Apr–3 May) is its only finished week; w2 ends 10 May.
    await expect(trigger).toHaveText(/May 2026 · week 1 of 5/);
    await expect(page.locator('.plan-header-title')).toHaveText('Week of 27 Apr–3 May');
    // May hasn't closed → no badge.
    await expect(page.locator('.rw-closed-badge')).toHaveCount(0);

    // Committing April w4 (20–26 Apr) shows the derived closed badge.
    await trigger.click();
    await page.locator('.cwp-panel .cwp-cycle-row').nth(1).click();
    await page.locator('.cwp-panel .cwp-week-row').nth(3).click();
    await expect(trigger).toHaveText(/April 2026 · week 4 of 4/);
    await expect(page.locator('.plan-header-title')).toHaveText('Week of 20–26 Apr');
    await expect(page.locator('.rw-closed-badge')).toHaveText('Cycle closed 26 Apr');

    // One selector per tab: no strip week Select here…
    await expect(page.locator('.progress-week-select')).toHaveCount(0);
    // …and the review tab's unfinished weeks are unreachable.
    await trigger.click();
    await page.locator('.cwp-panel .cwp-cycle-row').nth(0).click();
    await expect(page.locator('.cwp-panel .cwp-week-row.cwp-disabled')).toHaveCount(4);
    await page.keyboard.press('Escape');

    // Analytics keeps the strip Select and no picker.
    await page.locator('.progress-tab-strip .plan-tab:has-text("Focus analytics")').click();
    await expect(page.locator('.progress-week-select')).toBeVisible();
    await expect(page.locator('[aria-label="Review cycle and week"]')).toHaveCount(0);
  });

  test('fresh cycle falls back to the previous cycle’s last finished week', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-05-01T12:00:00.000Z'));
    await page.addInitScript(() => window.localStorage.setItem('myokr_walkthrough_state', '"seen"'));
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await seedTwoCycles(page);
    await page.reload();
    await page.waitForLoadState('networkidle');

    await openReview(page);
    // May w1 (27 Apr–3 May) is still in progress on May 1 → April w4.
    await expect(page.locator('[aria-label="Review cycle and week"]')).toHaveText(/April 2026 · week 4 of 4/);
    await expect(page.locator('.rw-closed-badge')).toHaveText('Cycle closed 26 Apr');
  });
});

test('default follows the calendar, not the stale isActive flag (supersedes decision 2)', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-11T12:00:00.000Z'));
  await page.addInitScript(() => window.localStorage.setItem('myokr_walkthrough_state', '"seen"'));
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    const okr = await import('/src/lib/okr-storage.ts');
    const mk = (id: string, name: string, month: number, year: number, isActive: boolean) =>
      ({ id, name, month, year, isActive, createdAt: new Date().toISOString() });
    // May carries the stale flag; August and September are the real ones.
    await okr.saveCycles([
      mk('c-may', 'May 2026', 4, 2026, true),
      mk('c-aug', 'August 2026', 7, 2026, false),
      mk('c-sep', 'September 2026', 8, 2026, false),
    ]);
    await okr.saveObjectives([]);
    await okr.saveKeyResults([]);
    await okr.saveReviews([
      { id: 'r-aug24', weekStartDate: '2026-08-24', weekEndDate: '2026-08-30', cycleId: 'c-aug',
        completedAt: '2026-08-25T20:00:00.000Z', entries: [], prompts: [],
        pomodoroStats: { totalPomodoros: 0, totalFocusMinutes: 0, tasksCompleted: 0, pomodorosByKeyResult: {} } },
      { id: 'r-aug31', weekStartDate: '2026-08-31', weekEndDate: '2026-09-06', cycleId: 'c-sep',
        entries: [], prompts: [],
        pomodoroStats: { totalPomodoros: 0, totalFocusMinutes: 0, tasksCompleted: 0, pomodorosByKeyResult: {} } },
    ] as any);
    window.dispatchEvent(new CustomEvent('myokr-data-synced'));
  });
  await page.reload();
  await page.waitForLoadState('networkidle');

  await openReview(page);
  const trigger = page.locator('[aria-label="Review cycle and week"]');
  // September is the cycle today falls in; its only finished week is the one
  // that opens it (31 Aug–6 Sep) — the week holding the draft.
  await expect(trigger).toHaveText(/September 2026 · week 1 of 4/);
  await expect(page.locator('.plan-header-title')).toHaveText('Week of 31 Aug–6 Sep');
  await expect(trigger).not.toHaveText(/May 2026/);
});

test('default prefers a non-flagged newest cycle over an older flagged one', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-05-08T12:00:00.000Z'));
  await page.addInitScript(() => window.localStorage.setItem('myokr_walkthrough_state', '"seen"'));
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    const okr = await import('/src/lib/okr-storage.ts');
    const mk = (id: string, name: string, month: number, year: number, isActive: boolean) =>
      ({ id, name, month, year, isActive, createdAt: new Date().toISOString() });
    // May exists and has a finished week, but APRIL carries the active flag.
    await okr.saveCycles([mk('c-may', 'May 2026', 4, 2026, false), mk('c-apr', 'April 2026', 3, 2026, true)]);
    await okr.saveObjectives([]);
    await okr.saveKeyResults([]);
    window.dispatchEvent(new CustomEvent('myokr-data-synced'));
  });
  await page.reload();
  await page.waitForLoadState('networkidle');

  await openReview(page);
  // Today is in May, so May's most recent finished week wins — not April's,
  // and no closed badge (May hasn't closed).
  await expect(page.locator('[aria-label="Review cycle and week"]')).toHaveText(/May 2026 · week 1 of 5/);
  await expect(page.locator('.rw-closed-badge')).toHaveCount(0);
});

test('finishing a review refreshes the picker without leaving the tab', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-11T12:00:00.000Z'));
  await page.addInitScript(() => window.localStorage.setItem('myokr_walkthrough_state', '"seen"'));
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    const okr = await import('/src/lib/okr-storage.ts');
    const now = new Date().toISOString();
    await okr.saveCycles([
      { id: 'c-sep', name: 'September 2026', month: 8, year: 2026, isActive: false, createdAt: now },
    ]);
    await okr.saveObjectives([{ id: 'o-1', cycleId: 'c-sep', title: 'Ship myOKR', order: 0, createdAt: now }]);
    await okr.saveKeyResults([
      { id: 'kr-1', objectiveId: 'o-1', title: 'Ship pomodoros', targetValue: 20, currentValue: 4,
        unit: 'pomodoros', confidence: 'not_set', completionMode: 'manual', order: 0, createdAt: now, updatedAt: now },
    ] as any);
    await okr.saveReviews([]);
    window.dispatchEvent(new CustomEvent('myokr-data-synced'));
  });
  await page.reload();
  await page.waitForLoadState('networkidle');

  // Open the review tab, where the picker lives: it starts at 0 of 4.
  await openReview(page);
  const trigger = page.locator('[aria-label="Review cycle and week"]');
  await trigger.click();
  const cycleRow = page.locator('.cwp-panel .cwp-cycle-row').first();
  await expect(cycleRow.locator('.cwp-meta')).toHaveText('0 of 4 reviewed');
  await page.keyboard.press('Escape');

  // Finish without touching anything: unscored key results don't block
  // Finish, so no draft edit is pending — the only thing that can refresh
  // the picker is the finish path itself.
  await page.locator('.rw-rail-item:has-text("Reflect")').click();
  await page.locator('.rw-btn:has-text("Finish review")').click();
  await expect(page.locator('.rw-summary-head h2')).toHaveText('Your review');

  // The picker must follow in place — no trip through Focus or Plan.
  await trigger.click();
  await expect(cycleRow.locator('.cwp-meta')).toHaveText('1 of 4 reviewed');
});
