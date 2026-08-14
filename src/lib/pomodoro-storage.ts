// Pomodoro storage helpers — adapted for Tauri Store plugin
// Uses @tauri-apps/plugin-store for persistent JSON-based storage

import { getAutomergeDoc, updateAutomergeDoc, sanitizeForAutomerge } from './automerge-storage';

// ===== TYPES =====

/**
 * Ambient background sound for the Session tab (ADR-0015). Procedural Web Audio
 * synths — no audio assets (licensing). `'none'` is the new off; it replaces the
 * legacy `focusMusicEnabled: boolean` drone, which is migrated away in
 * `normalizeSettings` (old `true` → `'none'`, since the drone is gone and we
 * can't know which preset the user would have wanted).
 */
export type AmbientPreset = 'none' | 'rain' | 'forest' | 'cafe';

export const AMBIENT_PRESETS: readonly AmbientPreset[] = ['none', 'rain', 'forest', 'cafe'];

export interface PomodoroSettings {
  focusDuration: number;
  shortBreakDuration: number;
  longBreakDuration: number;
  pomosBeforeLongBreak: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  ambientPreset: AmbientPreset;
}

export type SessionType = 'focus' | 'shortBreak' | 'longBreak';

export type EisenhowerCategory = 'do' | 'decide' | 'delegate' | 'delete';

export const EISENHOWER_META: Record<EisenhowerCategory, {
  label: string;
  description: string;
  color: string;
  bgColor: string;
  axis: { urgent: boolean; important: boolean };
}> = {
  do:       { label: 'Do',       description: 'Get it done now',          color: '#ef4444', bgColor: 'rgba(239,68,68,0.12)',   axis: { urgent: true,  important: true  } },
  decide:   { label: 'Decide',   description: 'Schedule a time to do it', color: '#eab308', bgColor: 'rgba(234,179,8,0.12)',   axis: { urgent: false, important: true  } },
  delegate: { label: 'Delegate', description: 'Who can do it for you?',   color: '#f97316', bgColor: 'rgba(249,115,22,0.12)',  axis: { urgent: true,  important: false } },
  delete:   { label: 'Delete',   description: 'Eliminate it',             color: '#6b7280', bgColor: 'rgba(107,114,128,0.12)', axis: { urgent: false, important: false } },
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

export type TaskBucket = 'today' | 'this_week' | 'backlog';
export const TASK_BUCKETS: TaskBucket[] = ['today', 'this_week', 'backlog'];

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
  bucket?: TaskBucket;
  dueDate?: string;
  keyResultId?: string;
  /** Last time any field on this task changed. Stamped centrally in
   *  handleTasksChange (SessionProvider) on every edit path, so the Task-detail
   *  footer's "updated X ago" reflects real edits. Absent on legacy tasks → the
   *  footer falls back to completedAt ?? createdAt. Mirrors KR/habit updatedAt. */
  updatedAt?: string;
}

/**
 * Apply one completed pomodoro session to a task. A pomodoro is the unit of
 * work, so reaching the estimate finishes the task: `isCompleted` flips and
 * `completedAt` is stamped. This keeps `isCompleted` in sync with pomodoro
 * progress (a bare increment would let a 3/3 task stay "open" forever), so the
 * Today backlog count — `!isCompleted && category !== 'delete'` — stays honest
 * without a separate `remaining > 0` gate.
 *
 * `now` is passed in (not read from `new Date()`) so the timestamp is
 * deterministic in tests. Already-complete tasks keep incrementing (over-
 * delivery) without resetting their original completion time.
 */
export function applyPomodoroCompletion(task: PomodoroTask, now: string): PomodoroTask {
  const newCompleted = task.completedPomodoros + 1;
  const estimate = task.estimatedPomodoros || 1;
  const justFinished = !task.isCompleted && newCompleted >= estimate;
  return {
    ...task,
    completedPomodoros: newCompleted,
    ...(justFinished ? { isCompleted: true, completedAt: now } : {}),
  };
}

/**
 * The instant a completed session is recorded as ended. A focus that finished
 * in the background — missed `timer-complete` event (suspended webview,
 * listener re-registration gap) — is often only processed much later, when the
 * user returns. Recording `now` then would inflate the session by the whole gap
 * (observed in real data: 40-min focuses recorded as 178m, 626m, even 3824m).
 * The frontend tracks the timer's true end (`estimateEndMs`, derived from the
 * start time plus the remaining seconds of the last tick); when the completion
 * is processed more than `lateThresholdMs` after that, the estimate is the
 * honest end. An on-time completion (delivered within ~a second of the end)
 * uses `now` as before.
 */
export function resolveSessionEndedAt(
  estimateEndMs: number | null,
  nowMs: number,
  lateThresholdMs: number,
): string {
  if (estimateEndMs !== null && nowMs - estimateEndMs > lateThresholdMs) {
    return new Date(estimateEndMs).toISOString();
  }
  return new Date(nowMs).toISOString();
}

/**
 * "pomo N of M" position semantics — decision A (see docs/design-system.md,
 * "Pomo count display"). N is the pomodoro you are ON, not the count finished:
 * while a focus is running on this task, the displayed count is
 * `completedPomodoros + 1` (clamped to the estimate); otherwise it is the
 * completed count unchanged. `completedPomodoros` itself is never mutated —
 * this is a pure display derivation.
 */
export function displayedPomoCount(
  completedPomodoros: number,
  estimatedPomodoros: number,
  focusInProgress: boolean,
): number {
  const est = estimatedPomodoros || 1;
  return focusInProgress ? Math.min(completedPomodoros + 1, est) : completedPomodoros;
}

/**
 * Reorder sub-tasks without drag-and-drop (ADR-0010 — "no HTML5 drag-drop
 * anywhere"; re-ordering is click-select → click-target). Lifts the sub-task
 * `movingId` to sit immediately ABOVE `targetId` in the list. Pure / immutable:
 * returns a new array, never mutates the input.
 *
 * No-op (returns the input array as-is) when movingId === targetId, when either
 * id is absent, or when the item already sits directly above its target — so a
 * stray click on the row that's already in place changes nothing.
 */
export function reorderTodoItems<T extends TodoItem>(todos: T[], movingId: string, targetId: string): T[] {
  if (movingId === targetId) return todos;
  const movingIdx = todos.findIndex(t => t.id === movingId);
  if (movingIdx === -1) return todos;
  const without = todos.filter(t => t.id !== movingId);
  const insertIdx = without.findIndex(t => t.id === targetId);
  if (insertIdx === -1) return todos; // target vanished — refuse to guess
  const next = without.slice();
  next.splice(insertIdx, 0, todos[movingIdx]);
  return next;
}

/**
 * Stamp `updatedAt` — the Task-detail footer's "updated X ago" source. Pure and
 * shared between the two task-write seams: SessionProvider.handleTasksChange
 * (the funnel for the Pomodoro/Tasks screens) and OKRApp.updateTask (which holds
 * its own task state, decoupled from the session context). `now` is passed in so
 * a single edit stamps every changed task at the same instant.
 */
export function stampUpdatedAt<T extends PomodoroTask>(task: T, now: string): T {
  return { ...task, updatedAt: now };
}

/**
 * Safely complete a pomodoro for a single active task in the Automerge document.
 * Modifies the task element in-place inside currentDoc.tasks rather than
 * overwriting d.tasks with a potentially stale React state array.
 */
export async function completePomodoroForTask(taskId: string, now: string): Promise<PomodoroTask[]> {
  let updatedTasks: PomodoroTask[] = [];
  await updateAutomergeDoc('Complete pomodoro for task', (d) => {
    if (!Array.isArray(d.tasks)) {
      d.tasks = [];
    }
    const idx = d.tasks.findIndex(t => t && t.id === taskId);
    if (idx !== -1) {
      const normalized = normalizeTask(d.tasks[idx]);
      if (normalized) {
        d.tasks[idx] = sanitizeForAutomerge(applyPomodoroCompletion(normalized, now));
      }
    }
    updatedTasks = d.tasks.map(normalizeTask).filter((t): t is PomodoroTask => t !== null);
  });
  return updatedTasks;
}

/**
 * Record a completed session into today's DailyRecord, mutating the record
 * IN-PLACE inside updateAutomergeDoc (rule 11) — never overwriting d.history
 * with a snapshot. A focus session also bumps completedPomodoros and
 * totalFocusMinutes; a break does not. Replaces the old load-modify-save in
 * handleSessionComplete, which could lose history written between the load and
 * the save (PR #37 review).
 */
export async function recordSessionInHistory(session: SessionRecord, focusMinutes: number): Promise<DailyRecord[]> {
  await updateAutomergeDoc('Record session', (d) => {
    if (!Array.isArray(d.history)) d.history = [];
    const key = todayKey();
    let idx = d.history.findIndex((r: unknown) => r != null && typeof r === 'object' && (r as DailyRecord).date === key);
    if (idx === -1) {
      d.history.push(sanitizeForAutomerge({
        date: key, completedPomodoros: 0, totalFocusMinutes: 0, tasksCompleted: 0, sessions: [] as SessionRecord[],
      }));
      idx = d.history.length - 1;
    }
    const rec = d.history[idx] as DailyRecord;
    if (!rec) return;
    if (!Array.isArray(rec.sessions)) rec.sessions = [];
    rec.sessions.push(sanitizeForAutomerge(session));
    if (session.type === 'focus') {
      rec.completedPomodoros = (typeof rec.completedPomodoros === 'number' ? rec.completedPomodoros : 0) + 1;
      rec.totalFocusMinutes = (typeof rec.totalFocusMinutes === 'number' ? rec.totalFocusMinutes : 0) + focusMinutes;
    }
  });
  return loadHistory();
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
  // Posture ii (docs/design-system.md "Session posture"): a focus ending
  // auto-starts the break (rest is the point); a break ending stages focus and
  // waits for a tap — the global session widget's resume job.
  autoStartBreaks: true,
  autoStartFocus: false,
  ambientPreset: 'none',
};

// ===== STORE REMOVED IN FAVOR OF AUTOMERGE =====

// ===== NORMALIZATION (untrusted synced/imported state → safe app data) =====
// Automerge is schema-less; merged/imported bytes can carry wrong types, unknown
// enum values, or runaway numerics. These normalizers run at the load choke-point
// so downstream render code never sees a value that would throw (e.g. indexing a
// metadata map with a non-enum, or calling .filter on a non-array).
const EISENHOWER_CATEGORIES: readonly EisenhowerCategory[] = ['do', 'decide', 'delegate', 'delete'];

function finiteNumber(v: unknown, fallback: number, min?: number, max?: number): number;
function finiteNumber(v: unknown, fallback: undefined, min?: number, max?: number): number | undefined;
function finiteNumber(v: unknown, fallback: number | undefined, min = -Infinity, max = Infinity): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, min), max) : fallback;
}

export function normalizeSettings(raw: unknown): PomodoroSettings {
  const plainRaw = raw && typeof raw === 'object' ? JSON.parse(JSON.stringify(raw)) : {};
  const src = plainRaw as Partial<PomodoroSettings>;
  return {
    focusDuration: finiteNumber(src.focusDuration, DEFAULT_SETTINGS.focusDuration, 1, 120),
    shortBreakDuration: finiteNumber(src.shortBreakDuration, DEFAULT_SETTINGS.shortBreakDuration, 1, 60),
    longBreakDuration: finiteNumber(src.longBreakDuration, DEFAULT_SETTINGS.longBreakDuration, 1, 120),
    pomosBeforeLongBreak: finiteNumber(src.pomosBeforeLongBreak, DEFAULT_SETTINGS.pomosBeforeLongBreak, 1, 10),
    // Falls back to DEFAULT_SETTINGS (posture ii) when the field is absent —
    // existing docs that stored an explicit value keep it (the migration wrinkle).
    autoStartBreaks: typeof src.autoStartBreaks === 'boolean' ? src.autoStartBreaks : DEFAULT_SETTINGS.autoStartBreaks,
    autoStartFocus: typeof src.autoStartFocus === 'boolean' ? src.autoStartFocus : DEFAULT_SETTINGS.autoStartFocus,
    // ambientPreset replaces the legacy focusMusicEnabled boolean (ADR-0015).
    // Migration: a legacy doc without ambientPreset (regardless of its old
    // focusMusicEnabled value) resolves to 'none' — the drone is gone and we
    // won't presume Rain/Forest/Café on the user's behalf. Any explicit,
    // in-enum ambientPreset is honored.
    ambientPreset: resolveAmbientPreset(src.ambientPreset),
  };
}

/**
 * Resolve the ambient preset from a persisted settings object. Honors a valid
 * `ambientPreset`; anything else (including legacy docs that only had the old
 * `focusMusicEnabled` boolean) falls back to 'none'. See ADR-0015: we never
 * silently enable a sound preset on the user's behalf.
 */
function resolveAmbientPreset(rawPreset: unknown): AmbientPreset {
  return AMBIENT_PRESETS.includes(rawPreset as AmbientPreset)
    ? (rawPreset as AmbientPreset)
    : DEFAULT_SETTINGS.ambientPreset;
}

export function normalizeTask(t: unknown): PomodoroTask | null {
  if (!t || typeof t !== 'object') return null;
  const plainT = JSON.parse(JSON.stringify(t));
  const task = plainT as Record<string, unknown>;
  const category = task.category as unknown;
  const bucket = task.bucket as unknown;
  const dueDate = task.dueDate as unknown;
  // Destructure-drop the removed weeklyPomodoroPlan so legacy docs' orphaned
  // key never leaks into the typed view (the spread below would carry it).
  const { weeklyPomodoroPlan: _legacy, ...rest } = task;
  return {
    ...(rest as unknown as PomodoroTask),
    title: typeof task.title === 'string' ? task.title : '',
    estimatedPomodoros: finiteNumber(task.estimatedPomodoros, 0),
    completedPomodoros: finiteNumber(task.completedPomodoros, 0),
    isCompleted: typeof task.isCompleted === 'boolean' ? task.isCompleted : false,
    category: EISENHOWER_CATEGORIES.includes(category as EisenhowerCategory) ? (category as EisenhowerCategory) : undefined,
    bucket: TASK_BUCKETS.includes(bucket as TaskBucket) ? (bucket as TaskBucket) : 'backlog',
    dueDate: typeof dueDate === 'string' && dueDate.trim() !== '' ? dueDate.trim() : undefined,
    todos: Array.isArray(task.todos) ? task.todos : undefined,
    comments: Array.isArray(task.comments) ? task.comments : undefined,
  };
}

export interface TaskImportanceOptions {
  keyResults?: Array<{ id: string; confidence?: 'on_track' | 'at_risk' | 'off_track' | 'not_set' }>;
  nowDate?: Date;
}

export function computeTaskImportance(task: PomodoroTask, options: TaskImportanceOptions = {}): number {
  const priorityWeightMap: Record<EisenhowerCategory, number> = {
    do: 4,
    decide: 3,
    delegate: 2,
    delete: 1,
  };
  const pWeight = task.category ? (priorityWeightMap[task.category] ?? 2) : 2;

  let krMultiplier = 1.0;
  if (task.keyResultId && options.keyResults) {
    const kr = options.keyResults.find(k => k.id === task.keyResultId);
    if (kr && kr.confidence) {
      switch (kr.confidence) {
        case 'off_track': krMultiplier = 1.5; break;
        case 'at_risk': krMultiplier = 1.25; break;
        case 'on_track': krMultiplier = 1.0; break;
        default: krMultiplier = 1.0; break;
      }
    }
  }

  let dueMultiplier = 1.0;
  if (task.dueDate) {
    const now = options.nowDate ? new Date(options.nowDate) : new Date();
    now.setHours(0, 0, 0, 0);
    const due = new Date(task.dueDate);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) {
      dueMultiplier = 1.5;
    } else if (diffDays <= 3) {
      dueMultiplier = 1.3;
    } else if (diffDays <= 7) {
      dueMultiplier = 1.1;
    }
  }

  let completionProximity = 0;
  if (task.estimatedPomodoros > 0) {
    const ratio = Math.min(1, Math.max(0, task.completedPomodoros / task.estimatedPomodoros));
    completionProximity = ratio * 0.5;
  }

  const bucketMultiplierMap: Record<TaskBucket, number> = {
    today: 1.3,
    this_week: 1.0,
    backlog: 0.7,
  };
  const bMultiplier = bucketMultiplierMap[task.bucket || 'backlog'] ?? 0.7;

  return (pWeight * krMultiplier * dueMultiplier + completionProximity) * bMultiplier;
}

function normalizeSession(s: unknown): SessionRecord | null {
  if (!s || typeof s !== 'object') return null;
  const plainS = JSON.parse(JSON.stringify(s));
  const sess = plainS as Record<string, unknown>;
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

export function normalizeDailyRecord(r: unknown): DailyRecord | null {
  if (!r || typeof r !== 'object') return null;
  const plainR = JSON.parse(JSON.stringify(r));
  const rec = plainR as Record<string, unknown>;
  return {
    date: typeof rec.date === 'string' ? rec.date : '',
    completedPomodoros: finiteNumber(rec.completedPomodoros, 0),
    totalFocusMinutes: finiteNumber(rec.totalFocusMinutes, 0),
    tasksCompleted: finiteNumber(rec.tasksCompleted, 0),
    sessions: Array.isArray(rec.sessions) ? rec.sessions.map(normalizeSession).filter((s): s is SessionRecord => s !== null) : [],
  };
}

// ===== SETTINGS =====
// Notify the app that the synced doc changed so live views reload. Mirrors the
// myokr-data-synced dispatch other writers (e.g. HabitsApp) use; covering direct
// local saves here means the always-mounted SessionProvider (ADR-0013) picks up
// writes it didn't initiate — tests that seed after mount, and any future code.
function notifyDataChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('myokr-data-synced'));
  }
}

export async function loadSettings(): Promise<PomodoroSettings> {
  try {
    const doc = await getAutomergeDoc();
    return JSON.parse(JSON.stringify(normalizeSettings(doc.settings)));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: PomodoroSettings): Promise<void> {
  await updateAutomergeDoc('Update settings', (d) => {
    d.settings = sanitizeForAutomerge(settings);
  });
  notifyDataChanged();
}

// ===== TASKS =====
export async function loadTasks(): Promise<PomodoroTask[]> {
  try {
    const doc = await getAutomergeDoc();
    const tasks = Array.isArray(doc.tasks) ? doc.tasks.map(normalizeTask).filter((t): t is PomodoroTask => t !== null) : [];
    return JSON.parse(JSON.stringify(tasks));
  } catch {
    return [];
  }
}

export async function saveTasks(tasks: PomodoroTask[]): Promise<void> {
  await updateAutomergeDoc('Update tasks', (d) => {
    d.tasks = sanitizeForAutomerge(tasks);
  });
  notifyDataChanged();
}

// ===== HISTORY =====
export async function loadHistory(): Promise<DailyRecord[]> {
  try {
    const doc = await getAutomergeDoc();
    const hist = Array.isArray(doc.history) ? doc.history.map(normalizeDailyRecord).filter((r): r is DailyRecord => r !== null) : [];
    return JSON.parse(JSON.stringify(hist));
  } catch {
    return [];
  }
}

export async function saveHistory(h: DailyRecord[]): Promise<void> {
  await updateAutomergeDoc('Update history', (d) => {
    d.history = sanitizeForAutomerge(h);
  });
  notifyDataChanged();
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

// Focus-day streak over history (the canonical definition shared by Analytics
// and Today). A "focus day" = a DailyRecord with completedPomodoros > 0;
// focus-minutes alone do not count. `current` ends at `now`'s local date — a
// day with no completed pomodoro breaks it. `now` is injectable for tests.
export function computeFocusStreak(
  history: DailyRecord[],
  now: Date = new Date(),
): { current: number; best: number } {
  const focusDays = new Set(
    history.filter(r => r.completedPomodoros > 0).map(r => r.date),
  );

  let current = 0;
  const cur = new Date(now);
  while (focusDays.has(getLocalDateString(cur))) {
    current++;
    cur.setDate(cur.getDate() - 1);
  }

  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of [...focusDays].sort((a, b) => a.localeCompare(b))) {
    if (prev) {
      const [dy, dm, dd] = d.split('-').map(Number);
      const [py, pm, pd] = prev.split('-').map(Number);
      const diff = Math.round(
        (new Date(dy, dm - 1, dd).getTime() - new Date(py, pm - 1, pd).getTime()) / 86_400_000,
      );
      run = diff === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    best = Math.max(best, run);
    prev = d;
  }

  return { current, best };
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

/**
 * ADR-0012 — presentational cycle rollover.
 *
 * A task's cycle membership is derived, never stored: a task belongs to the
 * cycle of its key result (`keyResultId → objective → cycle`); an unlinked
 * task belongs to no cycle. Cycle-scoped views count a task as "in this
 * cycle" when its KR cycle is the active cycle or any already-ended cycle —
 * the rollover is presentational, no document migration ever runs.
 */
export function isTaskInCycle(
  task: PomodoroTask,
  krCycle: { month: number; year: number } | undefined,
  activeCycle: { month: number; year: number } | null,
): boolean {
  if (!task.keyResultId) return true; // unlinked tasks have no cycle → always in
  if (!activeCycle) return true; // no active cycle → nothing to filter by
  if (!krCycle) return true; // KR's cycle unknown → never hide the task
  const krKey = krCycle.year * 12 + krCycle.month;
  const activeKey = activeCycle.year * 12 + activeCycle.month;
  return krKey <= activeKey;
}

/**
 * Build a `keyResultId → OKRCycle` map from the loaded OKR data, resolving
 * through objective linkage. KRs whose objective or cycle is missing are
 * omitted from the map (their tasks stay visible everywhere).
 */
export function buildKrCycleMap(
  keyResults: Array<{ id: string; objectiveId: string }>,
  objectives: Array<{ id: string; cycleId: string }>,
  cycles: Array<{ id: string; month: number; year: number }>,
): Map<string, { month: number; year: number }> {
  const objByKr = new Map(keyResults.map(kr => [kr.id, kr.objectiveId]));
  const cycleByObj = new Map(objectives.map(o => [o.id, o.cycleId]));
  const cycleById = new Map(cycles.map(c => [c.id, c]));
  const map = new Map<string, { month: number; year: number }>();
  for (const kr of keyResults) {
    const cycle = cycleById.get(cycleByObj.get(objByKr.get(kr.id)!) ?? '');
    if (cycle) map.set(kr.id, { month: cycle.month, year: cycle.year });
  }
  return map;
}

