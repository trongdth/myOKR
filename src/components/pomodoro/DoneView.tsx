import { useMemo, useState } from 'react';
import { RotateCcw, CheckCircle2, Search } from 'lucide-react';
import type { PomodoroTask } from '../../lib/pomodoro-storage';
import { isTaskInCycle, buildKrCycleMap } from '../../lib/pomodoro-storage';
import type { KeyResult, OKRCycle, Objective } from '../../lib/okr-storage';
import PlanTabStrip, { cycleWeekLabel, PlanHeader } from './PlanTabStrip';
import { Select } from '../shared/Select';
import { PRIORITY_OPTIONS, krOptions } from './taskSelectOptions';

interface Props {
  tasks: PomodoroTask[];
  /** Bulk-shaped so a multi-select reopen is one write, not N sequential ones. */
  onReopenTasks: (tasks: PomodoroTask[]) => void;
  keyResults?: KeyResult[];
  objectives?: Objective[];
  cycles?: OKRCycle[];
  activeCycle?: OKRCycle | null;
  onSelectTask?: (task: PomodoroTask) => void;
  onOpenSearch?: () => void;
}

const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dayGroupLabel(dateStr: string, todayStr: string, yesterdayStr: string): string {
  if (dateStr === todayStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return `TODAY · ${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].toUpperCase()}`;
  }
  if (dateStr === yesterdayStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return `YESTERDAY · ${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].toUpperCase()}`;
  }
  const d = new Date(dateStr + 'T00:00:00');
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].toUpperCase()}`;
}

export default function DoneView({ tasks, onReopenTasks, keyResults = [], objectives = [], cycles = [], activeCycle, onSelectTask, onOpenSearch }: Props) {
  // Filters (P5): This week / All key results / All priorities
  const [weekOnly, setWeekOnly] = useState(false);
  const [krFilter, setKrFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // Bulk selection (row anatomy matches the Tasks list view — 2026-08-29)
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  const krCycleMap = useMemo(
    () => buildKrCycleMap(keyResults, objectives, cycles),
    [keyResults, objectives, cycles],
  );

  const todayStr = new Date().toISOString().slice(0, 10);
  const weekStart = useMemo(() => {
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    return monday.toISOString().slice(0, 10);
  }, []);

  // The Done list itself is NOT cycle-scoped (ADR-0012 enumerates only tab
  // counts, the completed-today strip and the SERVING strip as cycle-scoped) —
  // it is the audit of everything finished, day-grouped. Only the strip
  // counts above use in-cycle membership.
  // Count base for the filter rows' trailing hints (ticket 07): completed
  // tasks after the week toggle, BEFORE the KR/priority filters — the count
  // is what choosing that row would show.
  const filterCountBase = useMemo(() => {
    return tasks
      .filter(t => t.isCompleted)
      .filter(t => !weekOnly || (t.completedAt || t.createdAt).slice(0, 10) >= weekStart);
  }, [tasks, weekOnly, weekStart]);

  const completedTasks = useMemo(() => {
    return tasks
      .filter(t => t.isCompleted)
      .filter(t => !weekOnly || (t.completedAt || t.createdAt).slice(0, 10) >= weekStart)
      .filter(t => krFilter === 'all' || t.keyResultId === krFilter)
      .filter(t => priorityFilter === 'all' || (t.category || 'do') === priorityFilter)
      .sort((a, b) => new Date(b.completedAt || b.createdAt).getTime() - new Date(a.completedAt || a.createdAt).getTime());
  }, [tasks, weekOnly, weekStart, krFilter, priorityFilter]);

  // Filter rows with per-value trailing counts (ticket 07). Each count is
  // what choosing that row would show — including the All rows' totals.
  const krFilterOptions = useMemo(() => [
    { value: 'all', label: 'All key results', trailing: String(filterCountBase.length) },
    ...krOptions(keyResults).map(opt => ({
      ...opt,
      trailing: String(filterCountBase.filter(t => t.keyResultId === opt.value).length),
    })),
  ], [keyResults, filterCountBase]);

  const priorityFilterOptions = useMemo(() => [
    { value: 'all', label: 'All priorities', trailing: String(filterCountBase.length) },
    ...PRIORITY_OPTIONS.map(opt => ({
      ...opt,
      trailing: String(filterCountBase.filter(t => (t.category || 'do') === opt.value).length),
    })),
  ], [filterCountBase]);

  const totalSpentPomos = useMemo(() => {
    return completedTasks.reduce((sum, t) => sum + (t.completedPomodoros || 0), 0);
  }, [completedTasks]);

  const averagePerTask = useMemo(() => {
    if (completedTasks.length === 0) return '0';
    return (totalSpentPomos / completedTasks.length).toFixed(1);
  }, [completedTasks, totalSpentPomos]);

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  // Tab-strip counts (ADR-0012 cycle membership)
  const openInCycleCount = useMemo(
    () => tasks.filter(t => !t.isCompleted && isTaskInCycle(t, krCycleMap.get(t.keyResultId || ''), activeCycle ?? null)).length,
    [tasks, krCycleMap, activeCycle],
  );
  const completedInCycleCount = completedTasks.length;
  const objectiveCount = useMemo(
    () => (activeCycle ? objectives.filter(o => o.cycleId === activeCycle.id).length : objectives.length),
    [objectives, activeCycle],
  );
  const cycleLabel = cycleWeekLabel(activeCycle);

  const groups = useMemo(() => {
    const map = new Map<string, PomodoroTask[]>();
    completedTasks.forEach(task => {
      const dateStr = task.completedAt ? task.completedAt.slice(0, 10) : 'Earlier';
      const list = map.get(dateStr) || [];
      list.push(task);
      map.set(dateStr, list);
    });

    return [...map.entries()].map(([dateStr, tList]) => {
      const totalPomos = tList.reduce((s, t) => s + (t.completedPomodoros || 0), 0);
      return {
        label: dateStr === 'Earlier' ? 'EARLIER' : dayGroupLabel(dateStr, todayStr, yesterdayStr),
        tasks: tList,
        totalPomos,
      };
    });
  }, [completedTasks, todayStr, yesterdayStr]);

  const toggleSelectTask = (id: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectGroup = (groupTasks: PomodoroTask[], checked: boolean) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      groupTasks.forEach(t => {
        if (checked) next.add(t.id);
        else next.delete(t.id);
      });
      return next;
    });
  };

  // Bulk actions only touch what the current filters show, then clear — same
  // posture as the Tasks list view's bulk bar.
  const selectedCompleted = completedTasks.filter(t => selectedTaskIds.has(t.id));

  const handleBulkReopen = () => {
    if (selectedCompleted.length === 0) return;
    onReopenTasks(selectedCompleted);
    setSelectedTaskIds(new Set());
  };

  const handleRowReopen = (task: PomodoroTask) => {
    onReopenTasks([task]);
    setSelectedTaskIds(prev => {
      if (!prev.has(task.id)) return prev;
      const next = new Set(prev);
      next.delete(task.id);
      return next;
    });
  };

  return (
    <div className="done-view-container">
      {/* Header (P5): PLAN + cycle pill + Search ⌘K */}
      <PlanHeader
        activeCycle={activeCycle}
        right={
          onOpenSearch && (
            <button className="search-trigger-btn" onClick={onOpenSearch}>
              <Search size={15} />
              <span>Search</span>
              <kbd className="cmd-k-badge">⌘K</kbd>
            </button>
          )
        }
      />

      {/* Tab strip with counts (P5) */}
      <PlanTabStrip
        active="done"
        tasksCount={openInCycleCount}
        objectivesCount={objectiveCount}
        doneCount={completedInCycleCount}
        cycleLabel={cycleLabel}
      />

      {/* Filters + summary (P5) */}
      <div className="done-filters-row">
        <button
          className={`done-filter-chip${weekOnly ? ' active' : ''}`}
          onClick={() => setWeekOnly(v => !v)}
        >
          This week
        </button>
        <Select
          options={krFilterOptions}
          value={krFilter}
          onChange={setKrFilter}
          ariaLabel="Key result filter"
        />
        <Select
          options={priorityFilterOptions}
          value={priorityFilter}
          onChange={setPriorityFilter}
          ariaLabel="Priority filter"
        />

        <span className="done-view-summary">
          {totalSpentPomos} pomodoros spent · {averagePerTask} average per task
        </span>
      </div>

      {/* Bulk Action Bar — same anatomy as the Tasks list view's; Reopen is
          the one bulk action completed tasks can take */}
      {selectedCompleted.length > 0 && (
        <div className="bulk-action-bar">
          <span className="bulk-count">{selectedCompleted.length} selected</span>
          <div className="bulk-buttons">
            <button onClick={handleBulkReopen} className="bulk-btn">Reopen</button>
          </div>
        </div>
      )}

      {completedTasks.length === 0 ? (
        <div className="done-view-empty">
          <CheckCircle2 size={36} className="empty-icon" />
          <p>No completed tasks match. Completed tasks leave the board but stay searchable here.</p>
        </div>
      ) : (
        <div className="done-view-groups">
          {groups.map(group => (
            <div key={group.label} className="done-group">
              <div className="done-group-header">
                <span className="done-group-title">{group.label}</span>
                <span className="done-group-meta">
                  {group.tasks.length} {group.tasks.length === 1 ? 'task' : 'tasks'} · {group.totalPomos} pomodoros
                </span>
              </div>

              {/* P5 columns in the Tasks list-view table anatomy (2026-08-29):
                  select · TASK | KEY RESULT | POMODOROS | FINISHED | UNDO */}
              <table className="list-table done-table">
                <thead>
                  <tr>
                    <th className="th-select">
                      <input
                        type="checkbox"
                        checked={group.tasks.length > 0 && group.tasks.every(t => selectedTaskIds.has(t.id))}
                        onChange={e => toggleSelectGroup(group.tasks, e.target.checked)}
                        aria-label={`Select all tasks finished ${group.label}`}
                      />
                    </th>
                    <th className="done-th-task">TASK</th>
                    <th className="done-th-kr">KEY RESULT</th>
                    <th className="done-th-pomos">POMODOROS</th>
                    <th className="done-th-finished">FINISHED</th>
                    <th className="done-th-undo">UNDO</th>
                  </tr>
                </thead>
                <tbody>
                  {group.tasks.map(task => {
                    const linkedKr = keyResults.find(k => k.id === task.keyResultId);
                    const finishedTime = task.completedAt
                      ? new Date(task.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : '—';
                    const isSelected = selectedTaskIds.has(task.id);

                    return (
                      <tr
                        key={task.id}
                        className={`list-row done-table-row${isSelected ? ' selected' : ''}`}
                        onClick={() => onSelectTask?.(task)}
                      >
                        <td className="td-select" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectTask(task.id)}
                            aria-label={`Select ${task.title}`}
                          />
                        </td>
                        <td className="done-td-task">
                          <span className="done-task-title">{task.title}</span>
                        </td>
                        <td className="done-td-kr">
                          <span className="done-task-kr">{linkedKr ? linkedKr.title : 'No key result'}</span>
                        </td>
                        <td className="done-td-pomos">
                          {task.completedPomodoros} / {task.estimatedPomodoros || 1}
                        </td>
                        <td className="done-td-finished">{finishedTime}</td>
                        <td className="done-td-undo" onClick={e => e.stopPropagation()}>
                          <button
                            className="done-reopen-btn"
                            onClick={() => handleRowReopen(task)}
                            title="Reopen task and return to bucket"
                          >
                            <RotateCcw size={13} />
                            <span>Reopen</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
