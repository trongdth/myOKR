/**
 * Pace derivation for the Objectives tab (R3) — ADR-0020.
 *
 * Everything here is DERIVED at render time; nothing is persisted. The module
 * is self-contained by design (mirroring cycle-windows.ts): importing
 * okr-storage would drag the Automerge storage layer (and its
 * `import.meta.env` dependency) into pure-Node tests. The as-of value math
 * below deliberately mirrors `getEffectiveCurrentValueAsOf`
 * (okr-storage.ts) on structural types — if that function changes shape,
 * change it here too; tests on both sides pin the shared arithmetic.
 *
 * All date arguments are 'YYYY-MM-DD' strings compared lexically in UTC,
 * matching cycle-windows.ts.
 */
import { getExclusiveCycleMondays, getCycleClosedDate } from './cycle-windows';

// ===== Minimal structural shapes (subset of the storage types) =====

export type PaceCompletionMode = 'manual' | 'focus_hours' | 'focus_pomodoros' | 'completed_tasks' | 'habit';

export interface PaceKeyResult {
  id: string;
  objectiveId: string;
  title: string;
  targetValue: number;
  currentValue: number;
  completionMode: PaceCompletionMode;
  createdAt: string;
  habitId?: string;
}

export interface PaceObjective {
  id: string;
  cycleId: string;
  title: string;
  createdAt: string;
  order: number;
}

export interface PaceCycle {
  id: string;
  name: string;
  month: number;
  year: number;
}

export interface PaceTask {
  id: string;
  keyResultId?: string;
  isCompleted: boolean;
  completedAt?: string;
}

export interface PaceSession {
  type: string;
  completed: boolean;
  taskId?: string;
}

export interface PaceDailyRecord {
  date: string;
  sessions: PaceSession[];
}

export interface PaceHabit {
  id: string;
  ticks: string[];
}

export interface PaceReviewEntry {
  keyResultId: string;
  currentValue: number;
}

export interface PaceReview {
  weekStartDate: string;
  completedAt?: string;
  entries: PaceReviewEntry[];
}

export interface PaceDataContext {
  tasks: PaceTask[];
  history: PaceDailyRecord[];
  habits: PaceHabit[];
  reviews: PaceReview[];
  focusDurationMinutes: number;
}

// ===== Calendar helpers (UTC-midnight string arithmetic) =====

const DAY_MS = 86_400_000;

function toUtc(dateStr: string): number {
  return Date.parse(`${dateStr}T00:00:00Z`);
}

export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

export function addDaysStr(dateStr: string, days: number): string {
  return new Date(toUtc(dateStr) + days * DAY_MS).toISOString().slice(0, 10);
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

export function pctOfTarget(value: number, target: number): number {
  if (target <= 0) return 0;
  return clampPct((value / target) * 100);
}

// ===== Pace marker (ADR-0020: days-based, never weeks) =====

export interface CycleSpan {
  start: string;
  end: string;
  mondays: string[];
  totalWeeks: number;
}

/** First exclusive Monday → cycle closed date. Null only for a malformed cycle. */
export function getCycleSpan(cycle: PaceCycle): CycleSpan | null {
  const mondays = getExclusiveCycleMondays(cycle);
  if (mondays.length === 0) return null;
  const closed = getCycleClosedDate(cycle);
  if (!closed) return null;
  return { start: mondays[0], end: closed, mondays, totalWeeks: mondays.length };
}

/**
 * The pace marker: days elapsed over the cycle's span, 0-100. Past cycles pin
 * at 100%, cycles that have not started at 0%.
 */
export function getCycleElapsedPercent(span: CycleSpan, todayISO: string): number {
  if (todayISO >= span.end) return 100;
  if (todayISO <= span.start) return 0;
  const total = diffDays(span.start, span.end);
  if (total <= 0) return 100;
  return clampPct(Math.round((diffDays(span.start, todayISO) / total) * 100));
}

/** True from the closed date onward — the final Sunday counts as closed so
 *  the marker (100% that day) and closed-ness never disagree. */
export function isCycleClosed(span: CycleSpan, todayISO: string): boolean {
  return todayISO >= span.end;
}

// ===== Pace status (ADR-0020: derived, never entered) =====

export type PaceStatus = 'ahead_of_pace' | 'on_pace' | 'behind_pace' | 'at_risk';

/**
 * Ahead of pace strictly above the marker, On pace within 5 points below it,
 * Behind pace below that, At risk more than 20 points below. A 0% value
 * greys in the UI but keeps its derived status label.
 */
export function getPaceStatus(progressPct: number, markerPct: number): PaceStatus {
  if (progressPct > markerPct) return 'ahead_of_pace';
  if (progressPct >= markerPct - 5) return 'on_pace';
  if (progressPct >= markerPct - 20) return 'behind_pace';
  return 'at_risk';
}

export const PACE_STATUS_LABEL: Record<PaceStatus, string> = {
  ahead_of_pace: 'Ahead of pace',
  on_pace: 'On pace',
  behind_pace: 'Behind pace',
  at_risk: 'At risk',
};

/** CSS class per status — dashes, matching the stylesheet's selectors. */
export const PACE_STATUS_CLASS: Record<PaceStatus, 'ahead-of-pace' | 'on-pace' | 'behind-pace' | 'at-risk'> = {
  ahead_of_pace: 'ahead-of-pace',
  on_pace: 'on-pace',
  behind_pace: 'behind-pace',
  at_risk: 'at-risk',
};

// ===== Projected landing =====

/**
 * Where the current rate lands by cycle close: progress ÷ elapsed fraction.
 * Null when nothing has elapsed yet (no basis to project from). Past cycles
 * project nothing — their landing is their progress.
 */
export function getProjectedLanding(progressPct: number, markerPct: number, cycleClosed: boolean): number | null {
  if (cycleClosed) return clampPct(Math.round(progressPct));
  if (markerPct <= 0) return null;
  return clampPct(Math.round(progressPct / (markerPct / 100)));
}

// ===== As-of values (mirrors getEffectiveCurrentValueAsOf) =====

function isTickInCycleMonth(tick: string, cycle: PaceCycle): boolean {
  const parts = tick.split('-');
  if (parts.length !== 3) return false;
  return Number(parts[0]) === cycle.year && Number(parts[1]) - 1 === cycle.month;
}

function linkedTaskIds(kr: PaceKeyResult, ctx: PaceDataContext): Set<string> {
  return new Set(ctx.tasks.filter(t => t.keyResultId === kr.id).map(t => t.id));
}

/**
 * Best-known value for a KR as of `endDate` (inclusive). Derived modes
 * compute from attributed activity; manual modes fall back to the latest
 * completed review entry, else `manualFallback` (the stored current value
 * for "now", or 0 when reconstructing past weeks — a manual KR has no
 * history before its first review).
 */
export function krValueAsOf(
  kr: PaceKeyResult,
  cycle: PaceCycle,
  ctx: PaceDataContext,
  endDate: string,
  manualFallback?: number,
): number {
  const mode = kr.completionMode ?? 'manual';
  if (mode === 'habit') {
    if (!kr.habitId) return 0;
    const habit = ctx.habits.find(h => h.id === kr.habitId);
    if (!habit) return 0;
    return habit.ticks.filter(tick => tick <= endDate && isTickInCycleMonth(tick, cycle)).length;
  }
  if (mode === 'focus_hours' || mode === 'focus_pomodoros') {
    const linked = linkedTaskIds(kr, ctx);
    let count = 0;
    for (const day of ctx.history) {
      if (day.date > endDate) continue;
      for (const s of day.sessions) {
        if (s.type === 'focus' && s.completed && s.taskId && linked.has(s.taskId)) count++;
      }
    }
    if (mode === 'focus_pomodoros') return count;
    return Math.round((count * ctx.focusDurationMinutes / 60) * 100) / 100;
  }
  if (mode === 'completed_tasks') {
    return ctx.tasks.filter(t => t.keyResultId === kr.id && t.isCompleted && t.completedAt && t.completedAt.slice(0, 10) <= endDate).length;
  }
  // Manual: latest completed review entry wins; fallback otherwise.
  let latest: PaceReview | null = null;
  for (const r of ctx.reviews) {
    if (!r.completedAt || r.weekStartDate > endDate) continue;
    if (!r.entries.some(e => e.keyResultId === kr.id)) continue;
    if (!latest || r.weekStartDate > latest.weekStartDate) latest = r;
  }
  if (latest) {
    const entry = latest.entries.find(e => e.keyResultId === kr.id);
    if (entry) return entry.currentValue;
  }
  return manualFallback ?? kr.currentValue;
}

// ===== Weekly activity (the Trajectory gap rule) =====

/** Did this KR record attributed activity inside [monday..sunday]? */
export function krWeekHasActivity(
  kr: PaceKeyResult,
  cycle: PaceCycle,
  ctx: PaceDataContext,
  monday: string,
  sunday: string,
): boolean {
  const mode = kr.completionMode ?? 'manual';
  if (mode === 'habit') {
    if (!kr.habitId) return false;
    const habit = ctx.habits.find(h => h.id === kr.habitId);
    if (!habit) return false;
    return habit.ticks.some(tick => tick >= monday && tick <= sunday && isTickInCycleMonth(tick, cycle));
  }
  if (mode === 'focus_hours' || mode === 'focus_pomodoros') {
    const linked = linkedTaskIds(kr, ctx);
    for (const day of ctx.history) {
      if (day.date < monday || day.date > sunday) continue;
      if (day.sessions.some(s => s.type === 'focus' && s.completed && s.taskId && linked.has(s.taskId))) return true;
    }
    return false;
  }
  if (mode === 'completed_tasks') {
    return ctx.tasks.some(t => {
      if (t.keyResultId !== kr.id || !t.isCompleted || !t.completedAt) return false;
      const day = t.completedAt.slice(0, 10);
      return day >= monday && day <= sunday;
    });
  }
  // Manual: a completed review entry that week is the only record.
  return ctx.reviews.some(r => r.completedAt && r.weekStartDate >= monday && r.weekStartDate <= sunday
    && r.entries.some(e => e.keyResultId === kr.id));
}

// ===== Weekly series (Trajectory) =====

export interface SeriesPoint {
  /** Position along the axis, in days from the cycle start — the week's
   *  Monday, so every dot sits on its W tick. */
  dayOffset: number;
  /** Index into the cycle's exclusive Mondays — the week the point belongs to. */
  weekIndex: number;
  pct: number;
  value: number;
  /** The still-running week — its point sits at today, not the Sunday. */
  live: boolean;
}

export interface EntitySeries {
  points: SeriesPoint[];
  /** Current best-known percent (0 when the entity has no data at all —
   *  an empty cycle still lists objectives at 0%). */
  currentPct: number;
  currentValue: number;
}

function seriesForKr(kr: PaceKeyResult, cycle: PaceCycle, span: CycleSpan, ctx: PaceDataContext, todayISO: string): EntitySeries {
  const points: SeriesPoint[] = [];
  for (let weekIndex = 0; weekIndex < span.mondays.length; weekIndex++) {
    const monday = span.mondays[weekIndex];
    const sunday = addDaysStr(monday, 6);
    if (monday > todayISO) break;
    const isLiveWeek = todayISO >= monday && todayISO <= sunday;
    if (!krWeekHasActivity(kr, cycle, ctx, monday, sunday)) continue;
    const value = krValueAsOf(kr, cycle, ctx, isLiveWeek ? todayISO : sunday);
    // Every point plots on its own W tick (the week's Monday position) —
    // dots sit on gridlines, the live week included (value as-of today).
    points.push({
      dayOffset: weekIndex * 7,
      weekIndex,
      pct: pctOfTarget(value, kr.targetValue),
      value,
      live: isLiveWeek,
    });
  }
  const currentValue = krValueAsOf(kr, cycle, ctx, todayISO > span.end ? span.end : todayISO);
  return { points, currentValue, currentPct: pctOfTarget(currentValue, kr.targetValue) };
}

/**
 * Rolled-up objective series: per week, the unweighted mean of its key
 * results' percents (only KRs that existed as of that week count). The week
 * is a data point when any member KR recorded activity in it.
 */
function seriesForObjectives(
  krs: PaceKeyResult[],
  cycle: PaceCycle,
  span: CycleSpan,
  ctx: PaceDataContext,
  todayISO: string,
): EntitySeries {
  const krSeries = krs.map(kr => ({ kr, series: seriesForKr(kr, cycle, span, ctx, todayISO) }));

  const points: SeriesPoint[] = [];
  for (let weekIndex = 0; weekIndex < span.mondays.length; weekIndex++) {
    const monday = span.mondays[weekIndex];
    const sunday = addDaysStr(monday, 6);
    if (monday > todayISO) break;
    const isLiveWeek = todayISO >= monday && todayISO <= sunday;
    const asOf = isLiveWeek ? todayISO : sunday;
    const eligible = krSeries.filter(({ kr }) => kr.createdAt.slice(0, 10) <= sunday);
    if (eligible.length === 0) continue;

    // Each member KR's value this week: its own point when it has one, else
    // its as-of value. A manual KR with no review yet has no history, so
    // past weeks read 0 rather than projecting today's value backward; the
    // live week keeps the stored current value (matching the list).
    const memberValues = eligible.map(({ kr, series }) => {
      const inWeek = series.points.find(p => p.weekIndex === weekIndex);
      if (inWeek) return inWeek.value;
      const fallback = isLiveWeek ? undefined : 0;
      return krValueAsOf(kr, cycle, ctx, asOf, fallback);
    });
    const weekHasData = eligible.some(({ kr }) => krWeekHasActivity(kr, cycle, ctx, monday, sunday));
    if (!weekHasData) continue;

    const pct = Math.round(
      memberValues.reduce((sum, value, i) => sum + pctOfTarget(value, eligible[i].kr.targetValue), 0) / eligible.length,
    );
    points.push({
      dayOffset: weekIndex * 7,
      weekIndex,
      pct,
      value: pct,
      live: isLiveWeek,
    });
  }

  const currentPct = krs.length > 0
    ? Math.round(krSeries.reduce((sum, { series }) => sum + series.currentPct, 0) / krs.length)
    : 0;
  return { points, currentPct, currentValue: currentPct };
}

export function buildEntitySeries(
  entity: { kind: 'kr'; kr: PaceKeyResult } | { kind: 'objective'; krs: PaceKeyResult[] },
  cycle: PaceCycle,
  span: CycleSpan,
  ctx: PaceDataContext,
  todayISO: string,
): EntitySeries {
  if (entity.kind === 'kr') return seriesForKr(entity.kr, cycle, span, ctx, todayISO);
  return seriesForObjectives(entity.krs, cycle, span, ctx, todayISO);
}

export function formatToFinish(needed: number, remaining: number, unit = ''): string {
  if (needed <= 0) return 'target met';
  const suffix = unit ? ` ${unit}` : '';
  return remaining === 1 ? `${needed}${suffix} next week` : `${needed}${suffix} / week`;
}

// ===== Why-it-is-behind / pace-check math =====

export interface WhyRows {
  /** target ÷ total cycle weeks (constant). */
  neededPerWeek: number;
  /** current ÷ fractional elapsed weeks (elapsed days / 7, clamped ≥ 1). */
  actualAverage: number;
  /** Formatted third-row value: "42 next week" on the final week, else "N / week". */
  toFinish: string;
  unit: string;
}

/**
 * The three rows for one entity, per the cycle-feedback formulas: needed =
 * target ÷ cycle weeks; actual = current ÷ fractional elapsed weeks; to
 * finish = (target − current) ÷ remaining weeks (remaining = total −
 * elapsed full weeks, clamped ≥ 1 — never NaN or Infinity). KR selection
 * works in the KR's units; objective selection in percentage points.
 */
export function computeWhyRows(
  entity: { kind: 'kr'; kr: PaceKeyResult } | { kind: 'objective'; krs: PaceKeyResult[] },
  cycle: PaceCycle,
  span: CycleSpan,
  ctx: PaceDataContext,
  todayISO: string,
  cycleClosed: boolean,
): WhyRows {
  const totalWeeks = Math.max(span.totalWeeks, 1);
  const asOf = cycleClosed ? span.end : todayISO;
  const elapsedDays = Math.max(0, diffDays(span.start, asOf < span.start ? span.start : asOf));
  const elapsedWeeks = Math.max(elapsedDays / 7, 1);
  const remaining = Math.max(totalWeeks - Math.floor(elapsedDays / 7), 1);

  if (entity.kind === 'kr') {
    const kr = entity.kr;
    const current = krValueAsOf(kr, cycle, ctx, asOf);
    const needed = Math.round(kr.targetValue / totalWeeks);
    const actual = Math.round(current / elapsedWeeks);
    return {
      neededPerWeek: needed,
      actualAverage: actual,
      toFinish: formatToFinish(Math.max(0, Math.ceil((kr.targetValue - current) / remaining)), remaining),
      unit: '',
    };
  }
  // Objective: percentage points.
  const pctNow = entity.krs.length > 0
    ? entity.krs.reduce((sum, kr) => sum + pctOfTarget(krValueAsOf(kr, cycle, ctx, asOf), kr.targetValue), 0) / entity.krs.length
    : 0;
  const needed = Math.round(100 / totalWeeks);
  const actual = Math.round(pctNow / elapsedWeeks);
  return {
    neededPerWeek: needed,
    actualAverage: actual,
    toFinish: formatToFinish(Math.max(0, Math.ceil((100 - pctNow) / remaining)), remaining, 'pts'),
    unit: 'pts',
  };
}

/**
 * The unlinked-sessions note: completed focus sessions of the last finished
 * week attributing to no key result (no task, or a task without one).
 * Returns null when the week had none.
 */
export function countUnlinkedSessionsLastWeek(
  span: CycleSpan,
  ctx: PaceDataContext,
  todayISO: string,
): number | null {
  const finishedWeeks = span.mondays
    .map(m => ({ monday: m, sunday: addDaysStr(m, 6) }))
    .filter(w => w.sunday < todayISO);
  if (finishedWeeks.length === 0) return null;
  const last = finishedWeeks[finishedWeeks.length - 1];
  const servedTaskIds = new Set(ctx.tasks.filter(t => t.keyResultId).map(t => t.id));
  let count = 0;
  for (const day of ctx.history) {
    if (day.date < last.monday || day.date > last.sunday) continue;
    for (const s of day.sessions) {
      if (s.type === 'focus' && s.completed && (!s.taskId || !servedTaskIds.has(s.taskId))) count++;
    }
  }
  return count > 0 ? count : null;
}

// ===== Worst-off ranking =====

export interface RankedEntity {
  kind: 'objective' | 'kr';
  id: string;
  objectiveId: string;
  progressPct: number;
  landing: number | null;
}

/** A worst pick always carries a landing — pickWorst skips null landings. */
export type WorstEntity = RankedEntity & { landing: number };

/**
 * Where a line drawn from `fromPct` lands at cycle close when the entity
 * keeps its current overall rate (progress ÷ elapsed). The Trajectory's
 * dashed projection segment — from the last data point — and the common case
 * of `getProjectedLanding` (fromPct == currentPct) share this arithmetic.
 */
export function projectedEndpoint(fromPct: number, currentPct: number, markerPct: number): number {
  if (markerPct <= 0) return clampPct(fromPct);
  return clampPct(fromPct + (currentPct / markerPct) * (100 - markerPct));
}

/** Lowest projected landing wins; ties break by most behind the marker, then list order. */
export function pickWorst(ranked: RankedEntity[]): WorstEntity | null {
  let worst: WorstEntity | null = null;
  for (const r of ranked) {
    if (r.landing == null) continue;
    if (worst == null
      || r.landing < worst.landing
      || (r.landing === worst.landing && r.progressPct < worst.progressPct)) {
      worst = { ...r, landing: r.landing };
    }
  }
  return worst;
}
