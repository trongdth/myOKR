// OKR storage helpers — Tauri Store plugin
// Uses @tauri-apps/plugin-store for persistent JSON-based storage

import { getAutomergeDoc, updateAutomergeDoc, sanitizeForAutomerge } from './automerge-storage';
import { generateId } from './pomodoro-storage';
import type { PomodoroTask } from './pomodoro-storage';

// ===== TYPES =====

export type Confidence = 'on_track' | 'at_risk' | 'off_track' | 'not_set';

export type CompletionMode = 'manual' | 'focus_hours' | 'focus_pomodoros' | 'completed_tasks';

export const COMPLETION_MODE_META: Record<CompletionMode, {
  label: string;
  icon: string;
  unit: string;
}> = {
  manual:            { label: 'Manual',           icon: '✏️', unit: '%' },
  focus_hours:       { label: 'Focus Hours',      icon: '⏱️', unit: 'hours' },
  focus_pomodoros:   { label: 'Pomodoros',        icon: '🍅', unit: 'pomodoros' },
  completed_tasks:   { label: 'Completed Tasks',  icon: '✅', unit: 'tasks' },
};

export const CONFIDENCE_META: Record<Confidence, {
  label: string;
  color: string;
  bgColor: string;
  icon: string;
}> = {
  on_track:  { label: 'On Track',  color: '#22c55e', bgColor: 'rgba(34,197,94,0.12)',   icon: '🟢' },
  at_risk:   { label: 'At Risk',   color: '#eab308', bgColor: 'rgba(234,179,8,0.12)',   icon: '🟡' },
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

export function getEffectiveCurrentValue(
  kr: KeyResult,
  tasks: PomodoroTask[],
  focusDurationMinutes: number = 25,
): number {
  if (kr.completionMode === 'manual' || !kr.completionMode) {
    return kr.currentValue;
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

export function computeObjectiveProgress(
  objectiveId: string,
  keyResults: KeyResult[],
  tasks?: PomodoroTask[],
  focusDurationMinutes?: number,
): number {
  const krs = keyResults.filter(kr => kr.objectiveId === objectiveId);
  if (krs.length === 0) return 0;
  const total = krs.reduce((sum, kr) => {
    const current = tasks
      ? getEffectiveCurrentValue(kr, tasks, focusDurationMinutes)
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
): number {
  const cycleObjectives = objectives.filter(o => o.cycleId === cycleId);
  if (cycleObjectives.length === 0) return 0;
  const total = cycleObjectives.reduce(
    (sum, o) => sum + computeObjectiveProgress(o.id, keyResults, tasks, focusDurationMinutes),
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
  return monday.toISOString().slice(0, 10);
}

/** Returns the Sunday of the current ISO week */
export function getCurrentWeekEnd(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? 0 : 7); // Sunday
  const sunday = new Date(d.setDate(diff));
  return sunday.toISOString().slice(0, 10);
}

// ===== TAURI STORE =====

// ===== STORE REMOVED IN FAVOR OF AUTOMERGE =====

// ===== CYCLES =====

export async function loadCycles(): Promise<OKRCycle[]> {
  try {
    const doc = await getAutomergeDoc();
    return doc.cycles || [];
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
    return doc.objectives || [];
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
    return doc.keyResults || [];
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
    return doc.reviews || [];
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
