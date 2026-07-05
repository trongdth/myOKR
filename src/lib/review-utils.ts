/**
 * A weekly review belongs to every cycle whose month its week spans. A week
 * crossing a month boundary (e.g. 2026-06-29 → 2026-07-05) therefore appears
 * under BOTH the June and July cycles, so a review tagged June still shows when
 * the active cycle rolls to July — it never "disappears" just because the
 * default cycle changed.
 *
 * Kept dependency-free (structural types only) so it is unit-testable in plain
 * Node. Comparison uses lexicographic order on `YYYY-MM-DD` strings, which is
 * valid for zero-padded ISO dates.
 */
export function reviewInCycle(
  review: { weekStartDate?: string; weekEndDate?: string },
  cycle: { month: number; year: number },
): boolean {
  const { weekStartDate, weekEndDate } = review;
  if (!weekStartDate || !weekEndDate) return false;
  const mm = String(cycle.month + 1).padStart(2, '0');
  const monthStart = `${cycle.year}-${mm}-01`;
  // Day 0 of the next month = last day of the target month (UTC, timezone-safe).
  const lastDay = new Date(Date.UTC(cycle.year, cycle.month + 1, 0)).getUTCDate();
  const monthEnd = `${cycle.year}-${mm}-${String(lastDay).padStart(2, '0')}`;
  return weekStartDate <= monthEnd && weekEndDate >= monthStart;
}
