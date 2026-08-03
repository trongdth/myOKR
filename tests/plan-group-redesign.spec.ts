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

test.describe('Plan Group Redesign — default cycle is the newest', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(FIXED));
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  // Bug #3: the Plan group must default to the NEWEST cycle. The old
  // resolveCurrentCycle fell back to a stale `isActive` flag, so when the
  // current calendar month has no cycle and isActive still points at an older
  // cycle, the screen showed the old one instead of the newest.
  test('resolveCurrentCycle returns the newest when no current-month cycle and isActive is stale', async ({ page }) => {
    const res = await page.evaluate(async () => {
      const { resolveCurrentCycle } = await import('/src/lib/okr-storage.ts');
      // FIXED = 2026-05 (May). Neither cycle is May, so the current-month
      // branch is skipped. isActive is stale on the older January cycle.
      const cycles = [
        { id: 'old',  name: 'Jan 2024', month: 0, year: 2024, isActive: true,  createdAt: '2024-01-01T00:00:00Z' },
        { id: 'new',  name: 'Jun 2024', month: 5, year: 2024, isActive: false, createdAt: '2024-06-01T00:00:00Z' },
      ];
      const resolved = resolveCurrentCycle(cycles);
      return resolved ? { id: resolved.id, month: resolved.month, year: resolved.year } : null;
    });

    // Newest = June 2024, NOT the isActive January cycle.
    expect(res).toEqual({ id: 'new', month: 5, year: 2024 });
  });

  test('resolveCurrentCycle still prefers a current-month cycle when one exists', async ({ page }) => {
    const res = await page.evaluate(async () => {
      const { resolveCurrentCycle } = await import('/src/lib/okr-storage.ts');
      // FIXED = 2026-05 (May). A May cycle exists and is NOT the active one,
      // yet it must still win (normal behaviour unchanged).
      const cycles = [
        { id: 'jan', name: 'Jan 2026', month: 0, year: 2026, isActive: true,  createdAt: '2026-01-01T00:00:00Z' },
        { id: 'may', name: 'May 2026', month: 4, year: 2026, isActive: false, createdAt: '2026-05-01T00:00:00Z' },
      ];
      const resolved = resolveCurrentCycle(cycles);
      return resolved ? { id: resolved.id } : null;
    });

    expect(res).toEqual({ id: 'may' });
  });
});

test.describe('Plan Group Redesign — task detail opens centered (bug #2)', () => {
  const FIXED = '2026-05-24T12:00:00.000Z';

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
          id: 'td1',
          title: 'Open me',
          estimatedPomodoros: 2,
          completedPomodoros: 0,
          isCompleted: false,
          createdAt: '2026-05-18T10:00:00Z',
        },
      ]);
    });
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await page.locator('.board-task-card').first().click();
    await expect(page.locator('.task-detail-panel')).toBeVisible();
  });

  test('overlay covers the whole viewport', async ({ page }) => {
    const vp = page.viewportSize()!;
    const box = await page.locator('.app-modal-overlay').boundingBox();

    expect(box).not.toBeNull();
    // A real modal backdrop is fixed and fills the screen.
    expect(box!.x).toBeLessThanOrEqual(1);
    expect(box!.y).toBeLessThanOrEqual(1);
    expect(box!.width).toBeGreaterThanOrEqual(vp.width - 1);
    expect(box!.height).toBeGreaterThanOrEqual(vp.height - 1);
  });

  test('the detail panel is centered on screen', async ({ page }) => {
    const vp = page.viewportSize()!;
    const box = await page.locator('.task-detail-panel').boundingBox();

    expect(box).not.toBeNull();
    const centerX = box!.x + box!.width / 2;
    const centerY = box!.y + box!.height / 2;

    // Centered horizontally (tight) and vertically (looser — tall panels).
    expect(Math.abs(centerX - vp.width / 2)).toBeLessThanOrEqual(16);
    expect(Math.abs(centerY - vp.height / 2)).toBeLessThanOrEqual(48);
  });
});
