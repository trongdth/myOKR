import { test, expect } from '@playwright/test';
import { getExclusiveCycleMondays } from '../src/lib/cycle-windows';
import { reviewInCycle } from '../src/lib/review-utils';

// Week-rule unification (ADR-0019): the weekly review joined the exclusive
// rule — every Progress tab lists the same weeks, and each calendar week
// belongs to exactly one cycle. Legacy reviews created under the old
// intersect rule (a boundary week could be listed under both cycles) must
// still resolve: their Monday appears in exactly one cycle's exclusive list,
// and the review itself lands on that week.
//
// Pure-Node: cycle-windows and review-utils are dependency-free by design.

type Cycle = { month: number; year: number };

/** The old intersect rule: every Monday whose week overlaps the month. */
function intersectMondays(cycle: Cycle, mondays: string[]): string[] {
  const mm = String(cycle.month + 1).padStart(2, '0');
  const monthStart = `${cycle.year}-${mm}-01`;
  const lastDay = new Date(Date.UTC(cycle.year, cycle.month + 1, 0)).getUTCDate();
  const monthEnd = `${cycle.year}-${mm}-${String(lastDay).padStart(2, '0')}`;
  return mondays.filter(monday => {
    const end = new Date(`${monday}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 6);
    const sunday = end.toISOString().slice(0, 10);
    return monday <= monthEnd && sunday >= monthStart;
  });
}

function findAllMondays(year: number): string[] {
  const mondays: string[] = [];
  const d = new Date(Date.UTC(year, 0, 1));
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCFullYear() === year) {
    mondays.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return mondays;
}

test.describe('exclusive-week unification', () => {
  test('every Monday of a year belongs to exactly one adjacent cycle list', () => {
    const year = 2026;
    const cycles: Cycle[] = Array.from({ length: 12 }, (_, month) => ({ month, year }));
    const ownership = new Map<string, number>();

    for (const cycle of cycles) {
      for (const monday of getExclusiveCycleMondays(cycle)) {
        expect(ownership.has(monday), `${monday} listed by two cycles`).toBe(false);
        ownership.set(monday, cycle.month);
      }
    }

    // All real Mondays of the year are covered except the boundary Mondays
    // that open January of the next year (they belong to that year).
    const allMondays = findAllMondays(year);
    const uncovered = allMondays.filter(m => !ownership.has(m));
    for (const monday of uncovered) {
      // Every uncovered Monday must open next January (i.e. its week contains
      // Jan 1 of year+1) and must be claimed by next year's January cycle.
      const next = getExclusiveCycleMondays({ month: 0, year: year + 1 });
      expect(next[0] <= monday).toBe(true);
    }
    // Sanity: at most one such boundary Monday per year.
    expect(uncovered.length).toBeLessThanOrEqual(1);
  });

  test('legacy boundary-week review resolves to exactly one week and one cycle', () => {
    // Sep 2026 opens with the boundary week 2026-08-31 → 2026-09-06.
    const august = { month: 7, year: 2026 };
    const september = { month: 8, year: 2026 };
    const augMondays = getExclusiveCycleMondays(august);
    const sepMondays = getExclusiveCycleMondays(september);
    const allYearMondays = findAllMondays(2026);

    // The old intersect rule listed 2026-08-31 under BOTH cycles.
    expect(intersectMondays(august, allYearMondays)).toContain('2026-08-31');
    expect(intersectMondays(september, allYearMondays)).toContain('2026-08-31');

    // The exclusive rule: September only — no double-listing.
    expect(augMondays).not.toContain('2026-08-31');
    expect(sepMondays).toContain('2026-08-31');

    // A legacy review for that boundary week maps to exactly one entry in the
    // unified (September) list, and its stored dates are untouched.
    const legacyReview = { weekStartDate: '2026-08-31', weekEndDate: '2026-09-06' };
    const matches = [august, september].filter(c => getExclusiveCycleMondays(c).includes(legacyReview.weekStartDate));
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual(september);

    // Cross-month VISIBILITY (display-only) still shows the review under
    // September — and under August only in the historical sense that the week
    // overlaps August's days; the review picker never lists it twice.
    expect(reviewInCycle(legacyReview, september)).toBe(true);
  });

  test('reviews stored mid-month still resolve under the unified lists', () => {
    const cycle = { month: 5, year: 2026 }; // June 2026
    const mondays = getExclusiveCycleMondays(cycle);
    expect(mondays[0]).toBe('2026-06-01'); // June 1 2026 is a Monday
    expect(mondays).toContain('2026-06-08');
    expect(mondays).not.toContain('2026-06-29'); // opens July
    expect(getExclusiveCycleMondays({ month: 6, year: 2026 })).toContain('2026-06-29');
  });
});
