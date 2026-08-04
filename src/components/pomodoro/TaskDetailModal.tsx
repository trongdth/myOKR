import { useState, useRef, useEffect, useMemo, lazy, Suspense } from 'react';
import { CheckCircle, X, SquareCheck, MessageSquare, Play, RotateCcw, GripVertical, ChevronDown, ChevronUp } from 'lucide-react';
import type { PomodoroTask, TodoItem, TaskComment, EisenhowerCategory, TaskBucket, DailyRecord } from '../../lib/pomodoro-storage';
import { generateId, EISENHOWER_META, weeklyPlanProgress, getLocalDateString, reorderTodoItems } from '../../lib/pomodoro-storage';
import type { KeyResult } from '../../lib/okr-storage';
import { useModalEffects } from '../../hooks/useModalEffects';
import ConfirmModal from '../ConfirmModal';

const Markdown = lazy(() => import('../shared/Markdown'));

type DetailTab = 'todos' | 'comments';
type PendingDelete = { kind: 'todo' | 'comment' | 'task'; id: string } | null;

/** Progress percentage 0–100, divide-by-zero safe (weekly + sub-task bars). */
const pct = (done: number, total: number) =>
  total > 0 ? Math.min(100, (done / total) * 100) : 0;

/** "12 Jul" — short absolute date for the footer's Created line. */
function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** "2 minutes ago" → "3 hours ago" → "2 days ago", falling back to a short date. */
function formatRelative(iso: string | undefined, now: number): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? '' : 's'} ago`;
  return formatShortDate(iso);
}

/** A note is "long" once it would overflow the 220px cap. Heuristic on the raw
 *  markdown so the fade + Expand chevron appear deterministically (no DOM
 *  measurement), matching how the cap is meant to safeguard the tabs below. */
function notesIsLong(markdown: string): boolean {
  return markdown.split('\n').length > 8 || markdown.length > 400;
}

interface Props {
  task: PomodoroTask;
  onUpdate: (updated: PomodoroTask) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
  keyResults?: KeyResult[];
  onStartFocus?: (task: PomodoroTask) => void;
  /** Session history — powers the POMODOROS THIS WEEK readout (P4). */
  history?: DailyRecord[];
}

export default function TaskDetailModal({ task, onUpdate, onClose, onDelete, keyResults = [], onStartFocus, history = [] }: Props) {
  const [activeTab, setActiveTab] = useState<DetailTab>('todos');
  const [description, setDescription] = useState(task.description || '');
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [newTodoText, setNewTodoText] = useState('');
  const [newComment, setNewComment] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleText, setEditingTitleText] = useState(task.title);
  const [editingWeeklyPlan, setEditingWeeklyPlan] = useState(false);
  const [weeklyPlanDraft, setWeeklyPlanDraft] = useState('');
  const [editingEstimate, setEditingEstimate] = useState(false);
  const [estimateDraft, setEstimateDraft] = useState('');
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editingTodoText, setEditingTodoText] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  /** Sub-task click-select reorder (ADR-0010). Non-null = an item is "picked up";
   *  clicking any other row commits, Esc / re-click cancels. */
  const [reorderMovingId, setReorderMovingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);

  const descRef = useRef<HTMLTextAreaElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  // Esc reverts notes / sub-task / comment edits; blur autosaves (severity-based
  // commit: one-liners & notes both autosave on blur, Esc discards). Setting this
  // before exit makes the imminent blur handler skip its save so the revert wins.
  const skipBlurSaveRef = useRef(false);

  const todos: TodoItem[] = task.todos || [];
  const comments: TaskComment[] = task.comments || [];

  // P4: POMODOROS THIS WEEK — current calendar week (Monday start), numerator
  // from the session history, denominator = weekly plan ?? estimate.
  // History dates are LOCAL (getLocalDateString) — never UTC-slice, or the
  // window shifts a day in UTC+X timezones (see mobile mirror).
  const weekRange = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      start: getLocalDateString(monday),
      end: getLocalDateString(sunday),
    };
  }, []);
  const weekly = weeklyPlanProgress(task, history, weekRange.start, weekRange.end);
  const doneCount = todos.filter(t => t.completed).length;
  const nowMs = Date.now();

  const saveWeeklyPlan = () => {
    // Empty input must not be silently dropped: parseInt('', 10) is NaN, which
    // used to skip the update and close the editor with no visible change.
    // Treat empty as an explicit plan of 0 (consistent with the 0-plan rule:
    // no fallback to the estimate).
    const raw = weeklyPlanDraft.trim();
    const value = raw === '' ? 0 : parseInt(raw, 10);
    if (Number.isFinite(value)) {
      onUpdate({ ...task, weeklyPomodoroPlan: Math.max(0, Math.min(99, value)) });
    }
    setEditingWeeklyPlan(false);
  };

  const saveEstimate = () => {
    const raw = estimateDraft.trim();
    const value = raw === '' ? 1 : parseInt(raw, 10);
    if (Number.isFinite(value)) {
      onUpdate({ ...task, estimatedPomodoros: Math.max(1, Math.min(99, value)) });
    }
    setEditingEstimate(false);
  };

  useModalEffects(onClose);

  useEffect(() => {
    setEditingTitleText(task.title);
  }, [task.title]);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  useEffect(() => {
    if (isEditingDesc && descRef.current) {
      descRef.current.focus();
      descRef.current.setSelectionRange(descRef.current.value.length, descRef.current.value.length);
    }
  }, [isEditingDesc]);

  // Esc cancels an in-flight click-select reorder (no focused input to catch it).
  useEffect(() => {
    if (!reorderMovingId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setReorderMovingId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reorderMovingId]);

  const saveTitle = () => {
    const trimmed = editingTitleText.trim();
    if (trimmed && trimmed !== task.title) {
      onUpdate({ ...task, title: trimmed });
    }
    setIsEditingTitle(false);
  };
  // Esc cancels: revert the draft and skip the imminent blur-save (same guard
  // notes/sub-tasks/comments use) so a modified title isn't silently committed.
  const cancelTitle = () => {
    skipBlurSaveRef.current = true;
    setEditingTitleText(task.title);
    setIsEditingTitle(false);
  };

  // Property update helpers
  const handleUpdateCategory = (cat: EisenhowerCategory) => onUpdate({ ...task, category: cat });
  const handleUpdateBucket = (b: TaskBucket) => onUpdate({ ...task, bucket: b });
  const handleUpdateDueDate = (d: string) => onUpdate({ ...task, dueDate: d || undefined });
  const handleUpdateKR = (krId: string) => onUpdate({ ...task, keyResultId: krId || undefined });

  const handleToggleComplete = () => {
    const isComp = !task.isCompleted;
    onUpdate({
      ...task,
      isCompleted: isComp,
      completedAt: isComp ? new Date().toISOString() : undefined,
    });
  };

  // Notes: click-anywhere swaps the rendered view for the raw-markdown textarea.
  // Autosaves on blur / ⌘+Enter (NOT per keystroke — persistence rules); Esc reverts.
  const startEditNotes = () => {
    setDescription(task.description || '');
    setNotesExpanded(false);
    setIsEditingDesc(true);
  };
  const commitNotes = () => {
    onUpdate({ ...task, description: description.trim() || undefined });
    setIsEditingDesc(false);
  };
  const cancelNotes = () => {
    setDescription(task.description || '');
    skipBlurSaveRef.current = true;
    setIsEditingDesc(false);
  };
  const onNotesViewClick = (e: React.MouseEvent) => {
    // Let rendered links & the copy button work — only the note body swaps to edit.
    if ((e.target as HTMLElement).closest('a, button')) return;
    startEditNotes();
  };

  // Todos CRUD
  const addTodo = () => {
    if (!newTodoText.trim()) return;
    const newTodo: TodoItem = {
      id: generateId(),
      text: newTodoText.trim(),
      completed: false,
      createdAt: new Date().toISOString(),
    };
    onUpdate({ ...task, todos: [...todos, newTodo] });
    setNewTodoText('');
  };

  const toggleTodo = (id: string) => {
    onUpdate({ ...task, todos: todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t) });
  };

  const deleteTodo = (id: string) => {
    onUpdate({ ...task, todos: todos.filter(t => t.id !== id) });
  };

  // Sub-task label inline edit (click-away / Enter autosaves; Esc reverts)
  const startEditTodo = (t: TodoItem) => {
    if (reorderMovingId) return; // don't fight the reorder mode
    setEditingTodoId(t.id);
    setEditingTodoText(t.text);
  };
  const commitTodo = (id: string) => {
    const text = editingTodoText.trim();
    if (text) {
      onUpdate({ ...task, todos: todos.map(t => t.id === id ? { ...t, text } : t) });
    }
    setEditingTodoId(null);
  };
  const cancelTodo = () => {
    skipBlurSaveRef.current = true;
    setEditingTodoId(null);
  };

  // Click-select reorder (ADR-0010): grip click picks up; another row commits.
  const togglePickup = (id: string) => {
    setEditingTodoId(null);
    setReorderMovingId(prev => (prev === id ? null : id));
  };
  const commitReorder = (targetId: string) => {
    if (!reorderMovingId) return;
    onUpdate({ ...task, todos: reorderTodoItems(todos, reorderMovingId, targetId) });
    setReorderMovingId(null);
  };

  // Comments CRUD
  const addComment = () => {
    if (!newComment.trim()) return;
    const comment: TaskComment = {
      id: generateId(),
      text: newComment.trim(),
      createdAt: new Date().toISOString(),
    };
    onUpdate({ ...task, comments: [...comments, comment] });
    setNewComment('');
  };

  const deleteComment = (id: string) => {
    onUpdate({ ...task, comments: comments.filter(c => c.id !== id) });
  };

  // Comment inline edit (click-away / Enter autosaves; Esc reverts)
  const startEditComment = (c: TaskComment) => {
    setEditingCommentId(c.id);
    setEditingCommentText(c.text);
  };
  const commitComment = (id: string) => {
    const text = editingCommentText.trim();
    if (text) {
      onUpdate({ ...task, comments: comments.map(c => c.id === id ? { ...c, text } : c) });
    }
    setEditingCommentId(null);
  };
  const cancelComment = () => {
    skipBlurSaveRef.current = true;
    setEditingCommentId(null);
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    if (pendingDelete.kind === 'todo') {
      deleteTodo(pendingDelete.id);
    } else if (pendingDelete.kind === 'comment') {
      deleteComment(pendingDelete.id);
    } else {
      onDelete(pendingDelete.id);
      onClose();
    }
    setPendingDelete(null);
  };

  const deleteModalProps = pendingDelete?.kind === 'comment'
    ? { title: 'Delete comment', message: 'Delete this comment? This cannot be undone.' }
    : pendingDelete?.kind === 'task'
      ? { title: 'Delete task', message: `Delete “${task.title}”? This permanently removes the task, its sub-tasks, and comments. This cannot be undone.` }
      : { title: 'Delete sub-task', message: 'Delete this sub-task? This cannot be undone.' };

  const notesLong = notesIsLong(task.description || '');
  const updatedIso = task.updatedAt ?? task.completedAt ?? task.createdAt;

  return (
    <div className="app-modal-overlay" onClick={onClose}>
      <div className="app-modal-content task-detail-panel" onClick={e => e.stopPropagation()}>
        {/* Pinned: header + properties row (note #4 — body scrolls under these) */}
        <div className="detail-pinned">
          {/* Panel Header */}
          <div className="detail-panel-header">
            <span className="detail-eyebrow">TASK · click any field to edit</span>
            <div className="detail-title-block">
              {isEditingTitle ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  className="detail-title-input"
                  value={editingTitleText}
                  onChange={e => setEditingTitleText(e.target.value)}
                  onBlur={() => {
                    if (skipBlurSaveRef.current) {
                      skipBlurSaveRef.current = false;
                      return;
                    }
                    saveTitle();
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveTitle();
                    if (e.key === 'Escape') cancelTitle();
                  }}
                />
              ) : (
                <h3 className="detail-title" onClick={() => setIsEditingTitle(true)}>
                  {task.title}
                </h3>
              )}
            </div>

            <div className="detail-header-actions">
              {!task.isCompleted && onStartFocus && (
                <button
                  className="detail-action-btn start-focus-btn"
                  onClick={() => {
                    onStartFocus(task);
                    onClose();
                  }}
                >
                  <Play size={14} />
                  <span>Start focus</span>
                </button>
              )}

              <button
                className={`detail-action-btn complete-btn${task.isCompleted ? ' completed' : ''}`}
                onClick={handleToggleComplete}
              >
                {task.isCompleted ? <RotateCcw size={14} /> : <CheckCircle size={14} />}
                <span>{task.isCompleted ? 'Reopen' : 'Complete'}</span>
              </button>

              <button className="modal-close-btn" onClick={onClose} aria-label="Close panel">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Properties strip — mockup's 4 columns (the 5th POMODOROS column was
              folded into the weekly line below; see docs/design-system.md P4). */}
          <div className="detail-properties-bar">
            <div className="prop-group">
              <span className="prop-label">PRIORITY</span>
              <select
                className="prop-select"
                value={task.category || 'do'}
                onChange={e => handleUpdateCategory(e.target.value as EisenhowerCategory)}
              >
                {Object.entries(EISENHOWER_META).map(([c, m]) => (
                  <option key={c} value={c}>{m.label}</option>
                ))}
              </select>
            </div>

            <div className="prop-group">
              <span className="prop-label">BUCKET</span>
              <select
                className="prop-select"
                value={task.bucket || 'backlog'}
                onChange={e => handleUpdateBucket(e.target.value as TaskBucket)}
              >
                <option value="today">Today</option>
                <option value="this_week">This week</option>
                <option value="backlog">Backlog</option>
              </select>
            </div>

            <div className="prop-group">
              <span className="prop-label">DUE</span>
              <input
                type="date"
                className="prop-date-input"
                value={task.dueDate || ''}
                onChange={e => handleUpdateDueDate(e.target.value)}
              />
            </div>

            <div className="prop-group">
              <span className="prop-label">KEY RESULT</span>
              <select
                className="prop-select kr-prop-select"
                value={task.keyResultId || ''}
                onChange={e => handleUpdateKR(e.target.value)}
              >
                <option value="">No Key Result</option>
                {keyResults.map(kr => (
                  <option key={kr.id} value={kr.id}>{kr.title}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Scrolling body: weekly line → notes → tabs → footer */}
        <div className="detail-scroll-body">
          {/* P4: POMODOROS THIS WEEK — completed-this-week / planned + Change weekly plan,
              plus the estimate editor (est. N) folded in here from the old 5th column. */}
          <div className="weekly-plan-block">
            <span className="prop-label">POMODOROS THIS WEEK</span>
            {editingWeeklyPlan ? (
              <div className="weekly-plan-editor">
                <span className="pomo-mono">{weekly.completed} / </span>
                <input
                  type="number"
                  min="0"
                  max="99"
                  className="weekly-plan-input"
                  value={weeklyPlanDraft}
                  autoFocus
                  onChange={e => setWeeklyPlanDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveWeeklyPlan();
                    if (e.key === 'Escape') setEditingWeeklyPlan(false);
                  }}
                />
                <span className="pomo-mono"> planned</span>
                <button className="weekly-plan-save-btn" onClick={saveWeeklyPlan}>Save</button>
                <button className="text-btn" onClick={() => setEditingWeeklyPlan(false)}>Cancel</button>
              </div>
            ) : (
              <div className="weekly-plan-readonly">
                <div className="weekly-plan-readout-group">
                  <span className="weekly-plan-readout pomo-mono">{weekly.completed} / {weekly.planned} planned</span>
                  <div className="weekly-plan-bar" role="progressbar"
                    aria-valuenow={weekly.completed} aria-valuemin={0} aria-valuemax={weekly.planned}>
                    <div className="weekly-plan-fill"
                      style={{ width: `${pct(weekly.completed, weekly.planned)}%` }} />
                  </div>
                  {/* Estimate editor (was the 5th properties column). Mono `est. N`
                      click-to-edit; Enter/blur saves, Esc cancels. */}
                  <span className="estimate-inline">
                    <span className="pomo-mono estimate-label">est.</span>
                    {editingEstimate ? (
                      <input
                        type="number"
                        min="1"
                        max="99"
                        className="estimate-input"
                        value={estimateDraft}
                        autoFocus
                        onChange={e => setEstimateDraft(e.target.value)}
                        onBlur={saveEstimate}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveEstimate();
                          if (e.key === 'Escape') setEditingEstimate(false);
                        }}
                      />
                    ) : (
                      <button
                        className="estimate-edit-btn pomo-mono"
                        onClick={() => {
                          setEstimateDraft(String(task.estimatedPomodoros || 1));
                          setEditingEstimate(true);
                        }}
                        title="Edit estimated pomodoros"
                      >
                        {task.estimatedPomodoros || 1}
                      </button>
                    )}
                  </span>
                </div>
                <button
                  className="weekly-plan-edit-btn"
                  onClick={() => {
                    setWeeklyPlanDraft(String(task.weeklyPomodoroPlan ?? weekly.planned));
                    setEditingWeeklyPlan(true);
                  }}
                >
                  Change weekly plan
                </button>
              </div>
            )}
          </div>

          {/* Notes & Links — one markdown field; click anywhere to edit. */}
          <div className="detail-body-section">
            <div className="notes-header">
              <span className="section-title">NOTES</span>
              <div className="notes-header-actions">
                <span className="notes-format-hint">Markdown</span>
                {notesLong && !isEditingDesc && (
                  <button
                    className="notes-expand-btn"
                    onClick={() => setNotesExpanded(v => !v)}
                    title={notesExpanded ? 'Collapse notes' : 'Expand notes'}
                  >
                    {notesExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    <span>{notesExpanded ? 'Less' : 'Expand'}</span>
                  </button>
                )}
              </div>
            </div>

            {isEditingDesc ? (
              <textarea
                ref={descRef}
                className="notes-textarea"
                value={description}
                onChange={e => setDescription(e.target.value)}
                onBlur={() => {
                  if (skipBlurSaveRef.current) {
                    skipBlurSaveRef.current = false;
                    return;
                  }
                  commitNotes();
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    commitNotes();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelNotes();
                  }
                }}
                placeholder="Add notes, context, or links (Markdown supported). ⌘/Ctrl+Enter saves, Esc reverts."
              />
            ) : (
              <div
                className={`notes-content-view${task.description ? '' : ' empty'}${notesLong && !notesExpanded ? ' collapsed' : ''}`}
                onClick={onNotesViewClick}
              >
                {task.description ? (
                  <Suspense fallback={<div>Loading notes…</div>}>
                    <Markdown showLinkCopy>{task.description}</Markdown>
                  </Suspense>
                ) : (
                  <p className="empty-notes-hint">Click to add notes, context, or links (Markdown supported).</p>
                )}
                {notesLong && !notesExpanded && task.description && (
                  <>
                    <div className="notes-fade" aria-hidden="true" />
                    <span className="notes-count">
                      {(task.description || '').split('\n').length} lines · {(task.description || '').length} chars
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Sub-tasks & Comments tabs */}
          <div className="detail-tabs-section">
            <div className="detail-tab-headers">
              <button
                className={`detail-tab-btn${activeTab === 'todos' ? ' active' : ''}`}
                onClick={() => setActiveTab('todos')}
              >
                <SquareCheck size={16} />
                <span>Sub-tasks</span>
                <span className="tab-badge">{doneCount}/{todos.length}</span>
              </button>

              <button
                className={`detail-tab-btn${activeTab === 'comments' ? ' active' : ''}`}
                onClick={() => setActiveTab('comments')}
              >
                <MessageSquare size={16} />
                <span>Comments</span>
                <span className="tab-badge">{comments.length}</span>
              </button>
            </div>

            <div className="detail-tab-content">
              {activeTab === 'todos' ? (
                <div className="todos-tab-body">
                  {todos.length > 0 && (
                    <div className="detail-tab-progress">
                      <div className="detail-tab-progress-bar">
                        <div className="detail-tab-progress-fill"
                          style={{ width: `${pct(doneCount, todos.length)}%` }} />
                      </div>
                      <span className="detail-tab-progress-text">
                        {doneCount} of {todos.length} done
                      </span>
                    </div>
                  )}
                  <div className="add-todo-row">
                    <input
                      type="text"
                      className="add-todo-input"
                      placeholder="Add a sub-task..."
                      value={newTodoText}
                      onChange={e => setNewTodoText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addTodo()}
                    />
                    <button className="add-todo-btn" onClick={addTodo}>Add</button>
                  </div>

                  {reorderMovingId && (
                    <div className="reorder-hint">
                      Click a row to move “{todos.find(t => t.id === reorderMovingId)?.text}” above it · <button className="text-btn" onClick={() => setReorderMovingId(null)}>Cancel</button>
                    </div>
                  )}

                  {todos.length === 0 ? (
                    <p className="empty-tab-hint">No sub-tasks yet. Add one above.</p>
                  ) : (
                    <div className="todos-list">
                      {todos.map(todo => {
                        const moving = reorderMovingId === todo.id;
                        const targeting = reorderMovingId && !moving;
                        return (
                          <div
                            key={todo.id}
                            className={`todo-item-row${todo.completed ? ' completed' : ''}${moving ? ' reordering' : ''}${targeting ? ' reorder-target' : ''}`}
                            onClick={targeting ? () => commitReorder(todo.id) : undefined}
                          >
                            <button
                              className="todo-grip"
                              onClick={e => { e.stopPropagation(); togglePickup(todo.id); }}
                              title="Click, then click a row to move this above it"
                              aria-label="Reorder sub-task"
                            >
                              <GripVertical size={14} />
                            </button>
                            <input
                              type="checkbox"
                              checked={todo.completed}
                              onChange={() => toggleTodo(todo.id)}
                            />
                            {editingTodoId === todo.id ? (
                              <input
                                type="text"
                                className="todo-edit-input"
                                value={editingTodoText}
                                autoFocus
                                onChange={e => setEditingTodoText(e.target.value)}
                                onBlur={() => {
                                  if (skipBlurSaveRef.current) {
                                    skipBlurSaveRef.current = false;
                                    return;
                                  }
                                  commitTodo(todo.id);
                                }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') commitTodo(todo.id);
                                  if (e.key === 'Escape') cancelTodo();
                                }}
                              />
                            ) : (
                              <span className="todo-text" onClick={() => startEditTodo(todo)}>{todo.text}</span>
                            )}
                            <button
                              className="delete-sub-btn"
                              onClick={e => { e.stopPropagation(); setPendingDelete({ kind: 'todo', id: todo.id }); }}
                              aria-label="Delete sub-task"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="comments-tab-body">
                  <div className="add-comment-row">
                    <input
                      type="text"
                      className="add-comment-input"
                      placeholder="Add a comment..."
                      value={newComment}
                      onChange={e => setNewComment(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addComment()}
                    />
                    <button className="add-comment-btn" onClick={addComment}>Comment</button>
                  </div>

                  {comments.length === 0 ? (
                    <p className="empty-tab-hint">No comments yet.</p>
                  ) : (
                    <div className="comments-list">
                      {comments.map(c => (
                        <div key={c.id} className="comment-item-card">
                          {editingCommentId === c.id ? (
                            <input
                              type="text"
                              className="comment-edit-input"
                              value={editingCommentText}
                              autoFocus
                              onChange={e => setEditingCommentText(e.target.value)}
                              onBlur={() => {
                                if (skipBlurSaveRef.current) {
                                  skipBlurSaveRef.current = false;
                                  return;
                                }
                                commitComment(c.id);
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') commitComment(c.id);
                                if (e.key === 'Escape') cancelComment();
                              }}
                            />
                          ) : (
                            <p className="comment-text" onClick={() => startEditComment(c)}>{c.text}</p>
                          )}
                          <div className="comment-footer">
                            <span className="comment-time">{new Date(c.createdAt).toLocaleString()}</span>
                            <button
                              className="delete-sub-btn"
                              onClick={() => setPendingDelete({ kind: 'comment', id: c.id })}
                              aria-label="Delete comment"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer: created/updated/logged + Delete task */}
          <div className="detail-footer">
            <span className="detail-meta">
              Created {formatShortDate(task.createdAt)}
              {updatedIso ? <> · updated {formatRelative(updatedIso, nowMs)}</> : null}
              {' · '}{task.completedPomodoros} pomodoro{task.completedPomodoros === 1 ? '' : 's'} logged
            </span>
            <button className="delete-task-btn" onClick={() => setPendingDelete({ kind: 'task', id: task.id })}>
              Delete task
            </button>
          </div>
        </div>
      </div>
      <ConfirmModal
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title={deleteModalProps.title}
        message={deleteModalProps.message}
        confirmText="Delete"
      />
    </div>
  );
}
