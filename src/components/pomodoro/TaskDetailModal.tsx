import { useState, useEffect, useRef } from 'react';
import type { PomodoroTask, TodoItem, TaskComment } from '../../lib/pomodoro-storage';
import { generateId, EISENHOWER_META } from '../../lib/pomodoro-storage';

type DetailTab = 'todos' | 'comments';

interface Props {
  task: PomodoroTask;
  onUpdate: (updated: PomodoroTask) => void;
  onClose: () => void;
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

export default function TaskDetailModal({ task, onUpdate, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<DetailTab>('todos');
  const [description, setDescription] = useState(task.description || '');
  const [newTodoText, setNewTodoText] = useState('');
  const [newComment, setNewComment] = useState('');
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);

  const todos: TodoItem[] = task.todos || [];
  const comments: TaskComment[] = task.comments || [];

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

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

  const deleteTodo = (id: string) => {
    onUpdate({ ...task, todos: todos.filter(t => t.id !== id) });
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

  const deleteComment = (id: string) => {
    onUpdate({ ...task, comments: comments.filter(c => c.id !== id) });
  };

  const meta = EISENHOWER_META[task.category || 'do'];
  const completedTodos = todos.filter(t => t.completed).length;

  return (
    <div className="prioritize-overlay" onClick={onClose}>
      <div className="prioritize-modal task-detail-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="task-detail-header">
          <div className="task-detail-title-row">
            <span className="category-dot" style={{ background: meta.color, width: 12, height: 12 }} />
            <h3 className="task-detail-title">{task.title}</h3>
          </div>
          <div className="task-detail-meta">
            <span className="task-detail-badge" style={{ borderColor: meta.color, color: meta.color }}>
              {meta.icon} {meta.label}
            </span>
            <span className="task-detail-badge">
              🍅 {task.completedPomodoros}/{task.estimatedPomodoros}
            </span>
            {task.isCompleted && (
              <span className="task-detail-badge task-detail-badge-done">✅ Done</span>
            )}
          </div>
          <button className="prioritize-close" onClick={onClose}>✕</button>
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
                ✎
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
            <div
              className={`task-detail-desc-text${!description ? ' empty' : ''}`}
              onClick={() => setIsEditingDesc(true)}
            >
              {description || 'Click to add a description...'}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="task-detail-tabs">
          <button
            className={`task-detail-tab${activeTab === 'todos' ? ' active' : ''}`}
            onClick={() => setActiveTab('todos')}
          >
            ☑ Todo list
            {todos.length > 0 && (
              <span className="task-detail-tab-count">{completedTodos}/{todos.length}</span>
            )}
          </button>
          <button
            className={`task-detail-tab${activeTab === 'comments' ? ' active' : ''}`}
            onClick={() => setActiveTab('comments')}
          >
            💬 Comments
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
              <div className="task-detail-todo-list">
                {todos.length === 0 && (
                  <div className="task-detail-empty">No sub-tasks yet. Add one above!</div>
                )}
                {todos.map(todo => (
                  <div key={todo.id} className={`task-detail-todo-item${todo.completed ? ' completed' : ''}`}>
                    <button
                      className={`task-checkbox${todo.completed ? ' checked' : ''}`}
                      onClick={() => toggleTodo(todo.id)}
                    >✓</button>
                    <span className="task-detail-todo-text">{todo.text}</span>
                    <button className="task-action-btn" onClick={() => deleteTodo(todo.id)} title="Delete">✕</button>
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
                      <span className="task-detail-comment-avatar">👤</span>
                      <span className="task-detail-comment-time">{formatRelativeTime(comment.createdAt)}</span>
                      <button className="task-action-btn task-detail-comment-delete" onClick={() => deleteComment(comment.id)} title="Delete">✕</button>
                    </div>
                    <div className="task-detail-comment-body">{comment.text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
