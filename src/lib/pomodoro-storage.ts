// Pomodoro storage helpers — adapted for Tauri Store plugin
// Uses @tauri-apps/plugin-store for persistent JSON-based storage

import { getAutomergeDoc, updateAutomergeDoc, sanitizeForAutomerge } from './automerge-storage';

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

// ===== STORE REMOVED IN FAVOR OF AUTOMERGE =====

// ===== NORMALIZATION (untrusted synced/imported state → safe app data) =====
// Automerge is schema-less; merged/imported bytes can carry wrong types, unknown
// enum values, or runaway numerics. These normalizers run at the load choke-point
// so downstream render code never sees a value that would throw (e.g. indexing a
// metadata map with a non-enum, or calling .filter on a non-array).
const EISENHOWER_CATEGORIES: readonly EisenhowerCategory[] = ['do', 'decide', 'delegate', 'delete'];

function finiteNumber(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, min), max) : fallback;
}

function normalizeSettings(raw: unknown): PomodoroSettings {
  const src = raw && typeof raw === 'object' ? raw as Partial<PomodoroSettings> : {};
  return {
    focusDuration: finiteNumber(src.focusDuration, DEFAULT_SETTINGS.focusDuration, 1, 120),
    shortBreakDuration: finiteNumber(src.shortBreakDuration, DEFAULT_SETTINGS.shortBreakDuration, 1, 60),
    longBreakDuration: finiteNumber(src.longBreakDuration, DEFAULT_SETTINGS.longBreakDuration, 1, 120),
    pomosBeforeLongBreak: finiteNumber(src.pomosBeforeLongBreak, DEFAULT_SETTINGS.pomosBeforeLongBreak, 1, 10),
    autoStartBreaks: typeof src.autoStartBreaks === 'boolean' ? src.autoStartBreaks : false,
    autoStartFocus: typeof src.autoStartFocus === 'boolean' ? src.autoStartFocus : false,
  };
}

function normalizeTask(t: unknown): PomodoroTask | null {
  if (!t || typeof t !== 'object') return null;
  const task = t as Record<string, unknown>;
  const category = task.category as unknown;
  return {
    ...(task as unknown as PomodoroTask),
    title: typeof task.title === 'string' ? task.title : '',
    estimatedPomodoros: finiteNumber(task.estimatedPomodoros, 0),
    completedPomodoros: finiteNumber(task.completedPomodoros, 0),
    isCompleted: typeof task.isCompleted === 'boolean' ? task.isCompleted : false,
    category: EISENHOWER_CATEGORIES.includes(category as EisenhowerCategory) ? (category as EisenhowerCategory) : undefined,
    todos: Array.isArray(task.todos) ? task.todos : undefined,
    comments: Array.isArray(task.comments) ? task.comments : undefined,
  };
}

function normalizeSession(s: unknown): SessionRecord | null {
  if (!s || typeof s !== 'object') return null;
  const sess = s as Record<string, unknown>;
  const type = sess.type as unknown;
  const session: SessionRecord = {
    startedAt: typeof sess.startedAt === 'string' ? sess.startedAt : '',
    endedAt: typeof sess.endedAt === 'string' ? sess.endedAt : '',
    type: VALID_SESSION_TYPES.includes(type as SessionType) ? (type as SessionType) : 'focus',
    completed: typeof sess.completed === 'boolean' ? sess.completed : false,
  };
  if (typeof sess.taskId === 'string') session.taskId = sess.taskId;
  return session;
}

function normalizeDailyRecord(r: unknown): DailyRecord | null {
  if (!r || typeof r !== 'object') return null;
  const rec = r as Record<string, unknown>;
  return {
    date: typeof rec.date === 'string' ? rec.date : '',
    completedPomodoros: finiteNumber(rec.completedPomodoros, 0),
    totalFocusMinutes: finiteNumber(rec.totalFocusMinutes, 0),
    tasksCompleted: finiteNumber(rec.tasksCompleted, 0),
    sessions: Array.isArray(rec.sessions) ? rec.sessions.map(normalizeSession).filter((s): s is SessionRecord => s !== null) : [],
  };
}

// ===== SETTINGS =====
export async function loadSettings(): Promise<PomodoroSettings> {
  try {
    const doc = await getAutomergeDoc();
    return normalizeSettings(doc.settings);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: PomodoroSettings): Promise<void> {
  await updateAutomergeDoc('Update settings', (d) => {
    d.settings = sanitizeForAutomerge(settings);
  });
}

// ===== TASKS =====
export async function loadTasks(): Promise<PomodoroTask[]> {
  try {
    const doc = await getAutomergeDoc();
    return Array.isArray(doc.tasks) ? doc.tasks.map(normalizeTask).filter((t): t is PomodoroTask => t !== null) : [];
  } catch {
    return [];
  }
}

export async function saveTasks(tasks: PomodoroTask[]): Promise<void> {
  await updateAutomergeDoc('Update tasks', (d) => {
    d.tasks = sanitizeForAutomerge(tasks);
  });
}

// ===== HISTORY =====
export async function loadHistory(): Promise<DailyRecord[]> {
  try {
    const doc = await getAutomergeDoc();
    return Array.isArray(doc.history) ? doc.history.map(normalizeDailyRecord).filter((r): r is DailyRecord => r !== null) : [];
  } catch {
    return [];
  }
}

export async function saveHistory(h: DailyRecord[]): Promise<void> {
  await updateAutomergeDoc('Update history', (d) => {
    d.history = sanitizeForAutomerge(h);
  });
}

// ===== TIMER STATE =====
const TIMER_STATE_KEY = 'myokr_timer_state';
const VALID_SESSION_TYPES: readonly SessionType[] = ['focus', 'shortBreak', 'longBreak'];

// localStorage is app-written (not synced/imported), but it persists across versions,
// so normalize defensively against stale/corrupt shapes rather than trusting JSON.parse.
function normalizeTimerState(raw: unknown): TimerState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const session = s.sessionType as unknown;
  return {
    sessionType: VALID_SESSION_TYPES.includes(session as SessionType) ? (session as SessionType) : 'focus',
    timeLeft: finiteNumber(s.timeLeft, 0, 0),
    isRunning: typeof s.isRunning === 'boolean' ? s.isRunning : false,
    lastUpdated: typeof s.lastUpdated === 'string' ? s.lastUpdated : new Date().toISOString(),
    activeTaskId: typeof s.activeTaskId === 'string' ? s.activeTaskId : null,
    completedPomos: finiteNumber(s.completedPomos, 0, 0),
    sessionStartedAt: typeof s.sessionStartedAt === 'string' ? s.sessionStartedAt : null,
  };
}

export async function loadTimerState(): Promise<TimerState | null> {
  try {
    const val = localStorage.getItem(TIMER_STATE_KEY);
    return val ? normalizeTimerState(JSON.parse(val)) : null;
  } catch {
    return null;
  }
}

export async function saveTimerState(state: TimerState): Promise<void> {
  try {
    localStorage.setItem(TIMER_STATE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save timer state to localStorage', e);
  }
}

export async function clearTimerState(): Promise<void> {
  try {
    localStorage.removeItem(TIMER_STATE_KEY);
  } catch (e) {
    console.error('Failed to clear timer state in localStorage', e);
  }
}

// ===== DATE HELPERS =====
export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayKey(): string {
  return getLocalDateString();
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

export function computeWeekTaskPomos(
  history: DailyRecord[],
  weekStart: string,
  weekEnd: string,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const day of history) {
    if (day.date < weekStart || day.date > weekEnd) continue;
    for (const s of day.sessions) {
      if (s.type !== 'focus' || !s.completed || !s.taskId) continue;
      m.set(s.taskId, (m.get(s.taskId) || 0) + 1);
    }
  }
  return m;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
