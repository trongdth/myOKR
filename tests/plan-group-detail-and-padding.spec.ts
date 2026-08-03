import { test, expect, type Page } from '@playwright/test';

// Fixed clock so cycle/week derivation is deterministic (matches the rest of
// the plan-group suite). 2026-05-24 is a Sunday — week 4 of the May cycle.
const FIXED = '2026-05-24T12:00:00.000Z';

async function openPlanTab(page: Page, tab: 'Tasks' | 'Objectives' | 'Done') {
  const btn = page.locator(`button[title="${tab}"]`).first();
  if (!(await btn.isVisible())) {
    await page.locator('button[title="Plan"]').first().click();
  }
  await btn.click();
  await page.waitForTimeout(300);
}

// ---------------------------------------------------------------------------
// Bug 2: the left/right padding of the Tasks and Done tabs must equal the
// Objectives tab. Objectives (.okr-container) is mounted directly and renders
// at the flagship 1280px width; Tasks/Done (.tasks-view-container /
// .done-view-container) are mounted inside .pomodoro-container, which clamps
// them to 900px — so today their rendered left/right insets differ from
// Objectives even though the inner container rules already match.
// ---------------------------------------------------------------------------
test.describe('Plan Group — tab content padding parity', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(FIXED));
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(async () => {
      const storage = await import('/src/lib/pomodoro-storage.ts');
      await storage.saveTasks([
        { id: 'open1', title: 'Open task', estimatedPomodoros: 2, completedPomodoros: 0, isCompleted: false, createdAt: '2026-05-18T10:00:00Z' },
        { id: 'done1', title: 'Done task', estimatedPomodoros: 1, completedPomodoros: 1, isCompleted: true, completedAt: '2026-05-24T10:00:00Z', createdAt: '2026-05-18T10:00:00Z' },
      ]);
    });
  });

  test('Tasks, Objectives, and Done share the same left/right content inset', async ({ page }) => {
    const TOL = 1; // sub-pixel rounding only

    await openPlanTab(page, 'Tasks');
    const tasksBox = await page.locator('.tasks-view-container').boundingBox();

    await openPlanTab(page, 'Objectives');
    const okrBox = await page.locator('.okr-container').boundingBox();

    await openPlanTab(page, 'Done');
    const doneBox = await page.locator('.done-view-container').boundingBox();

    expect(tasksBox, 'tasks-view-container rendered').not.toBeNull();
    expect(okrBox, 'okr-container rendered').not.toBeNull();
    expect(doneBox, 'done-view-container rendered').not.toBeNull();

    const inset = (b: { x: number; width: number }) => ({ left: b.x, right: b.x + b.width });
    const tasks = inset(tasksBox!);
    const okr = inset(okrBox!);
    const done = inset(doneBox!);

    // Objectives is the flagship layout the other two must match.
    expect(Math.abs(tasks.left - okr.left), 'Tasks left == Objectives left').toBeLessThanOrEqual(TOL);
    expect(Math.abs(tasks.right - okr.right), 'Tasks right == Objectives right').toBeLessThanOrEqual(TOL);
    expect(Math.abs(done.left - okr.left), 'Done left == Objectives left').toBeLessThanOrEqual(TOL);
    expect(Math.abs(done.right - okr.right), 'Done right == Objectives right').toBeLessThanOrEqual(TOL);
  });
});

// ---------------------------------------------------------------------------
// Bug 1: the Task detail header (P4) must put the title and the Start focus /
// Complete actions on ONE row (title left, actions right-aligned), with Start
// focus as the primary cyan action. Today the header classes are entirely
// unstyled, so the eyebrow / title / buttons collapse to stacked block flow
// and Start focus has no primary colour.
// ---------------------------------------------------------------------------
test.describe('Plan Group — Task detail header (P4)', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(FIXED));
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(async () => {
      const storage = await import('/src/lib/pomodoro-storage.ts');
      await storage.saveTasks([
        { id: 'td1', title: 'Open me', estimatedPomodoros: 2, completedPomodoros: 0, isCompleted: false, createdAt: '2026-05-18T10:00:00Z' },
      ]);
    });
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await page.locator('.board-task-card').first().click();
    await expect(page.locator('.task-detail-panel')).toBeVisible();
  });

  test('title and Start focus are on one row, with the action right-aligned', async ({ page }) => {
    const titleBox = await page.locator('.detail-title').boundingBox();
    const btnBox = await page.locator('.start-focus-btn').boundingBox();
    const panelBox = await page.locator('.task-detail-panel').boundingBox();

    expect(titleBox).not.toBeNull();
    expect(btnBox).not.toBeNull();
    expect(panelBox).not.toBeNull();

    // Same row: the button vertically overlaps the title's band (not stacked below it).
    const overlapsVertically =
      btnBox!.y < titleBox!.y + titleBox!.height &&
      btnBox!.y + btnBox!.height > titleBox!.y;
    expect(overlapsVertically, 'Start focus is on the same row as the title').toBe(true);

    // Right-aligned: the action sits in the right half of the panel.
    expect(btnBox!.x + btnBox!.width, 'Start focus is on the right half').toBeGreaterThan(
      panelBox!.x + panelBox!.width / 2
    );
  });

  test('Start focus is the primary cyan action', async ({ page }) => {
    const { btnBg, primary } = await page.evaluate(() => {
      // Resolve the --color-primary token independently (the source of truth
      // is the design system, not the button's own rule), then compare.
      const tmp = document.createElement('div');
      tmp.style.background = 'var(--color-primary)';
      document.body.appendChild(tmp);
      const primary = getComputedStyle(tmp).backgroundColor;
      tmp.remove();
      const btn = document.querySelector('.start-focus-btn')!;
      return { btnBg: getComputedStyle(btn).backgroundColor, primary };
    });

    expect(btnBg, 'Start focus background equals --color-primary').toBe(primary);
  });
});

// ---------------------------------------------------------------------------
// Sub-task (todo) deletion is permanent and undoable, so it must be guarded by
// a confirmation — matching TaskList's ConfirmModal for task deletion. The 1a
// redesign had the X button delete immediately with no confirm.
// ---------------------------------------------------------------------------
test.describe('Task detail — sub-task delete confirmation', () => {
  const FIXED = '2026-05-24T12:00:00.000Z'; // Sunday — deterministic cycle/week

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(FIXED));
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(async () => {
      const storage = await import('/src/lib/pomodoro-storage.ts');
      await storage.saveTasks([
        {
          id: 'sub1',
          title: 'Task with sub-tasks',
          estimatedPomodoros: 2,
          completedPomodoros: 0,
          isCompleted: false,
          createdAt: '2026-05-18T10:00:00Z',
          todos: [
            { id: 'st1', text: 'Sub-task to delete', completed: false, createdAt: '2026-05-18T10:00:00Z' },
            { id: 'st2', text: 'Keeper sub-task', completed: true, createdAt: '2026-05-19T10:00:00Z' },
          ],
        },
      ]);
    });
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await page.locator('.board-task-card').first().click();
    await expect(page.locator('.task-detail-panel')).toBeVisible();
  });

  test('asks for confirmation before deleting a sub-task, then removes only it on confirm', async ({ page }) => {
    const doomed = page.locator('.todo-text', { hasText: 'Sub-task to delete' });
    await expect(doomed).toBeVisible();

    // Click the X — a confirm modal must appear; deletion is not immediate.
    await page.locator('.delete-sub-btn').first().click();
    await expect(page.locator('.confirm-modal')).toBeVisible();
    await expect(doomed, 'sub-task still present while unconfirmed').toBeVisible();

    // Confirm — the doomed sub-task goes, the sibling stays.
    await page.locator('.confirm-modal button:has-text("Delete")').click();
    await expect(page.locator('.confirm-modal')).toHaveCount(0);
    await expect(doomed).toHaveCount(0);
    await expect(page.locator('.todo-text', { hasText: 'Keeper sub-task' })).toBeVisible();
  });

  test('cancel on the delete confirmation keeps the sub-task', async ({ page }) => {
    const doomed = page.locator('.todo-text', { hasText: 'Sub-task to delete' });
    await page.locator('.delete-sub-btn').first().click();
    await expect(page.locator('.confirm-modal')).toBeVisible();
    await page.locator('.confirm-modal button:has-text("Cancel")').click();
    await expect(page.locator('.confirm-modal')).toHaveCount(0);
    await expect(doomed).toBeVisible();
  });
});
