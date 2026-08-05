import { test, expect } from '@playwright/test';

// Option C: a pomodoro session is the unit of work — completing the last
// estimated pomodoro finishes the task (flips isCompleted). Tested as a pure
// helper (applyPomodoroCompletion) so the rule is deterministic and not gated
// behind driving the real timer to zero. This is what keeps `isCompleted` from
// drifting out of sync with pomodoro progress, so the Today backlog count
// (`!isCompleted && !delete`) stays honest without a `remaining > 0` gate.

const FIXED = '2026-05-24T12:00:00.000Z';

async function apply(page: import('@playwright/test').Page, task: Record<string, unknown>) {
  return page.evaluate(async ({ task, now }) => {
    const mod = await import('/src/lib/pomodoro-storage.ts') as {
      applyPomodoroCompletion: (t: Record<string, unknown>, now: string) => Record<string, unknown>;
    };
    const r = mod.applyPomodoroCompletion(task, now);
    return {
      completedPomodoros: r.completedPomodoros,
      isCompleted: r.isCompleted,
      completedAt: r.completedAt,
    };
  }, { task, now: FIXED });
}

test.describe('applyPomodoroCompletion', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(FIXED));
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('below the estimate: increments pomodoros, stays open', async ({ page }) => {
    const r = await apply(page, { id: 't', estimatedPomodoros: 3, completedPomodoros: 1, isCompleted: false });
    expect(r).toEqual({ completedPomodoros: 2, isCompleted: false, completedAt: undefined });
  });

  test('reaches the estimate: marks the task complete with a timestamp', async ({ page }) => {
    const r = await apply(page, { id: 't', estimatedPomodoros: 3, completedPomodoros: 2, isCompleted: false });
    expect(r).toEqual({ completedPomodoros: 3, isCompleted: true, completedAt: FIXED });
  });

  test('already complete: keeps incrementing without resetting the completion time', async ({ page }) => {
    const r = await apply(page, {
      id: 't', estimatedPomodoros: 3, completedPomodoros: 3, isCompleted: true,
      completedAt: '2026-05-20T00:00:00.000Z',
    });
    expect(r).toEqual({ completedPomodoros: 4, isCompleted: true, completedAt: '2026-05-20T00:00:00.000Z' });
  });

  test('heals drift: a finished-but-unmarked task completes on the next session', async ({ page }) => {
    // Pre-fix data: pomodoros already at the estimate but isCompletion never flipped.
    // One more recorded completion should heal it.
    const r = await apply(page, { id: 't', estimatedPomodoros: 3, completedPomodoros: 3, isCompleted: false });
    expect(r).toEqual({ completedPomodoros: 4, isCompleted: true, completedAt: FIXED });
  });
});

test.describe('computeFocusStreak', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(FIXED));
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('calculates streak using local dates and explicit sorting', async ({ page }) => {
    const streak = await page.evaluate(async () => {
      const mod = await import('/src/lib/pomodoro-storage.ts') as {
        computeFocusStreak: (
          history: Array<{ date: string; completedPomodoros: number }>,
          now?: Date,
        ) => { current: number; best: number };
      };
      const history = [
        { date: '2026-05-24', completedPomodoros: 1 },
        { date: '2026-05-23', completedPomodoros: 2 },
        { date: '2026-05-22', completedPomodoros: 1 },
      ];
      return mod.computeFocusStreak(history, new Date('2026-05-24T10:00:00'));
    });
    expect(streak).toEqual({ current: 3, best: 3 });
  });
});

test.describe('completePomodoroForTask', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(FIXED));
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('preserves newly added tasks when completing a pomodoro for an active task', async ({ page }) => {
    const result = await page.evaluate(async ({ now }) => {
      const pomoStorage = await import('/src/lib/pomodoro-storage.ts');
      
      // Seed initial active task
      await pomoStorage.saveTasks([
        { id: 'task-active', title: 'Active Task', estimatedPomodoros: 2, completedPomodoros: 0, isCompleted: false, createdAt: now },
      ]);

      // Concurrently add a new task (simulating task added while timer was running)
      const currentTasks = await pomoStorage.loadTasks();
      await pomoStorage.saveTasks([
        ...currentTasks,
        { id: 'task-new', title: 'Newly Added Task', estimatedPomodoros: 1, completedPomodoros: 0, isCompleted: false, createdAt: now },
      ]);

      // Complete a pomodoro session for task-active
      const updated = await pomoStorage.completePomodoroForTask('task-active', now);

      // Verify Automerge persistence contains BOTH tasks
      const loaded = await pomoStorage.loadTasks();
      return { updated, loaded };
    }, { now: FIXED });

    expect(result.loaded).toHaveLength(2);
    expect(result.loaded.find(t => t.id === 'task-active')?.completedPomodoros).toBe(1);
    expect(result.loaded.find(t => t.id === 'task-new')?.title).toBe('Newly Added Task');
  });
});

test.describe('recordSessionInHistory (rule 11 — in-place, no root-array overwrite)', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(FIXED));
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('appends a focus session to today in-place, preserving other days', async ({ page }) => {
    const result = await page.evaluate(async ({ now }) => {
      const pomoStorage = await import('/src/lib/pomodoro-storage.ts');
      const today = pomoStorage.getTodayRecord([]);
      const otherDay = {
        date: '2026-05-10', completedPomodoros: 5, totalFocusMinutes: 125, tasksCompleted: 1,
        sessions: [{ startedAt: now, endedAt: now, type: 'focus', completed: true }],
      };
      await pomoStorage.saveHistory([today, otherDay]);
      // Record a focus session — must mutate today in-place, never overwrite d.history.
      const updated = await pomoStorage.recordSessionInHistory(
        { startedAt: now, endedAt: now, type: 'focus', taskId: 't1', completed: true },
        25,
      );
      return { updated, todayDate: today.date };
    }, { now: FIXED });

    const today = result.updated.find(r => r.date === result.todayDate)!;
    expect(today.sessions).toHaveLength(1);
    expect(today.sessions[0].type).toBe('focus');
    expect(today.completedPomodoros).toBe(1);
    expect(today.totalFocusMinutes).toBe(25);

    const other = result.updated.find(r => r.date === '2026-05-10');
    expect(other?.completedPomodoros).toBe(5); // preserved — not blown away
  });

  test('records a break session without bumping focus counts', async ({ page }) => {
    const result = await page.evaluate(async ({ now }) => {
      const pomoStorage = await import('/src/lib/pomodoro-storage.ts');
      const today = pomoStorage.getTodayRecord([]);
      today.completedPomodoros = 1;
      today.totalFocusMinutes = 25;
      today.sessions = [{ startedAt: now, endedAt: now, type: 'focus', taskId: 't1', completed: true }];
      await pomoStorage.saveHistory([today]);
      const updated = await pomoStorage.recordSessionInHistory(
        { startedAt: now, endedAt: now, type: 'shortBreak', completed: true },
        0,
      );
      return { updated, todayDate: today.date };
    }, { now: FIXED });

    const today = result.updated.find(r => r.date === result.todayDate)!;
    expect(today.sessions).toHaveLength(2);
    expect(today.completedPomodoros).toBe(1); // a break doesn't bump focus counts
    expect(today.totalFocusMinutes).toBe(25); // a break doesn't add focus minutes
  });
});

// reorderTodoItems — sub-task click-select reorder (ADR-0010: no drag-drop).
// Pure array helper: lift `movingId` to sit immediately ABOVE `targetId`.
test.describe('reorderTodoItems', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(FIXED));
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  const call = (page: import('@playwright/test').Page, ids: string[], movingId: string, targetId: string) =>
    page.evaluate(async ({ ids, movingId, targetId }) => {
      const mod = await import('/src/lib/pomodoro-storage.ts') as {
        reorderTodoItems: (todos: Array<{ id: string; text: string }>, movingId: string, targetId: string) => Array<{ id: string }>;
      };
      const todos = ids.map(id => ({ id, text: id.toUpperCase() }));
      return mod.reorderTodoItems(todos, movingId, targetId).map(t => t.id);
    }, { ids, movingId, targetId });

  test('lifts an item above the target (C above A)', async ({ page }) => {
    expect(await call(page, ['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
  });

  test('lifts a middle item above the first (B above A)', async ({ page }) => {
    expect(await call(page, ['a', 'b', 'c'], 'b', 'a')).toEqual(['b', 'a', 'c']);
  });

  test('already directly above the target → unchanged', async ({ page }) => {
    expect(await call(page, ['a', 'b', 'c'], 'a', 'b')).toEqual(['a', 'b', 'c']);
  });

  test('movingId === targetId → no-op', async ({ page }) => {
    expect(await call(page, ['a', 'b', 'c'], 'b', 'b')).toEqual(['a', 'b', 'c']);
  });

  test('unknown movingId → unchanged', async ({ page }) => {
    expect(await call(page, ['a', 'b', 'c'], 'x', 'a')).toEqual(['a', 'b', 'c']);
  });

  test('unknown targetId → unchanged', async ({ page }) => {
    expect(await call(page, ['a', 'b', 'c'], 'a', 'x')).toEqual(['a', 'b', 'c']);
  });
});


test.describe('resolveSessionEndedAt', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(FIXED));
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  const THRESHOLD = 30_000;

  async function endedAt(
    page: import('@playwright/test').Page,
    estimateEndMs: number | null,
    nowMs: number,
  ): Promise<string> {
    return page.evaluate(async ({ estimateEndMs, nowMs, THRESHOLD }) => {
      const mod = await import('/src/lib/pomodoro-storage.ts') as {
        resolveSessionEndedAt: (e: number | null, n: number, t: number) => string;
      };
      return mod.resolveSessionEndedAt(estimateEndMs, nowMs, THRESHOLD);
    }, { estimateEndMs, nowMs, THRESHOLD });
  }

  test('on-time completion (delivered ~1s after the end) uses now', async ({ page }) => {
    const now = new Date(FIXED).getTime();
    // The tick placed the true end 1s ago; the completion arrives on schedule.
    expect(await endedAt(page, now - 1000, now)).toBe(new Date(now).toISOString());
  });

  test('late completion (missed event, processed much later) uses the true end', async ({ page }) => {
    const now = new Date(FIXED).getTime();
    // The timer ended 2h ago; the completion is only processed now.
    expect(await endedAt(page, now - 2 * 3600_000, now)).toBe(new Date(now - 2 * 3600_000).toISOString());
  });

  test('no estimate (never started / estimate cleared) uses now', async ({ page }) => {
    const now = new Date(FIXED).getTime();
    expect(await endedAt(page, null, now)).toBe(new Date(now).toISOString());
  });

  test('boundary: late by exactly the threshold is still on time', async ({ page }) => {
    const now = new Date(FIXED).getTime();
    expect(await endedAt(page, now - THRESHOLD, now)).toBe(new Date(now).toISOString());
    expect(await endedAt(page, now - THRESHOLD - 1, now)).toBe(new Date(now - THRESHOLD - 1).toISOString());
  });
});
