// Today Focus — strict Eisenhower ranking with effort-vs-time-left urgency,
// and a per-day plan locked in localStorage so picks stay stable all day.
import type { PomodoroTask, EisenhowerCategory, PomodoroSettings } from './pomodoro-storage';
import { getLocalDateString } from './pomodoro-storage';
import type { KeyResult, Confidence, OKRCycle } from './okr-storage';

// ===== CONSTANTS =====

export const DAILY_FOCUS_MINUTES = 320; // 320 minutes — 8 pomodoros @ 40 min/session ceiling

// Lower rank sorts first. Category is the primary key — a Do task can never
// be outranked by a Decide task, regardless of other factors.
const CATEGORY_RANK: Record<EisenhowerCategory, number> = {
  do: 0,
  decide: 1,
  delegate: 2,
  delete: 3,
};

// Higher rank wins ties. KR confidence is a tie-breaker only, never a weight.
const CONFIDENCE_RANK: Record<Confidence | 'no_kr', number> = {
  off_track: 4,
  at_risk: 3,
  on_track: 2,
  not_set: 1,
  no_kr: 0,
};

// ===== BUDGET DERIVATION =====

export function getDailyPomodoroBudget(settings: PomodoroSettings): number {
  return Math.round(DAILY_FOCUS_MINUTES / settings.focusDuration);
}

export function getMaxTaskBudgetShare(budget: number): number {
  return Math.max(5, Math.floor(budget / 2));
}

export function remainingPomodoros(task: PomodoroTask): number {
  return Math.max(0, (task.estimatedPomodoros || 1) - task.completedPomodoros);
}

export function todaysSlice(task: PomodoroTask, maxShare: number): number {
  return Math.min(remainingPomodoros(task), maxShare);
}

// ===== DAYS LEFT IN CYCLE =====

export function getDaysLeftInCycle(cycle: OKRCycle | null): number {
  if (!cycle) return 999;
  const lastDay = new Date(cycle.year, cycle.month + 1, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  lastDay.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((lastDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
}

// ===== SCORING =====

export interface ScoreBreakdown {
  categoryRank: number;   // 0 = Do; primary sort key
  urgency: number;        // 0..1 — remaining effort vs days left in cycle
  confidenceRank: number; // tie-breaker
  momentum: number;       // tie-breaker: 1 if already in progress
  daysNeeded: number;     // full-focus days to finish the remaining estimate
  daysLeft: number;
}

export function scoreTask(
  task: PomodoroTask,
  kr: KeyResult | undefined,
  daysLeft: number,
  budget: number,
): ScoreBreakdown {
  const remaining = remainingPomodoros(task);
  const daysNeeded = remaining / budget;
  return {
    categoryRank: CATEGORY_RANK[task.category ?? 'decide'],
    urgency: remaining === 0 ? 0 : Math.min(1, daysNeeded / Math.max(daysLeft, 1)),
    confidenceRank: kr ? CONFIDENCE_RANK[kr.confidence] : CONFIDENCE_RANK.no_kr,
    momentum: task.completedPomodoros > 0 && !task.isCompleted ? 1 : 0,
    daysNeeded,
    daysLeft,
  };
}

function compareScored(a: ScoredTask, b: ScoredTask): number {
  if (a._score.categoryRank !== b._score.categoryRank) return a._score.categoryRank - b._score.categoryRank;
  if (b._score.urgency !== a._score.urgency) return b._score.urgency - a._score.urgency;
  if (b._score.confidenceRank !== a._score.confidenceRank) return b._score.confidenceRank - a._score.confidenceRank;
  if (b._score.momentum !== a._score.momentum) return b._score.momentum - a._score.momentum;
  return a.createdAt.localeCompare(b.createdAt);
}

// ===== HUMANIZED WHY REASONS =====

export function getWhyReasons(b: ScoreBreakdown): string[] {
  const reasons: string[] = [];

  if (b.categoryRank === 0) reasons.push('Top-priority Do task');
  else if (b.categoryRank === 1) reasons.push('Important Decide task');
  else if (b.categoryRank === 2) reasons.push('Delegate task');

  if (b.urgency >= 1) {
    reasons.push(`Needs every remaining day (${b.daysLeft}) to finish`);
  } else if (b.urgency >= 0.5) {
    reasons.push(`Needs ~${Math.ceil(b.daysNeeded)} of the ${b.daysLeft} days left in the cycle`);
  }

  if (b.momentum >= 1) reasons.push('Already in progress');

  if (b.confidenceRank === 4) reasons.push('KR is off-track');
  else if (b.confidenceRank === 3) reasons.push('KR is at risk');

  return reasons;
}

// ===== RANKING + BUDGET FILL =====

const MAX_CARDS = 5;

export type ScoredTask = PomodoroTask & { _score: ScoreBreakdown };

export function rankTasks(
  tasks: PomodoroTask[],
  keyResults: KeyResult[],
  cycle: OKRCycle | null,
  settings: PomodoroSettings,
  excludeIds: string[] = [],
  opts: { shuffleTies?: boolean } = {},
): ScoredTask[] {
  const krMap = new Map(keyResults.map(kr => [kr.id, kr]));
  const daysLeft = getDaysLeftInCycle(cycle);
  const budget = getDailyPomodoroBudget(settings);
  const excludeSet = new Set(excludeIds);

  // Pre-assign a random tie-break key per task so shuffling is a real shuffle
  // (a random sort comparator is inconsistent across engines). Only used when
  // reshuffling tied tasks on Replan.
  const tieKey = new Map<string, number>();

  return tasks
    .filter(t => !t.isCompleted && t.category !== 'delete' && !excludeSet.has(t.id))
    .map(t => {
      const kr = t.keyResultId ? krMap.get(t.keyResultId) : undefined;
      if (opts.shuffleTies) tieKey.set(t.id, Math.random());
      return { ...t, _score: scoreTask(t, kr, daysLeft, budget) };
    })
    .sort((a, b) => {
      if (!opts.shuffleTies) return compareScored(a, b);
      // Reshuffle within (category, urgency, confidence) bands; ignore the
      // deterministic momentum/createdAt tiebreaks so genuine ties move.
      if (a._score.categoryRank !== b._score.categoryRank) return a._score.categoryRank - b._score.categoryRank;
      if (b._score.urgency !== a._score.urgency) return b._score.urgency - a._score.urgency;
      if (b._score.confidenceRank !== a._score.confidenceRank) return b._score.confidenceRank - a._score.confidenceRank;
      return (tieKey.get(a.id) ?? 0) - (tieKey.get(b.id) ?? 0);
    });
}

// Fill the day in rank order. The top-ranked task is always included (its
// slice is capped at maxShare ≤ budget); lower ranks only if their slice fits.
function fillBudget(
  ranked: ScoredTask[],
  budget: number,
  maxShare: number,
  alreadyPicked: ScoredTask[] = [],
): ScoredTask[] {
  const picked = [...alreadyPicked];
  const pickedIds = new Set(picked.map(t => t.id));
  let used = picked.reduce((sum, t) => sum + todaysSlice(t, maxShare), 0);

  for (const c of ranked) {
    if (picked.length >= MAX_CARDS) break;
    if (pickedIds.has(c.id)) continue;
    const slice = todaysSlice(c, maxShare);
    if (slice === 0) continue;
    if (picked.length === 0 || slice <= budget - used) {
      picked.push(c);
      pickedIds.add(c.id);
      used += slice;
    }
  }

  return picked;
}

// ===== PLAN-DAY MODAL SPLIT =====

export interface CapacitySplit {
  inCapacity: ScoredTask[];
  /** Ranked candidates that did not fit the budget — "Add anyway" pool. */
  overflow: ScoredTask[];
  /** Pomodoros committed by the in-capacity list (sum of slices). */
  used: number;
}

/**
 * Split ranked candidates at the day's capacity for the Plan-day modal.
 * Unlike fillBudget (the dashboard's auto-fill) there is no MAX_CARDS cap —
 * the modal IS the capacity view, so membership is bounded by the pomodoro
 * budget alone. Greedy in rank order: a task joins when its whole slice fits
 * the remaining budget (the first task always joins — its slice is capped at
 * maxShare ≤ budget, mirroring fillBudget); everything else overflows in rank
 * order. Tasks with nothing remaining are skipped: there is nothing to plan.
 */
export function splitByCapacity(
  ranked: ScoredTask[],
  budget: number,
  maxShare: number,
): CapacitySplit {
  const inCapacity: ScoredTask[] = [];
  const overflow: ScoredTask[] = [];
  let used = 0;

  for (const c of ranked) {
    const slice = todaysSlice(c, maxShare);
    if (slice === 0) continue;
    if (inCapacity.length === 0 || slice <= budget - used) {
      inCapacity.push(c);
      used += slice;
    } else {
      overflow.push(c);
    }
  }

  return { inCapacity, overflow, used };
}

// ===== DAILY PLAN PERSISTENCE =====

export interface TodayPlan {
  date: string;
  taskIds: string[];
  skippedIds: string[];
}

const TODAY_PLAN_KEY = 'myokr_today_plan';

export function loadTodayPlan(): TodayPlan | null {
  try {
    const raw = localStorage.getItem(TODAY_PLAN_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<TodayPlan>;
    if (!p || typeof p !== 'object' || p.date !== getLocalDateString()) return null;
    return {
      date: p.date,
      taskIds: Array.isArray(p.taskIds) ? p.taskIds.filter((x): x is string => typeof x === 'string') : [],
      skippedIds: Array.isArray(p.skippedIds) ? p.skippedIds.filter((x): x is string => typeof x === 'string') : [],
    };
  } catch {
    return null;
  }
}

export function saveTodayPlan(plan: TodayPlan): void {
  try {
    localStorage.setItem(TODAY_PLAN_KEY, JSON.stringify(plan));
  } catch (e) {
    console.error('Failed to save today plan', e);
  }
}

export function clearTodayPlan(): void {
  try {
    localStorage.removeItem(TODAY_PLAN_KEY);
  } catch { /* ignore */ }
}

// ===== BUILD TODAY'S LIST =====

// Honor the saved plan's order (dropping tasks that were completed, skipped,
// or re-categorized away), then top up freed budget from the ranked candidates.
export function buildTodayList(
  tasks: PomodoroTask[],
  keyResults: KeyResult[],
  cycle: OKRCycle | null,
  settings: PomodoroSettings,
  plan: TodayPlan | null,
  opts: { shuffleTies?: boolean } = {},
): { picked: ScoredTask[]; plan: TodayPlan } {
  const skippedIds = plan?.skippedIds ?? [];
  const ranked = rankTasks(tasks, keyResults, cycle, settings, skippedIds, opts);
  const budget = getDailyPomodoroBudget(settings);
  const maxShare = getMaxTaskBudgetShare(budget);

  const byId = new Map(ranked.map(t => [t.id, t]));
  const kept = (plan?.taskIds ?? [])
    .map(id => byId.get(id))
    .filter((t): t is ScoredTask => !!t && remainingPomodoros(t) > 0);

  const picked = fillBudget(ranked, budget, maxShare, kept);

  return {
    picked,
    plan: { date: getLocalDateString(), taskIds: picked.map(t => t.id), skippedIds },
  };
}
