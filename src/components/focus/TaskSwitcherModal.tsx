import { useState, useRef, useEffect } from 'react';
import { Search, Check } from 'lucide-react';
import type { PomodoroTask, EisenhowerCategory } from '../../lib/pomodoro-storage';
import { EISENHOWER_META } from '../../lib/pomodoro-storage';
import type { KeyResult, Objective } from '../../lib/okr-storage';
import { formatKrSubtitle } from '../../lib/okr-storage';
import { useModalEffects } from '../../hooks/useModalEffects';

/**
 * The Task Switcher — a command-palette-style modal opened from the Session
 * tab's "Change" button (replaces the old inline TaskPicker dropdown). Lists the
 * active task, the Day-plan queue, and the Today bucket in three labelled
 * sections, with a search box that filters by title or KR subtitle. Picking a
 * row makes it the active task and closes the modal.
 *
 * Layout (mockup 2026-08-12): dark floating dialog, rounded-2xl, a search
 * header with an `Esc` badge on the right, then sectioned rows. Each row =
 * [category dot] [title + KR subtitle] [right metadata]. Right metadata is a
 * cyan checkmark for the active task, an "N session(s)" estimate for queued /
 * today tasks, and an "Overdue" badge (soft red) when a task's dueDate is in
 * the past.
 *
 * Reuses `.app-modal-overlay` / `.app-modal-content` (shared with TaskDetail
 * and Command-K) for the backdrop + centering; `.task-switcher` supplies the
 * panel's look. `useModalEffects(onClose)` wires Esc + body-scroll-lock.
 */

interface Props {
  activeTask: PomodoroTask | null;
  /** Day-plan queue (TodayPlan.taskIds resolved to incomplete tasks, in order). */
  queuedTasks: PomodoroTask[];
  /** Incomplete tasks whose bucket === 'today'. */
  todayTasks: PomodoroTask[];
  krMap: Map<string, KeyResult>;
  objMap: Map<string, Objective>;
  /** Select a task as active and close the modal. */
  onPick: (id: string) => void;
  onClose: () => void;
}

type SectionKey = 'current' | 'queue' | 'today';

interface Section {
  key: SectionKey;
  label: string;
  tasks: PomodoroTask[];
}

/** Date-only overdue check (design-system: overdue = red/risk, never amber). */
function isOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < today.getTime();
}

function sessionsLabel(n: number): string {
  return `${n} session${n === 1 ? '' : 's'}`;
}

function categoryColor(category: EisenhowerCategory | undefined): string {
  return (category && EISENHOWER_META[category]?.color) || EISENHOWER_META.do.color;
}

export default function TaskSwitcherModal({
  activeTask,
  queuedTasks,
  todayTasks,
  krMap,
  objMap,
  onPick,
  onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useModalEffects(onClose);

  useEffect(() => {
    // Autofocus the search box on open (command-palette convention).
    inputRef.current?.focus();
  }, []);

  const q = query.trim().toLowerCase();

  /** Resolve a task's KR subtitle (objective → KR), with the "No key result"
   *  fallback. Centralised via formatKrSubtitle so copy can't drift from the
   *  Active Task Card / Tasks board. */
  const subtitleFor = (task: PomodoroTask): string => {
    const kr = task.keyResultId ? krMap.get(task.keyResultId) : undefined;
    const obj = kr ? objMap.get(kr.objectiveId) : undefined;
    return formatKrSubtitle(kr, obj, 'No key result');
  };

  const matches = (task: PomodoroTask): boolean => {
    if (!q) return true;
    return task.title.toLowerCase().includes(q) || subtitleFor(task).toLowerCase().includes(q);
  };

  // Build sections. The active task is excluded from queue/today so it only
  // appears once (under CURRENT). Queue and today are also de-duped against
  // each other by id (a task can be both queued and in the today bucket — it
  // shows under whichever comes first: queue). Computed each render: the lists
  // are small (today's tasks) and the filters are cheap, so a memo isn't worth
  // the deps-bookkeeping (and a Set built per render would defeat it anyway).
  const activeId = activeTask?.id;
  const queuedIds = new Set(queuedTasks.map(t => t.id));

  const sections: Section[] = [
    { key: 'current', label: 'Current', tasks: activeTask ? [activeTask] : [] },
    {
      key: 'queue',
      label: 'Up next in queue',
      tasks: queuedTasks.filter(t => t.id !== activeId && matches(t)),
    },
    {
      key: 'today',
      label: 'Today',
      tasks: todayTasks.filter(t => t.id !== activeId && !queuedIds.has(t.id) && matches(t)),
    },
  ];

  const visibleSections = sections.filter(s => s.tasks.length > 0);
  const anyMatch = visibleSections.length > 0;

  const renderRow = (task: PomodoroTask, sectionKey: SectionKey) => {
    const isActive = task.id === activeId;
    const overdue = isOverdue(task.dueDate);
    return (
      <button
        key={task.id}
        type="button"
        role="option"
        aria-selected={isActive}
        className={`switcher-task${isActive ? ' active' : ''}`}
        onClick={() => onPick(task.id)}
      >
        <span
          className="switcher-task-dot"
          style={{ backgroundColor: categoryColor(task.category) }}
          aria-hidden="true"
        />
        <span className="switcher-task-body">
          <span className="switcher-task-title">{task.title}</span>
          <span className="switcher-task-subtitle">{subtitleFor(task)}</span>
        </span>
        <span className="switcher-task-meta">
          {sectionKey === 'current' ? (
            <span className="switcher-task-check" aria-label="Active task">
              <Check size={14} strokeWidth={3} />
            </span>
          ) : overdue ? (
            <span className="switcher-task-overdue">Overdue</span>
          ) : (
            <span className="switcher-task-sessions">{sessionsLabel(task.estimatedPomodoros)}</span>
          )}
        </span>
      </button>
    );
  };

  return (
    <div className="app-modal-overlay task-switcher-overlay" onClick={onClose}>
      <div
        className="app-modal-content task-switcher"
        role="dialog"
        aria-modal="true"
        aria-label="Switch active task"
        onClick={e => e.stopPropagation()}
      >
        {/* Search header */}
        <div className="switcher-header">
          <Search size={16} className="switcher-search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            className="switcher-search-input"
            placeholder="Search tasks"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Search tasks"
          />
          <kbd className="switcher-esc-badge" aria-hidden="true">Esc</kbd>
        </div>

        {/* Sectioned list */}
        <div className="switcher-body">
          {!anyMatch && (
            <p className="switcher-empty">No matching tasks.</p>
          )}
          {visibleSections.map(section => (
            <div key={section.key} className="switcher-section">
              <h3 className="switcher-section-title">{section.label}</h3>
              {section.tasks.map(t => renderRow(t, section.key))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
