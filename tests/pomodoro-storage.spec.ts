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

