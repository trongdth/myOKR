import { useState, useMemo } from 'react';
import { LayoutGrid, List, Plus, Search, CheckSquare, Play, CheckCircle2, RotateCcw, AlertTriangle, ArrowRight } from 'lucide-react';
import type { PomodoroTask, EisenhowerCategory, TaskBucket } from '../../lib/pomodoro-storage';
import { generateId, EISENHOWER_META, TASK_BUCKETS, computeTaskImportance } from '../../lib/pomodoro-storage';
import type { KeyResult, OKRCycle } from '../../lib/okr-storage';

export type ViewMode = 'board' | 'list';

interface Props {
  tasks: PomodoroTask[];
  activeTaskId: string | null;
  onTasksChange: (tasks: PomodoroTask[]) => void;
  onSetActive: (id: string | null) => void;
  onSelectTask: (task: PomodoroTask) => void;
  onStartFocusTask?: (task: PomodoroTask) => void;
  keyResults?: KeyResult[];
  cycles?: OKRCycle[];
  activeCycle?: OKRCycle | null;
  onOpenSearch: () => void;
}

export default function TasksView({
  tasks,
  onTasksChange,
  onSelectTask,
  onStartFocusTask,
  keyResults = [],
  activeCycle,
  onOpenSearch,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('board');
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  // Click-to-place task selection (ADR-0010)
  const [selectedForMoveId, setSelectedForMoveId] = useState<string | null>(null);

  // Same-session undo collapsed footer toggle
  const [showCompletedToday, setShowCompletedToday] = useState(false);

  // Quick Add Form
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<EisenhowerCategory>('do');
  const [newBucket, setNewBucket] = useState<TaskBucket>('today');
  const [newKrId, setNewKrId] = useState<string>('');
  const [newDueDate, setNewDueDate] = useState<string>('');

  // Active (uncompleted) tasks
  const openTasks = useMemo(() => tasks.filter(t => !t.isCompleted), [tasks]);
  const completedTodayTasks = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return tasks.filter(t => t.isCompleted && t.completedAt && t.completedAt.slice(0, 10) === todayStr);
  }, [tasks]);

  // Serving KR calculations (P1)
  const servingKrs = useMemo(() => {
    const servedKrIds = new Set(openTasks.map(t => t.keyResultId).filter(Boolean));
    return keyResults.map(kr => ({
      kr,
      isServed: servedKrIds.has(kr.id),
      taskCount: openTasks.filter(t => t.keyResultId === kr.id).length,
    }));
  }, [keyResults, openTasks]);

  // Handle Quick Add
  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newTask: PomodoroTask = {
      id: generateId(),
      title: newTitle.trim(),
      category: newCategory,
      bucket: newBucket,
      keyResultId: newKrId || undefined,
      estimatedPomodoros: 1,
      completedPomodoros: 0,
      isCompleted: false,
      createdAt: new Date().toISOString(),
      dueDate: newDueDate || undefined,
    };

    onTasksChange([newTask, ...tasks]);
    setNewTitle('');
    setNewDueDate('');
  };

  // Bucket Assignment Helper
  const handleMoveTaskBucket = (taskId: string, targetBucket: TaskBucket) => {
    const updated = tasks.map(t => t.id === taskId ? { ...t, bucket: targetBucket } : t);
    onTasksChange(updated);
    setSelectedForMoveId(null);
  };

  // Reopen Helper
  const handleReopen = (task: PomodoroTask) => {
    const updated = tasks.map(t => t.id === task.id ? { ...t, isCompleted: false, completedAt: undefined } : t);
    onTasksChange(updated);
  };

  // Bulk Multi-Select Helpers (P3)
  const toggleSelectTask = (id: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkMoveBucket = (bucket: TaskBucket) => {
    const updated = tasks.map(t => selectedTaskIds.has(t.id) ? { ...t, bucket } : t);
    onTasksChange(updated);
    setSelectedTaskIds(new Set());
  };

  const handleBulkSetCategory = (category: EisenhowerCategory) => {
    const updated = tasks.map(t => selectedTaskIds.has(t.id) ? { ...t, category } : t);
    onTasksChange(updated);
    setSelectedTaskIds(new Set());
  };

  // Tasks grouped by Bucket for Board
  const tasksByBucket = useMemo(() => {
    const map: Record<TaskBucket, PomodoroTask[]> = {
      today: [],
      this_week: [],
      backlog: [],
    };
    openTasks.forEach(t => {
      const b = t.bucket || 'backlog';
      if (map[b]) map[b].push(t);
      else map.backlog.push(t);
    });

    // Sort within buckets by computed task importance
    TASK_BUCKETS.forEach(b => {
      map[b].sort((a, c) => computeTaskImportance(c, { keyResults }) - computeTaskImportance(a, { keyResults }));
    });

    return map;
  }, [openTasks, keyResults]);

  return (
    <div className="tasks-view-container">
      {/* Top Header Controls Bar */}
      <div className="tasks-view-header">
        <div className="tasks-header-left">
          <h2 className="tasks-title">Tasks</h2>
          <span className="tasks-badge">{openTasks.length} open</span>

          {activeCycle && (
            <div className="cycle-header-pill">
              <span>{activeCycle.name}</span>
            </div>
          )}
        </div>

        <div className="tasks-header-right">
          {/* Board / List Switcher */}
          <div className="segmented-view-switch">
            <button
              className={`view-switch-btn${viewMode === 'board' ? ' active' : ''}`}
              onClick={() => setViewMode('board')}
              title="Board view (⌘2)"
            >
              <LayoutGrid size={15} />
              <span>Board</span>
            </button>
            <button
              className={`view-switch-btn${viewMode === 'list' ? ' active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List view"
            >
              <List size={15} />
              <span>List</span>
            </button>
          </div>

          {/* Global Search Trigger */}
          <button className="search-trigger-btn" onClick={onOpenSearch}>
            <Search size={15} />
            <span>Search</span>
            <kbd className="cmd-k-badge">⌘K</kbd>
          </button>
        </div>
      </div>

      {/* Serving Key Results Strip (P1) */}
      {keyResults.length > 0 && (
        <div className="serving-kr-strip">
          <span className="serving-label">SERVING</span>
          <div className="serving-kr-list">
            {servingKrs.map(({ kr, isServed, taskCount }) => (
              <div key={kr.id} className={`serving-kr-chip${!isServed ? ' unserved' : ''}`}>
                <span className="kr-chip-title">{kr.title}</span>
                <span className="kr-chip-count">{taskCount} tasks</span>
                {!isServed && (
                  <span className="unserved-warning" title="No active tasks currently serving this Key Result">
                    <AlertTriangle size={12} />
                    <span>No tasks</span>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Add Bar */}
      <form className="quick-add-bar" onSubmit={handleAddTask}>
        <input
          type="text"
          className="quick-add-input"
          placeholder="What are you working on? Type task title..."
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
        />

        <select
          className="quick-add-select"
          value={newCategory}
          onChange={e => setNewCategory(e.target.value as EisenhowerCategory)}
        >
          {Object.entries(EISENHOWER_META).map(([cat, meta]) => (
            <option key={cat} value={cat}>{meta.label}</option>
          ))}
        </select>

        <select
          className="quick-add-select"
          value={newBucket}
          onChange={e => setNewBucket(e.target.value as TaskBucket)}
        >
          <option value="today">Today</option>
          <option value="this_week">This Week</option>
          <option value="backlog">Backlog</option>
        </select>

        {keyResults.length > 0 && (
          <select
            className="quick-add-select kr-select"
            value={newKrId}
            onChange={e => setNewKrId(e.target.value)}
          >
            <option value="">No Key Result</option>
            {keyResults.map(kr => (
              <option key={kr.id} value={kr.id}>{kr.title}</option>
            ))}
          </select>
        )}

        <button type="submit" className="quick-add-btn">
          <Plus size={16} />
          <span>Add</span>
        </button>
      </form>

      {/* Main Content: BOARD VIEW vs LIST VIEW */}
      {viewMode === 'board' ? (
        <div className="board-view-grid">
          {/* TODAY COLUMN */}
          <div className="board-column column-today">
            <div className="column-header">
              <div className="column-title">
                <span className="bucket-dot today-dot" />
                <span>Today</span>
                <span className="column-count">{tasksByBucket.today.length}</span>
              </div>
            </div>

            <div className="column-cards">
              {tasksByBucket.today.map(task => (
                <BoardTaskCard
                  key={task.id}
                  task={task}
                  keyResults={keyResults}
                  isSelectedForMove={selectedForMoveId === task.id}
                  onSelect={() => onSelectTask(task)}
                  onStartFocus={() => onStartFocusTask?.(task)}
                  onToggleMove={() => setSelectedForMoveId(selectedForMoveId === task.id ? null : task.id)}
                  onMoveBucket={(b) => handleMoveTaskBucket(task.id, b)}
                />
              ))}
            </div>
          </div>

          {/* THIS WEEK COLUMN */}
          <div className="board-column column-this-week">
            <div className="column-header">
              <div className="column-title">
                <span className="bucket-dot week-dot" />
                <span>This week</span>
                <span className="column-count">{tasksByBucket.this_week.length}</span>
              </div>
            </div>

            <div className="column-cards">
              {tasksByBucket.this_week.map(task => (
                <BoardTaskCard
                  key={task.id}
                  task={task}
                  keyResults={keyResults}
                  isSelectedForMove={selectedForMoveId === task.id}
                  onSelect={() => onSelectTask(task)}
                  onStartFocus={() => onStartFocusTask?.(task)}
                  onToggleMove={() => setSelectedForMoveId(selectedForMoveId === task.id ? null : task.id)}
                  onMoveBucket={(b) => handleMoveTaskBucket(task.id, b)}
                />
              ))}
            </div>
          </div>

          {/* BACKLOG COLUMN (Responsive Collapse P2) */}
          <div className="board-column column-backlog">
            <div className="column-header">
              <div className="column-title">
                <span className="bucket-dot backlog-dot" />
                <span>Backlog</span>
                <span className="column-count">{tasksByBucket.backlog.length}</span>
              </div>
            </div>

            <div className="column-cards">
              {tasksByBucket.backlog.map(task => (
                <BoardTaskCard
                  key={task.id}
                  task={task}
                  keyResults={keyResults}
                  isSelectedForMove={selectedForMoveId === task.id}
                  onSelect={() => onSelectTask(task)}
                  onStartFocus={() => onStartFocusTask?.(task)}
                  onToggleMove={() => setSelectedForMoveId(selectedForMoveId === task.id ? null : task.id)}
                  onMoveBucket={(b) => handleMoveTaskBucket(task.id, b)}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* LIST VIEW (P3) */
        <div className="list-view-container">
          {/* Bulk Action Bar */}
          {selectedTaskIds.size > 0 && (
            <div className="bulk-action-bar">
              <span className="bulk-count">{selectedTaskIds.size} selected</span>
              <div className="bulk-buttons">
                <span className="bulk-label">Move to:</span>
                <button onClick={() => handleBulkMoveBucket('today')} className="bulk-btn">Today</button>
                <button onClick={() => handleBulkMoveBucket('this_week')} className="bulk-btn">This week</button>
                <button onClick={() => handleBulkMoveBucket('backlog')} className="bulk-btn">Backlog</button>

                <span className="bulk-divider">|</span>
                <span className="bulk-label">Priority:</span>
                <button onClick={() => handleBulkSetCategory('do')} className="bulk-btn">Do</button>
                <button onClick={() => handleBulkSetCategory('decide')} className="bulk-btn">Decide</button>
              </div>
            </div>
          )}

          {/* List Data Table */}
          <table className="list-table">
            <thead>
              <tr>
                <th className="th-select">
                  <input
                    type="checkbox"
                    checked={selectedTaskIds.size === openTasks.length && openTasks.length > 0}
                    onChange={e => {
                      if (e.target.checked) setSelectedTaskIds(new Set(openTasks.map(t => t.id)));
                      else setSelectedTaskIds(new Set());
                    }}
                  />
                </th>
                <th className="th-title">TASK</th>
                <th className="th-priority">PRIORITY</th>
                <th className="th-kr">KEY RESULT</th>
                <th className="th-bucket">BUCKET</th>
                <th className="th-due">DUE</th>
                <th className="th-pomos">POMOS</th>
                <th className="th-subtasks">SUBTASKS</th>
              </tr>
            </thead>
            <tbody>
              {openTasks.map(task => {
                const isSelected = selectedTaskIds.has(task.id);
                const doneSubtasks = (task.todos || []).filter(t => t.completed).length;

                return (
                  <tr key={task.id} className={`list-row${isSelected ? ' selected' : ''}`}>
                    <td className="td-select" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectTask(task.id)}
                      />
                    </td>
                    <td className="td-title" onClick={() => onSelectTask(task)}>
                      <span className="list-task-title">{task.title}</span>
                    </td>
                    <td className="td-priority">
                      <select
                        value={task.category || 'do'}
                        onChange={e => {
                          const updated = tasks.map(t => t.id === task.id ? { ...t, category: e.target.value as EisenhowerCategory } : t);
                          onTasksChange(updated);
                        }}
                        className="cell-select"
                      >
                        {Object.entries(EISENHOWER_META).map(([c, m]) => (
                          <option key={c} value={c}>{m.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="td-kr">
                      <select
                        value={task.keyResultId || ''}
                        onChange={e => {
                          const updated = tasks.map(t => t.id === task.id ? { ...t, keyResultId: e.target.value || undefined } : t);
                          onTasksChange(updated);
                        }}
                        className="cell-select kr-cell"
                      >
                        <option value="">No Key Result</option>
                        {keyResults.map(kr => (
                          <option key={kr.id} value={kr.id}>{kr.title}</option>
                        ))}
                      </select>
                    </td>
                    <td className="td-bucket">
                      <select
                        value={task.bucket || 'backlog'}
                        onChange={e => handleMoveTaskBucket(task.id, e.target.value as TaskBucket)}
                        className="cell-select bucket-cell"
                      >
                        <option value="today">Today</option>
                        <option value="this_week">This week</option>
                        <option value="backlog">Backlog</option>
                      </select>
                    </td>
                    <td className="td-due">
                      <input
                        type="date"
                        value={task.dueDate || ''}
                        onChange={e => {
                          const updated = tasks.map(t => t.id === task.id ? { ...t, dueDate: e.target.value || undefined } : t);
                          onTasksChange(updated);
                        }}
                        className="cell-date-input"
                      />
                    </td>
                    <td className="td-pomos">
                      🍅 {task.completedPomodoros}/{task.estimatedPomodoros || 1}
                    </td>
                    <td className="td-subtasks">
                      {(task.todos || []).length > 0 ? `${doneSubtasks}/${(task.todos || []).length}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Same-Session Undo Footers (P1/P5) */}
      {completedTodayTasks.length > 0 && (
        <div className="completed-today-strip">
          <button
            className="completed-today-toggle"
            onClick={() => setShowCompletedToday(!showCompletedToday)}
          >
            <span>{completedTodayTasks.length} completed today</span>
            <span className="toggle-label">{showCompletedToday ? 'Hide' : 'Show'}</span>
          </button>

          {showCompletedToday && (
            <div className="completed-today-list">
              {completedTodayTasks.map(t => (
                <div key={t.id} className="completed-today-item">
                  <CheckCircle2 size={14} className="done-icon" />
                  <span className="item-title">{t.title}</span>
                  <button onClick={() => handleReopen(t)} className="undo-btn">
                    <RotateCcw size={12} />
                    <span>Undo</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Single Board Card Component with Click-to-Move Actions (ADR-0010)
function BoardTaskCard({
  task,
  keyResults,
  isSelectedForMove,
  onSelect,
  onStartFocus,
  onToggleMove,
  onMoveBucket,
}: {
  task: PomodoroTask;
  keyResults: KeyResult[];
  isSelectedForMove: boolean;
  onSelect: () => void;
  onStartFocus: () => void;
  onToggleMove: () => void;
  onMoveBucket: (b: TaskBucket) => void;
}) {
  const meta = task.category ? EISENHOWER_META[task.category] : null;
  const linkedKr = keyResults.find(k => k.id === task.keyResultId);
  const doneSubtasks = (task.todos || []).filter(t => t.completed).length;

  return (
    <div
      className={`board-task-card${isSelectedForMove ? ' selected-for-move' : ''}`}
      onClick={onSelect}
    >
      <div className="card-top">
        {meta && (
          <span className="category-pill" style={{ background: meta.color }}>
            {meta.label}
          </span>
        )}
        <div className="card-top-right">
          <button
            className="card-focus-btn"
            onClick={e => {
              e.stopPropagation();
              onStartFocus();
            }}
            title="Start focus session"
          >
            <Play size={12} />
          </button>
        </div>
      </div>

      <h4 className="card-title">{task.title}</h4>

      {linkedKr && (
        <div className="card-kr">
          🎯 {linkedKr.title}
        </div>
      )}

      <div className="card-footer">
        <span className="card-pomos">
          🍅 {task.completedPomodoros}/{task.estimatedPomodoros || 1}
        </span>

        {(task.todos || []).length > 0 && (
          <span className="card-subtasks">
            <CheckSquare size={12} />
            {doneSubtasks}/{(task.todos || []).length}
          </span>
        )}

        {task.dueDate && (
          <span className="card-due">
            📅 {task.dueDate}
          </span>
        )}

        {/* Click-to-Move Bucket Menu (ADR-0010) */}
        <div className="card-move-wrapper" onClick={e => e.stopPropagation()}>
          <button
            className="card-move-btn"
            onClick={onToggleMove}
            title="Move to bucket"
          >
            <ArrowRight size={12} />
          </button>

          {isSelectedForMove && (
            <div className="card-move-menu">
              <span className="move-title">Move task to:</span>
              <button onClick={() => onMoveBucket('today')} className="move-option">Today</button>
              <button onClick={() => onMoveBucket('this_week')} className="move-option">This week</button>
              <button onClick={() => onMoveBucket('backlog')} className="move-option">Backlog</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
