import { useState, useRef, useEffect } from 'react';
import type { PomodoroTask, EisenhowerCategory } from '../../lib/pomodoro-storage';
import { generateId, EISENHOWER_META } from '../../lib/pomodoro-storage';
import type { KeyResult } from '../../lib/okr-storage';
import ConfirmModal from '../ConfirmModal';
import TaskDetailModal from './TaskDetailModal';

function truncateDescription(desc: string, maxWords: number = 10): { text: string; truncated: boolean } {
  const words = desc.trim().split(/\s+/);
  if (words.length <= maxWords) return { text: desc.trim(), truncated: false };
  return { text: words.slice(0, maxWords).join(' ') + '…', truncated: true };
}

function EisenhowerLegend() {
  return (
    <div className="eisenhower-legend">
      {(Object.keys(EISENHOWER_META) as EisenhowerCategory[]).map(key => {
        const m = EISENHOWER_META[key];
        return (
          <div key={key} className="legend-item" title={m.description}>
            <span className="category-dot" style={{ background: m.color }} />
            <span className="legend-label">{m.label}</span>
          </div>
        );
      })}
    </div>
  );
}

interface Props {
  tasks: PomodoroTask[];
  activeTaskId: string | null;
  onTasksChange: (tasks: PomodoroTask[]) => void;
  onSetActive: (id: string | null) => void;
  keyResults?: KeyResult[];
  hideCompleted?: boolean;
}

function CategoryBadge({ category, onChange }: { category: EisenhowerCategory; onChange: (c: EisenhowerCategory) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const meta = EISENHOWER_META[category];

  return (
    <div className="category-badge-wrapper" ref={ref}>
      <button
        className="category-badge"
        style={{ background: meta.color }}
        onClick={e => { e.stopPropagation(); setOpen(!open); }}
        title={`${meta.label}: ${meta.description}`}
      />
      {open && (
        <div className="category-dropdown">
          {(Object.keys(EISENHOWER_META) as EisenhowerCategory[]).map(key => {
            const m = EISENHOWER_META[key];
            return (
              <button
                key={key}
                className={`category-dropdown-item${key === category ? ' selected' : ''}`}
                onClick={e => { e.stopPropagation(); onChange(key); setOpen(false); }}
              >
                <span className="category-dot" style={{ background: m.color }} />
                <span>{m.label}</span>
                <span className="category-desc">{m.description}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CategorySelector({ value, onChange }: { value: EisenhowerCategory; onChange: (c: EisenhowerCategory) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const meta = EISENHOWER_META[value];

  return (
    <div className="category-selector-wrapper" ref={ref}>
      <button
        className="category-selector-btn"
        onClick={() => setOpen(!open)}
        title="Select priority category"
        type="button"
      >
        <span className="category-dot" style={{ background: meta.color }} />
        <span>{meta.label}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 4l3 3 3-3" />
        </svg>
      </button>
      {open && (
        <div className="category-dropdown">
          {(Object.keys(EISENHOWER_META) as EisenhowerCategory[]).map(key => {
            const m = EISENHOWER_META[key];
            return (
              <button
                key={key}
                className={`category-dropdown-item${key === value ? ' selected' : ''}`}
                onClick={() => { onChange(key); setOpen(false); }}
              >
                <span className="category-dot" style={{ background: m.color }} />
                <span>{m.label}</span>
                <span className="category-desc">{m.description}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DescriptionPreview({ task, onExpand }: { task: PomodoroTask; onExpand: () => void }) {
  const desc = task.description;
  const todoCount = task.todos?.length || 0;
  const commentCount = task.comments?.length || 0;
  const hasMeta = todoCount > 0 || commentCount > 0;

  if (!desc && !hasMeta) {
    return (
      <div className="task-description-row">
        <button
          className="task-expand-btn subtle"
          onClick={e => { e.stopPropagation(); onExpand(); }}
          title="Add description & details"
        >
          + Add details
        </button>
      </div>
    );
  }

  const { text, truncated } = desc ? truncateDescription(desc) : { text: '', truncated: false };

  return (
    <div className="task-description-row">
      {text && (
        <span className="task-description-preview">{text}</span>
      )}
      <div className="task-description-meta">
        {todoCount > 0 && (
          <span className="task-description-badge">
            ☑ {task.todos!.filter(t => t.completed).length}/{todoCount}
          </span>
        )}
        {commentCount > 0 && (
          <span className="task-description-badge">
            💬 {commentCount}
          </span>
        )}
      </div>
      <button
        className="task-expand-btn"
        onClick={e => { e.stopPropagation(); onExpand(); }}
        title="View details"
      >
        {truncated ? 'more ↗' : '↗'}
      </button>
    </div>
  );
}

export default function TaskList({ tasks, activeTaskId, onTasksChange, onSetActive, keyResults = [], hideCompleted = false }: Props) {
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<EisenhowerCategory>('do');
  const [newKeyResultId, setNewKeyResultId] = useState<string>('');
  const [taskToDelete, setTaskToDelete] = useState<PomodoroTask | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [detailTask, setDetailTask] = useState<PomodoroTask | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const startEdit = (task: PomodoroTask) => {
    setEditingTaskId(task.id);
    setEditTitle(task.title);
  };

  const saveEdit = (id: string) => {
    if (editingTaskId === id) {
      const title = editTitle.trim();
      if (title) {
        onTasksChange(tasks.map(t => t.id === id ? { ...t, title } : t));
      }
      setEditingTaskId(null);
    }
  };

  const cancelEdit = () => {
    setEditingTaskId(null);
  };

  const addTask = () => {
    const title = newTitle.trim();
    if (!title) return;
    const task: PomodoroTask = {
      id: generateId(),
      title,
      estimatedPomodoros: 1,
      completedPomodoros: 0,
      isCompleted: false,
      createdAt: new Date().toISOString(),
      category: newCategory,
      keyResultId: newKeyResultId || undefined,
    };
    onTasksChange([...tasks, task]);
    setNewTitle('');
    setNewKeyResultId('');
  };

  const toggleComplete = (id: string) => {
    onTasksChange(tasks.map(t =>
      t.id === id ? { ...t, isCompleted: !t.isCompleted, completedAt: !t.isCompleted ? new Date().toISOString() : undefined } : t
    ));
  };

  const deleteTask = (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (task) setTaskToDelete(task);
  };

  const confirmDelete = () => {
    if (!taskToDelete) return;
    if (activeTaskId === taskToDelete.id) onSetActive(null);
    onTasksChange(tasks.filter(t => t.id !== taskToDelete.id));
    setTaskToDelete(null);
  };

  const updateEstimate = (id: string, val: number) => {
    const est = Math.max(1, Math.min(20, val || 1));
    onTasksChange(tasks.map(t => t.id === id ? { ...t, estimatedPomodoros: est } : t));
  };

  const updateCategory = (id: string, category: EisenhowerCategory) => {
    onTasksChange(tasks.map(t => t.id === id ? { ...t, category } : t));
  };

  const handleDetailUpdate = (updated: PomodoroTask) => {
    onTasksChange(tasks.map(t => t.id === updated.id ? updated : t));
    setDetailTask(updated);
  };

  const activeTasks = tasks.filter(t => !t.isCompleted);
  const completedTasks = tasks.filter(t => t.isCompleted);

  return (
    <div className="task-section">
      <div className="task-section-header">
        <h3>📋 Tasks</h3>
        <span className="task-count">
          {activeTasks.length} active · {completedTasks.length} done
        </span>
      </div>

      <div className="task-input-row">
        <div className="task-input-group">
          <input
            type="text"
            placeholder="What are you working on?"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask()}
          />
          <CategorySelector value={newCategory} onChange={setNewCategory} />
        </div>
        {keyResults.length > 0 && (
          <select
            className="task-kr-select"
            value={newKeyResultId}
            onChange={e => setNewKeyResultId(e.target.value)}
            title="Link to Key Result (optional)"
          >
            <option value="">🎯 No KR</option>
            {keyResults.map(kr => (
              <option key={kr.id} value={kr.id}>{kr.title}</option>
            ))}
          </select>
        )}
        <button className="btn add-task-btn" onClick={addTask}>+ Add</button>
      </div>

      <div className="task-list">
        {tasks.length === 0 && (
          <div className="task-empty">No tasks yet. Add one above to get started!</div>
        )}
        {activeTasks.map(task => (
          <div
            key={task.id}
            className={`task-item${activeTaskId === task.id ? ' active-task' : ''} ${editingTaskId === task.id ? 'editing' : ''}`}
            onClick={() => {
              if (editingTaskId !== task.id) {
                onSetActive(activeTaskId === task.id ? null : task.id);
              }
            }}
          >
            <button
              className={`task-checkbox${task.isCompleted ? ' checked' : ''}`}
              onClick={e => { e.stopPropagation(); toggleComplete(task.id); }}
            >✓</button>
            {editingTaskId === task.id ? (
              <input
                type="text"
                className="task-name-input"
                value={editTitle}
                autoFocus
                onClick={e => e.stopPropagation()}
                onChange={e => setEditTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveEdit(task.id);
                  if (e.key === 'Escape') cancelEdit();
                }}
                onBlur={() => saveEdit(task.id)}
              />
            ) : (
              <span 
                className="task-name"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  window.getSelection()?.removeAllRanges();
                  startEdit(task);
                }}
                title="Double click to edit"
              >
                {task.title}
              </span>
            )}
            <CategoryBadge
              category={task.category || 'do'}
              onChange={c => updateCategory(task.id, c)}
            />
            {task.keyResultId && keyResults.length > 0 && (() => {
              const kr = keyResults.find(k => k.id === task.keyResultId);
              return kr ? (
                <span className="task-kr-badge" title={`Linked to: ${kr.title}`}>
                  🎯 {kr.title.length > 20 ? kr.title.slice(0, 20) + '…' : kr.title}
                </span>
              ) : null;
            })()}
            <div className="task-controls">
              <div className="task-pomodoros">
                <span className="task-pomo-icon main-icon">🍅</span>
                <span className="task-pomo-count">
                  {task.completedPomodoros}/{task.estimatedPomodoros}
                </span>
              </div>
              <input
                type="number"
                className="task-est-input"
                value={task.estimatedPomodoros}
                min={1} max={20}
                onClick={e => e.stopPropagation()}
                onChange={e => updateEstimate(task.id, parseInt(e.target.value))}
                title="Estimated pomodoros"
              />
              <div className="task-actions">
                <button className="task-action-btn" onClick={e => { e.stopPropagation(); deleteTask(task.id); }} title="Delete">✕</button>
              </div>
            </div>
            <DescriptionPreview task={task} onExpand={() => setDetailTask(task)} />
          </div>
        ))}
        {completedTasks.length > 0 && !hideCompleted && (
          <>
            <div 
              className="completed-tasks-header"
              style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '0.5em 0', marginTop: '0.5em', display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setShowCompleted(!showCompleted)}
            >
              <svg 
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ marginRight: '0.5em', transform: showCompleted ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              Completed ({completedTasks.length})
            </div>
            {showCompleted && completedTasks.map(task => (
              <div key={task.id} className="task-item completed-task">
                <button
                  className="task-checkbox checked"
                  onClick={() => toggleComplete(task.id)}
                >✓</button>
                <span className="task-name">{task.title}</span>
                <CategoryBadge
                  category={task.category || 'do'}
                  onChange={c => updateCategory(task.id, c)}
                />
                <div className="task-controls">
                  <div className="task-pomodoros">
                    <span className="task-pomo-icon main-icon">🍅</span>
                    <span className="task-pomo-count">
                      {task.completedPomodoros}/{task.estimatedPomodoros}
                    </span>
                  </div>
                  <div className="task-actions">
                    <button className="task-action-btn" onClick={() => deleteTask(task.id)} title="Delete">✕</button>
                  </div>
                </div>
                <DescriptionPreview task={task} onExpand={() => setDetailTask(task)} />
              </div>
            ))}
          </>
        )}
      </div>

      <EisenhowerLegend />

      <ConfirmModal
        isOpen={!!taskToDelete}
        onClose={() => setTaskToDelete(null)}
        onConfirm={confirmDelete}
        title="Delete Task?"
        message={
          <>Are you sure you want to delete "<strong>{taskToDelete?.title}</strong>"? This action cannot be undone.</>
        }
        confirmText="Delete"
      />

      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          onUpdate={handleDetailUpdate}
          onClose={() => setDetailTask(null)}
        />
      )}
    </div>
  );
}
