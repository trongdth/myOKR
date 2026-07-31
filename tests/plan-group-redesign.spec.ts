import { test, expect } from '@playwright/test';

const FIXED = '2026-05-24T12:00:00.000Z';

test.describe('Plan Group Redesign — Task Bucket & Importance Helper', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(FIXED));
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('normalizes task bucket and dueDate with defaults', async ({ page }) => {
    const res = await page.evaluate(async () => {
      const storage = await import('/src/lib/pomodoro-storage.ts');

      await storage.saveTasks([
        { id: 't1', title: 'Task 1', estimatedPomodoros: 2, completedPomodoros: 0, isCompleted: false, createdAt: '2026-05-24T10:00:00Z' },
        { id: 't2', title: 'Task 2', bucket: 'today', dueDate: '2026-05-28', estimatedPomodoros: 1, completedPomodoros: 0, isCompleted: false, createdAt: '2026-05-24T10:00:00Z' },
      ]);

      const loaded = await storage.loadTasks();
      return loaded.map(t => ({ id: t.id, bucket: t.bucket, dueDate: t.dueDate }));
    });

    expect(res).toEqual([
      { id: 't1', bucket: 'backlog', dueDate: undefined },
      { id: 't2', bucket: 'today', dueDate: '2026-05-28' },
    ]);
  });

  test('calculates computeTaskImportance correctly', async ({ page }) => {
    const importance = await page.evaluate(async () => {
      const storage = await import('/src/lib/pomodoro-storage.ts');

      const taskToday = {
        id: 't1',
        title: 'High priority today',
        category: 'do' as const,
        bucket: 'today' as const,
        estimatedPomodoros: 4,
        completedPomodoros: 2,
        isCompleted: false,
        createdAt: '2026-05-24T10:00:00Z',
      };

      const taskBacklog = {
        id: 't2',
        title: 'Low priority backlog',
        category: 'delete' as const,
        bucket: 'backlog' as const,
        estimatedPomodoros: 2,
        completedPomodoros: 0,
        isCompleted: false,
        createdAt: '2026-05-24T10:00:00Z',
      };

      const score1 = storage.computeTaskImportance(taskToday);
      const score2 = storage.computeTaskImportance(taskBacklog);

      return { score1, score2 };
    });

    expect(importance.score1).toBeGreaterThan(importance.score2);
  });
});
