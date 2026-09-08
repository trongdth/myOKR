// Pure computations behind the weekly review's three steps (ADR-0019).
// No React, no storage calls — everything derives from the loaded document
// slices passed in. Week values are computed as-of the week's start/end
// dates whether or not a review exists, so step 1 works on the in-progress
// week and retro-linked tasks shift the numbers (that is the point).

import {
  getEffectiveCurrentValueAsOf,
  type Confidence,
  type KeyResult,
  type Objective,
  type OKRCycle,
  type ReviewPrompt,
  type WeeklyReview,
} from './okr-storage';
import { isDraftReview } from './okr-storage';
import { computeWeekTaskPomos, type DailyRecord, type PomodoroTask } from './pomodoro-storage';
import type { Habit } from './habit-storage';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const RISK_CONFIDENCES: Confidence[] = ['at_risk', 'off_track'];

export interface ReviewInsightsInput {
  weekStart: string;
  weekEnd: string;
  todayStr: string;
  cycleId: string;
  tasks: PomodoroTask[];
  history: DailyRecord[];
  habits: Habit[];
  keyResults: KeyResult[];
  objectives: Objective[];
  cycles: OKRCycle[];
  reviews: WeeklyReview[];
  focusDurationMinutes: number;
}

export interface WeekGlanceDayStat {
  weekday: string;
  date: string;
  sessions: number;
}

export interface WeekGlance {
  sessions: number;
  sessionsPrevWeek: number;
  focusMinutes: number;
  avgFocusMinutesPerDay: number;
  tasksDone: number;
  tasksTotal: number;
  tasksCarried: number;
  habitsPct: number | null;
  habitsMissedWeekdays: string[];
  sessionsPerDay: WeekGlanceDayStat[];
  insight: string[];
}

export interface KrMove {
  keyResultId: string;
  title: string;
  startValue: number;
  endValue: number;
  delta: number;
  weekSessions: number;
}

export interface KrMovesResult {
  moves: KrMove[];
  othersNoSessions: number;
}

export interface UnlinkedSummary {
  totalSessions: number;
  unlinked: number;
  linkedToCycle: number;
}

// ===== date helpers (UTC-safe, same convention as the review repair path) =====

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function addDaysIso(iso: string, days: number): string {
  const dt = parseIsoDate(iso);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function dayBefore(iso: string): string {
  return addDaysIso(iso, -1);
}

function fmtValue(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

// ===== shared lookups =====

function cycleKrIds(keyResults: KeyResult[], objectives: Objective[], cycleId: string): Set<string> {
  const objIds = new Set(objectives.filter(o => o.cycleId === cycleId).map(o => o.id));
  return new Set(keyResults.filter(kr => objIds.has(kr.objectiveId)).map(kr => kr.id));
}

function asOf(
  kr: KeyResult,
  input: ReviewInsightsInput,
  endDate: string,
): number {
  return getEffectiveCurrentValueAsOf(
    kr,
    input.tasks,
    input.history,
    endDate,
    input.focusDurationMinutes,
    input.habits,
    input.objectives,
    input.cycles,
  );
}

function completedReviewsBefore(reviews: WeeklyReview[], weekStart: string): WeeklyReview[] {
  return reviews
    .filter(r => !isDraftReview(r) && r.weekStartDate < weekStart)
    .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));
}

// ===== week at a glance =====

export function computeWeekGlance(input: ReviewInsightsInput): WeekGlance {
  const { weekStart, weekEnd, todayStr, history, tasks, habits } = input;

  const sessionsPerDay: WeekGlanceDayStat[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDaysIso(weekStart, i);
    const day = history.find(d => d.date === date);
    const sessions = day ? day.sessions.filter(s => s.type === 'focus' && s.completed).length : 0;
    return { weekday: WEEKDAYS[i], date, sessions };
  });
  const sessions = sessionsPerDay.reduce((n, d) => n + d.sessions, 0);

  const prevStart = addDaysIso(weekStart, -7);
  const prevEnd = addDaysIso(weekStart, -1);
  let sessionsPrevWeek = 0;
  for (const day of history) {
    if (day.date >= prevStart && day.date <= prevEnd) {
      sessionsPrevWeek += day.sessions.filter(s => s.type === 'focus' && s.completed).length;
    }
  }

  let focusMinutes = 0;
  for (const day of history) {
    if (day.date >= weekStart && day.date <= weekEnd) focusMinutes += day.totalFocusMinutes;
  }
  // Days that are fully over (for per-day averages and habit scheduling) —
  // a past week counts 7, today doesn't count until it's over.
  const daysElapsed = Math.min(7, sessionsPerDay.filter(d => d.date < todayStr).length);
  const avgFocusMinutesPerDay = daysElapsed > 0 ? Math.round(focusMinutes / daysElapsed) : 0;

  // Task cohort: tasks linked to this cycle's KRs. "of N" = open entering the
  // week (or completed during it); done = finished inside the week; carried =
  // still incomplete at week end. Day-plan history isn't persisted, so the
  // cohort is cycle-scoped by design (grilling decision 8).
  const krIds = cycleKrIds(input.keyResults, input.objectives, input.cycleId);
  const cohort = tasks.filter(t => t.keyResultId && krIds.has(t.keyResultId));
  const openAtWeekStart = cohort.filter(t =>
    !t.isCompleted || (t.completedAt && t.completedAt.slice(0, 10) >= weekStart));
  const tasksDone = openAtWeekStart.filter(t =>
    t.isCompleted && t.completedAt && t.completedAt.slice(0, 10) >= weekStart && t.completedAt.slice(0, 10) <= weekEnd).length;
  const tasksCarried = openAtWeekStart.filter(t =>
    !(t.isCompleted && t.completedAt && t.completedAt.slice(0, 10) <= weekEnd)).length;

  // Habits: week-matrix semantics, but the denominator only counts days that
  // are over — a Thursday "76%" shouldn't be punished for the weekend.
  let habitsPct: number | null = null;
  const habitsMissedWeekdays: string[] = [];
  if (habits.length > 0 && daysElapsed > 0) {
    const scheduled = habits.length * daysElapsed;
    let completed = 0;
    for (const habit of habits) {
      completed += habit.ticks.filter(t => t >= weekStart && t <= weekEnd).length;
    }
    habitsPct = Math.round((completed / scheduled) * 100);
    for (const d of sessionsPerDay) {
      if (d.date >= todayStr) continue;
      const anyTick = habits.some(h => h.ticks.includes(d.date));
      if (!anyTick) habitsMissedWeekdays.push(d.weekday);
    }
  }

  return {
    sessions,
    sessionsPrevWeek,
    focusMinutes,
    avgFocusMinutesPerDay,
    tasksDone,
    tasksTotal: tasksDone + tasksCarried,
    tasksCarried,
    habitsPct,
    habitsMissedWeekdays,
    sessionsPerDay,
    insight: buildInsight(sessionsPerDay, sessions, habitsMissedWeekdays, todayStr),
  };
}

// Rule-based copy: peak day, then (when true) the light-days ∩ missed-habits
// correlation. No insight when the week had no sessions.
function buildInsight(
  days: WeekGlanceDayStat[],
  totalSessions: number,
  missedWeekdays: string[],
  todayStr: string,
): string[] {
  if (totalSessions === 0) return ['No sessions this week.'];
  const sentences: string[] = [];
  const past = days.filter(d => d.date < todayStr);
  const peak = past.reduce((best, d) => (d.sessions > best.sessions ? d : best), past[0] ?? days[0]);
  if (peak && peak.sessions > 0) sentences.push(`${peak.weekday} carried the week.`);
  const light = past.filter(d => d.sessions === 0);
  const missedSet = new Set(missedWeekdays);
  const overlap = light.filter(d => missedSet.has(d.weekday));
  if (light.length >= 2 && overlap.length === light.length) {
    sentences.push(`The ${light.length} lightest days are the ${light.length} you missed habits on.`);
  } else if (overlap.length > 0) {
    sentences.push('Your missed habit days were among the lightest.');
  }
  return sentences;
}

// ===== key results that moved =====

export function computeKrMoves(input: ReviewInsightsInput): KrMovesResult {
  const start = dayBefore(input.weekStart);
  const krIds = cycleKrIds(input.keyResults, input.objectives, input.cycleId);
  const cycleKrs = input.keyResults.filter(kr => krIds.has(kr.id));
  const weekPomos = computeWeekTaskPomos(input.history, input.weekStart, input.weekEnd);

  const moves: KrMove[] = cycleKrs.map(kr => {
    const startValue = asOf(kr, input, start);
    const endValue = asOf(kr, input, input.weekEnd);
    const weekSessions = input.tasks
      .filter(t => t.keyResultId === kr.id)
      .reduce((n, t) => n + (weekPomos.get(t.id) ?? 0), 0);
    return {
      keyResultId: kr.id,
      title: kr.title,
      startValue,
      endValue,
      delta: Math.round((endValue - startValue) * 100) / 100,
      weekSessions,
    };
  });

  moves.sort((a, b) =>
    Math.abs(b.delta) - Math.abs(a.delta) ||
    b.weekSessions - a.weekSessions);

  const shown = moves.filter(m => m.delta !== 0 || m.weekSessions > 0).slice(0, 3);
  const shownIds = new Set(shown.map(m => m.keyResultId));
  const othersNoSessions = moves.filter(m =>
    !shownIds.has(m.keyResultId) && m.delta === 0 && m.weekSessions === 0).length;

  return { moves: shown, othersNoSessions };
}

// ===== at-risk streaks =====

/**
 * Consecutive *completed* reviews immediately before `weekStart* in which the
 * KR's entry was At risk / Off track, **only when that run is ≥2** (grilling
 * decision 9 — a single flagged review is not a streak). Drafts never count.
 * The banner/prompt phrase the number as "N weeks running".
 */
export function computeAtRiskStreaks(reviews: WeeklyReview[], weekStart: string): Map<string, number> {
  const streaks = new Map<string, number>();
  const history = completedReviewsBefore(reviews, weekStart);
  if (history.length === 0) return streaks;

  const latest = new Set(
    history[0].entries.filter(e => RISK_CONFIDENCES.includes(e.confidence)).map(e => e.keyResultId));
  for (const krId of latest) {
    let streak = 1;
    for (let i = 1; i < history.length; i++) {
      const entry = history[i].entries.find(e => e.keyResultId === krId);
      if (!entry || !RISK_CONFIDENCES.includes(entry.confidence)) break;
      streak++;
    }
    if (streak >= 2) streaks.set(krId, streak);
  }
  return streaks;
}

// ===== unlinked sessions =====

// Same rule as Analytics' Unlinked work row: a completed focus session is
// unlinked when it has no task, or the task's key result is missing or
// belongs to another cycle.
export function countWeekSessions(input: ReviewInsightsInput): UnlinkedSummary {
  const krIds = cycleKrIds(input.keyResults, input.objectives, input.cycleId);
  const taskById = new Map(input.tasks.map(t => [t.id, t]));
  let totalSessions = 0;
  let unlinked = 0;
  let linkedToCycle = 0;
  for (const day of input.history) {
    if (day.date < input.weekStart || day.date > input.weekEnd) continue;
    for (const s of day.sessions) {
      if (s.type !== 'focus' || !s.completed) continue;
      totalSessions++;
      const task = s.taskId ? taskById.get(s.taskId) : undefined;
      if (task?.keyResultId && krIds.has(task.keyResultId)) linkedToCycle++;
      else unlinked++;
    }
  }
  return { totalSessions, unlinked, linkedToCycle };
}

// The banner promises linking "changes the numbers you are about to score" —
// only true when the cycle has at least one derived KR.
export function cycleHasDerivedKrs(input: Pick<ReviewInsightsInput, 'keyResults' | 'objectives' | 'cycleId'>): boolean {
  const krIds = cycleKrIds(input.keyResults, input.objectives, input.cycleId);
  return input.keyResults.some(kr => krIds.has(kr.id) && kr.completionMode && kr.completionMode !== 'manual');
}

// ===== reflect prompts =====

export function buildReflectPrompts(input: ReviewInsightsInput): ReviewPrompt[] {
  const prompts: ReviewPrompt[] = [];

  const streaks = computeAtRiskStreaks(input.reviews, input.weekStart);
  const riskCandidates = [...streaks.entries()]
    .map(([keyResultId, streak]) => ({
      keyResultId,
      streak,
      title: input.keyResults.find(kr => kr.id === keyResultId)?.title ?? 'A key result',
    }))
    .sort((a, b) => b.streak - a.streak);
  if (riskCandidates.length > 0) {
    const c = riskCandidates[0];
    prompts.push({
      id: `prompt-at_risk-${c.keyResultId}`,
      type: 'at_risk',
      keyResultId: c.keyResultId,
      text: `${c.title} has been at risk ${c.streak} weeks running. What is in the way?`,
      answer: '',
    });
  }

  const { moves } = computeKrMoves(input);
  const mover = moves.filter(m => m.delta > 0).sort((a, b) => b.delta - a.delta)[0];
  if (mover) {
    prompts.push({
      id: `prompt-mover-${mover.keyResultId}`,
      type: 'mover',
      keyResultId: mover.keyResultId,
      text: `${mover.title} moved ${fmtValue(mover.startValue)} → ${fmtValue(mover.endValue)}. What made that possible?`,
      answer: '',
    });
  }

  if (prompts.length === 0) {
    prompts.push({ id: 'prompt-free-week', type: 'free', text: 'What do you want to remember about this week?', answer: '' });
  }

  prompts.push({ id: 'prompt-one-change', type: 'one_change', text: 'One change for next week?', answer: '' });
  return prompts.slice(0, 3);
}

// The IMMEDIATELY previous completed week's One change answer — the "Last
// week you committed to…" line on this week's glance (decision 7: next
// week's glance, never an older week's). Drafts never count; a blank answer
// in the immediately previous review shows nothing.
export function previousWeekCommitment(reviews: WeeklyReview[], weekStart: string): string | null {
  const [latest] = completedReviewsBefore(reviews, weekStart);
  if (!latest) return null;
  return latest.prompts?.find(p => p.type === 'one_change' && p.answer.trim())?.answer.trim() ?? null;
}
