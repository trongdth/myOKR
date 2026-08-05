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
// updatedAt (Task-detail footer "updated X ago") — stamped centrally in
// handleTasksChange on every edit path. Regression test for the stamp: editing
// a task must persist updatedAt (the clock is frozen at FIXED, so it == FIXED).
// ---------------------------------------------------------------------------
test.describe('Task detail — updatedAt stamp on edit', () => {
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
        { id: 'td1', title: 'Original', estimatedPomodoros: 2, completedPomodoros: 0, isCompleted: false, createdAt: '2026-05-18T10:00:00Z' },
      ]);
    });
    // The app reads tasks on mount; saveTasks above writes storage but doesn't
    // re-render, so reload to mount fresh with the seeded task (otherwise a
    // prior test's task stays on the board).
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await page.locator('.board-task-card').first().click();
    await expect(page.locator('.task-detail-panel')).toBeVisible();
  });

  test('editing the title stamps updatedAt and persists it', async ({ page }) => {
    const before = await page.evaluate(async () => {
      const s = await import('/src/lib/pomodoro-storage.ts');
      return (await s.loadTasks()).find(t => t.id === 'td1');
    });
    expect(before?.updatedAt).toBeUndefined();

    await page.locator('.detail-title').click();
    const input = page.locator('.detail-title-input');
    await input.fill('Edited title');
    await input.press('Enter');

    const after = await page.evaluate(async () => {
      const s = await import('/src/lib/pomodoro-storage.ts');
      return (await s.loadTasks()).find(t => t.id === 'td1');
    });
    expect(after?.title).toBe('Edited title');
    expect(after?.updatedAt).toBe(FIXED); // clock frozen → stamp == FIXED
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

// ---------------------------------------------------------------------------
// Sub-task reorder via HTML5 drag-and-drop (amends ADR-0010 to permit in-list
// reordering; PrioritizeModal already uses HTML5 DnD as precedent). Dropping a
// row onto another inserts it ABOVE the target (reorderTodoItems semantics).
// ---------------------------------------------------------------------------
test.describe('Task detail — sub-task drag-and-drop reorder', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(FIXED));
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(async () => {
      const storage = await import('/src/lib/pomodoro-storage.ts');
      await storage.saveTasks([{
        id: 'td1', title: 'Reorder me', estimatedPomodoros: 2, completedPomodoros: 0, isCompleted: false,
        createdAt: '2026-05-18T10:00:00Z',
        todos: [
          { id: 's1', text: 'Sub A', completed: false, createdAt: '2026-05-18T10:00:00Z' },
          { id: 's2', text: 'Sub B', completed: false, createdAt: '2026-05-18T10:00:00Z' },
          { id: 's3', text: 'Sub C', completed: false, createdAt: '2026-05-18T10:00:00Z' },
        ],
      }]);
    });
    // Reload so the board shows the freshly-seeded task, not a prior test's.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await page.locator('.board-task-card').first().click();
    await expect(page.locator('.task-detail-panel')).toBeVisible();
  });

  test('click-select reorder: pick up a sub-task, click a row to place it above', async ({ page }) => {
    const texts = page.locator('.todos-list .todo-text');
    await expect(texts).toHaveText(['Sub A', 'Sub B', 'Sub C']);

    // Click-select (WKWebView can't start HTML5 drags in scroll regions — see
    // docs/design-system.md): grip click picks C up, clicking A places C above.
    const gripC = page.locator('.todos-list .todo-item-row').nth(2).locator('.todo-grip');
    const rowA = page.locator('.todos-list .todo-item-row').nth(0);
    await gripC.click();
    await expect(page.locator('.reorder-hint')).toBeVisible();
    await rowA.click();

    await expect(texts).toHaveText(['Sub C', 'Sub A', 'Sub B']);
  });
});
