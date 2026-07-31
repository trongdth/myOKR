import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { Pencil, CheckCircle, X, SquareCheck, MessageSquare, Play, RotateCcw } from 'lucide-react';
import type { PomodoroTask, TodoItem, TaskComment, EisenhowerCategory, TaskBucket } from '../../lib/pomodoro-storage';
import { generateId, EISENHOWER_META } from '../../lib/pomodoro-storage';
import type { KeyResult } from '../../lib/okr-storage';
import { useModalEffects } from '../../hooks/useModalEffects';

const Markdown = lazy(() => import('../shared/Markdown'));

type DetailTab = 'todos' | 'comments';

interface Props {
  task: PomodoroTask;
  onUpdate: (updated: PomodoroTask) => void;
  onClose: () => void;
  keyResults?: KeyResult[];
  onStartFocus?: (task: PomodoroTask) => void;
}

export default function TaskDetailModal({ task, onUpdate, onClose, keyResults = [], onStartFocus }: Props) {
  const [activeTab, setActiveTab] = useState<DetailTab>('todos');
  const [description, setDescription] = useState(task.description || '');
  const [newTodoText, setNewTodoText] = useState('');
  const [newComment, setNewComment] = useState('');
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleText, setEditingTitleText] = useState(task.title);

  const descRef = useRef<HTMLTextAreaElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const todos: TodoItem[] = task.todos || [];
  const comments: TaskComment[] = task.comments || [];

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

  const saveTitle = () => {
    const trimmed = editingTitleText.trim();
    if (trimmed && trimmed !== task.title) {
      onUpdate({ ...task, title: trimmed });
    }
    setIsEditingTitle(false);
  };

  // Property update helpers
  const handleUpdateCategory = (cat: EisenhowerCategory) => {
    onUpdate({ ...task, category: cat });
  };

  const handleUpdateBucket = (b: TaskBucket) => {
    onUpdate({ ...task, bucket: b });
  };

  const handleUpdateDueDate = (d: string) => {
    onUpdate({ ...task, dueDate: d || undefined });
  };

  const handleUpdateKR = (krId: string) => {
    onUpdate({ ...task, keyResultId: krId || undefined });
  };

  const handleUpdateEstPomos = (est: number) => {
    onUpdate({ ...task, estimatedPomodoros: Math.max(1, est) });
  };

  const handleToggleComplete = () => {
    const isComp = !task.isCompleted;
    onUpdate({
      ...task,
      isCompleted: isComp,
      completedAt: isComp ? new Date().toISOString() : undefined,
    });
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
    const updated = todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
    onUpdate({ ...task, todos: updated });
  };

  const deleteTodo = (id: string) => {
    onUpdate({ ...task, todos: todos.filter(t => t.id !== id) });
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content task-detail-panel" onClick={e => e.stopPropagation()}>
        {/* Panel Header */}
        <div className="detail-panel-header">
          <div className="detail-title-block">
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                className="detail-title-input"
                value={editingTitleText}
                onChange={e => setEditingTitleText(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveTitle();
                  if (e.key === 'Escape') setIsEditingTitle(false);
                }}
              />
            ) : (
              <h3 className="detail-title" onClick={() => setIsEditingTitle(true)}>
                {task.title}
                <Pencil size={14} className="edit-icon" />
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

        {/* Unified Top Properties Strip (P4) */}
        <div className="detail-properties-bar">
          {/* Priority Pill */}
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

          {/* Bucket Pill */}
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

          {/* Due Date Pill */}
          <div className="prop-group">
            <span className="prop-label">DUE</span>
            <input
              type="date"
              className="prop-date-input"
              value={task.dueDate || ''}
              onChange={e => handleUpdateDueDate(e.target.value)}
            />
          </div>

          {/* Key Result Pill */}
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

          {/* Pomodoros Planned Pill */}
          <div className="prop-group">
            <span className="prop-label">POMODOROS</span>
            <div className="prop-pomo-input-wrapper">
              <span>🍅 {task.completedPomodoros} / </span>
              <input
                type="number"
                min="1"
                max="99"
                className="prop-pomo-input"
                value={task.estimatedPomodoros || 1}
                onChange={e => handleUpdateEstPomos(parseInt(e.target.value, 10) || 1)}
              />
              <span>planned</span>
            </div>
          </div>
        </div>

        {/* Main Body: Notes & Links */}
        <div className="detail-body-section">
          <div className="notes-header">
            <span className="section-title">NOTES & LINKS</span>
            {!isEditingDesc && (
              <button className="text-btn" onClick={() => setIsEditingDesc(true)}>
                <Pencil size={13} />
                <span>Edit notes</span>
              </button>
            )}
          </div>

          {isEditingDesc ? (
            <div className="notes-edit-block">
              <textarea
                ref={descRef}
                className="notes-textarea"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Add notes, context, or links (Markdown supported)..."
                rows={5}
              />
              <div className="notes-edit-actions">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setDescription(task.description || '');
                    setIsEditingDesc(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    onUpdate({ ...task, description: description.trim() || undefined });
                    setIsEditingDesc(false);
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div className="notes-content-view">
              {task.description ? (
                <Suspense fallback={<div>Loading notes...</div>}>
                  <Markdown>{task.description}</Markdown>
                </Suspense>
              ) : (
                <p className="empty-notes-hint">Click &quot;Edit notes&quot; to add links or notes.</p>
              )}
            </div>
          )}
        </div>

        {/* Equal-Weight Sub-tasks & Comments Tabs (P4) */}
        <div className="detail-tabs-section">
          <div className="detail-tab-headers">
            <button
              className={`detail-tab-btn${activeTab === 'todos' ? ' active' : ''}`}
              onClick={() => setActiveTab('todos')}
            >
              <SquareCheck size={16} />
              <span>Sub-tasks ({todos.filter(t => t.completed).length}/{todos.length})</span>
            </button>

            <button
              className={`detail-tab-btn${activeTab === 'comments' ? ' active' : ''}`}
              onClick={() => setActiveTab('comments')}
            >
              <MessageSquare size={16} />
              <span>Comments ({comments.length})</span>
            </button>
          </div>

          <div className="detail-tab-content">
            {activeTab === 'todos' ? (
              <div className="todos-tab-body">
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

                <div className="todos-list">
                  {todos.map(todo => (
                    <div key={todo.id} className={`todo-item-row${todo.completed ? ' completed' : ''}`}>
                      <input
                        type="checkbox"
                        checked={todo.completed}
                        onChange={() => toggleTodo(todo.id)}
                      />
                      <span className="todo-text">{todo.text}</span>
                      <button className="delete-sub-btn" onClick={() => deleteTodo(todo.id)}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
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

                <div className="comments-list">
                  {comments.map(c => (
                    <div key={c.id} className="comment-item-card">
                      <p className="comment-text">{c.text}</p>
                      <div className="comment-footer">
                        <span className="comment-time">{new Date(c.createdAt).toLocaleString()}</span>
                        <button className="delete-sub-btn" onClick={() => deleteComment(c.id)}>
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
