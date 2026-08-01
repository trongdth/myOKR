import { test, expect } from '@playwright/test';

// Weekly pomodoro plan (P4 — Task detail): `weeklyPomodoroPlan` on
// PomodoroTask, "POMODOROS THIS WEEK — X / Y planned" + "Change weekly plan".
// Seams confirmed with the user: A) normalizer/persistence, B) pure helper,
// C) TaskDetailModal UI.

test.describe('Weekly pomodoro plan — storage (Seam A)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('normalizeTask cleans a non-numeric weeklyPomodoroPlan to undefined', async ({ page }) => {
    const res = await page.evaluate(async () => {
      const storage = await import('/src/lib/pomodoro-storage.ts');
      await storage.saveTasks([
        {
          id: 't1',
          title: 'Task',
          weeklyPomodoroPlan: '20', // garbage: string, not number
          estimatedPomodoros: 4,
          completedPomodoros: 0,
          isCompleted: false,
          createdAt: '2026-05-24T10:00:00Z',
        },
      ]);
      const loaded = await storage.loadTasks();
      return loaded[0].weeklyPomodoroPlan;
    });
    expect(res).toBeUndefined();
  });

  test('valid weeklyPomodoroPlan survives the save→load round trip', async ({ page }) => {
    const res = await page.evaluate(async () => {
      const storage = await import('/src/lib/pomodoro-storage.ts');
      await storage.saveTasks([
        {
          id: 't1',
          title: 'Task',
          weeklyPomodoroPlan: 20,
          estimatedPomodoros: 4,
          completedPomodoros: 0,
          isCompleted: false,
          createdAt: '2026-05-24T10:00:00Z',
        },
      ]);
      const loaded = await storage.loadTasks();
      return loaded[0].weeklyPomodoroPlan;
    });
    expect(res).toBe(20);
  });

  test('absent weeklyPomodoroPlan stays undefined (no default injected)', async ({ page }) => {
    const res = await page.evaluate(async () => {
      const storage = await import('/src/lib/pomodoro-storage.ts');
      await storage.saveTasks([
        {
          id: 't1',
          title: 'Task',
          estimatedPomodoros: 4,
          completedPomodoros: 0,
          isCompleted: false,
          createdAt: '2026-05-24T10:00:00Z',
        },
      ]);
      const loaded = await storage.loadTasks();
      return loaded[0].weeklyPomodoroPlan;
    });
    expect(res).toBeUndefined();
  });

  test('runaway weeklyPomodoroPlan is clamped to the 99 cap (normalizer convention)', async ({ page }) => {
    const res = await page.evaluate(async () => {
      const storage = await import('/src/lib/pomodoro-storage.ts');
      await storage.saveTasks([
        {
          id: 't1',
          title: 'Task',
          weeklyPomodoroPlan: 500, // > 99 cap → tamed, like estimatedPomodoros
          estimatedPomodoros: 4,
          completedPomodoros: 0,
          isCompleted: false,
          createdAt: '2026-05-24T10:00:00Z',
        },
      ]);
      const loaded = await storage.loadTasks();
      return loaded[0].weeklyPomodoroPlan;
    });
    expect(res).toBe(99);
  });
});

test.describe('Weekly pomodoro plan — helper (Seam B)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('weeklyPlanProgress counts completed focus sessions in range and uses the plan', async ({ page }) => {
    const res = await page.evaluate(async () => {
      const storage = await import('/src/lib/pomodoro-storage.ts');
      const task = {
        id: 't1',
        title: 'Task',
        weeklyPomodoroPlan: 5,
        estimatedPomodoros: 4,
        completedPomodoros: 0,
        isCompleted: false,
        createdAt: '2026-05-18T10:00:00Z',
      };
      const history = [
        {
          date: '2026-05-19',
          completedPomodoros: 1,
          totalFocusMinutes: 25,
          tasksCompleted: 0,
          sessions: [
            { startedAt: '2026-05-19T10:00:00Z', endedAt: '2026-05-19T10:25:00Z', type: 'focus', taskId: 't1', completed: true },
          ],
        },
        {
          date: '2026-05-21',
          completedPomodoros: 1,
          totalFocusMinutes: 50,
          tasksCompleted: 0,
          sessions: [
            { startedAt: '2026-05-21T10:00:00Z', endedAt: '2026-05-21T10:25:00Z', type: 'focus', taskId: 't1', completed: true },
            // not completed → excluded
            { startedAt: '2026-05-21T11:00:00Z', endedAt: '2026-05-21T11:25:00Z', type: 'focus', taskId: 't1', completed: false },
            // break → excluded
            { startedAt: '2026-05-21T12:00:00Z', endedAt: '2026-05-21T12:05:00Z', type: 'shortBreak', taskId: 't1', completed: true },
            // another task → excluded
            { startedAt: '2026-05-21T13:00:00Z', endedAt: '2026-05-21T13:25:00Z', type: 'focus', taskId: 't2', completed: true },
          ],
        },
        {
          date: '2026-05-25', // outside the week
          completedPomodoros: 1,
          totalFocusMinutes: 25,
          tasksCompleted: 0,
          sessions: [
            { startedAt: '2026-05-25T10:00:00Z', endedAt: '2026-05-25T10:25:00Z', type: 'focus', taskId: 't1', completed: true },
          ],
        },
      ];
      return storage.weeklyPlanProgress(task, history, '2026-05-18', '2026-05-24');
    });
    expect(res).toEqual({ completed: 2, planned: 5 });
  });

  test('weeklyPlanProgress falls back to the estimate when no plan is set', async ({ page }) => {
    const res = await page.evaluate(async () => {
      const storage = await import('/src/lib/pomodoro-storage.ts');
      const task = {
        id: 't1',
        title: 'Task',
        estimatedPomodoros: 4,
        completedPomodoros: 0,
        isCompleted: false,
        createdAt: '2026-05-18T10:00:00Z',
      };
      return storage.weeklyPlanProgress(task, [], '2026-05-18', '2026-05-24');
    });
    expect(res).toEqual({ completed: 0, planned: 4 });
  });

  test('weeklyPlanProgress respects an explicit plan of 0 (no fallback)', async ({ page }) => {
    const res = await page.evaluate(async () => {
      const storage = await import('/src/lib/pomodoro-storage.ts');
      const task = {
        id: 't1',
        title: 'Task',
        weeklyPomodoroPlan: 0,
        estimatedPomodoros: 4,
        completedPomodoros: 0,
        isCompleted: false,
        createdAt: '2026-05-18T10:00:00Z',
      };
      return storage.weeklyPlanProgress(task, [], '2026-05-18', '2026-05-24');
    });
    expect(res).toEqual({ completed: 0, planned: 0 });
  });
});

test.describe('Weekly pomodoro plan — task detail modal (Seam C)', () => {
  const FIXED = '2026-05-24T12:00:00.000Z'; // Sunday — week is Mon 18 – Sun 24 May

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
          id: 'wp1',
          title: 'Weekly plan task',
          weeklyPomodoroPlan: 5,
          estimatedPomodoros: 4,
          completedPomodoros: 2,
          isCompleted: false,
          createdAt: '2026-05-18T10:00:00Z',
        },
      ]);
      await storage.saveHistory([
        {
          date: '2026-05-19',
          completedPomodoros: 2,
          totalFocusMinutes: 50,
          tasksCompleted: 0,
          sessions: [
            { startedAt: '2026-05-19T10:00:00Z', endedAt: '2026-05-19T10:25:00Z', type: 'focus', taskId: 'wp1', completed: true },
            { startedAt: '2026-05-19T11:00:00Z', endedAt: '2026-05-19T11:25:00Z', type: 'focus', taskId: 'wp1', completed: true },
          ],
        },
      ]);
    });
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await page.locator('.board-task-card').first().click();
  });

  test('shows POMODOROS THIS WEEK with completed-this-week / planned', async ({ page }) => {
    await expect(page.locator('.weekly-plan-block')).toContainText('POMODOROS THIS WEEK');
    await expect(page.locator('.weekly-plan-readout')).toHaveText('2 / 5 planned');
    await expect(page.locator('.weekly-plan-edit-btn')).toHaveText('Change weekly plan');
  });

  test('Change weekly plan edits and persists across reload', async ({ page }) => {
    await page.locator('.weekly-plan-edit-btn').click();
    const input = page.locator('.weekly-plan-input');
    await input.fill('7');
    await page.locator('.weekly-plan-save-btn').click();
    await expect(page.locator('.weekly-plan-readout')).toHaveText('2 / 7 planned');

    // Persistence: reload and reopen the task
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await page.locator('.board-task-card').first().click();
    await expect(page.locator('.weekly-plan-readout')).toHaveText('2 / 7 planned');
  });
});
