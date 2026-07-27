import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { Pencil, Timer, CheckCircle, X, SquareCheck, MessageSquare, Check } from 'lucide-react';
import type { PomodoroTask, TodoItem, TaskComment } from '../../lib/pomodoro-storage';
import { generateId, EISENHOWER_META } from '../../lib/pomodoro-storage';
import type { KeyResult } from '../../lib/okr-storage';
import { useModalEffects } from '../../hooks/useModalEffects';
import ConfirmModal from '../ConfirmModal';

const Markdown = lazy(() => import('../shared/Markdown'));

type DetailTab = 'todos' | 'comments';

interface Props {
  task: PomodoroTask;
  onUpdate: (updated: PomodoroTask) => void;
  onClose: () => void;
  keyResults?: KeyResult[];
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function TaskDetailModal({ task, onUpdate, onClose, keyResults = [] }: Props) {
  const [activeTab, setActiveTab] = useState<DetailTab>('todos');
  const [description, setDescription] = useState(task.description || '');
  const [newTodoText, setNewTodoText] = useState('');
  const [newComment, setNewComment] = useState('');
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleText, setEditingTitleText] = useState(task.title);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'todo' | 'comment', id: string, text?: string } | null>(null);
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [draggedTodoId, setDraggedTodoId] = useState<string | null>(null);
  const [dragOverTodoId, setDragOverTodoId] = useState<string | null>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);

  const todos: TodoItem[] = task.todos || [];
  const comments: TaskComment[] = task.comments || [];

  useModalEffects(onClose);

  // Sync title text if task prop changes externally
  useEffect(() => {
    setEditingTitleText(task.title);
  }, [task.title]);

  // Focus title input on edit start
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // --- Title ---
  const startEditTitle = () => {
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

  const cancelEditTitle = () => {
    setEditingTitleText(task.title);
    setIsEditingTitle(false);
  };

  // Auto-focus description textarea when entering edit mode
  useEffect(() => {
    if (isEditingDesc && descRef.current) {
      descRef.current.focus();
      descRef.current.selectionStart = descRef.current.value.length;
    }
  }, [isEditingDesc]);

  // --- Description ---
  const saveDescription = () => {
    const trimmed = description.trim();
    onUpdate({ ...task, description: trimmed || undefined });
    setIsEditingDesc(false);
  };

  // --- Todos ---
  const addTodo = () => {
    const text = newTodoText.trim();
    if (!text) return;
    const item: TodoItem = {
      id: generateId(),
      text,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    onUpdate({ ...task, todos: [...todos, item] });
    setNewTodoText('');
  };

  const toggleTodo = (id: string) => {
    onUpdate({
      ...task,
      todos: todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t),
    });
  };

  const deleteTodoRequest = (id: string) => {
    const todo = todos.find(t => t.id === id);
    setDeleteTarget({ type: 'todo', id, text: todo?.text });
  };

  const executeDeleteTodo = (id: string) => {
    onUpdate({ ...task, todos: todos.filter(t => t.id !== id) });
  };

  const startEditTodo = (todo: TodoItem) => {
    setEditingTodoId(todo.id);
    setEditingText(todo.text);
  };

  const commitEditTodo = () => {
    if (!editingTodoId) return;
    const trimmed = editingText.trim();
    if (trimmed) {
      onUpdate({
        ...task,
        todos: todos.map(t => t.id === editingTodoId ? { ...t, text: trimmed } : t),
      });
    }
    setEditingTodoId(null);
  };

  const cancelEditTodo = () => setEditingTodoId(null);

  const reorderTodos = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const next = [...todos];
    const from = next.findIndex(t => t.id === sourceId);
    const to = next.findIndex(t => t.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onUpdate({ ...task, todos: next });
  };

  const handleDragPointerDown = (e: React.PointerEvent, todoId: string) => {
    if (editingTodoId) return;
    e.preventDefault();
    setDraggedTodoId(todoId);

    let targetId: string | null = null;

    const handleMove = (moveEvent: PointerEvent) => {
      if (!listRef.current) return;
      const items = listRef.current.querySelectorAll('[data-todo-id]');
      let found: string | null = null;
      for (const item of items) {
        const rect = (item as HTMLElement).getBoundingClientRect();
        if (moveEvent.clientY >= rect.top && moveEvent.clientY <= rect.bottom) {
          found = (item as HTMLElement).dataset.todoId!;
          break;
        }
      }
      targetId = found;
      setDragOverTodoId(found);
    };

    const handleUp = () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
      if (targetId && todoId !== targetId) {
        reorderTodos(todoId, targetId);
      }
      setDraggedTodoId(null);
      setDragOverTodoId(null);
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
  };

  // --- Comments ---
  const addComment = () => {
    const text = newComment.trim();
    if (!text) return;
    const comment: TaskComment = {
      id: generateId(),
      text,
      createdAt: new Date().toISOString(),
    };
    onUpdate({ ...task, comments: [comment, ...comments] });
    setNewComment('');
  };

  const deleteCommentRequest = (id: string) => {
    const comment = comments.find(c => c.id === id);
    // Truncate comment text for modal
    const text = comment?.text.length && comment.text.length > 50 ? comment.text.slice(0, 50) + '...' : comment?.text;
    setDeleteTarget({ type: 'comment', id, text });
  };

  const executeDeleteComment = (id: string) => {
    onUpdate({ ...task, comments: comments.filter(c => c.id !== id) });
  };

  const startEditComment = (comment: TaskComment) => {
    setEditingCommentId(comment.id);
    setEditingCommentText(comment.text);
  };

  const commitEditComment = () => {
    if (!editingCommentId) return;
    const trimmed = editingCommentText.trim();
    if (trimmed) {
      onUpdate({
        ...task,
        comments: comments.map(c => c.id === editingCommentId ? { ...c, text: trimmed } : c),
      });
    } else {
      // Clearing the text removes the comment instead of silently keeping the old text.
      onUpdate({ ...task, comments: comments.filter(c => c.id !== editingCommentId) });
    }
    setEditingCommentId(null);
  };

  const cancelEditComment = () => setEditingCommentId(null);

  const meta = EISENHOWER_META[task.category || 'do'];
  const completedTodos = todos.filter(t => t.completed).length;

  return (
    <div className="prioritize-overlay" onClick={onClose}>
      <div className="prioritize-modal task-detail-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="task-detail-header">
          <div className="task-detail-title-row">
            <span className="category-dot" style={{ background: meta.color, width: 12, height: 12 }} />
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                className="task-detail-title-input"
                value={editingTitleText}
                onChange={e => setEditingTitleText(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveTitle();
                  if (e.key === 'Escape') cancelEditTitle();
                }}
              />
            ) : (
              <>
                <h3 className="task-detail-title" onClick={startEditTitle} title="Click to edit title">
                  {task.title}
                </h3>
                <button className="task-detail-edit-btn" onClick={startEditTitle} title="Edit title">
                  <Pencil size={14} />
                </button>
              </>
            )}
          </div>
          <div className="task-detail-meta">
            <span className="task-detail-badge" style={{ borderColor: meta.color, color: meta.color }}>
              <span className="confidence-dot" style={{ background: meta.color, verticalAlign: 'middle' }} /> {meta.label}
            </span>
            <span className="task-detail-badge">
              <Timer size={12} className="icon-inline" /> {task.completedPomodoros}/{task.estimatedPomodoros}
            </span>
            {task.isCompleted && (
              <span className="task-detail-badge task-detail-badge-done"><CheckCircle size={12} className="icon-inline" /> Done</span>
            )}
            {keyResults.length > 0 && (
              <select
                className="task-detail-kr-select"
                value={task.keyResultId || ''}
                onChange={e => onUpdate({ ...task, keyResultId: e.target.value || undefined })}
              >
                <option value="">No KR</option>
                {keyResults.map(kr => (
                  <option key={kr.id} value={kr.id}>{kr.title}</option>
                ))}
              </select>
            )}
          </div>
          <button className="prioritize-close" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Description */}
        <div className="task-detail-description">
          <div className="task-detail-section-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            Description
            {!isEditingDesc && (
              <button className="task-detail-edit-btn" onClick={() => setIsEditingDesc(true)}>
                <Pencil size={14} />
              </button>
            )}
          </div>
          {isEditingDesc ? (
            <div className="task-detail-desc-edit">
              <textarea
                ref={descRef}
                className="task-detail-textarea"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Add a description for this task..."
                rows={4}
              />
              <div className="task-detail-desc-actions">
                <button className="btn-sm" onClick={() => { setDescription(task.description || ''); setIsEditingDesc(false); }}>Cancel</button>
                <button className="btn task-detail-save-btn" onClick={saveDescription}>Save</button>
              </div>
            </div>
          ) : (
            <div className={`task-detail-desc-text${!description ? ' empty' : ''}`}>
              {description ? (
<Suspense fallback={<span className="loading-text">Loading...</span>}>
                  <Markdown>{description}</Markdown>
                </Suspense>
              ) : (
                'No description yet — click to add one.'
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="task-detail-tabs">
          <button
            className={`task-detail-tab${activeTab === 'todos' ? ' active' : ''}`}
            onClick={() => setActiveTab('todos')}
          >
            <SquareCheck size={14} className="icon-inline" /> Todo list
            {todos.length > 0 && (
              <span className="task-detail-tab-count">{completedTodos}/{todos.length}</span>
            )}
          </button>
          <button
            className={`task-detail-tab${activeTab === 'comments' ? ' active' : ''}`}
            onClick={() => setActiveTab('comments')}
          >
            <MessageSquare size={14} className="icon-inline" /> Comments
            {comments.length > 0 && (
              <span className="task-detail-tab-count">{comments.length}</span>
            )}
          </button>
        </div>

        {/* Tab Content */}
        <div className="task-detail-tab-content">
          {activeTab === 'todos' && (
            <div className="task-detail-todos">
              {/* Add todo input */}
              <div className="task-detail-todo-input-row">
                <input
                  type="text"
                  placeholder="Add a sub-task..."
                  value={newTodoText}
                  onChange={e => setNewTodoText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addTodo()}
                />
                <button className="btn task-detail-add-btn" onClick={addTodo}>+</button>
              </div>

              {/* Progress bar */}
              {todos.length > 0 && (
                <div className="task-detail-todo-progress">
                  <div className="task-detail-todo-progress-bar">
                    <div
                      className="task-detail-todo-progress-fill"
                      style={{ width: `${(completedTodos / todos.length) * 100}%` }}
                    />
                  </div>
                  <span className="task-detail-todo-progress-text">
                    {completedTodos}/{todos.length}
                  </span>
                </div>
              )}

              {/* Todo items */}
              <div className="task-detail-todo-list" ref={listRef}>
                {todos.length === 0 && (
                  <div className="task-detail-empty">No sub-tasks yet. Add one above!</div>
                )}
                {todos.map(todo => (
                  <div
                    key={todo.id}
                    data-todo-id={todo.id}
                    className={`task-detail-todo-item${todo.completed ? ' completed' : ''}${dragOverTodoId === todo.id ? ' drag-over' : ''}${draggedTodoId === todo.id ? ' dragging' : ''}`}
                  >
                    <span
                      className="task-detail-todo-drag"
                      aria-label="Drag to reorder"
                      onPointerDown={e => handleDragPointerDown(e, todo.id)}
                    >≡</span>
                    <button
                      className={`task-checkbox${todo.completed ? ' checked' : ''}`}
                      onClick={() => toggleTodo(todo.id)}
                    ><Check size={16} /></button>
                    {editingTodoId === todo.id ? (
                      <input
                        className="task-detail-todo-edit-input"
                        autoFocus
                        value={editingText}
                        onChange={e => setEditingText(e.target.value)}
                        onBlur={commitEditTodo}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitEditTodo();
                          if (e.key === 'Escape') cancelEditTodo();
                        }}
                      />
                    ) : (
                      <span className="task-detail-todo-text" onClick={() => startEditTodo(todo)}>{todo.text}</span>
                    )}
                    <button className="task-action-btn" onClick={() => deleteTodoRequest(todo.id)} title="Delete"><X size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'comments' && (
            <div className="task-detail-comments">
              {/* Add comment input */}
              <div className="task-detail-comment-input-row">
                <input
                  ref={commentInputRef}
                  type="text"
                  placeholder="Write a comment..."
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addComment()}
                />
                <button className="btn task-detail-add-btn" onClick={addComment}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>

              {/* Comments list */}
              <div className="task-detail-comment-list">
                {comments.length === 0 && (
                  <div className="task-detail-empty">No comments yet. Add one above!</div>
                )}
                {comments.map(comment => (
                  <div key={comment.id} className="task-detail-comment-item">
                    <div className="task-detail-comment-header">
                      <span className="task-detail-comment-time">{formatRelativeTime(comment.createdAt)}</span>
                      <div className="task-detail-comment-actions">
                        <button className="task-action-btn task-detail-comment-edit" onClick={() => startEditComment(comment)} title="Edit comment">
                          <Pencil size={14} />
                        </button>
                        <button className="task-action-btn task-detail-comment-delete" onClick={() => deleteCommentRequest(comment.id)} title="Delete comment">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                    {editingCommentId === comment.id ? (
                      <div className="task-detail-comment-edit-box">
                        <textarea
                          className="task-detail-comment-edit-input"
                          value={editingCommentText}
                          onChange={e => setEditingCommentText(e.target.value)}
                          autoFocus
                          rows={2}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              commitEditComment();
                            }
                            if (e.key === 'Escape') cancelEditComment();
                          }}
                        />
                        <div className="task-detail-comment-edit-actions">
                          <button className="btn-sm" onClick={cancelEditComment}>Cancel</button>
                          <button className="btn task-detail-save-btn" onClick={commitEditComment}>Save</button>
                        </div>
                      </div>
                    ) : (
                      <div className="task-detail-comment-body">{comment.text}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget?.type === 'todo') executeDeleteTodo(deleteTarget.id);
          else if (deleteTarget?.type === 'comment') executeDeleteComment(deleteTarget.id);
        }}
        title={deleteTarget?.type === 'todo' ? 'Delete Sub-task?' : 'Delete Comment?'}
        message={
          deleteTarget?.type === 'todo'
            ? `Are you sure you want to delete "${deleteTarget?.text}"?`
            : `Are you sure you want to delete this comment: "${deleteTarget?.text}"?`
        }
        confirmText="Delete"
      />
    </div>
  );
}
