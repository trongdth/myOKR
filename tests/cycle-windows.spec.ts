import { test, expect } from '@playwright/test';
import { getExclusiveCycleMondays } from '../src/lib/cycle-windows';

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
});
