import { getAutomergeDoc, updateAutomergeDoc, sanitizeForAutomerge } from './automerge-storage';
import { getLocalDateString } from './pomodoro-storage';

export type HabitStatus = 'want_to_form' | 'in_progress' | 'formed';

export interface Habit {
  id: string;
  name: string;
  status: HabitStatus;
  ticks: string[];       // sorted 'YYYY-MM-DD', deduped in normalizeHabit
  createdAt: string;
  updatedAt: string;
}

const HABIT_STATUS_VALUES: readonly HabitStatus[] = ['want_to_form', 'in_progress', 'formed'];

/** Parse a 'YYYY-MM-DD' key into a local-time Date (midnight). */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Local-time Date arithmetic — day-safe across month/year boundaries. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Whole-day difference between two 'YYYY-MM-DD' local keys. */
function diffCalendarDays(a: string, b: string): number {
  return Math.round((parseDateKey(b).getTime() - parseDateKey(a).getTime()) / 86_400_000);
}

export function normalizeHabit(h: unknown): Habit | null {
  if (!h || typeof h !== 'object') return null;
  const plainH = JSON.parse(JSON.stringify(h));
  const habit = plainH as Record<string, unknown>;
  const status = habit.status as unknown;
  
  let ticks: string[] = [];
  if (Array.isArray(habit.ticks)) {
    const validTicks = habit.ticks.filter((t): t is string => typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t));
    ticks = Array.from(new Set(validTicks)).sort();
  }

  return {
    id: typeof habit.id === 'string' ? habit.id : '',
    name: typeof habit.name === 'string' ? habit.name : '',
    status: HABIT_STATUS_VALUES.includes(status as HabitStatus) ? (status as HabitStatus) : 'want_to_form',
    ticks,
    createdAt: typeof habit.createdAt === 'string' ? habit.createdAt : new Date().toISOString(),
    updatedAt: typeof habit.updatedAt === 'string' ? habit.updatedAt : new Date().toISOString(),
  };
}

export async function loadHabits(): Promise<Habit[]> {
  try {
    const doc = await getAutomergeDoc();
    const habits = Array.isArray(doc.habits) ? doc.habits.map(normalizeHabit).filter((h): h is Habit => h !== null) : [];
    return JSON.parse(JSON.stringify(habits));
  } catch {
    return [];
  }
}

export async function saveHabits(habits: Habit[]): Promise<void> {
  await updateAutomergeDoc('Update habits', (d) => {
    d.habits = sanitizeForAutomerge(habits);
  });
}

export function computeHabitStreaks(ticks: string[]): { current: number; best: number } {
  if (ticks.length === 0) return { current: 0, best: 0 };
  const sortedTicks = [...new Set(ticks)].sort();

  let best = 0;
  let currentRun = 0;
  let prevKey: string | null = null;

  for (const tickKey of sortedTicks) {
    if (prevKey === null) {
      currentRun = 1;
    } else {
      const diffDays = diffCalendarDays(prevKey, tickKey);
      if (diffDays === 1) {
        currentRun++;
      } else if (diffDays > 1) {
        best = Math.max(best, currentRun);
        currentRun = 1;
      }
    }
    prevKey = tickKey;
  }
  best = Math.max(best, currentRun);

  // Current streak: the run of consecutive ticked days ending at the most
  // recent tick. It does not expire when the last tick is a few days old —
  // three ticks in a row read "3 days" until a new tick extends or breaks the
  // run (2026-08-08 feedback; the old today/yesterday recency gate collapsed
  // stale runs to 0 in the tracker's STREAK column).
  let current = 1;
  let idx = sortedTicks.length - 1;
  while (idx > 0 && diffCalendarDays(sortedTicks[idx - 1], sortedTicks[idx]) === 1) {
    current++;
    idx--;
  }

  return { current, best };
}

// ===== Tracker data (read-only, pure) =====

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Monday (as a local Date at midnight) of the week containing `date`. */
export function getMondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = d.getDay(); // 0 = Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDays(d, diff);
}

export type HabitCellState = 'completed' | 'pending' | 'future';

export interface HabitWeekDay {
  date: string;          // 'YYYY-MM-DD'
  weekdayLabel: string;  // 'Mon'..'Sun'
  dayOfMonth: number;
  isToday: boolean;
}

export interface HabitMatrixCell {
  date: string;
  state: HabitCellState;
}

export interface HabitMatrixRow {
  habitId: string;
  name: string;
  status: HabitStatus;
  cells: HabitMatrixCell[];
  /** Ticks inside this week block (Mon–Sun) — the matrix's STREAK column.
   *  Feedback 2026-08-08: a global consecutive run read "1 day" for habits
   *  whose ticks didn't form a run ending today/yesterday, and "1 day" even
   *  with no visible ticks. The column now counts the ticks in the visible
   *  period (week view: current week; month view: per block). */
  ticksInWeek: number;
}

export interface HabitWeekMatrix {
  weekStart: string; // Monday 'YYYY-MM-DD'
  days: HabitWeekDay[];
  rows: HabitMatrixRow[];
  completed: number; // completed cells this week
  scheduled: number; // habits.length × 7 (implicit every-day scheduling)
}

/**
 * The weekly completion matrix: one row per habit, 7 Mon–Sun cells. Cell state
 * derives purely from `ticks` vs the given week + today — the same numbers feed
 * the matrix, the tab badge ("17/28"), and the analytics panel.
 */
export function buildHabitWeekMatrix(habits: Habit[], weekStart: string, todayStr: string): HabitWeekMatrix {
  const start = parseDateKey(weekStart);
  const days: HabitWeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const date = getLocalDateString(d);
    days.push({ date, weekdayLabel: WEEKDAY_SHORT[i], dayOfMonth: d.getDate(), isToday: date === todayStr });
  }

  const rows: HabitMatrixRow[] = habits.map((habit) => {
    const ticked = new Set(habit.ticks);
    const cells: HabitMatrixCell[] = days.map((day) => ({
      date: day.date,
      state: ticked.has(day.date) ? 'completed' : day.date > todayStr ? 'future' : 'pending',
    }));
    const weekEnd = getLocalDateString(addDays(start, 6));
    const ticksInWeek = habit.ticks.filter((t) => t >= weekStart && t <= weekEnd).length;
    return {
      habitId: habit.id,
      name: habit.name,
      status: habit.status,
      cells,
      ticksInWeek,
    };
  });

  const completed = rows.reduce((n, r) => n + r.cells.filter((c) => c.state === 'completed').length, 0);
  return {
    weekStart,
    days,
    rows,
    completed,
    scheduled: habits.length * 7,
  };
}

export interface HabitAnalyticsPerHabit {
  habitId: string;
  name: string;
  completed: number;
  scheduled: number;
  rate: number; // 0-100 rounded; 0 when nothing scheduled
}

export interface HabitAnalyticsWeakDay {
  dayIndex: number; // 0 = Mon .. 6 = Sun
  dayLabel: string; // 'Wednesday'
  completed: number;
  scheduled: number;
  rate: number; // 0-100 rounded
}

export interface HabitAnalytics {
  windowStart: string; // today − 29
  windowEnd: string;   // today
  totalCompleted: number;
  totalScheduled: number;
  overallRate: number;          // rounded 0-100; 0 when nothing scheduled
  trend: number | null;         // current − previous window, percentage points; null when either window has nothing scheduled
  perHabit: HabitAnalyticsPerHabit[];
  weakDay: HabitAnalyticsWeakDay | null; // worst weekday — only when data exists and it is strictly below the best
  isEmpty: boolean;
}

/**
 * 30-day consistency: rolling window ending today vs the 30 days before it.
 * "Scheduled" is days in a window on/after the habit's createdAt (a habit
 * created mid-window is not charged for days it did not exist), and the
 * per-habit rate is completed / scheduled inside the window.
 */
export function buildHabitAnalytics(habits: Habit[], todayStr: string, windowDays = 30): HabitAnalytics {
  const today = parseDateKey(todayStr);
  const currentDays: string[] = [];
  const previousDays: string[] = [];
  for (let i = 0; i < windowDays; i++) {
    currentDays.push(getLocalDateString(addDays(today, -(windowDays - 1 - i))));
    previousDays.push(getLocalDateString(addDays(today, -(2 * windowDays - 1 - i))));
  }

  const perHabit: HabitAnalyticsPerHabit[] = [];
  const dayCompleted = new Array<number>(7).fill(0);
  const dayScheduled = new Array<number>(7).fill(0);
  let totalCompleted = 0;
  let totalScheduled = 0;
  let prevCompleted = 0;
  let prevScheduled = 0;

  for (const habit of habits) {
    const ticked = new Set(habit.ticks);
    // createdAt is an ISO UTC instant; ticks/today are local keys — convert so a
    // habit created late in the evening isn't charged for a local day it didn't
    // exist. (Same TZ assumption as the rest of the suite.)
    let startKey = '';
    if (habit.createdAt) {
      const created = new Date(habit.createdAt);
      if (!Number.isNaN(created.getTime())) startKey = getLocalDateString(created);
    }

    let completed = 0;
    let scheduled = 0;
    for (const day of currentDays) {
      if (day < startKey) continue;
      scheduled++;
      if (ticked.has(day)) completed++;
      const dow = (parseDateKey(day).getDay() + 6) % 7;
      dayScheduled[dow]++;
      if (ticked.has(day)) dayCompleted[dow]++;
    }
    perHabit.push({
      habitId: habit.id,
      name: habit.name,
      completed,
      scheduled,
      rate: scheduled === 0 ? 0 : Math.round((100 * completed) / scheduled),
    });
    totalCompleted += completed;
    totalScheduled += scheduled;

    for (const day of previousDays) {
      if (day < startKey) continue;
      prevScheduled++;
      if (ticked.has(day)) prevCompleted++;
    }
  }

  const overallRate = totalScheduled === 0 ? 0 : Math.round((100 * totalCompleted) / totalScheduled);
  const trend =
    totalScheduled > 0 && prevScheduled > 0
      ? Math.round(100 * (totalCompleted / totalScheduled - prevCompleted / prevScheduled))
      : null;

  // Weak day: the lowest-rate weekday with any scheduled day, reported only when
  // it is strictly below the best weekday (an all-100% week has no weak day).
  let weakDay: HabitAnalyticsWeakDay | null = null;
  let bestRate = -1;
  let worstRate = 101;
  let worstIdx = -1;
  for (let i = 0; i < 7; i++) {
    if (dayScheduled[i] === 0) continue;
    const rate = Math.round((100 * dayCompleted[i]) / dayScheduled[i]);
    if (rate > bestRate) bestRate = rate;
    if (rate < worstRate) {
      worstRate = rate;
      worstIdx = i;
    }
  }
  if (worstIdx !== -1 && worstRate < bestRate) {
    weakDay = {
      dayIndex: worstIdx,
      dayLabel: WEEKDAY_FULL[worstIdx],
      completed: dayCompleted[worstIdx],
      scheduled: dayScheduled[worstIdx],
      rate: worstRate,
    };
  }

  return {
    windowStart: currentDays[0],
    windowEnd: todayStr,
    totalCompleted,
    totalScheduled,
    overallRate,
    trend,
    perHabit,
    weakDay,
    isEmpty: totalScheduled === 0,
  };
}
