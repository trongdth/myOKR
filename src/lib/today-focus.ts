// Today Focus — deterministic, normalised heuristic with time-based budget fill
import type { PomodoroTask, EisenhowerCategory, PomodoroSettings } from './pomodoro-storage';
import type { KeyResult, Confidence, OKRCycle } from './okr-storage';

// ===== CONSTANTS =====

export const DAILY_FOCUS_MINUTES = 240; // 4 focused hours — research-backed ceiling

export const WEIGHT_CATEGORY = 0.45;
export const WEIGHT_CONFIDENCE = 0.30;
export const WEIGHT_URGENCY = 0.15;
export const WEIGHT_MOMENTUM = 0.10;

const CATEGORY_NORM: Record<EisenhowerCategory, number> = {
  do: 1.0,
  decide: 0.66,
  delegate: 0.33,
  delete: 0,
};

const CONFIDENCE_NORM: Record<Confidence | 'no_kr', number> = {
  off_track: 1.0,
  at_risk: 0.66,
  on_track: 0.33,
  not_set: 0.16,
  no_kr: 0,
};

function urgencyNorm(daysLeft: number): number {
  if (daysLeft <= 7) return 1.0;
  if (daysLeft <= 14) return 0.5;
  return 0;
}

function momentumNorm(task: PomodoroTask): number {
  if (task.completedPomodoros > 0 && !task.isCompleted) return 1.0;
  return 0;
}

// ===== BUDGET DERIVATION =====

export function getDailyPomodoroBudget(settings: PomodoroSettings): number {
  return Math.round(DAILY_FOCUS_MINUTES / settings.focusDuration);
}

export function getMaxTaskBudgetShare(budget: number): number {
  return Math.max(2, Math.floor(budget / 2));
}

export function todaysSlice(task: PomodoroTask, maxShare: number): number {
  const remaining = Math.max(0, (task.estimatedPomodoros || 1) - task.completedPomodoros);
  return Math.min(remaining, maxShare);
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
  categoryRaw: number;
  confidenceRaw: number;
  urgencyRaw: number;
  momentumRaw: number;
  total: number;
}

export function scoreTask(
  task: PomodoroTask,
  kr: KeyResult | undefined,
  daysLeft: number,
): ScoreBreakdown {
  const catRaw = CATEGORY_NORM[task.category ?? 'decide'];
  const confRaw = kr ? CONFIDENCE_NORM[kr.confidence] : CONFIDENCE_NORM.no_kr;
  const urgRaw = urgencyNorm(daysLeft);
  const momRaw = momentumNorm(task);

  return {
    categoryRaw: catRaw,
    confidenceRaw: confRaw,
    urgencyRaw: urgRaw,
    momentumRaw: momRaw,
    total: WEIGHT_CATEGORY * catRaw + WEIGHT_CONFIDENCE * confRaw + WEIGHT_URGENCY * urgRaw + WEIGHT_MOMENTUM * momRaw,
  };
}

// ===== HUMANIZED WHY REASONS =====

export function getWhyReasons(breakdown: ScoreBreakdown, daysLeft: number): string[] {
  const reasons: string[] = [];

  if (breakdown.categoryRaw >= 1.0) reasons.push('🔥 Top-priority Do task');
  else if (breakdown.categoryRaw >= 0.66) reasons.push('📋 Important Decide task');
  else if (breakdown.categoryRaw >= 0.33) reasons.push('👉 Delegate task');

  if (breakdown.confidenceRaw >= 1.0) reasons.push('⚠️ KR is off-track');
  else if (breakdown.confidenceRaw >= 0.66) reasons.push('🟡 KR is at risk');

  if (breakdown.urgencyRaw >= 1.0) reasons.push(`⏰ Cycle ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`);
  else if (breakdown.urgencyRaw >= 0.5) reasons.push('⏰ Cycle ends within 2 weeks');

  if (breakdown.momentumRaw >= 1.0) reasons.push('🚀 Already in progress');

  return reasons;
}

// ===== BUDGET FILL =====

const MAX_CARDS = 5;

export function pickForBudget(
  tasks: PomodoroTask[],
  keyResults: KeyResult[],
  cycle: OKRCycle | null,
  settings: PomodoroSettings,
  excludeIds: string[] = [],
): Array<PomodoroTask & { _score: ScoreBreakdown }> {
  const krMap = new Map(keyResults.map(kr => [kr.id, kr]));
  const daysLeft = getDaysLeftInCycle(cycle);
  const excludeSet = new Set(excludeIds);
  const budget = getDailyPomodoroBudget(settings);
  const maxShare = getMaxTaskBudgetShare(budget);

  const candidates = tasks
    .filter(t => !t.isCompleted && t.category !== 'delete' && !excludeSet.has(t.id))
    .map(t => {
      const kr = t.keyResultId ? krMap.get(t.keyResultId) : undefined;
      const _score = scoreTask(t, kr, daysLeft);
      return { ...t, _score };
    });

  candidates.sort((a, b) => {
    if (b._score.total !== a._score.total) return b._score.total - a._score.total;
    return a.createdAt.localeCompare(b.createdAt);
  });

  // Greedy budget fill using slices
  const picked: typeof candidates = [];
  let cumulative = 0;
  for (const c of candidates) {
    if (picked.length >= MAX_CARDS) break;
    picked.push(c);
    cumulative += todaysSlice(c, maxShare);
    if (cumulative >= budget && picked.length >= 1) break;
  }

  return picked;
}

// ===== RESHUFFLE POOL =====

const RESHUFFLE_BAND = 0.10;

export function getReshufflePool(
  tasks: PomodoroTask[],
  keyResults: KeyResult[],
  cycle: OKRCycle | null,
  _settings: PomodoroSettings,
  pickedCount: number,
  excludeIds: string[] = [],
): Array<PomodoroTask & { _score: ScoreBreakdown }> {
  const krMap = new Map(keyResults.map(kr => [kr.id, kr]));
  const daysLeft = getDaysLeftInCycle(cycle);
  const excludeSet = new Set(excludeIds);

  const candidates = tasks
    .filter(t => !t.isCompleted && t.category !== 'delete' && !excludeSet.has(t.id))
    .map(t => {
      const kr = t.keyResultId ? krMap.get(t.keyResultId) : undefined;
      const _score = scoreTask(t, kr, daysLeft);
      return { ...t, _score };
    });

  candidates.sort((a, b) => {
    if (b._score.total !== a._score.total) return b._score.total - a._score.total;
    return a.createdAt.localeCompare(b.createdAt);
  });

  const poolSize = Math.max(6, pickedCount + 3);
  return candidates.slice(0, poolSize);
}

// Reshuffle within 0.10 score band of the top
export function reshufflePool(
  pool: Array<PomodoroTask & { _score: ScoreBreakdown }>,
  _settings: PomodoroSettings,
): Array<PomodoroTask & { _score: ScoreBreakdown }> {
  if (pool.length <= 1) return pool;

  const topScore = pool[0]._score.total;
  const band = pool.filter(t => t._score.total >= topScore - RESHUFFLE_BAND);

  // Shuffle the band
  const shuffled = [...band];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Reassemble: shuffled band first, then rest
  const bandIds = new Set(band.map(t => t.id));
  const rest = pool.filter(t => !bandIds.has(t.id));
  return [...shuffled, ...rest];
}
