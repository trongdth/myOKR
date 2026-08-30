import { useState, useMemo, type CSSProperties } from 'react';
import { LayoutGrid, List, Search, CheckCircle2, Check, RotateCcw, ArrowRight, Calendar, KanbanSquare, ChevronDown } from 'lucide-react';
import type { PomodoroTask, EisenhowerCategory, TaskBucket } from '../../lib/pomodoro-storage';
import { generateId, EISENHOWER_META, TASK_BUCKETS, computeTaskImportance, isTaskInCycle, buildKrCycleMap, displayedPomoCount } from '../../lib/pomodoro-storage';
import { getEffectiveCurrentValue, type KeyResult, type OKRCycle, type Objective } from '../../lib/okr-storage';
import type { Habit } from '../../lib/habit-storage';
import PlanTabStrip, { cycleWeekLabel, PlanHeader } from './PlanTabStrip';
import { useTaskMultiSelect } from '../../hooks/useTaskMultiSelect';
import { navigateToSection } from '../../lib/navigation';
import { Select, type SelectOption } from '../shared/Select';
import { PRIORITY_OPTIONS, BUCKET_OPTIONS, krOptions, BUCKET_LABELS, GROUP_BY_OPTIONS, SORT_BY_OPTIONS } from './taskSelectOptions';

export type ViewMode = 'board' | 'list';

type GroupBy = 'bucket' | 'keyResult' | 'priority';
type SortBy = 'priority' | 'due' | 'pomos';

interface Props {
  tasks: PomodoroTask[];
  activeTaskId: string | null;
  onTasksChange: (tasks: PomodoroTask[]) => void;
  onSetActive: (id: string | null) => void;
  onSelectTask: (task: PomodoroTask) => void;
  keyResults?: KeyResult[];
  cycles?: OKRCycle[];
  activeCycle?: OKRCycle | null;
  objectives?: Objective[];
  habits?: Habit[];
  focusDurationMinutes?: number;
  onOpenSearch: () => void;
  /** Task currently being focused (running), for "pomo N of M" position display (decision A). */
  activeFocusTaskId?: string | null;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDueLabel(dueDate: string | undefined): { label: string; overdue: boolean } | null {
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return { label: 'Overdue', overdue: true };
  if (diffDays <= 7) return { label: WEEKDAYS[due.getDay()], overdue: false };
  return { label: `${MONTHS[due.getMonth()]} ${due.getDate()}`, overdue: false };
}

export default function TasksView({
  tasks,
  onTasksChange,
  onSelectTask,
  keyResults = [],
  cycles = [],
  activeCycle,
  objectives = [],
  habits = [],
  focusDurationMinutes = 25,
  onOpenSearch,
  activeFocusTaskId = null,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('board');
  const { selectedTaskIds, isSelected: isTaskSelected, isGroupSelected, toggleTask: toggleSelectTask, toggleGroup, clear: clearSelection } = useTaskMultiSelect();

  // Click-to-place task selection (ADR-0010)
  const [selectedForMoveId, setSelectedForMoveId] = useState<string | null>(null);

  // Same-session undo collapsed footer toggle
  const [showCompletedToday, setShowCompletedToday] = useState(false);

  // Responsive Backlog collapse (P2): expanded panel below the bar
  const [backlogOpen, setBacklogOpen] = useState(false);

  // Quick Add Form (P1: only Priority + Key Result live in the row; new tasks
  // land in Backlog — the storage default. No bucket select, no due date.)
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<EisenhowerCategory>('do');
  const [newKrId, setNewKrId] = useState<string>('');

  // Week filter state ('all' or week number)
  const [selectedWeek, setSelectedWeek] = useState<number | 'all' | null>('all');

  // List view controls (P3)
  const [groupBy, setGroupBy] = useState<GroupBy>('bucket');
  const [sortBy, setSortBy] = useState<SortBy>('priority');

  // Active (uncompleted) tasks
  const openTasks = useMemo(() => tasks.filter(t => !t.isCompleted), [tasks]);

  // Week-filtered open tasks
  const filteredOpenTasks = useMemo(() => {
    if (selectedWeek === 'all' || !selectedWeek || !activeCycle) return openTasks;
    const year = activeCycle.year;
    const month = activeCycle.month;
    const startDay = (selectedWeek - 1) * 7 + 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const endDay = Math.min(selectedWeek * 7, daysInMonth);

    return openTasks.filter(t => {
      if (t.dueDate) {
        const d = new Date(t.dueDate + 'T00:00:00');
        return d.getFullYear() === year && d.getMonth() === month && d.getDate() >= startDay && d.getDate() <= endDay;
      }
      if (t.createdAt) {
        const d = new Date(t.createdAt);
        return d.getFullYear() === year && d.getMonth() === month && d.getDate() >= startDay && d.getDate() <= endDay;
      }
      return true;
    });
  }, [openTasks, selectedWeek, activeCycle]);

  // ADR-0012 — derived cycle membership for cycle-scoped counts/filters.
  const krCycleMap = useMemo(
    () => buildKrCycleMap(keyResults, objectives, cycles),
    [keyResults, objectives, cycles],
  );

  // KR options are static between keyResults changes — build once, not per row.
  const krOpts = useMemo(() => krOptions(keyResults, tasks), [keyResults, tasks]);

  const inCycle = useMemo(() => {
    const map = krCycleMap;
    return (t: PomodoroTask) => isTaskInCycle(t, map.get(t.keyResultId || ''), activeCycle ?? null);
  }, [krCycleMap, activeCycle]);

  const completedTodayInCycle = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return tasks.filter(t =>
      t.isCompleted && t.completedAt && t.completedAt.slice(0, 10) === todayStr && inCycle(t),
    );
  }, [tasks, inCycle]);

  const openInCycleCount = useMemo(() => openTasks.filter(inCycle).length, [openTasks, inCycle]);
  const completedInCycleCount = useMemo(() => tasks.filter(t => t.isCompleted && inCycle(t)).length, [tasks, inCycle]);
  const objectiveCount = useMemo(
    () => (activeCycle ? objectives.filter(o => o.cycleId === activeCycle.id).length : objectives.length),
    [objectives, activeCycle],
  );

  const cycleLabel = cycleWeekLabel(activeCycle);

  // Serving objectives strip (P1 — objectives with progress, not KR chips).
  // Progress uses the same effective computation as the Objectives screen so
  // the two surfaces can never disagree (focus-hours/pomodoros modes read
  // session history, not the raw currentValue).
  const servingObjectives = useMemo(() => {
    const objs = activeCycle ? objectives.filter(o => o.cycleId === activeCycle.id) : objectives;
    return objs.map(obj => {
      const objKrs = keyResults.filter(kr => kr.objectiveId === obj.id);
      const servedOpenCount = openTasks.filter(t =>
        inCycle(t) && objKrs.some(kr => kr.id === t.keyResultId),
      ).length;
      const progress = objKrs.length === 0
        ? 0
        : Math.round(
            objKrs.reduce((sum, kr) => {
              if (kr.targetValue <= 0) return sum;
              const effective = getEffectiveCurrentValue(kr, tasks, focusDurationMinutes, habits, objectives, cycles);
              return sum + Math.min(100, (effective / kr.targetValue) * 100);
            }, 0) / objKrs.length,
          );
      return { obj, progress, servedOpenCount, krCount: objKrs.length };
    });
  }, [objectives, keyResults, openTasks, activeCycle, inCycle, tasks, focusDurationMinutes, habits, cycles]);

  // Handle Quick Add
  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newTask: PomodoroTask = {
      id: generateId(),
      title: newTitle.trim(),
      category: newCategory,
      // P1: new tasks land in Backlog (the storage default); promote them to
      // Today / This week via the card's bucket button.
      bucket: 'backlog',
      keyResultId: newKrId || undefined,
      estimatedPomodoros: 1,
      completedPomodoros: 0,
      isCompleted: false,
      createdAt: new Date().toISOString(),
    };

    onTasksChange([newTask, ...tasks]);
    setNewTitle('');
  };

  // Bucket Assignment Helper
  const handleMoveTaskBucket = (taskId: string, targetBucket: TaskBucket) => {
    const updated = tasks.map(t => t.id === taskId ? { ...t, bucket: targetBucket } : t);
    onTasksChange(updated);
    setSelectedForMoveId(null);
  };

  const setTaskField = (taskId: string, patch: Partial<PomodoroTask>) => {
    onTasksChange(tasks.map(t => t.id === taskId ? { ...t, ...patch } : t));
  };

  // Tick-to-complete (P5: ticking removes from board; undo via completed strip)
  const handleComplete = (task: PomodoroTask) => {
    const updated = tasks.map(t =>
      t.id === task.id ? { ...t, isCompleted: true, completedAt: new Date().toISOString() } : t,
    );
    onTasksChange(updated);
  };

  // Reopen Helper
  const handleReopen = (task: PomodoroTask) => {
    const updated = tasks.map(t => t.id === task.id ? { ...t, isCompleted: false, completedAt: undefined } : t);
    onTasksChange(updated);
  };

  // Bulk actions (P3) — selection machinery comes from the shared hook
  const handleBulkMoveBucket = (bucket: TaskBucket) => {
    const updated = tasks.map(t => selectedTaskIds.has(t.id) ? { ...t, bucket } : t);
    onTasksChange(updated);
    clearSelection();
  };

  const handleBulkSetCategory = (category: EisenhowerCategory) => {
    const updated = tasks.map(t => selectedTaskIds.has(t.id) ? { ...t, category } : t);
    onTasksChange(updated);
    clearSelection();
  };

  // Tasks grouped by Bucket for Board
  const tasksByBucket = useMemo(() => {
    const map: Record<TaskBucket, PomodoroTask[]> = {
      today: [],
      this_week: [],
      backlog: [],
    };
    filteredOpenTasks.forEach(t => {
      const b = t.bucket || 'backlog';
      if (map[b]) map[b].push(t);
      else map.backlog.push(t);
    });

    // Sort within buckets by computed task importance
    TASK_BUCKETS.forEach(b => {
      map[b].sort((a, c) => computeTaskImportance(c, { keyResults }) - computeTaskImportance(a, { keyResults }));
    });

    return map;
  }, [filteredOpenTasks, keyResults]);

  const bucketPomos = useMemo(() => {
    const m = { today: 0, this_week: 0, backlog: 0 } as Record<TaskBucket, number>;
    TASK_BUCKETS.forEach(b => {
      m[b] = tasksByBucket[b].reduce((s, t) => s + (t.estimatedPomodoros || 1), 0);
    });
    return m;
  }, [tasksByBucket]);

  // ---- List view (P3): grouping + sorting ----
  const sortOpenTasks = useMemo(() => {
    const list = [...filteredOpenTasks];
    if (sortBy === 'priority') {
      list.sort((a, c) => computeTaskImportance(c, { keyResults }) - computeTaskImportance(a, { keyResults }));
    } else if (sortBy === 'due') {
      list.sort((a, c) => {
        if (!a.dueDate && !c.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!c.dueDate) return -1;
        return a.dueDate.localeCompare(c.dueDate);
      });
    } else {
      list.sort((a, c) => (c.estimatedPomodoros || 1) - (a.estimatedPomodoros || 1));
    }
    return list;
  }, [filteredOpenTasks, sortBy, keyResults]);

  const listGroups = useMemo(() => {
    const groups: { key: string; title: string; tasks: PomodoroTask[] }[] = [];
    const withPlanningLine = (key: string, title: string, list: PomodoroTask[]) => {
      const pomos = list.reduce((s, t) => s + (t.estimatedPomodoros || 1), 0);
      return {
        key,
        title: `${title} — ${list.length} ${list.length === 1 ? 'task' : 'tasks'} · ${pomos} ${pomos === 1 ? 'pomodoro' : 'pomodoros'} planned`,
        tasks: list,
      };
    };

    if (groupBy === 'bucket') {
      TASK_BUCKETS.forEach(b => {
        const bucketTasks = sortOpenTasks.filter(t => (t.bucket || 'backlog') === b);
        if (bucketTasks.length === 0) return;
        groups.push(withPlanningLine(b, BUCKET_LABELS[b].toUpperCase(), bucketTasks));
      });
    } else if (groupBy === 'keyResult') {
      const byKr = new Map<string, PomodoroTask[]>();
      sortOpenTasks.forEach(t => {
        const kr = keyResults.find(k => k.id === t.keyResultId);
        const key = kr ? kr.id : '__none__';
        const list = byKr.get(key) || [];
        list.push(t);
        byKr.set(key, list);
      });
      byKr.forEach((list, key) => {
        if (list.length === 0) return;
        const kr = keyResults.find(k => k.id === key);
        groups.push(withPlanningLine(key, (kr ? kr.title : 'NO KEY RESULT').toUpperCase(), list));
      });
    } else {
      (Object.keys(EISENHOWER_META) as EisenhowerCategory[]).forEach(cat => {
        const catTasks = sortOpenTasks.filter(t => (t.category || 'do') === cat);
        if (catTasks.length === 0) return;
        groups.push(withPlanningLine(cat, EISENHOWER_META[cat].label.toUpperCase(), catTasks));
      });
    }
    return groups;
  }, [groupBy, sortOpenTasks, keyResults]);

  return (
    <div className="tasks-view-container">
      {/* Top Header Controls Bar (Redesign 08.53.52.png: Board/List switcher only, no header New task button) */}
      <PlanHeader
        activeCycle={activeCycle}
        right={
          <div className="segmented-view-switch">
            <button
              className={`view-switch-btn${viewMode === 'board' ? ' active' : ''}`}
              onClick={() => setViewMode('board')}
              title="Board view"
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
        }
      />

      {/* Tab strip with counts (P1): Tasks / Objectives / Done + cycle week dropdown */}
      <PlanTabStrip
        active="tasks"
        tasksCount={openInCycleCount}
        objectivesCount={objectiveCount}
        doneCount={completedInCycleCount}
        cycleLabel={cycleLabel}
        activeCycle={activeCycle}
        selectedWeek={selectedWeek}
        onSelectWeek={setSelectedWeek}
      />

      {/* Serving Objectives Strip (P1) */}
      {servingObjectives.length > 0 && (
        <div className="serving-kr-strip">
          <span className="serving-label">SERVING</span>
          <div className="serving-kr-list">
            {servingObjectives.map(({ obj, progress, servedOpenCount }, idx) => {
              const dotColor = progress <= 50 ? '#ef4444' : progress <= 70 ? '#a855f7' : '#22c55e';
              return (
                <div key={obj.id} className="serving-obj-wrapper">
                  {idx > 0 && <span className="serving-obj-divider" />}
                  <div className="serving-obj-item">
                    <span className="serving-obj-dot" style={{ backgroundColor: dotColor }} />
                    <span className="serving-obj-title">{obj.title}</span>
                    <div className="serving-obj-bar">
                      <div className="serving-obj-fill" style={{ width: `${progress}%`, backgroundColor: dotColor }} />
                    </div>
                    <span className="serving-obj-progress" style={{ color: dotColor }}>{progress}%</span>
                    {servedOpenCount === 0 && (
                      <span className="unserved-warning" title="No open tasks in this cycle serve this objective's key results">
                        <span>no tasks</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <button className="serving-open-objectives" onClick={() => navigateToSection('objectives')}>
            Open Objectives <ArrowRight size={13} />
          </button>
        </div>
      )}

      {/* Quick Add Bar (P1: Priority + Key Result only; new tasks land in Backlog) */}
      <form className="quick-add-bar" onSubmit={handleAddTask}>
        <span className="quick-add-eyebrow">NEW TASK</span>

        <input
          type="text"
          className="quick-add-input"
          placeholder="What are you working on?"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
        />

        <div className="quick-add-field">
          <span className="quick-add-field-label">PRIORITY</span>
          <Select
            options={PRIORITY_OPTIONS}
            value={newCategory}
            onChange={setNewCategory}
            ariaLabel="Priority"
          />
        </div>

        <div className="quick-add-field kr-field">
          <span className="quick-add-field-label">KEY RESULT</span>
          <Select
            options={krOpts}
            value={newKrId || null}
            onChange={setNewKrId}
            placeholder="Link a key result"
            onClear={() => setNewKrId('')}
            clearLabel="No key result"
            ariaLabel="Key result"
          />
        </div>

        <button type="submit" className="quick-add-btn">
          Add
        </button>
      </form>

      {/* Main Content: BOARD VIEW vs LIST VIEW */}
      {viewMode === 'board' ? (
        <>
        <div className="board-view-grid">
          {/* TODAY COLUMN */}
          <div className="board-column column-today">
            <div className="column-header">
              <div className="column-title">
                <span className="bucket-dot today-dot" />
                <span>Today</span>
                <span className="column-count">{tasksByBucket.today.length}</span>
              </div>
              <span className="column-pomos">{bucketPomos.today} pomos</span>
            </div>

            <div className="column-cards">
              {tasksByBucket.today.map(task => (
                <BoardTaskCard
                  key={task.id}
                  task={task}
                  krOptions={krOpts}
                  activeFocusTaskId={activeFocusTaskId}
                  isSelectedForMove={selectedForMoveId === task.id}
                  onSelect={() => onSelectTask(task)}
                  onComplete={handleComplete}
                  onToggleMove={() => setSelectedForMoveId(selectedForMoveId === task.id ? null : task.id)}
                  onMoveBucket={(b) => handleMoveTaskBucket(task.id, b)}
                  onSetKeyResult={(krId) => setTaskField(task.id, { keyResultId: krId || undefined })}
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
              <span className="column-pomos">{bucketPomos.this_week} pomos</span>
            </div>

            <div className="column-cards">
              {tasksByBucket.this_week.map(task => (
                <BoardTaskCard
                  key={task.id}
                  task={task}
                  krOptions={krOpts}
                  activeFocusTaskId={activeFocusTaskId}
                  isSelectedForMove={selectedForMoveId === task.id}
                  onSelect={() => onSelectTask(task)}
                  onComplete={handleComplete}
                  onToggleMove={() => setSelectedForMoveId(selectedForMoveId === task.id ? null : task.id)}
                  onMoveBucket={(b) => handleMoveTaskBucket(task.id, b)}
                  onSetKeyResult={(krId) => setTaskField(task.id, { keyResultId: krId || undefined })}
                />
              ))}
            </div>
          </div>

          {/* BACKLOG COLUMN (Responsive Collapse P2) */}
          <div className={`board-column column-backlog${backlogOpen ? ' backlog-expanded' : ''}`}>
            <button
              className="column-header backlog-bar-toggle"
              onClick={() => {
                // P2 click-and-place (ADR-0010): a card selected for move drops
                // into Backlog; otherwise the bar toggles the mini-list.
                if (selectedForMoveId) {
                  handleMoveTaskBucket(selectedForMoveId, 'backlog');
                } else {
                  setBacklogOpen(v => !v);
                }
              }}
              title="Toggle backlog list"
            >
              <div className="column-title">
                <span className="bucket-dot backlog-dot" />
                <span>Backlog</span>
                <span className="column-count">{tasksByBucket.backlog.length}</span>
              </div>
              <span className="backlog-bar-hint">
                {tasksByBucket.backlog[0]?.title && (
                  <>{tasksByBucket.backlog[0].title} · </>
                )}
                drop a card here to defer it
              </span>
              <span className="column-pomos">{bucketPomos.backlog} pomos</span>
            </button>

            <div className="column-cards">
              {tasksByBucket.backlog.map(task => (
                <BoardTaskCard
                  key={task.id}
                  task={task}
                  krOptions={krOpts}
                  activeFocusTaskId={activeFocusTaskId}
                  isSelectedForMove={selectedForMoveId === task.id}
                  onSelect={() => onSelectTask(task)}
                  onComplete={handleComplete}
                  onToggleMove={() => setSelectedForMoveId(selectedForMoveId === task.id ? null : task.id)}
                  onMoveBucket={(b) => handleMoveTaskBucket(task.id, b)}
                  onSetKeyResult={(krId) => setTaskField(task.id, { keyResultId: krId || undefined })}
                />
              ))}
            </div>

            {/* Same-Session Undo Footer — inside the Backlog column (P1) */}
            {completedTodayInCycle.length > 0 && (
              <div className="completed-today-strip">
                <button
                  className="completed-today-toggle"
                  onClick={() => setShowCompletedToday(!showCompletedToday)}
                >
                  <span>{completedTodayInCycle.length} completed today</span>
                  <span className="toggle-label">{showCompletedToday ? 'Hide' : 'Show'}</span>
                </button>

                {showCompletedToday && (
                  <div className="completed-today-list">
                    {completedTodayInCycle.map(t => (
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
        </div>

        {/* P2: expanded backlog mini-list at narrow widths */}
        {backlogOpen && (
          <div className="backlog-expanded-panel">
            {tasksByBucket.backlog.map(task => (
              <BoardTaskCard
                key={task.id}
                task={task}
                krOptions={krOpts}
                activeFocusTaskId={activeFocusTaskId}
                isSelectedForMove={selectedForMoveId === task.id}
                onSelect={() => onSelectTask(task)}
                onComplete={handleComplete}
                onToggleMove={() => setSelectedForMoveId(selectedForMoveId === task.id ? null : task.id)}
                onMoveBucket={(b) => handleMoveTaskBucket(task.id, b)}
                onSetKeyResult={(krId) => setTaskField(task.id, { keyResultId: krId || undefined })}
              />
            ))}
            {tasksByBucket.backlog.length === 0 && (
              <div className="backlog-expanded-empty">Backlog is empty.</div>
            )}
          </div>
        )}
        </>
      ) : (
        /* LIST VIEW (P3) */
        <div className="list-view-container">
          {/* Toolbar: Group by / Sort (the persistent quick-add bar above owns task creation) */}
          <div className="list-toolbar">
            <div className="list-toolbar-item">
              <span className="list-toolbar-label">Group by</span>
              <Select options={GROUP_BY_OPTIONS} value={groupBy} onChange={setGroupBy} ariaLabel="Group by" />
            </div>

            <div className="list-toolbar-item">
              <span className="list-toolbar-label">Sort</span>
              <Select options={SORT_BY_OPTIONS} value={sortBy} onChange={setSortBy} ariaLabel="Sort" />
            </div>

            <button className="search-trigger-btn list-search-btn" onClick={onOpenSearch}>
              <Search size={15} />
              <span>Search</span>
              <kbd className="cmd-k-badge">⌘K</kbd>
            </button>
          </div>

          {/* Bulk Action Bar */}
          {selectedTaskIds.size > 0 && (
            <div className="bulk-action-bar">
              <span className="bulk-count">{selectedTaskIds.size} selected · Move to</span>
              <div className="bulk-buttons">
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

          {/* List Data Table with group headers */}
          {listGroups.map(group => (
            <div key={group.key} className="list-group">
              <div className="list-group-header">{group.title}</div>
              <table className="list-table">
                <thead>
                  <tr>
                    <th className="th-select">
                      <input
                        type="checkbox"
                        checked={isGroupSelected(group.tasks)}
                        onChange={e => toggleGroup(group.tasks, e.target.checked)}
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
                  {group.tasks.map(task => {
                    const isSelected = isTaskSelected(task.id);
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
                          <Select
                            options={PRIORITY_OPTIONS}
                            value={task.category || 'do'}
                            onChange={(category) => setTaskField(task.id, { category })}
                            ariaLabel={`Priority for ${task.title}`}
                          />
                        </td>
                        <td className="td-kr">
                          <Select
                            options={krOpts}
                            value={task.keyResultId || null}
                            onChange={(krId) => setTaskField(task.id, { keyResultId: krId || undefined })}
                            placeholder="Link a key result"
                            onClear={() => setTaskField(task.id, { keyResultId: undefined })}
                            clearLabel="No key result"
                            ariaLabel={`Key result for ${task.title}`}
                          />
                        </td>
                        <td className="td-bucket">
                          <Select
                            options={BUCKET_OPTIONS}
                            value={task.bucket || 'backlog'}
                            onChange={(bucket) => handleMoveTaskBucket(task.id, bucket)}
                            ariaLabel={`Bucket for ${task.title}`}
                          />
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
                          {displayedPomoCount(task.completedPomodoros, task.estimatedPomodoros, task.id === activeFocusTaskId)}/{task.estimatedPomodoros || 1}
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
          ))}

          {openTasks.length === 0 && (
            <div className="done-view-empty">
              <CheckCircle2 size={36} className="empty-icon" />
              <p>No open tasks. Add one above or search completed tasks with ⌘K.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Single Board Card Component (P1 anatomy: tick · title · bucket button · pomos / KR picker + category / due)
function BoardTaskCard({
  task,
  krOptions,
  isSelectedForMove,
  onSelect,
  onComplete,
  onToggleMove,
  onMoveBucket,
  onSetKeyResult,
  activeFocusTaskId,
}: {
  task: PomodoroTask;
  krOptions: SelectOption<string>[];
  activeFocusTaskId: string | null;
  isSelectedForMove: boolean;
  onSelect: () => void;
  onComplete: (task: PomodoroTask) => void;
  onToggleMove: () => void;
  onMoveBucket: (b: TaskBucket) => void;
  onSetKeyResult: (krId: string | undefined) => void;
}) {
  const meta = task.category ? EISENHOWER_META[task.category] || null : null;
  const accentVar = meta?.color ?? '#6b7280';
  const due = formatDueLabel(task.dueDate);

  return (
    <div
      className={`board-task-card${isSelectedForMove ? ' selected-for-move' : ''}`}
      style={{ '--task-accent': accentVar } as CSSProperties}
      onClick={onSelect}
    >
      <div className="card-top-row">
        <button
          className="card-tick"
          onClick={e => { e.stopPropagation(); onComplete(task); }}
          title="Mark complete"
          aria-label={`Mark ${task.title} complete`}
        />
        <span className="card-title">{task.title}</span>

        {/* Board-card mini-trigger (ADR-0010 click-select move flow lives
            behind it) — rounded-rect pill with the board glyph + chevron in
            muted foreground, top-right beside the pomo counter. */}
        <div className="card-move-wrapper" onClick={e => e.stopPropagation()}>
          <button
            className="card-bucket-btn"
            onClick={onToggleMove}
            title="Move to another bucket"
            aria-label={`Move ${task.title} to another bucket`}
            aria-expanded={isSelectedForMove}
          >
            <KanbanSquare size={13} />
            <ChevronDown size={11} />
          </button>

          {/* Select-style move panel: eyebrow + ticked current bucket +
              green Mark done action (round-8 reference screenshot). The
              ADR-0010 click-select flow keeps working around it — picking a
              bucket or marking done also clears the move selection. */}
          {isSelectedForMove && (
            <div className="card-move-menu" role="group" aria-label="Move to bucket">
              <span className="move-eyebrow">Move to bucket</span>
              {TASK_BUCKETS.map(bucket => {
                const current = (task.bucket || 'backlog') === bucket;
                return (
                  <button
                    key={bucket}
                    type="button"
                    className={`move-option${current ? ' is-chosen' : ''}`}
                    onClick={() => onMoveBucket(bucket)}
                  >
                    <span>{BUCKET_LABELS[bucket]}</span>
                    {current && <Check size={14} className="move-tick" aria-hidden="true" />}
                  </button>
                );
              })}
              <div className="move-divider" />
              <button
                type="button"
                className="move-action"
                onClick={() => { onComplete(task); onToggleMove(); }}
              >
                Mark done
              </button>
            </div>
          )}
        </div>

        <span className="card-pomos">
          {displayedPomoCount(task.completedPomodoros, task.estimatedPomodoros, task.id === activeFocusTaskId)}/{task.estimatedPomodoros || 1}
        </span>
      </div>

      {/* Meta block: priority + KR chip share the first row; the due badge
          sits on its own row below the priority tag (2026-08-27 feedback). */}
      <div className="card-meta-block">
        <div className="card-meta-row">
          {meta && (
            <span
              className="card-category"
              style={{ '--cat-color': meta.color, '--cat-bg': meta.bgColor } as CSSProperties}
            >
              <span className="card-category-dot" />
              {meta.label}
            </span>
          )}

          {/* KR chip inline with the priority tag; clicking it opens the KR
              picker (never the detail modal). Truncates when the title is
              long — but only once a KR is linked; the empty prompt shows in
              full. */}
          <div className={`card-kr${task.keyResultId ? '' : ' is-empty'}`} onClick={e => e.stopPropagation()}>
            <Select
              variant="bare"
              options={krOptions}
              value={task.keyResultId ?? null}
              placeholder="Link a key result"
              onChange={(krId) => onSetKeyResult(krId)}
              onClear={() => onSetKeyResult(undefined)}
              clearLabel="No key result"
              ariaLabel={`Key result for ${task.title}`}
            />
          </div>
        </div>

        <div className="card-meta-row">
          {/* Due pill: the due label, or a dashed calendar "No due date" prompt. */}
          <span className={`card-due${due ? '' : ' is-empty'}${due?.overdue ? ' overdue' : ''}`}>
            <Calendar size={11} className="card-due-icon" />
            {due ? due.label : 'No due date'}
          </span>
        </div>
      </div>
    </div>
  );
}
