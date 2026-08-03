import { test, expect } from '@playwright/test';

// ADR-0012 — presentational cycle rollover:
//   - a task's cycle membership is derived from its key result's cycle
//   - unlinked tasks belong to no cycle → always "in this cycle"
//   - "in this cycle" = KR cycle is the active cycle or any already-ended cycle
//   - no data migration ever runs

test.describe('isTaskInCycle (ADR-0012 presentational rollover)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('unlinked tasks are always in cycle', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const storage = await import('/src/lib/pomodoro-storage.ts');
      const task = {
        id: 't1',
        title: 'No KR',
        estimatedPomodoros: 1,
        completedPomodoros: 0,
        isCompleted: false,
        createdAt: '2026-05-01T10:00:00Z',
      };
      // No keyResultId on the task
      const active = { month: 5, year: 2026 };
      return storage.isTaskInCycle(task, undefined, active);
    });
    expect(result).toBe(true);
  });

  test('KR from the active cycle is in cycle', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const storage = await import('/src/lib/pomodoro-storage.ts');
      const task = {
        id: 't1',
        title: 'Active KR task',
        keyResultId: 'kr1',
        estimatedPomodoros: 1,
        completedPomodoros: 0,
        isCompleted: false,
        createdAt: '2026-05-01T10:00:00Z',
      };
      return storage.isTaskInCycle(task, { month: 5, year: 2026 }, { month: 5, year: 2026 });
    });
    expect(result).toBe(true);
  });

  test('KR from an already-ended cycle rolls over (presentational, no migration)', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const storage = await import('/src/lib/pomodoro-storage.ts');
      const task = {
        id: 't1',
        title: 'Rolled over from May',
        keyResultId: 'kr1',
        estimatedPomodoros: 1,
        completedPomodoros: 0,
        isCompleted: false,
        createdAt: '2026-05-01T10:00:00Z',
      };
      // May 2026 ended; active cycle is June 2026
      return storage.isTaskInCycle(task, { month: 4, year: 2026 }, { month: 5, year: 2026 });
    });
    expect(result).toBe(true);
  });

  test('KR from a future cycle is NOT in cycle', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const storage = await import('/src/lib/pomodoro-storage.ts');
      const task = {
        id: 't1',
        title: 'Future cycle task',
        keyResultId: 'kr1',
        estimatedPomodoros: 1,
        completedPomodoros: 0,
        isCompleted: false,
        createdAt: '2026-05-01T10:00:00Z',
      };
      // July 2026 is after the active May 2026 cycle
      return storage.isTaskInCycle(task, { month: 6, year: 2026 }, { month: 4, year: 2026 });
    });
    expect(result).toBe(false);
  });

  test('KR with unknown cycle is kept (never hides a task)', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const storage = await import('/src/lib/pomodoro-storage.ts');
      const task = {
        id: 't1',
        title: 'Orphaned KR link',
        keyResultId: 'kr-gone',
        estimatedPomodoros: 1,
        completedPomodoros: 0,
        isCompleted: false,
        createdAt: '2026-05-01T10:00:00Z',
      };
      return storage.isTaskInCycle(task, undefined, { month: 5, year: 2026 });
    });
    expect(result).toBe(true);
  });

  test('no active cycle → everything is in cycle', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const storage = await import('/src/lib/pomodoro-storage.ts');
      const task = {
        id: 't1',
        title: 'No active cycle',
        keyResultId: 'kr1',
        estimatedPomodoros: 1,
        completedPomodoros: 0,
        isCompleted: false,
        createdAt: '2026-05-01T10:00:00Z',
      };
      return storage.isTaskInCycle(task, { month: 4, year: 2026 }, null);
    });
    expect(result).toBe(true);
  });

  test('buildKrCycleMap resolves KR → cycle via objective linkage', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const storage = await import('/src/lib/pomodoro-storage.ts');
      const map = storage.buildKrCycleMap(
        [
          { id: 'kr1', objectiveId: 'obj1', title: 'KR 1', targetValue: 10, currentValue: 2 },
          { id: 'kr2', objectiveId: 'obj-missing', title: 'KR 2', targetValue: 10, currentValue: 2 },
        ],
        [{ id: 'obj1', cycleId: 'cyc1', title: 'Obj 1', order: 0, createdAt: 'x' }],
        [
          { id: 'cyc1', name: 'May 2026', month: 4, year: 2026, isActive: true, createdAt: 'x' },
          { id: 'cyc2', name: 'June 2026', month: 5, year: 2026, isActive: false, createdAt: 'x' },
        ],
      );
      const kr1Cycle = map.get('kr1');
      const kr2Cycle = map.get('kr2');
      return {
        kr1: kr1Cycle ? `${kr1Cycle.month}/${kr1Cycle.year}` : null,
        kr2: kr2Cycle ? `${kr2Cycle.month}/${kr2Cycle.year}` : null,
      };
    });
    expect(result).toEqual({ kr1: '4/2026', kr2: null });
  });
});
