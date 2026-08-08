import { test, expect } from '@playwright/test';

const FIXED_TIME = new Date('2026-05-24T12:00:00.000Z');

/**
 * Pure data tests for the Habits tracker (week matrix + 30-day analytics).
 * The functions under test take explicit dates so these specs run on a fixed
 * clock and assert exact numbers — no date drift, no locale dependence.
 */
test.describe('Habit tracker data', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(FIXED_TIME);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('getMondayOf returns the Monday of the week for any day, incl. Sunday', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { getMondayOf } = await import('/src/lib/habit-storage.ts');
      return [
        getMondayOf(new Date(2026, 4, 4)),  // Mon May 4 → itself
        getMondayOf(new Date(2026, 4, 6)),  // Wed May 6 → May 4
        getMondayOf(new Date(2026, 4, 10)), // Sun May 10 → May 4
        getMondayOf(new Date(2026, 4, 3)),  // Sun May 3 → Apr 27
        getMondayOf(new Date(2026, 0, 1)),  // Thu Jan 1 2026 → Dec 29 2025
      ].map(d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    });
    expect(result).toEqual([
      '2026-05-04',
      '2026-05-04',
      '2026-05-04',
      '2026-04-27',
      '2025-12-29',
    ]);
  });

  test('buildHabitWeekMatrix: 7 Mon–Sun days, today highlighted, cell states from ticks', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { buildHabitWeekMatrix } = await import('/src/lib/habit-storage.ts');
      const ts = '2026-05-01T00:00:00Z';
      const habit = {
        id: 'h1', name: 'Read', status: 'in_progress' as const,
        ticks: ['2026-05-04', '2026-05-05'], // Mon + Tue
        createdAt: ts, updatedAt: ts,
      };
      const matrix = buildHabitWeekMatrix([habit], '2026-05-04', '2026-05-06');
      return {
        days: matrix.days.map(d => ({ date: d.date, label: d.weekdayLabel, num: d.dayOfMonth, today: d.isToday })),
        states: matrix.rows[0].cells.map(c => c.state),
        completed: matrix.completed,
        scheduled: matrix.scheduled,
      };
    });
    expect(result.days).toEqual([
      { date: '2026-05-04', label: 'Mon', num: 4, today: false },
      { date: '2026-05-05', label: 'Tue', num: 5, today: false },
      { date: '2026-05-06', label: 'Wed', num: 6, today: true },
      { date: '2026-05-07', label: 'Thu', num: 7, today: false },
      { date: '2026-05-08', label: 'Fri', num: 8, today: false },
      { date: '2026-05-09', label: 'Sat', num: 9, today: false },
      { date: '2026-05-10', label: 'Sun', num: 10, today: false },
    ]);
    // Mon+Tue ticked → completed; Wed (today) unticked → pending; Thu–Sun → future
    expect(result.states).toEqual(['completed', 'completed', 'pending', 'future', 'future', 'future', 'future']);
    expect(result.completed).toBe(2);
    expect(result.scheduled).toBe(7);
  });

  test('buildHabitWeekMatrix: month-boundary week carries correct day numbers', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { buildHabitWeekMatrix } = await import('/src/lib/habit-storage.ts');
      const habit = {
        id: 'h1', name: 'Read', status: 'want_to_form' as const,
        ticks: [], createdAt: '2026-05-25T00:00:00Z', updatedAt: '2026-05-25T00:00:00Z',
      };
      const matrix = buildHabitWeekMatrix([habit], '2026-05-25', '2026-05-31');
      return matrix.days.map(d => ({ label: d.weekdayLabel, num: d.dayOfMonth }));
    });
    expect(result).toEqual([
      { label: 'Mon', num: 25 },
      { label: 'Tue', num: 26 },
      { label: 'Wed', num: 27 },
      { label: 'Thu', num: 28 },
      { label: 'Fri', num: 29 },
      { label: 'Sat', num: 30 },
      { label: 'Sun', num: 31 },
    ]);
  });

  test('computeHabitStreaks counts the consecutive ticked days ending at the last tick', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { computeHabitStreaks } = await import('/src/lib/habit-storage.ts');
      return {
        endingToday: computeHabitStreaks(['2026-05-23', '2026-05-24']).current,
        endingYesterday: computeHabitStreaks(['2026-05-22', '2026-05-23']).current,
        staleRun: computeHabitStreaks(['2026-05-21', '2026-05-22', '2026-05-23']).current, // 3 ticks, last one 2 days ago
        singleTick: computeHabitStreaks(['2026-05-21']).current,
        brokenRun: computeHabitStreaks(['2026-05-10', '2026-05-20']).current,
        best: computeHabitStreaks(['2026-05-10', '2026-05-11', '2026-05-12', '2026-05-20']).best,
      };
    });
    expect(result).toEqual({ endingToday: 2, endingYesterday: 2, staleRun: 3, singleTick: 1, brokenRun: 1, best: 3 });
  });

  test('buildHabitAnalytics: 30-day rates, trend vs previous window, weak-day insight', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { buildHabitAnalytics } = await import('/src/lib/habit-storage.ts');

      // Every day in the current window (2026-04-25..2026-05-24) except the four
      // Wednesdays (Apr 29, May 6, May 13, May 20) — 26 of 30 ticked.
      const ticks: string[] = [];
      for (let d = new Date(2026, 3, 25); d <= new Date(2026, 4, 24); d.setDate(d.getDate() + 1)) {
        if (d.getDay() !== 3) {
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          ticks.push(`2026-${mm}-${dd}`);
        }
      }
      const habit = {
        id: 'h1', name: 'Read', status: 'in_progress' as const,
        ticks, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z',
      };
      const analytics = buildHabitAnalytics([habit], '2026-05-24');
      return {
        overallRate: analytics.overallRate,
        totalCompleted: analytics.totalCompleted,
        totalScheduled: analytics.totalScheduled,
        trend: analytics.trend, // previous window (Mar 26..Apr 24) has 24 scheduled days, 0 completed
        perHabit: analytics.perHabit.map(h => ({ rate: h.rate, completed: h.completed, scheduled: h.scheduled })),
        weakDay: analytics.weakDay && { label: analytics.weakDay.dayLabel, rate: analytics.weakDay.rate, scheduled: analytics.weakDay.scheduled },
        isEmpty: analytics.isEmpty,
      };
    });
    expect(result.overallRate).toBe(87); // 26/30
    expect(result.totalCompleted).toBe(26);
    expect(result.totalScheduled).toBe(30);
    expect(result.trend).toBe(87); // 87 - 0
    expect(result.perHabit).toEqual([{ rate: 87, completed: 26, scheduled: 30 }]);
    expect(result.weakDay).toEqual({ label: 'Wednesday', rate: 0, scheduled: 4 });
    expect(result.isEmpty).toBe(false);
  });

  test('buildHabitAnalytics: all-equal weekdays → no weak-day insight; trend null without prior data', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { buildHabitAnalytics } = await import('/src/lib/habit-storage.ts');
      const ticks: string[] = [];
      for (let d = new Date(2026, 3, 25); d <= new Date(2026, 4, 24); d.setDate(d.getDate() + 1)) {
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        ticks.push(`2026-${mm}-${dd}`);
      }
      const allDays = {
        id: 'h1', name: 'Read', status: 'in_progress' as const,
        ticks, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z',
      };
      const recent = {
        id: 'h2', name: 'New habit', status: 'want_to_form' as const,
        ticks: ['2026-05-24'], createdAt: '2026-05-20T00:00:00Z', updatedAt: '2026-05-20T00:00:00Z',
      };
      const allEqual = buildHabitAnalytics([allDays], '2026-05-24');
      const noPrior = buildHabitAnalytics([recent], '2026-05-24');
      return {
        weakDayNull: allEqual.weakDay === null,   // every weekday 100% — nothing is "the weak day"
        recentTrendNull: noPrior.trend === null,   // previous window has 0 scheduled days
        recentScheduled: noPrior.totalScheduled,   // May 20..24 = 5 days
        recentRate: noPrior.overallRate,           // 1 of 5
      };
    });
    expect(result).toEqual({ weakDayNull: true, recentTrendNull: true, recentScheduled: 5, recentRate: 20 });
  });

  test('buildHabitAnalytics: empty state when there are no habits', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { buildHabitAnalytics } = await import('/src/lib/habit-storage.ts');
      const analytics = buildHabitAnalytics([], '2026-05-24');
      return { isEmpty: analytics.isEmpty, overallRate: analytics.overallRate, weakDay: analytics.weakDay, trend: analytics.trend, perHabit: analytics.perHabit };
    });
    expect(result).toEqual({ isEmpty: true, overallRate: 0, weakDay: null, trend: null, perHabit: [] });
  });
});
