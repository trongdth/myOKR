import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { X, SquareCheck, MessageSquare, Play, GripVertical, Pencil } from 'lucide-react';
import type { PomodoroTask, TodoItem, TaskComment, EisenhowerCategory, TaskBucket } from '../../lib/pomodoro-storage';
import { EISENHOWER_META, generateId, reorderTodoItems } from '../../lib/pomodoro-storage';
import type { KeyResult } from '../../lib/okr-storage';
import { useModalEffects } from '../../hooks/useModalEffects';
import ConfirmModal from '../ConfirmModal';
import PomoEstimatePopover from './PomoEstimatePopover';
import { Select, type SelectOption } from '../shared/Select';
import DatePicker from '../shared/DatePicker';
import { PRIORITY_OPTIONS, BUCKET_OPTIONS, krOptions } from './taskSelectOptions';

const Markdown = lazy(() => import('../shared/Markdown'));

type DetailTab = 'todos' | 'comments';
type PendingDelete = { kind: 'todo' | 'comment' | 'task'; id: string } | null;

/** Sub-task rows shown before the "N more · M completed" expander. */
const SUBTASKS_VISIBLE = 4;

/** Meta-bar bucket options: value + label only — the cell is text + chevron,
 *  so the calendar glyphs the Tasks toolbar uses are dropped here. */
const META_BUCKET_OPTIONS: SelectOption<TaskBucket>[] = BUCKET_OPTIONS.map(
  ({ value, label }) => ({ value, label }),
);

/** Progress percentage 0–100, divide-by-zero safe (pomodoro + sub-task bars). */
const pct = (done: number, total: number) =>
  total > 0 ? Math.max(0, Math.min(100, (done / total) * 100)) : 0;

/** IME composition guard (WebKit / WKWebView out-of-order compositionend also requires keyCode === 229). */
const isImeComposing = (e: React.KeyboardEvent) =>
  e.nativeEvent.isComposing || e.keyCode === 229;

/** Task-delete confirm copy: names what goes away with the task and reassures
 * that logged pomodoros stay in stats (they live in review snapshots). */
function taskDeleteMessage(task: PomodoroTask): string {
  const parts = [`“${task.title}”`];
  if (task.todos?.length) parts.push(`its ${task.todos.length} sub-task${task.todos.length === 1 ? '' : 's'}`);
  if (task.comments?.length) parts.push(`${task.comments.length} comment${task.comments.length === 1 ? '' : 's'}`);
  const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  const logged = task.completedPomodoros;
  const pomoLine = logged > 0 ? ` The ${logged} logged pomodoro${logged === 1 ? '' : 's'} stay${logged === 1 ? 's' : ''} in your stats.` : '';
  return `${joined} will be removed.${pomoLine}`;
}

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

interface Props {
  /** The full task list — feeds the KR picker's open-linked counts (ticket 07). */
  tasks?: PomodoroTask[];
  task: PomodoroTask;
  onUpdate: (updated: PomodoroTask) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
  keyResults?: KeyResult[];
  onStartFocus?: (task: PomodoroTask) => void;
}

export default function TaskDetailModal({ task: taskProp, tasks, onUpdate, onClose, onDelete, keyResults = [], onStartFocus }: Props) {
  const task = tasks?.find(t => t.id === taskProp.id) ?? taskProp;
  const [activeTab, setActiveTab] = useState<DetailTab>('todos');
  const [description, setDescription] = useState(task.description || '');
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [showAllTodos, setShowAllTodos] = useState(false);
  const [newTodoText, setNewTodoText] = useState('');
  const [newComment, setNewComment] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleText, setEditingTitleText] = useState(task.title);
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editingTodoText, setEditingTodoText] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  /** Sub-task click-select reorder (restored 2026-08-05 — HTML5 drag-and-drop
   *  was reverted: WKWebView never initiates drags inside scroll regions, so
   *  the packaged app could not drag; see docs/design-system.md). Non-null =
   *  an item is "picked up"; a click on another row places it above that row. */
  const [reorderMovingId, setReorderMovingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);

  const descRef = useRef<HTMLTextAreaElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Esc reverts notes / sub-task / comment edits; blur autosaves (severity-based
  // commit: one-liners & notes both autosave on blur, Esc discards). Setting this
  // before exit makes the imminent blur handler skip its save so the revert wins.
  const skipBlurSaveRef = useRef(false);
  const clearSkipBlurNextTick = () => {
    queueMicrotask(() => {
      skipBlurSaveRef.current = false;
    });
  };

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const todos: TodoItem[] = task.todos || [];
  const comments: TaskComment[] = task.comments || [];

  const doneCount = todos.filter(t => t.completed).length;
  const nowMs = Date.now();

  // 4-row collapse: rows past SUBTASKS_VISIBLE hide behind the muted
  // "N more · M completed" line until clicked.
  const visibleTodos = showAllTodos ? todos : todos.slice(0, SUBTASKS_VISIBLE);
  const hiddenTodos = todos.slice(visibleTodos.length);
  const hiddenCompletedCount = hiddenTodos.filter(t => t.completed).length;

  useModalEffects(() => {
    if (pendingDelete) {
      setPendingDelete(null);
      return;
    }
    if (reorderMovingId) {
      setReorderMovingId(null);
      return;
    }
    onClose();
  });

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

  const startEditTitle = () => {
    skipBlurSaveRef.current = false;
    setEditingTitleText(task.title);
    setIsEditingTitle(true);
  };
  const saveTitle = () => {
    const trimmed = editingTitleText.trim();
    if (trimmed && trimmed !== task.title) {
      onUpdate({ ...task, title: trimmed });
    } else {
      setEditingTitleText(task.title);
    }
    setIsEditingTitle(false);
  };
  // Esc cancels: revert the draft and skip the imminent blur-save (same guard
  // notes/sub-tasks/comments use) so a modified title isn't silently committed.
  const cancelTitle = () => {
    skipBlurSaveRef.current = true;
    setEditingTitleText(task.title);
    setIsEditingTitle(false);
    clearSkipBlurNextTick();
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

  // Notes: click-anywhere or the explicit Edit button swaps the rendered view
  // for the raw-markdown textarea. Autosaves on blur / ⌘+Enter / Save button
  // (NOT per keystroke — persistence rules); Esc / Cancel button reverts.
  const startEditNotes = () => {
    skipBlurSaveRef.current = false;
    setDescription(task.description || '');
    setIsEditingDesc(true);
  };
  const commitNotes = () => {
    const nextDesc = description.trim() || undefined;
    if (nextDesc !== (task.description || undefined)) {
      onUpdate({ ...task, description: nextDesc });
      setNotesSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setNotesSaved(false), 1800);
    }
    setIsEditingDesc(false);
  };
  const cancelNotes = () => {
    setDescription(task.description || '');
    skipBlurSaveRef.current = true;
    setIsEditingDesc(false);
    clearSkipBlurNextTick();
  };
  const onNotesViewClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // Let rendered links & the copy button work — only the note body swaps to edit.
    if (target.closest('a, button')) return;
    // Ignore clicks on horizontal/vertical scrollbars of scrollable blocks (table, pre).
    if (
      (target.scrollWidth > target.clientWidth && e.nativeEvent.offsetY > target.clientHeight) ||
      (target.scrollHeight > target.clientHeight && e.nativeEvent.offsetX > target.clientWidth)
    ) {
      return;
    }
    // Do not swap to edit mode if the user just drag-selected text to copy (⌘C).
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().length > 0) return;
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
    const nextTodos = [...todos, newTodo];
    onUpdate({ ...task, todos: nextTodos });
    if (nextTodos.length > SUBTASKS_VISIBLE) {
      setShowAllTodos(true);
    }
    setNewTodoText('');
  };

  const toggleTodo = (id: string) => {
    onUpdate({ ...task, todos: todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t) });
  };

  const deleteTodo = (id: string) => {
    if (reorderMovingId === id) setReorderMovingId(null);
    onUpdate({ ...task, todos: todos.filter(t => t.id !== id) });
  };

  // Sub-task label inline edit (click-away / Enter autosaves; Esc reverts)
  const startEditTodo = (t: TodoItem) => {
    if (reorderMovingId) return; // don't fight the reorder mode
    skipBlurSaveRef.current = false;
    setEditingTodoId(t.id);
    setEditingTodoText(t.text);
  };
  const commitTodo = (id: string) => {
    const text = editingTodoText.trim();
    const current = todos.find(t => t.id === id);
    if (text && current && text !== current.text) {
      onUpdate({ ...task, todos: todos.map(t => t.id === id ? { ...t, text } : t) });
    }
    setEditingTodoId(null);
  };
  const cancelTodo = () => {
    skipBlurSaveRef.current = true;
    setEditingTodoId(null);
    clearSkipBlurNextTick();
  };

  // Click-select reorder: grip click picks up; clicking another row commits
  // (reorderTodoItems inserts above the target); Esc or re-click cancels.
  const togglePickup = (id: string) => {
    if (editingTodoId) commitTodo(editingTodoId);
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
    skipBlurSaveRef.current = false;
    setEditingCommentId(c.id);
    setEditingCommentText(c.text);
  };
  const commitComment = (id: string) => {
    const text = editingCommentText.trim();
    const current = comments.find(c => c.id === id);
    if (text && current && text !== current.text) {
      onUpdate({ ...task, comments: comments.map(c => c.id === id ? { ...c, text } : c) });
    }
    setEditingCommentId(null);
  };
  const cancelComment = () => {
    skipBlurSaveRef.current = true;
    setEditingCommentId(null);
    clearSkipBlurNextTick();
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

  let deleteModalProps = { title: 'Delete sub-task', message: 'Delete this sub-task? This cannot be undone.' as React.ReactNode, confirmText: 'Delete' };
  if (pendingDelete?.kind === 'comment') {
    deleteModalProps = { title: 'Delete comment', message: 'Delete this comment? This cannot be undone.', confirmText: 'Delete' };
  } else if (pendingDelete?.kind === 'task') {
    deleteModalProps = { title: 'Delete this task?', message: taskDeleteMessage(task), confirmText: 'Delete task' };
  }

  const updatedIso = task.updatedAt ?? task.completedAt ?? task.createdAt;

  return (
    <div className="app-modal-overlay" onClick={onClose}>
      <div
        className="app-modal-content task-detail-panel"
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
      >
        {/* Pinned: header + properties row + pomodoros band. The band lives in
            the pinned stack (flush under the bar) — its full-bleed negative
            margins are only safe where overflow is hidden; inside the scroll
            container they became horizontal swipe (2026-08-30 feedback). */}
        <div className="detail-pinned">
          {/* Panel Header */}
          <div className="detail-panel-header">
            <span className="detail-eyebrow">
              <span className="eyebrow-label">TASK</span>
              <span className="eyebrow-hint">click any field to edit</span>
            </span>
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
                    if (isImeComposing(e)) return;
                    if (e.key === 'Enter') saveTitle();
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelTitle();
                    }
                  }}
                />
              ) : (
                <h3
                  className="detail-title"
                  role="button"
                  tabIndex={0}
                  onClick={startEditTitle}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      startEditTitle();
                    }
                  }}
                >
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
                  <Play size={14} fill="currentColor" />
                  <span>Start</span>
                </button>
              )}

              <button
                className={`detail-action-btn complete-btn${task.isCompleted ? ' completed' : ''}`}
                onClick={handleToggleComplete}
              >
                {task.isCompleted ? 'Reopen' : 'Complete'}
              </button>

              <button className="modal-close-btn" onClick={onClose} aria-label="Close panel">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Properties strip — a full-bleed 4-cell row (label over value,
              1px column dividers; no card, no per-field boxes). The 5th
              POMODOROS column was folded into the pomodoro line below; see
              docs/design-system.md P4. */}
          <div className="detail-properties-bar">
            <div
              className="prop-group prop-priority"
              style={{ '--prop-accent': EISENHOWER_META[task.category || 'do'].color } as React.CSSProperties}
            >
              <span className="prop-label">PRIORITY</span>
              <Select
                options={PRIORITY_OPTIONS}
                value={task.category || 'do'}
                onChange={handleUpdateCategory}
                ariaLabel="Priority"
              />
            </div>

            <div className="prop-group">
              <span className="prop-label">BUCKET</span>
              <Select
                options={META_BUCKET_OPTIONS}
                value={task.bucket || 'backlog'}
                onChange={handleUpdateBucket}
                ariaLabel="Bucket"
              />
            </div>

            <div className="prop-group">
              <span className="prop-label">DUE</span>
              <div className="prop-due">
                <DatePicker
                  className="prop-due-btn"
                  ariaLabel="Due date"
                  value={task.dueDate}
                  onChange={handleUpdateDueDate}
                  placeholder="Set a due date"
                  onClear={() => handleUpdateDueDate('')}
                  clearLabel="No due date"
                />
              </div>
            </div>

            <div className="prop-group prop-kr">
              <span className="prop-label">KEY RESULT</span>
              <Select
                options={krOptions(keyResults, tasks)}
                value={task.keyResultId || null}
                onChange={(krId) => handleUpdateKR(krId || '')}
                placeholder="Link a key result"
                onClear={() => handleUpdateKR('')}
                clearLabel="No key result"
                ariaLabel="Key result"
              />
            </div>
          </div>

          {/* P4: POMODOROS — an elevated band: label · bar · readout on one row.
              The readout IS the estimate editor: click `2 / 4 planned` to open the
              shared Adjust Total Pomodoros popover (same component as the
              Tasks rows). The bar mirrors the completed/estimated ratio. */}
          <div className="weekly-plan-block">
            <span className="prop-label">POMODOROS</span>
            <div className="weekly-plan-bar" role="progressbar"
              aria-valuenow={task.completedPomodoros} aria-valuemin={0}
              aria-valuemax={Math.max(task.completedPomodoros, task.estimatedPomodoros || 1)}>
              <div className="weekly-plan-fill"
                style={{ width: `${pct(task.completedPomodoros, task.estimatedPomodoros || 1)}%` }} />
            </div>
            <PomoEstimatePopover
              completed={task.completedPomodoros}
              estimated={task.estimatedPomodoros || 1}
              suffix="planned"
              plain
              showIcon
              showChevron
              onChange={n => onUpdate({ ...task, estimatedPomodoros: n })}
            />
          </div>
        </div>

        {/* Scrolling body: notes → tabs. min-height:0 is required for a flex
            child to scroll instead of growing past the panel's 90vh cap. */}
        <div className="detail-scroll-body">
          {/* Notes & Links — one markdown field; click anywhere to edit.
              Full render, no cap/fade/Expand: notes of any length stay whole. */}
          <div className="detail-body-section">
            <div className="notes-header">
              <div className="notes-header-left">
                <span className="section-title">NOTES</span>
                {notesSaved && !isEditingDesc && (
                  <span className="notes-saved-badge" role="status">✓ Saved</span>
                )}
              </div>
              <div className="notes-header-actions">
                <span className="notes-format-hint">Markdown</span>
                {isEditingDesc ? (
                  <>
                    <button
                      type="button"
                      className="notes-cancel-btn"
                      onMouseDown={e => e.preventDefault()}
                      onClick={cancelNotes}
                    >
                      <span>Cancel</span>
                      <span className="notes-kbd">Esc</span>
                    </button>
                    <button
                      type="button"
                      className="notes-save-btn"
                      onMouseDown={e => e.preventDefault()}
                      onClick={commitNotes}
                    >
                      <span>Save</span>
                      <span className="notes-kbd">⌘Enter</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="notes-edit-btn"
                    onClick={startEditNotes}
                  >
                    <Pencil size={12} />
                    <span>Edit</span>
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
                  if (isImeComposing(e)) return;
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    commitNotes();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    e.nativeEvent.stopImmediatePropagation();
                    cancelNotes();
                  }
                }}
                placeholder="Add notes, context, or links (Markdown supported). ⌘/Ctrl+Enter saves, Esc reverts."
              />
            ) : (
              <div
                className={`notes-content-view${task.description ? '' : ' empty'}`}
                onClick={onNotesViewClick}
              >
                {task.description ? (
                  <Suspense fallback={<div>Loading notes…</div>}>
                    <Markdown>{task.description}</Markdown>
                  </Suspense>
                ) : (
                  <p className="empty-notes-hint">Click to add notes, context, or links (Markdown supported).</p>
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
                  <div className="add-todo-row">
                    <input
                      type="text"
                      className="add-todo-input"
                      placeholder="Add a sub-task"
                      value={newTodoText}
                      onChange={e => setNewTodoText(e.target.value)}
                      onKeyDown={e => {
                        if (isImeComposing(e)) return;
                        if (e.key === 'Enter') addTodo();
                      }}
                    />
                    <button className="add-todo-btn" onClick={addTodo} disabled={!newTodoText.trim()}>Add</button>
                  </div>

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

                  {reorderMovingId && (
                    <div className="reorder-hint">
                      Click a row to move “{todos.find(t => t.id === reorderMovingId)?.text}” above it · <button className="text-btn" onClick={() => setReorderMovingId(null)}>Cancel</button>
                    </div>
                  )}

                  {todos.length === 0 ? (
                    <p className="empty-tab-hint">No sub-tasks yet.</p>
                  ) : (
                    <>
                      <div className="todos-list">
                        {visibleTodos.map(todo => {
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
                                onClick={e => e.stopPropagation()}
                                onChange={() => toggleTodo(todo.id)}
                              />
                              {editingTodoId === todo.id ? (
                                <input
                                  type="text"
                                  className="todo-edit-input"
                                  value={editingTodoText}
                                  autoFocus
                                  onClick={e => e.stopPropagation()}
                                  onChange={e => setEditingTodoText(e.target.value)}
                                  onBlur={() => {
                                    if (skipBlurSaveRef.current) {
                                      skipBlurSaveRef.current = false;
                                      return;
                                    }
                                    commitTodo(todo.id);
                                  }}
                                  onKeyDown={e => {
                                    if (isImeComposing(e)) return;
                                    if (e.key === 'Enter') commitTodo(todo.id);
                                    if (e.key === 'Escape') {
                                      e.preventDefault();
                                      cancelTodo();
                                    }
                                  }}
                                />
                              ) : (
                                <span
                                  className="todo-text"
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => startEditTodo(todo)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      startEditTodo(todo);
                                    }
                                  }}
                                >
                                  {todo.text}
                                </span>
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
                      {todos.length > SUBTASKS_VISIBLE && (
                        <button
                          type="button"
                          className="todos-more-btn"
                          onClick={() => setShowAllTodos(prev => !prev)}
                        >
                          {showAllTodos
                            ? `Show less (hide ${todos.length - SUBTASKS_VISIBLE} item${todos.length - SUBTASKS_VISIBLE === 1 ? '' : 's'})`
                            : `${hiddenTodos.length} more${hiddenCompletedCount > 0 ? ` · ${hiddenCompletedCount} completed` : ''}`}
                        </button>
                      )}
                    </>
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
                      onKeyDown={e => {
                        if (isImeComposing(e)) return;
                        if (e.key === 'Enter') addComment();
                      }}
                    />
                    <button className="add-comment-btn" onClick={addComment} disabled={!newComment.trim()}>Comment</button>
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
                                if (isImeComposing(e)) return;
                                if (e.key === 'Enter') commitComment(c.id);
                                if (e.key === 'Escape') {
                                  e.preventDefault();
                                  cancelComment();
                                }
                              }}
                            />
                          ) : (
                            <p
                              className="comment-text"
                              role="button"
                              tabIndex={0}
                              onClick={() => startEditComment(c)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  startEditComment(c);
                                }
                              }}
                            >
                              {c.text}
                            </p>
                          )}
                          <div className="comment-footer">
                            <span className="comment-time">
                              {Number.isNaN(new Date(c.createdAt).getTime()) ? '' : new Date(c.createdAt).toLocaleString()}
                            </span>
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
        </div>

        {/* Footer: created/updated/logged + Delete task — pinned to the panel's
            bottom edge; only notes → tabs scroll (2026-08-30 feedback). */}
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
      <ConfirmModal
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title={deleteModalProps.title}
        message={deleteModalProps.message}
        confirmText={deleteModalProps.confirmText}
      />
    </div>
  );
}
