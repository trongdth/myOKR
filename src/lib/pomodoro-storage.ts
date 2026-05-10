// Pomodoro storage helpers — adapted for Tauri Store plugin
// Uses @tauri-apps/plugin-store for persistent JSON-based storage

import { load } from '@tauri-apps/plugin-store';

// ===== TYPES =====
export interface PomodoroSettings {
  focusDuration: number;
  shortBreakDuration: number;
  longBreakDuration: number;
  pomosBeforeLongBreak: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
}

export type SessionType = 'focus' | 'shortBreak' | 'longBreak';

export type EisenhowerCategory = 'do' | 'decide' | 'delegate' | 'delete';

export const EISENHOWER_META: Record<EisenhowerCategory, {
  label: string;
  description: string;
  color: string;
  bgColor: string;
  icon: string;
  axis: { urgent: boolean; important: boolean };
}> = {
  do:       { label: 'Do',       description: 'Get it done now',          color: '#ef4444', bgColor: 'rgba(239,68,68,0.12)',   icon: '🔴', axis: { urgent: true,  important: true  } },
  decide:   { label: 'Decide',   description: 'Schedule a time to do it', color: '#eab308', bgColor: 'rgba(234,179,8,0.12)',   icon: '🟡', axis: { urgent: false, important: true  } },
  delegate: { label: 'Delegate', description: 'Who can do it for you?',   color: '#f97316', bgColor: 'rgba(249,115,22,0.12)',  icon: '🟠', axis: { urgent: true,  important: false } },
  delete:   { label: 'Delete',   description: 'Eliminate it',             color: '#6b7280', bgColor: 'rgba(107,114,128,0.12)', icon: '⚪', axis: { urgent: false, important: false } },
};

export const EISENHOWER_PRIORITY_ORDER: EisenhowerCategory[] = ['do', 'decide', 'delegate', 'delete'];

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
}

export interface TaskComment {
  id: string;
  text: string;
  createdAt: string;
}

export interface PomodoroTask {
  id: string;
  title: string;
  description?: string;
  todos?: TodoItem[];
  comments?: TaskComment[];
  estimatedPomodoros: number;
  completedPomodoros: number;
  isCompleted: boolean;
  createdAt: string;
  completedAt?: string;
  category?: EisenhowerCategory;
  keyResultId?: string;
}

export interface SessionRecord {
  startedAt: string;
  endedAt: string;
  type: SessionType;
  taskId?: string;
  completed: boolean;
}

export interface DailyRecord {
  date: string;
  completedPomodoros: number;
  totalFocusMinutes: number;
  tasksCompleted: number;
  sessions: SessionRecord[];
}

export interface TimerState {
  sessionType: SessionType;
  timeLeft: number;
  isRunning: boolean;
  lastUpdated: string;
  activeTaskId: string | null;
  completedPomos: number;
  sessionStartedAt: string | null;
}

// ===== DEFAULTS =====
export const DEFAULT_SETTINGS: PomodoroSettings = {
  focusDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  pomosBeforeLongBreak: 4,
  autoStartBreaks: false,
  autoStartFocus: false,
};

// ===== TAURI STORE =====
let _store: Awaited<ReturnType<typeof load>> | null = null;

async function getStore() {
  if (!_store) {
    _store = await load('pomodoro-data.json', { autoSave: true, defaults: {} });
  }
  return _store;
}

// ===== SETTINGS =====
export async function loadSettings(): Promise<PomodoroSettings> {
  try {
    const store = await getStore();
    const saved = await store.get<Partial<PomodoroSettings>>('settings');
    return { ...DEFAULT_SETTINGS, ...(saved || {}) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: PomodoroSettings): Promise<void> {
  try {
    const store = await getStore();
    await store.set('settings', s);
  } catch { /* silently fail */ }
}

// ===== TASKS =====
export async function loadTasks(): Promise<PomodoroTask[]> {
  try {
    const store = await getStore();
    return (await store.get<PomodoroTask[]>('tasks')) || [];
  } catch {
    return [];
  }
}

export async function saveTasks(tasks: PomodoroTask[]): Promise<void> {
  try {
    const store = await getStore();
    await store.set('tasks', tasks);
  } catch { /* silently fail */ }
}

// ===== HISTORY =====
export async function loadHistory(): Promise<DailyRecord[]> {
  try {
    const store = await getStore();
    return (await store.get<DailyRecord[]>('history')) || [];
  } catch {
    return [];
  }
}

export async function saveHistory(h: DailyRecord[]): Promise<void> {
  try {
    const store = await getStore();
    await store.set('history', h);
  } catch { /* silently fail */ }
}

// ===== TIMER STATE =====
export async function loadTimerState(): Promise<TimerState | null> {
  try {
    const store = await getStore();
    return (await store.get<TimerState | null>('timerState')) || null;
  } catch {
    return null;
  }
}

export async function saveTimerState(state: TimerState): Promise<void> {
  try {
    const store = await getStore();
    await store.set('timerState', state);
  } catch { /* silently fail */ }
}

export async function clearTimerState(): Promise<void> {
  try {
    const store = await getStore();
    await store.delete('timerState');
  } catch { /* silently fail */ }
}

// ===== DATE HELPERS =====
export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getTodayRecord(history: DailyRecord[]): DailyRecord {
  const key = todayKey();
  return history.find(r => r.date === key) || {
    date: key,
    completedPomodoros: 0,
    totalFocusMinutes: 0,
    tasksCompleted: 0,
    sessions: [],
  };
}

export function upsertTodayRecord(history: DailyRecord[], record: DailyRecord): DailyRecord[] {
  const key = todayKey();
  const idx = history.findIndex(r => r.date === key);
  if (idx >= 0) {
    const copy = [...history];
    copy[idx] = record;
    return copy;
  }
  return [...history, record];
}

// ===== AUDIO =====
export function playCompletionSound(): void {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
    // Second beep
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.value = 1000;
    osc2.type = 'sine';
    gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.3);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
    osc2.start(ctx.currentTime + 0.3);
    osc2.stop(ctx.currentTime + 0.8);
  } catch { /* no audio support */ }
}

// ===== NOTIFICATIONS (Tauri native) =====
export async function sendNotification(title: string, body: string): Promise<void> {
  try {
    const { sendNotification: tauriNotify, isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
    let permitted = await isPermissionGranted();
    if (!permitted) {
      const result = await requestPermission();
      permitted = result === 'granted';
    }
    if (permitted) {
      tauriNotify({ title, body });
    }
  } catch {
    // Fallback to web notification
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body });
      }
    } catch { /* not supported */ }
  }
}

export async function requestNotificationPermission(): Promise<void> {
  try {
    const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
    const permitted = await isPermissionGranted();
    if (!permitted) {
      await requestPermission();
    }
  } catch {
    // Fallback
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } catch { /* not supported */ }
  }
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
