import { Pencil, Clock, Timer, CheckCheck, TrendingUp } from 'lucide-react';
import type { CompletionMode, Confidence } from '../../lib/okr-storage';
import { COMPLETION_MODE_META, CONFIDENCE_META, CONFIDENCE_VALUES } from '../../lib/okr-storage';
import type { SelectOption } from '../shared/Select';

/** Option sets for the OKR-screen Selects (ticket 04, custom-select). */

export const KR_MODE_OPTIONS: SelectOption<CompletionMode>[] = [
  { value: 'manual', label: COMPLETION_MODE_META.manual.label, icon: <Pencil size={14} /> },
  { value: 'focus_hours', label: COMPLETION_MODE_META.focus_hours.label, icon: <Clock size={14} /> },
  { value: 'focus_pomodoros', label: COMPLETION_MODE_META.focus_pomodoros.label, icon: <Timer size={14} /> },
  { value: 'completed_tasks', label: COMPLETION_MODE_META.completed_tasks.label, icon: <CheckCheck size={14} /> },
  { value: 'habit', label: COMPLETION_MODE_META.habit.label, icon: <TrendingUp size={14} /> },
];

/** Confidence picker rows — "not_set" is not offered; it is the absence of a pick. */
export const CONFIDENCE_OPTIONS: SelectOption<Confidence>[] =
  CONFIDENCE_VALUES.filter(c => c !== 'not_set').map(c => ({
  value: c,
  label: CONFIDENCE_META[c].label,
  icon: <span className="confidence-dot" style={{ background: CONFIDENCE_META[c].color }} />,
}));
