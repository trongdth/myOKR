import { CalendarCheck, CalendarRange, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import type { EisenhowerCategory, TaskBucket } from '../../lib/pomodoro-storage';
import { EISENHOWER_META, TASK_BUCKETS } from '../../lib/pomodoro-storage';
import type { KeyResult } from '../../lib/okr-storage';
import type { SelectOption } from '../shared/Select';

/** Option builders for the Tasks-screen Selects (ticket 02, custom-select). */

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

export const priorityOptions = (): SelectOption<EisenhowerCategory>[] =>
  (Object.keys(EISENHOWER_META) as EisenhowerCategory[]).map(cat => ({
    value: cat,
    label: EISENHOWER_META[cat].label,
    icon: <span className="sel-priority-dot" style={{ background: EISENHOWER_META[cat].color }} />,
  }));

export const bucketOptions = (): SelectOption<TaskBucket>[] =>
  TASK_BUCKETS.map(b => ({ value: b, label: BUCKET_LABELS[b], icon: BUCKET_ICONS[b] }));

export const krOptions = (keyResults: KeyResult[]): SelectOption<string>[] =>
  keyResults.map(kr => ({ value: kr.id, label: kr.title, icon: <span className="sel-kr-swatch" /> }));
