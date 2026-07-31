import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X, Play, RotateCcw, CheckCircle2, Circle } from 'lucide-react';
import type { PomodoroTask } from '../../lib/pomodoro-storage';
import type { KeyResult, OKRCycle } from '../../lib/okr-storage';
import { useModalEffects } from '../../hooks/useModalEffects';

export type SearchScope = 'everything' | 'open' | 'completed' | 'subtasks' | 'notes';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  tasks: PomodoroTask[];
  keyResults?: KeyResult[];
  cycles?: OKRCycle[];
  activeCycleId?: string | null;
  onSelectTask: (task: PomodoroTask) => void;
  onStartFocusTask?: (task: PomodoroTask) => void;
  onReopenTask?: (task: PomodoroTask) => void;
}

export default function CommandKModal({
  isOpen,
  onClose,
  tasks,
  keyResults = [],
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

  const filteredResults = useMemo(() => {
    const q = query.trim().toLowerCase();

    // Map KRs to Cycle IDs
    const krCycleMap = new Map<string, string>();
    keyResults.forEach(kr => {
      krCycleMap.set(kr.id, kr.objectiveId);
    });

    return tasks.filter(task => {
      // Cycle Filter
      if (selectedCycleId !== 'all' && task.keyResultId) {
        // If keyResult is linked, match cycle
        const kr = keyResults.find(k => k.id === task.keyResultId);
        if (kr && activeCycleId && krCycleMap.has(kr.id)) {
          // Keep if cycle matches selected
        }
      }

      // Scope Filter
      if (scope === 'open' && task.isCompleted) return false;
      if (scope === 'completed' && !task.isCompleted) return false;

      if (!q) return true;

      const titleMatch = task.title.toLowerCase().includes(q);
      const descMatch = (task.description || '').toLowerCase().includes(q);
      const subtaskMatch = (task.todos || []).some(t => t.text.toLowerCase().includes(q));
      const commentMatch = (task.comments || []).some(c => c.text.toLowerCase().includes(q));

      if (scope === 'subtasks') return subtaskMatch;
      if (scope === 'notes') return descMatch || commentMatch;

      return titleMatch || descMatch || subtaskMatch || commentMatch;
    });
  }, [tasks, query, scope, selectedCycleId, keyResults, activeCycleId]);

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

        {/* Results List */}
        <div className="command-k-results">
          {filteredResults.length === 0 ? (
            <div className="command-k-empty">
              No matching tasks found for &quot;{query}&quot;
            </div>
          ) : (
            filteredResults.map(task => {
              const linkedKr = keyResults.find(k => k.id === task.keyResultId);
              return (
                <div
                  key={task.id}
                  className={`command-k-item${task.isCompleted ? ' completed' : ''}`}
                  onClick={() => {
                    onSelectTask(task);
                    onClose();
                  }}
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
                      {linkedKr && <span className="meta-kr">🎯 {linkedKr.title}</span>}
                      {task.dueDate && <span className="meta-due">📅 {task.dueDate}</span>}
                      <span className="meta-pomos">
                        🍅 {task.completedPomodoros}/{task.estimatedPomodoros || 1}
                      </span>
                    </div>
                  </div>

                  <div className="command-k-item-actions" onClick={e => e.stopPropagation()}>
                    {!task.isCompleted && onStartFocusTask && (
                      <button
                        className="command-k-act-btn focus-btn"
                        onClick={() => {
                          onStartFocusTask(task);
                          onClose();
                        }}
                        title="Start focus timer with this task"
                      >
                        <Play size={13} />
                        <span>Start</span>
                      </button>
                    )}
                    {task.isCompleted && onReopenTask && (
                      <button
                        className="command-k-act-btn reopen-btn"
                        onClick={() => onReopenTask(task)}
                        title="Reopen task"
                      >
                        <RotateCcw size={13} />
                        <span>Reopen</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
