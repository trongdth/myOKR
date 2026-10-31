import { test, expect } from '@playwright/test';
import { getExclusiveCycleMondays, getExclusiveCycleForDate } from '../src/lib/cycle-windows';

test.describe('getExclusiveCycleMondays', () => {
  test('boundary week belongs to the cycle it opens, never the one it closes', () => {
    // September 2026: Sep 1 is a Tuesday, so the cycle opens on Mon Aug 31
    // (that week contains Sep 1 → September's W1). The trailing week Sep 28
    // contains Oct 1 → belongs to October, excluded here.
    expect(getExclusiveCycleMondays({ month: 8, year: 2026 })).toEqual([
      '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21',
    ]);

    // August 2026: opens Mon Jul 27 (week contains Aug 1); its trailing week
    // Aug 31 contains Sep 1 → excluded, so the Aug-31 week is counted only
    // for September. No week is shared between the two cycles.
    expect(getExclusiveCycleMondays({ month: 7, year: 2026 })).toEqual([
      '2026-07-27', '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24',
    ]);
  });

  test('a month starting on Monday keeps its own first week', () => {
    // June 2026: Jun 1 is a Monday → opens on Jun 1. Trailing week Jun 29
    // contains Jul 1 → excluded.
    expect(getExclusiveCycleMondays({ month: 5, year: 2026 })).toEqual([
      '2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22',
    ]);
  });

  test('December hands its trailing week to January across the year boundary', () => {
    // December 2026: Dec 1 is a Tuesday → opens Mon Nov 30. Trailing week
    // Dec 28 contains Jan 1 2027 → excluded.
    expect(getExclusiveCycleMondays({ month: 11, year: 2026 })).toEqual([
      '2026-11-30', '2026-12-07', '2026-12-14', '2026-12-21',
    ]);
  });

  test('corrupt month/year falls back to the current month like getMondaysForCycle', () => {
    const result = getExclusiveCycleMondays({ month: null, year: null });
    const now = new Date();
    expect(result.length).toBeGreaterThanOrEqual(4);
    expect(result[0]).toBe(
      getExclusiveCycleMondays({ month: now.getMonth(), year: now.getFullYear() })[0]
    );
  });

  test('getExclusiveCycleForDate maps every date (including month/year-end boundary weeks) to the cycle whose exclusive weeks contain it', () => {
    // Mid-month date stays in its calendar month (May 2026).
    expect(getExclusiveCycleForDate(new Date(2026, 4, 15, 12, 0, 0))).toEqual({ month: 4, year: 2026 });

    // Saturday Oct 31, 2026 sits in week Mon Oct 26 – Sun Nov 1, which opens
    // November 2026 (month 10) and is excluded from October 2026 (month 9).
    const oct31 = new Date(2026, 9, 31, 12, 0, 0);
    const oct31Cycle = getExclusiveCycleForDate(oct31);
    expect(oct31Cycle).toEqual({ month: 10, year: 2026 });
    expect(getExclusiveCycleMondays(oct31Cycle)).toContain('2026-10-26');

    // Thursday Dec 31, 2026 sits in week Mon Dec 28 – Sun Jan 3, 2027, which
    // opens January 2027 across the year boundary.
    const dec31 = new Date(2026, 11, 31, 12, 0, 0);
    const dec31Cycle = getExclusiveCycleForDate(dec31);
    expect(dec31Cycle).toEqual({ month: 0, year: 2027 });
    expect(getExclusiveCycleMondays(dec31Cycle)).toContain('2026-12-28');
  });
});
