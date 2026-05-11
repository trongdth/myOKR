// OKR storage helpers — Tauri Store plugin
// Uses @tauri-apps/plugin-store for persistent JSON-based storage

import { load } from '@tauri-apps/plugin-store';
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

let _store: Awaited<ReturnType<typeof load>> | null = null;

async function getStore() {
  if (!_store) {
    _store = await load('okr-data.json', { autoSave: true, defaults: {} });
  }
  return _store;
}

// ===== CYCLES =====

export async function loadCycles(): Promise<OKRCycle[]> {
  try {
    const store = await getStore();
    return (await store.get<OKRCycle[]>('cycles')) || [];
  } catch {
    return [];
  }
}

export async function saveCycles(cycles: OKRCycle[]): Promise<void> {
  try {
    const store = await getStore();
    await store.set('cycles', cycles);
  } catch { /* silently fail */ }
}

export async function getActiveCycle(): Promise<OKRCycle | null> {
  const cycles = await loadCycles();
  return cycles.find(c => c.isActive) || cycles[0] || null;
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
    const store = await getStore();
    return (await store.get<Objective[]>('objectives')) || [];
  } catch {
    return [];
  }
}

export async function saveObjectives(objectives: Objective[]): Promise<void> {
  try {
    const store = await getStore();
    await store.set('objectives', objectives);
  } catch { /* silently fail */ }
}

// ===== KEY RESULTS =====

export async function loadKeyResults(): Promise<KeyResult[]> {
  try {
    const store = await getStore();
    return (await store.get<KeyResult[]>('keyResults')) || [];
  } catch {
    return [];
  }
}

export async function saveKeyResults(keyResults: KeyResult[]): Promise<void> {
  try {
    const store = await getStore();
    await store.set('keyResults', keyResults);
  } catch { /* silently fail */ }
}

// ===== REVIEWS =====

export async function loadReviews(): Promise<WeeklyReview[]> {
  try {
    const store = await getStore();
    return (await store.get<WeeklyReview[]>('reviews')) || [];
  } catch {
    return [];
  }
}

export async function saveReviews(reviews: WeeklyReview[]): Promise<void> {
  try {
    const store = await getStore();
    await store.set('reviews', reviews);
  } catch { /* silently fail */ }
}
