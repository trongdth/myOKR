import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X, Play, RotateCcw, CheckCircle2, Circle } from 'lucide-react';
import type { PomodoroTask } from '../../lib/pomodoro-storage';
import { buildKrCycleMap } from '../../lib/pomodoro-storage';
import type { KeyResult, OKRCycle, Objective } from '../../lib/okr-storage';
import { useModalEffects } from '../../hooks/useModalEffects';

export type SearchScope = 'everything' | 'open' | 'completed' | 'subtasks' | 'notes';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  tasks: PomodoroTask[];
  keyResults?: KeyResult[];
  objectives?: Objective[];
  cycles?: OKRCycle[];
  activeCycleId?: string | null;
  onSelectTask: (task: PomodoroTask) => void;
  onStartFocusTask?: (task: PomodoroTask) => void;
  onReopenTask?: (task: PomodoroTask) => void;
}

interface MatchInfo {
  title: boolean;
  subtask: boolean;
  body: boolean;
}

interface GroupedResults {
  open: PomodoroTask[];
  completed: PomodoroTask[];
  insideTasks: PomodoroTask[];
}

export default function CommandKModal({
  isOpen,
  onClose,
  tasks,
  keyResults = [],
  objectives = [],
  cycles = [],
  activeCycleId,
  onSelectTask,
  onStartFocusTask,
  onReopenTask,
}: Props) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>('everything');
  const [selectedCycleId, setSelectedCycleId] = useState<string | 'all'>(activeCycleId || 'all');
  const inputRef = useRef<HTMLInputElement>(null);

  useModalEffects(onClose);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const krCycleMap = useMemo(
    () => buildKrCycleMap(keyResults, objectives, cycles),
    [keyResults, objectives, cycles],
  );

  const grouped = useMemo<GroupedResults>(() => {
    const q = query.trim().toLowerCase();
    const selectedCycle = cycles.find(c => c.id === selectedCycleId);

    const inSelectedCycle = (task: PomodoroTask): boolean => {
      if (selectedCycleId === 'all' || !selectedCycle) return true;
      const krCycle = krCycleMap.get(task.keyResultId || '');
      if (!task.keyResultId) {
        // Unlinked tasks belong to no cycle: they surface in the active-cycle
        // scope (presentational rollover) and in "All Cycles" only.
        return activeCycleId === selectedCycleId;
      }
      if (!krCycle) return true; // unknown KR cycle → never hide the task
      const krKey = krCycle.year * 12 + krCycle.month;
      const selectedKey = selectedCycle.year * 12 + selectedCycle.month;
      if (krKey === selectedKey) return true;
      // In the active-cycle scope, already-ended cycles roll over (ADR-0012);
      // in a history-cycle scope membership is strict.
      if (activeCycleId === selectedCycleId) return krKey < selectedKey;
      return false;
    };

    const match = (task: PomodoroTask): MatchInfo | null => {
      if (!q) return { title: true, subtask: true, body: true };
      const title = task.title.toLowerCase().includes(q);
      const subtask = (task.todos || []).some(t => t.text.toLowerCase().includes(q));
      const body = (task.description || '').toLowerCase().includes(q)
        || (task.comments || []).some(c => c.text.toLowerCase().includes(q));

      if (scope === 'open') return title || subtask || body ? { title, subtask, body } : null;
      if (scope === 'completed') return title || subtask || body ? { title, subtask, body } : null;
      if (scope === 'subtasks') return subtask ? { title, subtask, body } : null;
      if (scope === 'notes') return body ? { title, subtask, body } : null;
      return title || subtask || body ? { title, subtask, body } : null;
    };

    const groups: GroupedResults = { open: [], completed: [], insideTasks: [] };

    tasks.forEach(task => {
      if (!inSelectedCycle(task)) return;
      if (scope === 'open' && task.isCompleted) return;
      if (scope === 'completed' && !task.isCompleted) return;

      const m = match(task);
      if (!m) return;

      if (task.isCompleted) {
        groups.completed.push(task);
      } else if (m.title) {
        groups.open.push(task);
      } else {
        groups.insideTasks.push(task); // sub-task or note match inside an open task
      }
    });

    return groups;
  }, [tasks, query, scope, selectedCycleId, cycles, activeCycleId, krCycleMap]);

  const total = grouped.open.length + grouped.completed.length + grouped.insideTasks.length;

  if (!isOpen) return null;

  return (
    <div className="modal-overlay search-modal-overlay" onClick={onClose}>
      <div className="modal-content command-k-modal" onClick={e => e.stopPropagation()}>
        {/* Search Input Bar */}
        <div className="command-k-header">
          <Search size={18} className="search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="command-k-input"
            placeholder="Search open tasks, completed tasks, sub-tasks and notes..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <button className="command-k-close-btn" onClick={onClose} aria-label="Close search">
            <X size={16} />
          </button>
        </div>

        {/* Scope Chips & Cycle Selector Bar */}
        <div className="command-k-controls">
          <div className="command-k-scopes">
            {(['everything', 'open', 'completed', 'subtasks', 'notes'] as SearchScope[]).map(s => (
              <button
                key={s}
                className={`command-k-scope-chip${scope === s ? ' active' : ''}`}
                onClick={() => setScope(s)}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {cycles.length > 0 && (
            <div className="command-k-cycle-filter">
              <select
                value={selectedCycleId}
                onChange={e => setSelectedCycleId(e.target.value)}
                className="command-k-cycle-select"
              >
                <option value="all">All Cycles</option>
                {cycles.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.isActive ? '(Active)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Results List — grouped OPEN / COMPLETED / INSIDE TASKS (P6) */}
        <div className="command-k-results">
          {total === 0 ? (
            <div className="command-k-empty">
              No matching tasks found for &quot;{query}&quot;
            </div>
          ) : (
            <>
              {grouped.open.length > 0 && (
                <div className="command-k-group">
                  <div className="command-k-group-header">
                    <span>OPEN</span>
                    <span className="command-k-group-count">{grouped.open.length}</span>
                  </div>
                  {grouped.open.map(task => (
                    <CommandKRow
                      key={task.id}
                      task={task}
                      keyResults={keyResults}
                      onSelect={() => { onSelectTask(task); onClose(); }}
                      onStartFocus={onStartFocusTask ? () => { onStartFocusTask(task); onClose(); } : undefined}
                      onReopen={onReopenTask ? () => onReopenTask(task) : undefined}
                    />
                  ))}
                </div>
              )}

              {grouped.completed.length > 0 && (
                <div className="command-k-group">
                  <div className="command-k-group-header">
                    <span>COMPLETED</span>
                    <span className="command-k-group-count">{grouped.completed.length}</span>
                  </div>
                  {grouped.completed.map(task => (
                    <CommandKRow
                      key={task.id}
                      task={task}
                      keyResults={keyResults}
                      onSelect={() => { onSelectTask(task); onClose(); }}
                      onStartFocus={undefined}
                      onReopen={onReopenTask ? () => onReopenTask(task) : undefined}
                    />
                  ))}
                </div>
              )}

              {grouped.insideTasks.length > 0 && (
                <div className="command-k-group">
                  <div className="command-k-group-header">
                    <span>INSIDE TASKS</span>
                    <span className="command-k-group-count">{grouped.insideTasks.length}</span>
                  </div>
                  {grouped.insideTasks.map(task => (
                    <CommandKRow
                      key={task.id}
                      task={task}
                      keyResults={keyResults}
                      onSelect={() => { onSelectTask(task); onClose(); }}
                      onStartFocus={onStartFocusTask ? () => { onStartFocusTask(task); onClose(); } : undefined}
                      onReopen={undefined}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CommandKRow({
  task,
  keyResults,
  onSelect,
  onStartFocus,
  onReopen,
}: {
  task: PomodoroTask;
  keyResults: KeyResult[];
  onSelect: () => void;
  onStartFocus?: () => void;
  onReopen?: () => void;
}) {
  const linkedKr = keyResults.find(k => k.id === task.keyResultId);
  return (
    <div
      className={`command-k-item${task.isCompleted ? ' completed' : ''}`}
      onClick={onSelect}
    >
      <div className="command-k-item-main">
        <div className="command-k-item-title-row">
          {task.isCompleted ? (
            <CheckCircle2 size={16} className="status-icon completed" />
          ) : (
            <Circle size={16} className="status-icon open" />
          )}
          <span className="command-k-item-title">{task.title}</span>
          {task.bucket && (
            <span className={`bucket-pill bucket-${task.bucket}`}>
              {task.bucket.replace('_', ' ')}
            </span>
          )}
        </div>

        <div className="command-k-item-meta">
          <span className="meta-kr">{linkedKr ? linkedKr.title : 'no key result'}</span>
          {task.dueDate && <span className="meta-due">{task.dueDate}</span>}
          <span className="meta-pomos">
            {task.completedPomodoros}/{task.estimatedPomodoros || 1}
          </span>
        </div>
      </div>

      <div className="command-k-item-actions" onClick={e => e.stopPropagation()}>
        {onStartFocus && (
          <button
            className="command-k-act-btn focus-btn"
            onClick={onStartFocus}
            title="Start focus timer with this task"
          >
            <Play size={13} />
            <span>Start</span>
          </button>
        )}
        {onReopen && task.isCompleted && (
          <button
            className="command-k-act-btn reopen-btn"
            onClick={onReopen}
            title="Reopen task"
          >
            <RotateCcw size={13} />
            <span>Reopen</span>
          </button>
        )}
      </div>
    </div>
  );
}
