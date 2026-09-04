import { test, expect } from '@playwright/test';
import { computeBestFocusWindow } from '../src/lib/best-focus-window';
import type { DailyRecord } from '../src/lib/pomodoro-storage';

// Fixed "today" for every test: 4 Sep 2026, 15:00 local time.
const NOW = new Date(2026, 8, 4, 15, 0, 0);

function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** ISO timestamp `daysAgo` days before NOW at `hour`:`min` local time. */
function at(daysAgo: number, hour: number, min = 0): string {
  return new Date(2026, 8, 4 - daysAgo, hour, min).toISOString();
}

function rec(daysAgo: number, sessions: { at: string; completed: boolean }[]): DailyRecord {
  const d = new Date(2026, 8, 4 - daysAgo);
  return {
    date: dayKey(d),
    completedPomodoros: sessions.filter(s => s.completed).length,
    totalFocusMinutes: sessions.length * 25,
    tasksCompleted: 0,
    sessions: sessions.map(s => ({
      startedAt: s.at,
      endedAt: s.at,
      type: 'focus' as const,
      completed: s.completed,
    })),
  };
}

test.describe('computeBestFocusWindow', () => {
  test('breaks all-100% ties by volume — no morning/afternoon contradiction', () => {
    // User's reported bug: everything completed, but the first-inserted
    // window (16:00–18:00) won while the caption credited "morning".
    // 10:00–12:00 holds the most sessions, so it must win, and the insight
    // must be the honest all-tie copy.
    const history = [
      rec(1, [{ at: at(1, 16, 30), completed: true }]),
      rec(0, [
        { at: at(0, 10, 0), completed: true },
        { at: at(0, 10, 30), completed: true },
        { at: at(0, 11, 0), completed: true },
        { at: at(0, 16, 0), completed: true },
      ]),
    ];

    const result = computeBestFocusWindow(history, NOW);

    expect(result.hasData).toBe(true);
    expect(result.hasStandout).toBe(true);
    expect(result.bestWindow).toBe('10:00–12:00');
    expect(result.rate).toBe(100);
    expect(result.sessionCount).toBe(3);
    expect(result.insight).toBe('You finish what you start at any hour — this is when you start the most sessions.');
    expect(result.insight).not.toContain('Morning sessions');
  });

  test('rate ties are broken by most sessions, then earliest window', () => {
    const history = [
      rec(0, [
        // 16:00–18:00: 3/3
        ...Array.from({ length: 3 }, (_, i) => ({ at: at(0, 16, i * 20), completed: true })),
        // 08:00–10:00: 10/10
        ...Array.from({ length: 10 }, (_, i) => ({ at: at(0, 9, i * 5), completed: true })),
        // 20:00–22:00: 10/10 — ties 08:00 on rate and volume, loses on earliness
        ...Array.from({ length: 10 }, (_, i) => ({ at: at(0, 21, i * 5), completed: true })),
      ]),
    ];

    const result = computeBestFocusWindow(history, NOW);

    expect(result.bestWindow).toBe('08:00–10:00');
    expect(result.rate).toBe(100);
    expect(result.sessionCount).toBe(10);
  });

  test('shows no standout when no window reaches 3 sessions — no fabricated window', () => {
    // 5 sessions spread 2/2/1: old code crowned an invented "09:00–11:00 · 0%".
    const history = [
      rec(0, [
        { at: at(0, 8, 0), completed: true },
        { at: at(0, 8, 30), completed: false },
        { at: at(0, 13, 0), completed: true },
        { at: at(0, 13, 30), completed: false },
        { at: at(0, 21, 0), completed: true },
      ]),
    ];

    const result = computeBestFocusWindow(history, NOW);

    expect(result.hasData).toBe(true);
    expect(result.hasStandout).toBe(false);
    expect(result.bestWindow).toBe('');
    expect(result.insight).toBe('Complete a few more sessions to reveal your best focus window.');
  });

  test('only counts sessions from the last 30 calendar days', () => {
    // 4 completed sessions 40 days ago would win by volume if counted.
    const withOld = [
      rec(40, Array.from({ length: 4 }, (_, i) => ({ at: at(40, 8, i * 10), completed: true }))),
      rec(1, Array.from({ length: 5 }, (_, i) => ({ at: at(1, 20, i * 15), completed: true }))),
    ];
    const result = computeBestFocusWindow(withOld, NOW);
    expect(result.bestWindow).toBe('20:00–22:00');
    expect(result.sessionCount).toBe(5);

    // Boundary: a session 29 days ago (>= local midnight cutoff) still counts.
    const day29 = [
      rec(29, Array.from({ length: 3 }, (_, i) => ({ at: at(29, 1, i * 15), completed: true }))),
      rec(0, [
        { at: at(0, 9, 0), completed: true },
        { at: at(0, 9, 30), completed: true },
      ]),
    ];
    const inWindow = computeBestFocusWindow(day29, NOW);
    expect(inWindow.hasStandout).toBe(true);
    expect(inWindow.bestWindow).toBe('00:00–02:00');

    // Boundary: the same cluster 30 days ago (before cutoff) drops out.
    const day30 = [
      rec(30, Array.from({ length: 3 }, (_, i) => ({ at: at(30, 1, i * 15), completed: true }))),
      rec(0, [
        { at: at(0, 9, 0), completed: true },
        { at: at(0, 10, 0), completed: true },
        { at: at(0, 11, 0), completed: true },
        { at: at(0, 12, 0), completed: true },
        { at: at(0, 13, 0), completed: true },
      ]),
    ];
    const outOfWindow = computeBestFocusWindow(day30, NOW);
    expect(outOfWindow.hasStandout).toBe(false);
  });

  test('stays gated below 5 timestamped sessions', () => {
    const history = [
      rec(0, [
        { at: at(0, 9, 0), completed: true },
        { at: at(0, 10, 0), completed: true },
        { at: at(0, 16, 0), completed: true },
        { at: at(0, 16, 30), completed: false },
      ]),
    ];

    const result = computeBestFocusWindow(history, NOW);

    expect(result.hasData).toBe(false);
    expect(result.insight).toBe('Complete at least 5 focus sessions to unlock completion and time-of-day insights.');
  });

  test('reports the computed abandonment ratio when a morning window wins', () => {
    const history = [
      rec(0, [
        // 08:00–10:00: 3/4 completed → 25% abandonment, wins on rate
        ...Array.from({ length: 4 }, (_, i) => ({ at: at(0, 9, i * 10), completed: i < 3 })),
        // 18:00–20:00: 2/4 completed → 50% abandonment
        ...Array.from({ length: 4 }, (_, i) => ({ at: at(0, 18, i * 10), completed: i < 2 })),
      ]),
    ];

    const result = computeBestFocusWindow(history, NOW);

    expect(result.bestWindow).toBe('08:00–10:00');
    expect(result.rate).toBe(75);
    expect(result.insight).toBe('Sessions started after 16:00 are abandoned 2x as often.');
  });

  test('never fires the abandonment special case for an evening winner', () => {
    // Winner is 16:00–18:00, so a "mornings are better" aside would be noise.
    const history = [
      rec(0, [
        // 10:00–12:00: 2/4 → 50% abandonment
        ...Array.from({ length: 4 }, (_, i) => ({ at: at(0, 10, i * 10), completed: i < 2 })),
        // 16:00–18:00: 4/4 → winner
        ...Array.from({ length: 4 }, (_, i) => ({ at: at(0, 16, i * 10), completed: true })),
      ]),
    ];

    const result = computeBestFocusWindow(history, NOW);

    expect(result.bestWindow).toBe('16:00–18:00');
    expect(result.rate).toBe(100);
    expect(result.insight).toBe('You have completed 4 of 4 sessions started in this window.');
    expect(result.insight).not.toContain('Morning');
  });

  test('all-tie copy wins even when sub-threshold windows give a qualifying ratio', () => {
    // The only qualifying window is perfect, so the rate says nothing —
    // the abandonment aside (computed from 1-session windows) must not
    // contradict the "any hour" verdict.
    const history = [
      rec(0, [
        // 10:00–12:00: 3/3 — the only window with ≥3 starts
        ...Array.from({ length: 3 }, (_, i) => ({ at: at(0, 10, i * 20), completed: true })),
        // Abandonments in sub-threshold windows: morning 1/4, afternoon 0/1
        { at: at(0, 9, 0), completed: false },
        { at: at(0, 20, 0), completed: false },
      ]),
    ];

    const result = computeBestFocusWindow(history, NOW);

    expect(result.bestWindow).toBe('10:00–12:00');
    expect(result.insight).toBe('You finish what you start at any hour — this is when you start the most sessions.');
    expect(result.insight).not.toContain('abandoned');
  });

  test('never claims an uncomputed ratio ("twice as often")', () => {
    // Morning is perfect, afternoon leaks — the old code asserted a hardcoded
    // "twice as often"; the new copy must only state the winner's own numbers.
    const history = [
      rec(0, [
        ...Array.from({ length: 3 }, (_, i) => ({ at: at(0, 10, i * 10), completed: true })),
        { at: at(0, 18, 0), completed: true },
        { at: at(0, 18, 30), completed: false },
        { at: at(0, 19, 0), completed: false },
      ]),
    ];

    const result = computeBestFocusWindow(history, NOW);

    expect(result.bestWindow).toBe('10:00–12:00');
    expect(result.insight).toBe('You have completed 3 of 3 sessions started in this window.');
  });
});
