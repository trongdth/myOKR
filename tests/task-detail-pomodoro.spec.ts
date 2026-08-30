import { test, expect } from '@playwright/test';

// P4 — Task detail pomodoro block (2026-08-05): the readout shows lifetime
// `completed / estimated` ("2 / 4 planned") and clicking it opens the shared
// "Adjust Total Pomodoros" popover; the muted bar mirrors the same ratio.
// The former weekly-plan feature (`weeklyPomodoroPlan` + "Change weekly plan")
// was removed entirely: legacy docs keep the orphaned key in the CRDT, but
// normalize drops it from the typed view (Seam A) and the modal reads only
// lifetime totals (Seam C). Seams confirmed with the user: A) storage
// normalization, C) TaskDetailModal UI.

test.describe('Pomodoro block — storage (Seam A)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  // Regression: a doc saved before the weekly-plan removal still carries
  // weeklyPomodoroPlan. Loading must not crash, must not leak the key into
  // the typed view (the normalize spread used to carry it through), and must
  // preserve every other field.
  test('legacy weeklyPomodoroPlan is ignored on load — not leaked into the typed view', async ({ page }) => {
    const res = await page.evaluate(async () => {
      const storage = await import('/src/lib/pomodoro-storage.ts');
      await storage.saveTasks([
        {
          id: 't1',
          title: 'Task',
          weeklyPomodoroPlan: 20, // legacy key — still present in old docs
          estimatedPomodoros: 4,
          completedPomodoros: 2,
          isCompleted: false,
          createdAt: '2026-05-24T10:00:00Z',
        },
      ]);
      const loaded = await storage.loadTasks();
      return {
        hasKey: 'weeklyPomodoroPlan' in loaded[0],
        title: loaded[0].title,
        estimated: loaded[0].estimatedPomodoros,
        completed: loaded[0].completedPomodoros,
      };
    });
    expect(res).toEqual({ hasKey: false, title: 'Task', estimated: 4, completed: 2 });
  });
});

test.describe('Pomodoro block — task detail modal (Seam C)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(async () => {
      const storage = await import('/src/lib/pomodoro-storage.ts');
      await storage.saveTasks([
        {
          id: 'pb1',
          title: 'Pomodoro block task',
          estimatedPomodoros: 4,
          completedPomodoros: 2,
          isCompleted: false,
          createdAt: '2026-05-18T10:00:00Z',
        },
      ]);
    });
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await page.locator('.board-task-card .card-title').first().click();
  });

  test('shows POMODOROS THIS WEEK with lifetime completed / estimated, no weekly plan button', async ({ page }) => {
    // 2026-08-29: the label reads POMODOROS THIS WEEK (mockup copy) while the
    // readout stays the lifetime `completed / estimated` totals.
    await expect(page.locator('.weekly-plan-block')).toContainText('POMODOROS THIS WEEK');
    await expect(page.locator('.weekly-plan-block .task-pomo-count')).toHaveText('2 / 4 planned');
    await expect(page.locator('.weekly-plan-edit-btn')).toHaveCount(0);
  });

  // The block must sit on ONE row (label · readout · bar) and fit the panel
  // width — the user's padding requirement for the redesigned block.
  test('block is one row and fits the panel width', async ({ page }) => {
    const block = page.locator('.weekly-plan-block');
    const label = block.locator('.prop-label');
    const count = block.locator('.task-pomo-count');
    const bar = block.locator('.weekly-plan-bar');
    const panel = page.locator('.task-detail-panel');
    const blockBox = await block.boundingBox();
    const labelBox = await label.boundingBox();
    const countBox = await count.boundingBox();
    const barBox = await bar.boundingBox();
    const panelBox = await panel.boundingBox();
    // Same row: the vertical centers of label / readout / bar within 4px.
    const midY = [labelBox, countBox, barBox].map(b => b.y + b.height / 2);
    expect(Math.max(...midY) - Math.min(...midY)).toBeLessThanOrEqual(4);
    // Fits the panel: no horizontal overflow.
    expect(blockBox.x).toBeGreaterThanOrEqual(panelBox.x);
    expect(blockBox.x + blockBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width + 1);
  });

  test('clicking the readout opens Adjust Total Pomodoros and persists across reload', async ({ page }) => {
    await page.locator('.weekly-plan-block .task-pomodoros').click();
    await expect(page.locator('.pomo-estimate-popover')).toContainText('Adjust Total Pomodoros');
    await page.locator('.pomo-estimate-popover .pomo-counter-btn').nth(1).click(); // +
    await page.locator('.pomo-popover-confirm').click();
    await expect(page.locator('.weekly-plan-block .task-pomo-count')).toHaveText('2 / 5 planned');
    // The bar mirrors the same completed/estimated ratio.
    await expect(page.locator('.weekly-plan-bar')).toHaveAttribute('aria-valuenow', '2');
    await expect(page.locator('.weekly-plan-bar')).toHaveAttribute('aria-valuemax', '5');

    // Persistence: reload and reopen the task
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await page.locator('.board-task-card .card-title').first().click();
    await expect(page.locator('.weekly-plan-block .task-pomo-count')).toHaveText('2 / 5 planned');
  });
});
