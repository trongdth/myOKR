import { CalendarCheck, CalendarRange, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import type { EisenhowerCategory, TaskBucket } from '../../lib/pomodoro-storage';
import { EISENHOWER_META, EISENHOWER_PRIORITY_ORDER, TASK_BUCKETS, type PomodoroTask } from '../../lib/pomodoro-storage';
import type { KeyResult } from '../../lib/okr-storage';
import type { SelectOption } from '../shared/Select';

/** Option sets for the Tasks-screen Selects (tickets 02/03, custom-select).
 * The static sets are module constants so list rows share one array instead
 * of rebuilding options (and their icon JSX) on every render. */

export const BUCKET_LABELS: Record<TaskBucket, string> = {
  today: 'Today',
  this_week: 'This week',
  backlog: 'Backlog',
};

const BUCKET_ICONS: Record<TaskBucket, ReactNode> = {
  today: <CalendarCheck size={14} />,
  this_week: <CalendarRange size={14} />,
  backlog: <Inbox size={14} />,
};

export const PRIORITY_OPTIONS: SelectOption<EisenhowerCategory>[] =
  EISENHOWER_PRIORITY_ORDER.map(cat => ({
    value: cat,
    label: EISENHOWER_META[cat].label,
    icon: <span className="sel-priority-dot" style={{ background: EISENHOWER_META[cat].color }} />,
  }));

export const BUCKET_OPTIONS: SelectOption<TaskBucket>[] =
  TASK_BUCKETS.map(b => ({ value: b, label: BUCKET_LABELS[b], icon: BUCKET_ICONS[b] }));

/** KR options; with `tasks`, each row carries its open-linked-task count
 * (ticket 07 — hidden on the chosen row, where the tick wins). */
export const krOptions = (keyResults: KeyResult[], tasks?: PomodoroTask[]): SelectOption<string>[] =>
  keyResults.map(kr => ({
    value: kr.id,
    label: kr.title,
    icon: <span className="sel-kr-swatch" />,
    trailing: tasks ? String(tasks.filter(t => !t.isCompleted && t.keyResultId === kr.id).length) : undefined,
  }));
