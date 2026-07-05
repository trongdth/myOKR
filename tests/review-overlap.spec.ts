import { test, expect } from '@playwright/test';
import { reviewInCycle } from '../src/lib/review-utils';

// Regression test for the "weekly review disappears after switching cycle" bug.
// A review for a cross-month week (e.g. 2026-06-29 → 2026-07-05) used to be
// hard-bound to one cycle (June) and filtered out of every other cycle view, so
// it vanished when the default cycle rolled to July. The fix is week/month
// overlap: a review is visible in every cycle whose month its week spans.
//
// These cases run in Node (no browser) — `reviewInCycle` is a pure,
// dependency-free function, so it can be exercised directly.

const cyc = (month: number, year = 2026) => ({ month, year });
const rev = (weekStartDate: string, weekEndDate: string) => ({ weekStartDate, weekEndDate });

test.describe('reviewInCycle — week/month overlap', () => {
  test('cross-month week appears in BOTH overlapping cycles (the bug)', () => {
    const r = rev('2026-06-29', '2026-07-05'); // spans June → July
    expect(reviewInCycle(r, cyc(5))).toBe(true);  // June
    expect(reviewInCycle(r, cyc(6))).toBe(true);  // July  ← previously filtered out
    expect(reviewInCycle(r, cyc(4))).toBe(false); // May
  });

  test('pure single-month week appears only in its own cycle', () => {
    expect(reviewInCycle(rev('2026-06-15', '2026-06-21'), cyc(5))).toBe(true);  // June
    expect(reviewInCycle(rev('2026-06-15', '2026-06-21'), cyc(6))).toBe(false); // July
  });

  test('week ending exactly on the last day of a month stays in that month only', () => {
    expect(reviewInCycle(rev('2026-06-25', '2026-06-30'), cyc(5))).toBe(true);  // June 30 = last day
    expect(reviewInCycle(rev('2026-06-25', '2026-06-30'), cyc(6))).toBe(false); // July
  });

  test('week starting on the 1st of a month stays in that month only', () => {
    expect(reviewInCycle(rev('2026-07-01', '2026-07-07'), cyc(6))).toBe(true);  // July
    expect(reviewInCycle(rev('2026-07-01', '2026-07-07'), cyc(5))).toBe(false); // June
  });

  test('year boundary: December → January spans both years', () => {
    const r = rev('2026-12-28', '2027-01-03');
    expect(reviewInCycle(r, cyc(11, 2026))).toBe(true);  // Dec 2026
    expect(reviewInCycle(r, cyc(0, 2027))).toBe(true);   // Jan 2027
    expect(reviewInCycle(r, cyc(0, 2026))).toBe(false);  // Jan 2026 (wrong year)
  });

  test('reviews with missing dates are never shown', () => {
    expect(reviewInCycle({} as any, cyc(5))).toBe(false);
    expect(reviewInCycle({ weekStartDate: '2026-06-29' } as any, cyc(5))).toBe(false);
    expect(reviewInCycle({ weekEndDate: '2026-07-05' } as any, cyc(5))).toBe(false);
  });

  test('February in a leap year (29 days) bounds correctly', () => {
    // Week fully inside Feb 2026 (non-leap, 28 days)
    expect(reviewInCycle(rev('2026-02-10', '2026-02-16'), cyc(1, 2026))).toBe(true);
    // Week crossing Jan → Feb
    expect(reviewInCycle(rev('2026-01-28', '2026-02-03'), cyc(1, 2026))).toBe(true); // Feb
    expect(reviewInCycle(rev('2026-01-28', '2026-02-03'), cyc(0, 2026))).toBe(true); // Jan
  });
});
