// OKR storage helpers — Tauri Store plugin
// Uses @tauri-apps/plugin-store for persistent JSON-based storage

import { getAutomergeDoc, updateAutomergeDoc, sanitizeForAutomerge } from './automerge-storage';
import { generateId } from './pomodoro-storage';
import type { PomodoroTask, DailyRecord } from './pomodoro-storage';
import type { Habit } from './habit-storage';

// ===== TYPES =====

export type Confidence = 'on_track' | 'at_risk' | 'off_track' | 'not_set';

export type CompletionMode = 'manual' | 'focus_hours' | 'focus_pomodoros' | 'completed_tasks' | 'habit';

export const COMPLETION_MODE_META: Record<CompletionMode, {
  label: string;
  icon: string;
  unit: string;
}> = {
  manual:            { label: 'Manual',           icon: '✏️', unit: '%' },
  focus_hours:       { label: 'Focus Hours',      icon: '⏱️', unit: 'hours' },
  focus_pomodoros:   { label: 'Pomodoros',        icon: '🍅', unit: 'pomodoros' },
  completed_tasks:   { label: 'Completed Tasks',  icon: '✅', unit: 'tasks' },
  habit:             { label: 'Habit Ticks',      icon: '📈', unit: 'ticks' },
};

export const CONFIDENCE_META: Record<Confidence, {
  label: string;
  color: string;
  bgColor: string;
  icon: string;
}> = {
  on_track:  { label: 'On Track',  color: '#22c55e', bgColor: 'rgba(34,197,94,0.12)',   icon: '🟢' },
  at_risk:   { label: 'At Risk',   color: '#f43f5e', bgColor: 'rgba(244,63,94,0.12)',   icon: '🟡' },
  off_track: { label: 'Off Track', color: '#ef4444', bgColor: 'rgba(239,68,68,0.12)',   icon: '🔴' },
  not_set:   { label: 'Not Set',   color: '#6b7280', bgColor: 'rgba(107,114,128,0.12)', icon: '⚪' },
};

export interface OKRCycle {
  id: string;
  name: string;       // e.g. "May 2026"
  month: number;      // 0-11
  year: number;       // e.g. 2026
  isActive: boolean;
  createdAt: string;
}

export interface Objective {
  id: string;
  cycleId: string;
  title: string;
  description?: string;
  reward?: string;
  order: number;
  createdAt: string;
}

export interface KeyResult {
  id: string;
  objectiveId: string;
  title: string;
  targetValue: number;
  currentValue: number;
  unit: string;          // e.g. "projects", "%", "hours"
  confidence: Confidence;
  completionMode: CompletionMode;
  order: number;
  createdAt: string;
  updatedAt: string;
  habitId?: string;
}

export interface ReviewEntry {
  keyResultId: string;
  previousValue: number;
  currentValue: number;
  confidence: Confidence;
  note?: string;
}

export interface WeeklyReview {
  id: string;
  weekStartDate: string;   // ISO date (Monday)
  weekEndDate: string;     // ISO date (Sunday)
  cycleId: string;
  completedAt?: string;
  entries: ReviewEntry[];
  reflection?: string;
  pomodoroStats: {
    totalPomodoros: number;
    totalFocusMinutes: number;
    tasksCompleted: number;
    pomodorosByKeyResult: Record<string, number>;
  };
}

// ===== HELPERS =====

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function getMonthName(month: number, year: number): string {
  return `${MONTH_NAMES[month]} ${year}`;
}

export function resolveCurrentCycle(cycles: OKRCycle[]): OKRCycle | null {
  if (cycles.length === 0) return null;
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const current = cycles.find(c => c.month === month && c.year === year);
  if (current) return current;
  // Fallback to active, then latest by date
  const active = cycles.find(c => c.isActive);
  if (active) return active;
  return cycles.reduce((latest, c) => (c.year * 12 + c.month) > (latest.year * 12 + latest.month) ? c : latest);
}

export function generateDefaultCycles(): OKRCycle[] {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
  const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;

  return [
    {
      id: generateId(),
      name: getMonthName(currentMonth, currentYear),
      month: currentMonth,
      year: currentYear,
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: generateId(),
      name: getMonthName(nextMonth, nextYear),
      month: nextMonth,
      year: nextYear,
      isActive: false,
      createdAt: new Date().toISOString(),
    },
  ];
}

/**
 * Clone the structure of a source cycle (objectives + KRs) into a new cycle
 * for the given target month/year. Fresh ids; current values reset; confidence
 * reset to 'not_set'. Pure — no storage I/O.
 */
export function cloneCycleStructure(
  source: OKRCycle,
  sourceObjectives: Objective[],
  sourceKeyResults: KeyResult[],
  targetMonth: number,
  targetYear: number,
): { cycle: OKRCycle; objectives: Objective[]; keyResults: KeyResult[] } {
  const now = new Date().toISOString();

  const cycle: OKRCycle = {
    id: generateId(),
    name: getMonthName(targetMonth, targetYear),
    month: targetMonth,
    year: targetYear,
    isActive: false,
    createdAt: now,
  };

  const relevantObjectives = sourceObjectives.filter(o => o.cycleId === source.id);
  const objectiveIdMap = new Map<string, string>();
  const objectives: Objective[] = relevantObjectives.map(o => {
    const newId = generateId();
    objectiveIdMap.set(o.id, newId);
    return {
      id: newId,
      cycleId: cycle.id,
      title: o.title,
      description: o.description,
      reward: o.reward,
      order: o.order,
      createdAt: now,
    };
  });

  const keyResults: KeyResult[] = sourceKeyResults
    .filter(kr => objectiveIdMap.has(kr.objectiveId))
    .map(kr => ({
      id: generateId(),
      objectiveId: objectiveIdMap.get(kr.objectiveId)!,
      title: kr.title,
      targetValue: kr.targetValue,
      currentValue: 0,
      unit: kr.unit,
      confidence: 'not_set',
      completionMode: kr.completionMode,
      order: kr.order,
      createdAt: now,
      updatedAt: now,
    }));

  return { cycle, objectives, keyResults };
}

export function isTickInCycleMonth(tickStr: string, cycleMonth: number, cycleYear: number): boolean {
  const parts = tickStr.split('-');
  if (parts.length !== 3) return false;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // 0-indexed month
  return year === cycleYear && month === cycleMonth;
}

export function getEffectiveCurrentValue(
  kr: KeyResult,
  tasks: PomodoroTask[],
  focusDurationMinutes: number = 25,
  habits: Habit[] = [],
  objectives: Objective[] = [],
  cycles: OKRCycle[] = [],
): number {
  if (kr.completionMode === 'manual' || !kr.completionMode) {
    return kr.currentValue;
  }
  if (kr.completionMode === 'habit') {
    if (!kr.habitId) return 0;
    const habit = habits.find(h => h.id === kr.habitId);
    if (!habit) return 0;
    const objective = objectives.find(o => o.id === kr.objectiveId);
    if (!objective) return 0;
    const cycle = cycles.find(c => c.id === objective.cycleId);
    if (!cycle) return 0;
    return habit.ticks.filter(tick => isTickInCycleMonth(tick, cycle.month, cycle.year)).length;
  }
  const linked = tasks.filter(t => t.keyResultId === kr.id);
  switch (kr.completionMode) {
    case 'focus_hours': {
      const totalMinutes = linked.reduce((sum, t) => sum + t.completedPomodoros * focusDurationMinutes, 0);
      return Math.round((totalMinutes / 60) * 100) / 100;
    }
    case 'focus_pomodoros':
      return linked.reduce((sum, t) => sum + t.completedPomodoros, 0);
    case 'completed_tasks':
      return linked.filter(t => t.isCompleted).length;
    default:
      return kr.currentValue;
  }
}

export function getEffectiveCurrentValueAsOf(
  kr: KeyResult,
  tasks: PomodoroTask[],
  history: DailyRecord[],
  endDate: string,
  focusDurationMinutes: number = 25,
  habits: Habit[] = [],
  objectives: Objective[] = [],
  cycles: OKRCycle[] = [],
): number {
  if (kr.completionMode === 'manual' || !kr.completionMode) {
    return kr.currentValue;
  }
  if (kr.completionMode === 'habit') {
    if (!kr.habitId) return 0;
    const habit = habits.find(h => h.id === kr.habitId);
    if (!habit) return 0;
    const objective = objectives.find(o => o.id === kr.objectiveId);
    if (!objective) return 0;
    const cycle = cycles.find(c => c.id === objective.cycleId);
    if (!cycle) return 0;
    return habit.ticks.filter(tick => tick <= endDate && isTickInCycleMonth(tick, cycle.month, cycle.year)).length;
  }
  const linked = tasks.filter(t => t.keyResultId === kr.id);
  const linkedIds = new Set(linked.map(t => t.id));

  switch (kr.completionMode) {
    case 'focus_hours': {
      let count = 0;
      for (const day of history) {
        if (day.date <= endDate) {
          for (const s of day.sessions) {
            if (s.type === 'focus' && s.completed && s.taskId && linkedIds.has(s.taskId)) {
              count++;
            }
          }
        }
      }
      const totalMinutes = count * focusDurationMinutes;
      return Math.round((totalMinutes / 60) * 100) / 100;
    }
    case 'focus_pomodoros': {
      let count = 0;
      for (const day of history) {
        if (day.date <= endDate) {
          for (const s of day.sessions) {
            if (s.type === 'focus' && s.completed && s.taskId && linkedIds.has(s.taskId)) {
              count++;
            }
          }
        }
      }
      return count;
    }
    case 'completed_tasks': {
      const completedLinked = linked.filter(t => 
        t.isCompleted && 
        t.completedAt && 
        t.completedAt.slice(0, 10) <= endDate
      );
      return completedLinked.length;
    }
    default:
      return kr.currentValue;
  }
}

export function computeObjectiveProgress(
  objectiveId: string,
  keyResults: KeyResult[],
  tasks?: PomodoroTask[],
  focusDurationMinutes?: number,
  habits?: Habit[],
  objectives?: Objective[],
  cycles?: OKRCycle[],
): number {
  const krs = keyResults.filter(kr => kr.objectiveId === objectiveId);
  if (krs.length === 0) return 0;
  const total = krs.reduce((sum, kr) => {
    const current = tasks
      ? getEffectiveCurrentValue(kr, tasks, focusDurationMinutes, habits, objectives, cycles)
      : kr.currentValue;
    const pct = kr.targetValue > 0 ? (current / kr.targetValue) * 100 : 0;
    return sum + Math.min(100, pct);
  }, 0);
  return Math.round(total / krs.length);
}

export function computeOverallProgress(
  objectives: Objective[],
  keyResults: KeyResult[],
  cycleId: string,
  tasks?: PomodoroTask[],
  focusDurationMinutes?: number,
  habits?: Habit[],
  cycles?: OKRCycle[],
): number {
  const cycleObjectives = objectives.filter(o => o.cycleId === cycleId);
  if (cycleObjectives.length === 0) return 0;
  const total = cycleObjectives.reduce(
    (sum, o) => sum + computeObjectiveProgress(o.id, keyResults, tasks, focusDurationMinutes, habits, objectives, cycles),
    0,
  );
  return Math.round(total / cycleObjectives.length);
}

/** Returns the Monday of the current ISO week */
export function getCurrentWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(d.setDate(diff));
  const yyyy = monday.getFullYear();
  const mm = String(monday.getMonth() + 1).padStart(2, '0');
  const dd = String(monday.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getCurrentWeekEnd(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? 0 : 7); // Sunday
  const sunday = new Date(d.setDate(diff));
  const yyyy = sunday.getFullYear();
  const mm = String(sunday.getMonth() + 1).padStart(2, '0');
  const dd = String(sunday.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Returns a list of recent Monday dates (YYYY-MM-DD) */
export function getRecentMondays(count: number = 6): string[] {
  const currentMonday = new Date(getCurrentWeekStart());
  const mondays: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(currentMonday);
    d.setUTCDate(d.getUTCDate() - i * 7);
    mondays.push(d.toISOString().slice(0, 10));
  }
  return mondays;
}

/** Returns all Mondays (latest first) whose weeks overlap with the given cycle */
export function getMondaysForCycle(cycle: { month: number; year: number }): string[] {
  const firstDay = new Date(Date.UTC(cycle.year, cycle.month, 1));
  const day = firstDay.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const firstMonday = new Date(firstDay);
  firstMonday.setUTCDate(firstMonday.getUTCDate() + diff);

  const mondays: string[] = [];
  const current = new Date(firstMonday);

  const mm = String(cycle.month + 1).padStart(2, '0');
  const monthStart = `${cycle.year}-${mm}-01`;
  const lastDayVal = new Date(Date.UTC(cycle.year, cycle.month + 1, 0)).getUTCDate();
  const monthEnd = `${cycle.year}-${mm}-${String(lastDayVal).padStart(2, '0')}`;

  while (true) {
    const weekStartStr = current.toISOString().slice(0, 10);
    const weekEndStr = getWeekEndFromStart(weekStartStr);

    if (weekStartStr <= monthEnd && weekEndStr >= monthStart) {
      mondays.push(weekStartStr);
    } else if (weekStartStr > monthEnd) {
      break;
    }
    current.setUTCDate(current.getUTCDate() + 7);
  }

  return mondays.reverse();
}

/** Returns the Sunday (YYYY-MM-DD) for a given Monday start date */
export function getWeekEndFromStart(startDate: string): string {
  const d = new Date(startDate);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

// ===== TAURI STORE =====

// ===== STORE REMOVED IN FAVOR OF AUTOMERGE =====

// ===== NORMALIZATION (untrusted synced/imported state → safe app data) =====
const CONFIDENCE_VALUES: readonly Confidence[] = ['on_track', 'at_risk', 'off_track', 'not_set'];
const COMPLETION_MODE_VALUES: readonly CompletionMode[] = ['manual', 'focus_hours', 'focus_pomodoros', 'completed_tasks', 'habit'];

function finiteNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function asObjectArray<T>(xs: unknown): T[] {
  if (!Array.isArray(xs)) return [];
  const filtered = xs.filter((x): x is T => !!x && typeof x === 'object');
  return JSON.parse(JSON.stringify(filtered));
}

function normalizeKeyResult(k: unknown): KeyResult | null {
  if (!k || typeof k !== 'object') return null;
  const plainK = JSON.parse(JSON.stringify(k));
  const kr = plainK as Record<string, unknown>;
  const confidence = kr.confidence as unknown;
  const mode = kr.completionMode as unknown;
  const normalized: KeyResult = {
    ...(kr as unknown as KeyResult),
    title: typeof kr.title === 'string' ? kr.title : '',
    targetValue: finiteNumber(kr.targetValue, 0),
    currentValue: finiteNumber(kr.currentValue, 0),
    order: finiteNumber(kr.order, 0),
    confidence: CONFIDENCE_VALUES.includes(confidence as Confidence) ? (confidence as Confidence) : 'not_set',
    completionMode: COMPLETION_MODE_VALUES.includes(mode as CompletionMode) ? (mode as CompletionMode) : 'manual',
  };
  if (typeof kr.habitId === 'string') {
    normalized.habitId = kr.habitId;
  }
  return normalized;
}

function normalizeReviewEntry(e: unknown): ReviewEntry | null {
  if (!e || typeof e !== 'object') return null;
  const plainE = JSON.parse(JSON.stringify(e));
  const en = plainE as Record<string, unknown>;
  const confidence = en.confidence as unknown;
  const entry: ReviewEntry = {
    keyResultId: typeof en.keyResultId === 'string' ? en.keyResultId : '',
    previousValue: finiteNumber(en.previousValue, 0),
    currentValue: finiteNumber(en.currentValue, 0),
    confidence: CONFIDENCE_VALUES.includes(confidence as Confidence) ? (confidence as Confidence) : 'not_set',
  };
  if (typeof en.note === 'string') entry.note = en.note;
  return entry;
}

function normalizeReview(r: unknown): WeeklyReview | null {
  if (!r || typeof r !== 'object') return null;
  const plainR = JSON.parse(JSON.stringify(r));
  const rv = plainR as Record<string, unknown>;
  const ps = rv.pomodoroStats && typeof rv.pomodoroStats === 'object' ? (rv.pomodoroStats as Record<string, unknown>) : {};
  const rawPbyKr = ps.pomodorosByKeyResult && typeof ps.pomodorosByKeyResult === 'object' ? ps.pomodorosByKeyResult as Record<string, unknown> : {};
  const pbyKr: Record<string, number> = {};
  for (const [k, v] of Object.entries(rawPbyKr)) {
    pbyKr[k] = finiteNumber(v, 0);
  }
  return {
    ...(rv as unknown as WeeklyReview),
    entries: Array.isArray(rv.entries) ? rv.entries.map(normalizeReviewEntry).filter((e): e is ReviewEntry => e !== null) : [],
    pomodoroStats: {
      totalPomodoros: finiteNumber(ps.totalPomodoros, 0),
      totalFocusMinutes: finiteNumber(ps.totalFocusMinutes, 0),
      tasksCompleted: finiteNumber(ps.tasksCompleted, 0),
      pomodorosByKeyResult: pbyKr,
    },
  };
}

// ===== CYCLES =====

export async function loadCycles(): Promise<OKRCycle[]> {
  try {
    const doc = await getAutomergeDoc();
    return asObjectArray<OKRCycle>(doc.cycles);
  } catch {
    return [];
  }
}

export async function saveCycles(cycles: OKRCycle[]): Promise<void> {
  await updateAutomergeDoc('Update cycles', (d) => {
    d.cycles = sanitizeForAutomerge(cycles);
  });
}

export async function getActiveCycle(): Promise<OKRCycle | null> {
  const cycles = await loadCycles();
  return resolveCurrentCycle(cycles);
}

export async function ensureCyclesExist(): Promise<OKRCycle[]> {
  let cycles = await loadCycles();
  if (cycles.length === 0) {
    cycles = generateDefaultCycles();
    await saveCycles(cycles);
  }
  return cycles;
}

// ===== OBJECTIVES =====

export async function loadObjectives(): Promise<Objective[]> {
  try {
    const doc = await getAutomergeDoc();
    return asObjectArray<Objective>(doc.objectives);
  } catch {
    return [];
  }
}

export async function saveObjectives(objectives: Objective[]): Promise<void> {
  await updateAutomergeDoc('Update objectives', (d) => {
    d.objectives = sanitizeForAutomerge(objectives);
  });
}

// ===== KEY RESULTS =====

export async function loadKeyResults(): Promise<KeyResult[]> {
  try {
    const doc = await getAutomergeDoc();
    const krs = Array.isArray(doc.keyResults) ? doc.keyResults.map(normalizeKeyResult).filter((k): k is KeyResult => k !== null) : [];
    return JSON.parse(JSON.stringify(krs));
  } catch {
    return [];
  }
}

export async function saveKeyResults(keyResults: KeyResult[]): Promise<void> {
  await updateAutomergeDoc('Update keyResults', (d) => {
    d.keyResults = sanitizeForAutomerge(keyResults);
  });
}

// ===== REVIEWS =====

export async function loadReviews(): Promise<WeeklyReview[]> {
  try {
    const doc = await getAutomergeDoc();
    const revs = Array.isArray(doc.reviews) ? doc.reviews.map(normalizeReview).filter((r): r is WeeklyReview => r !== null) : [];
    return JSON.parse(JSON.stringify(revs));
  } catch {
    return [];
  }
}

export async function saveReviews(reviews: WeeklyReview[]): Promise<void> {
  await updateAutomergeDoc('Update reviews', (d) => {
    d.reviews = sanitizeForAutomerge(reviews);
  });
}

// ===== WALKTHROUGH =====

export type WalkthroughState = 'not_seen' | 'seen' | 'dismissed';

export async function loadWalkthroughState(): Promise<WalkthroughState> {
  try {
    const doc = await getAutomergeDoc();
    return doc.walkthroughState || 'not_seen';
  } catch {
    return 'not_seen';
  }
}

export async function saveWalkthroughState(state: WalkthroughState): Promise<void> {
  await updateAutomergeDoc('Update walkthroughState', (d) => {
    d.walkthroughState = state;
  });
}

export function shouldShowWalkthrough(state: WalkthroughState): boolean {
  if (state === 'not_seen') return true;
  if (state === 'dismissed') return false;
  return Math.random() < 0.15;
}
