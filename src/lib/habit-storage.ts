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
  let prevDate: Date | null = null;
  
  for (const tickStr of sortedTicks) {
    const d = new Date(tickStr);
    if (prevDate === null) {
      currentRun = 1;
    } else {
      const t1 = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
      const t2 = Date.UTC(prevDate.getFullYear(), prevDate.getMonth(), prevDate.getDate());
      const diffDays = Math.round((t1 - t2) / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        currentRun++;
      } else if (diffDays > 1) {
        best = Math.max(best, currentRun);
        currentRun = 1;
      }
    }
    prevDate = d;
  }
  best = Math.max(best, currentRun);
  
  const todayStr = getLocalDateString();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getLocalDateString(yesterday);
  
  let current = 0;
  const lastTick = sortedTicks[sortedTicks.length - 1];
  
  if (lastTick === todayStr || lastTick === yesterdayStr) {
    let idx = sortedTicks.length - 1;
    current = 1;
    while (idx > 0) {
      const d1 = new Date(sortedTicks[idx]);
      const d2 = new Date(sortedTicks[idx - 1]);
      
      const t1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
      const t2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
      const diffDays = Math.round((t1 - t2) / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        current++;
        idx--;
      } else {
        break;
      }
    }
  }
  
  return { current, best };
}
