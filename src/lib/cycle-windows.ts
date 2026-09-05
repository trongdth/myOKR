/**
 * Exclusive cycle-week membership for the Progress screen.
 *
 * `getMondaysForCycle` (okr-storage) lists every week *intersecting* the
 * month, so the boundary week containing the 1st of the next month (e.g.
 * Aug 31–Sep 6 2026) belongs to both cycles. Counting it in both makes the
 * cycle KPI trajectory double-count that week's sessions ("0 vs last cycle"
 * when the previous month had none of its own).
 *
 * Rule: a boundary week belongs to the cycle it *opens* — the week containing
 * the cycle's own 1st stays, the week containing the *next* month's 1st is
 * excluded (it will be that cycle's opening week). Every calendar week then
 * belongs to exactly one cycle. Returns Mondays earliest-first.
 *
 * Self-contained by design: importing okr-storage would drag the Automerge
 * storage layer (and its `import.meta.env` dependency) into pure-Node tests.
 */
export function getExclusiveCycleMondays(cycle: { month: number | null; year: number | null }): string[] {
  const month = typeof cycle.month === 'number' && Number.isFinite(cycle.month)
    ? Math.min(11, Math.max(0, Math.floor(cycle.month)))
    : new Date().getMonth();
  const year = typeof cycle.year === 'number' && Number.isFinite(cycle.year)
    ? Math.min(2100, Math.max(1970, Math.floor(cycle.year)))
    : new Date().getFullYear();

  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const dow = firstOfMonth.getUTCDay();
  const firstMonday = new Date(firstOfMonth);
  firstMonday.setUTCDate(firstMonday.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  const nextMonthFirst = iso(new Date(Date.UTC(year, month + 1, 1)));

  const mondays: string[] = [];
  for (let i = 0; i < 10; i++) {
    const monday = new Date(firstMonday);
    monday.setUTCDate(firstMonday.getUTCDate() + i * 7);
    const mondayStr = iso(monday);
    if (mondayStr > nextMonthFirst) break;

    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const sundayStr = iso(sunday);
    if (mondayStr <= nextMonthFirst && nextMonthFirst <= sundayStr) continue;

    mondays.push(mondayStr);
  }
  return mondays;
}
