import { test, expect } from '@playwright/test';

// review-insights lib: pure computations behind the three wizard steps.
// Fixtures are in-memory objects — the module only reads its inputs.

const WEEK_START = '2026-06-08'; // Mon
const WEEK_END = '2026-06-14';   // Sun
const TODAY = '2026-06-20';      // week fully in the past

interface Fixture {
  weekStart: string; weekEnd: string; todayStr: string; cycleId: string;
  tasks: unknown[]; history: unknown[]; habits: unknown[];
  keyResults: unknown[]; objectives: unknown[]; cycles: unknown[]; reviews: unknown[];
  focusDurationMinutes: number;
}

function sessions(taskId: string | null, n: number, date: string): unknown[] {
  return Array.from({ length: n }, (_, i) => ({
    startedAt: `${date}T10:0${i}:00.000Z`, endedAt: `${date}T10:25:00.000Z`,
    type: 'focus', taskId: taskId ?? undefined, completed: true,
  }));
}

function makeFixture(): Fixture {
  return {
    weekStart: WEEK_START, weekEnd: WEEK_END, todayStr: TODAY, cycleId: 'c1',
    focusDurationMinutes: 25,
    cycles: [
      { id: 'c1', name: 'June 2026', month: 5, year: 2026, isActive: true, createdAt: '2026-06-01T00:00:00.000Z' },
      { id: 'c2', name: 'July 2026', month: 6, year: 2026, isActive: false, createdAt: '2026-06-01T00:00:00.000Z' },
    ],
    objectives: [
      { id: 'o1', cycleId: 'c1', title: 'Core', order: 0, createdAt: '2026-06-01T00:00:00.000Z' },
      { id: 'o2', cycleId: 'c2', title: 'Next', order: 0, createdAt: '2026-06-01T00:00:00.000Z' },
    ],
    keyResults: [
      { id: 'krPomos', objectiveId: 'o1', title: 'Focus Pomodoros KR', targetValue: 20, currentValue: 9, unit: 'pomodoros', confidence: 'on_track', completionMode: 'focus_pomodoros', order: 0, createdAt: '', updatedAt: '' },
      { id: 'krTasks', objectiveId: 'o1', title: 'Ship tasks KR', targetValue: 5, currentValue: 2, unit: 'tasks', confidence: 'at_risk', completionMode: 'completed_tasks', order: 1, createdAt: '', updatedAt: '' },
      { id: 'krManual', objectiveId: 'o1', title: 'Manual KR', targetValue: 100, currentValue: 42, unit: '%', confidence: 'not_set', completionMode: 'manual', order: 2, createdAt: '', updatedAt: '' },
      { id: 'krOther', objectiveId: 'o2', title: 'Other cycle KR', targetValue: 10, currentValue: 1, unit: 'pomodoros', confidence: 'on_track', completionMode: 'focus_pomodoros', order: 0, createdAt: '', updatedAt: '' },
    ],
    tasks: [
      { id: 'tA', title: 'A', keyResultId: 'krPomos', isCompleted: false, completedPomodoros: 0, createdAt: '2026-06-01T00:00:00.000Z' },
      { id: 'tB', title: 'B', keyResultId: 'krTasks', isCompleted: true, completedAt: '2026-06-10T09:00:00.000Z', completedPomodoros: 0, createdAt: '2026-06-01T00:00:00.000Z' },
      { id: 'tC', title: 'C', keyResultId: 'krTasks', isCompleted: true, completedAt: '2026-06-03T09:00:00.000Z', completedPomodoros: 0, createdAt: '2026-06-01T00:00:00.000Z' },
      { id: 'tD', title: 'D', keyResultId: 'krPomos', isCompleted: false, completedPomodoros: 0, createdAt: '2026-06-01T00:00:00.000Z' },
      { id: 'tUnlinked', title: 'U', isCompleted: false, completedPomodoros: 0, createdAt: '2026-06-01T00:00:00.000Z' },
      { id: 'tOther', title: 'O', keyResultId: 'krOther', isCompleted: false, completedPomodoros: 0, createdAt: '2026-06-01T00:00:00.000Z' },
    ],
    history: [
      { date: '2026-06-01', completedPomodoros: 4, totalFocusMinutes: 100, tasksCompleted: 0, sessions: sessions('tA', 4, '2026-06-01') },
      { date: '2026-06-08', completedPomodoros: 2, totalFocusMinutes: 50, tasksCompleted: 0, sessions: sessions('tA', 2, '2026-06-08') },
      { date: '2026-06-09', completedPomodoros: 3, totalFocusMinutes: 75, tasksCompleted: 0, sessions: sessions('tA', 3, '2026-06-09') },
      { date: '2026-06-10', completedPomodoros: 1, totalFocusMinutes: 25, tasksCompleted: 1, sessions: sessions('tB', 1, '2026-06-10') },
      { date: '2026-06-13', completedPomodoros: 1, totalFocusMinutes: 25, tasksCompleted: 0, sessions: sessions('tUnlinked', 1, '2026-06-13') },
      { date: '2026-06-14', completedPomodoros: 1, totalFocusMinutes: 25, tasksCompleted: 0, sessions: sessions('tOther', 1, '2026-06-14') },
    ],
    habits: [
      { id: 'h1', name: 'Read', status: 'in_progress', ticks: ['2026-06-09', '2026-06-10'], createdAt: '', updatedAt: '' },
      { id: 'h2', name: 'Stretch', status: 'in_progress', ticks: ['2026-06-10'], createdAt: '', updatedAt: '' },
    ],
    reviews: [
      { id: 'r0', weekStartDate: '2026-05-25', weekEndDate: '2026-05-31', cycleId: 'c1', completedAt: '2026-06-01T08:00:00.000Z',
        entries: [{ keyResultId: 'krTasks', previousValue: 0, currentValue: 1, confidence: 'at_risk' }], prompts: [],
        pomodoroStats: { totalPomodoros: 0, totalFocusMinutes: 0, tasksCompleted: 0, pomodorosByKeyResult: {} } },
      { id: 'r1', weekStartDate: '2026-06-01', weekEndDate: '2026-06-07', cycleId: 'c1', completedAt: '2026-06-08T08:00:00.000Z',
        entries: [
          { keyResultId: 'krTasks', previousValue: 1, currentValue: 1, confidence: 'at_risk' },
          { keyResultId: 'krPomos', previousValue: 0, currentValue: 4, confidence: 'on_track' },
        ],
        prompts: [{ id: 'p1', type: 'one_change', text: 'One change for next week?', answer: 'Block mornings' }],
        pomodoroStats: { totalPomodoros: 4, totalFocusMinutes: 100, tasksCompleted: 0, pomodorosByKeyResult: {} } },
      { id: 'rDraft', weekStartDate: WEEK_START, weekEndDate: WEEK_END, cycleId: 'c1',
        entries: [{ keyResultId: 'krTasks', previousValue: 1, currentValue: 9, confidence: 'off_track' }], prompts: [],
        pomodoroStats: { totalPomodoros: 0, totalFocusMinutes: 0, tasksCompleted: 0, pomodorosByKeyResult: {} } },
    ],
  };
}

async function callInsights<T>(page: import('@playwright/test').Page, fn: string, fixture: Fixture, extra: unknown = undefined): Promise<T> {
  return page.evaluate(async ({ fn, fixture, extra }) => {
    const mod = await import('/src/lib/review-insights.ts') as Record<string, (i: unknown, e?: unknown) => unknown>;
    return mod[fn](fixture, extra) as T;
  }, { fn, fixture, extra });
}

test.describe('review-insights', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
  });

  test('week glance: sessions, focus, task cohort, habits, insight', async ({ page }) => {
    const g = await callInsights<Record<string, any>>(page, 'computeWeekGlance', makeFixture());

    expect(g.sessions).toBe(8);
    expect(g.sessionsPrevWeek).toBe(4);
    expect(g.focusMinutes).toBe(200);
    expect(g.avgFocusMinutesPerDay).toBe(29); // 200 / 7
    expect(g.tasksDone).toBe(1);   // tB completed in-week
    expect(g.tasksCarried).toBe(2); // tA, tD still open
    expect(g.tasksTotal).toBe(3);  // tC completed before the week → excluded
    expect(g.habitsPct).toBe(21);  // 3 ticks / (2 habits × 7 days)
    expect(g.habitsMissedWeekdays).toEqual(['Mon', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(g.sessionsPerDay.map((d: any) => d.sessions)).toEqual([2, 3, 1, 0, 0, 1, 1]);
    expect(g.insight[0]).toBe('Tue carried the week.');
    // Light days: Thu + Fri (Sat/Sun each had one session) — both missed habits.
    expect(g.insight[1]).toBe('The 2 lightest days are the 2 you missed habits on.');
  });

  test('kr moves: as-of deltas, session attribution, others footnote', async ({ page }) => {
    const r = await callInsights<Record<string, any>>(page, 'computeKrMoves', makeFixture());

    expect(r.moves).toHaveLength(2);
    const pomoMove = r.moves.find((m: any) => m.keyResultId === 'krPomos');
    expect(pomoMove).toMatchObject({ startValue: 4, endValue: 9, delta: 5, weekSessions: 5 });
    const taskMove = r.moves.find((m: any) => m.keyResultId === 'krTasks');
    expect(taskMove).toMatchObject({ startValue: 1, endValue: 2, delta: 1, weekSessions: 1 });
    // krManual: no delta, no sessions → the footnote, not the panel.
    // krOther belongs to another cycle → not counted anywhere.
    expect(r.othersNoSessions).toBe(1);
  });

  test('unlinked sessions + derived-KR gate', async ({ page }) => {
    const u = await callInsights<Record<string, any>>(page, 'countWeekSessions', makeFixture());
    expect(u).toEqual({ totalSessions: 8, unlinked: 2, linkedToCycle: 6 });

    const hasDerived = await callInsights<boolean>(page, 'cycleHasDerivedKrs', makeFixture());
    expect(hasDerived).toBe(true);

    const manualOnly = makeFixture();
    manualOnly.keyResults = manualOnly.keyResults.filter((k: any) => k.completionMode === 'manual' || k.id === 'krOther');
    expect(await callInsights<boolean>(page, 'cycleHasDerivedKrs', manualOnly)).toBe(false);
  });

  test('at-risk streaks count consecutive completed reviews and ignore drafts', async ({ page }) => {
    const fixture = makeFixture();
    const streaks = await page.evaluate(async ({ reviews, weekStart }) => {
      const mod = await import('/src/lib/review-insights.ts') as any;
      return Object.fromEntries(mod.computeAtRiskStreaks(reviews, weekStart));
    }, { reviews: fixture.reviews, weekStart: WEEK_START });
    // r1 (06-01) and r0 (05-25) both at_risk for krTasks → streak 2.
    // The 06-08 draft says off_track but drafts never count.
    expect(streaks).toEqual({ krTasks: 2 });
  });

  test('at-risk streaks require two consecutive completed reviews (decision 9)', async ({ page }) => {
    const fixture = makeFixture();
    // Only ONE prior completed review flags krTasks at risk (drop r0).
    fixture.reviews = fixture.reviews.filter(r => r.id !== 'r0');
    const streaks = await page.evaluate(async ({ reviews, weekStart }) => {
      const mod = await import('/src/lib/review-insights.ts') as any;
      return Object.fromEntries(mod.computeAtRiskStreaks(reviews, weekStart));
    }, { reviews: fixture.reviews, weekStart: WEEK_START });
    expect(streaks).toEqual({});
  });

  test('reflect prompts: at-risk first, mover second, one-change always, cap 3', async ({ page }) => {
    const prompts = await callInsights<any[]>(page, 'buildReflectPrompts', makeFixture());

    expect(prompts).toHaveLength(3);
    expect(prompts[0].type).toBe('at_risk');
    expect(prompts[0].keyResultId).toBe('krTasks');
    expect(prompts[0].text).toBe('Ship tasks KR has been at risk 2 weeks running. What is in the way?');
    expect(prompts[1].type).toBe('mover');
    expect(prompts[1].text).toBe('Focus Pomodoros KR moved 4 → 9. What made that possible?');
    expect(prompts[2]).toMatchObject({ type: 'one_change', text: 'One change for next week?' });
  });

  test('reflect prompts: free fallback when nothing notable happened', async ({ page }) => {
    const quiet = makeFixture();
    // Nothing notable: no completed reviews (no at-risk streaks), no sessions
    // or task completions (no mover).
    quiet.reviews = [];
    quiet.history = [];
    quiet.tasks = quiet.tasks.map((t: any) => ({ ...t, isCompleted: false, completedAt: undefined }));
    const prompts = await callInsights<any[]>(page, 'buildReflectPrompts', quiet);

    expect(prompts).toHaveLength(2);
    expect(prompts[0].type).toBe('free');
    expect(prompts[1].type).toBe('one_change');
  });

  test('previousWeekCommitment reads only the immediately previous week (decision 7)', async ({ page }) => {
    const fixture = makeFixture();
    // r1 (06-01) is the immediately-previous review; blank its answer and
    // give the OLDER r0 (05-25) one — the older answer must NOT surface
    // under "Last week you committed to".
    fixture.reviews = fixture.reviews.map((r: any) => {
      if (r.id === 'r1') {
        return { ...r, prompts: r.prompts.map((p: any) => p.type === 'one_change' ? { ...p, answer: '' } : p) };
      }
      if (r.id === 'r0') {
        return { ...r, prompts: [{ id: 'p-old', type: 'one_change', text: 'One change for next week?', answer: 'Old commitment' }] };
      }
      return r;
    });
    const result = await page.evaluate(async ({ reviews, weekStart }) => {
      const mod = await import('/src/lib/review-insights.ts') as any;
      return mod.previousWeekCommitment(reviews, weekStart);
    }, { reviews: fixture.reviews, weekStart: WEEK_START });
    expect(result).toBeNull();
  });

  test('previousWeekCommitment: latest completed week’s one-change answer', async ({ page }) => {
    const fixture = makeFixture();
    const answer = await page.evaluate(async ({ reviews, weekStart }) => {
      const mod = await import('/src/lib/review-insights.ts') as any;
      return mod.previousWeekCommitment(reviews, weekStart);
    }, { reviews: fixture.reviews, weekStart: WEEK_START });
    expect(answer).toBe('Block mornings');

    const none = makeFixture();
    none.reviews = [];
    const empty = await page.evaluate(async ({ reviews, weekStart }) => {
      const mod = await import('/src/lib/review-insights.ts') as any;
      return mod.previousWeekCommitment(reviews, weekStart);
    }, { reviews: none.reviews, weekStart: WEEK_START });
    expect(empty).toBeNull();
  });
});
