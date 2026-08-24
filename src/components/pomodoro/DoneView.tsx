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
  onReopenTask: (task: PomodoroTask) => void;
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

export default function DoneView({ tasks, onReopenTask, keyResults = [], objectives = [], cycles = [], activeCycle, onSelectTask, onOpenSearch }: Props) {
  // Filters (P5): This week / All key results / All priorities
  const [weekOnly, setWeekOnly] = useState(false);
  const [krFilter, setKrFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

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
  const completedTasks = useMemo(() => {
    return tasks
      .filter(t => t.isCompleted)
      .filter(t => !weekOnly || (t.completedAt || t.createdAt).slice(0, 10) >= weekStart)
      .filter(t => krFilter === 'all' || t.keyResultId === krFilter)
      .filter(t => priorityFilter === 'all' || (t.category || 'do') === priorityFilter)
      .sort((a, b) => new Date(b.completedAt || b.createdAt).getTime() - new Date(a.completedAt || a.createdAt).getTime());
  }, [tasks, weekOnly, weekStart, krFilter, priorityFilter]);

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
          options={[{ value: 'all', label: 'All key results' }, ...krOptions(keyResults)]}
          value={krFilter}
          onChange={setKrFilter}
          ariaLabel="Key result filter"
        />
        <Select
          options={[{ value: 'all', label: 'All priorities' }, ...PRIORITY_OPTIONS]}
          value={priorityFilter}
          onChange={setPriorityFilter}
          ariaLabel="Priority filter"
        />

        <span className="done-view-summary">
          {totalSpentPomos} pomodoros spent · {averagePerTask} average per task
        </span>
      </div>

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

              {/* P5: table TASK | KEY RESULT | POMODOROS | FINISHED | UNDO */}
              <table className="done-table">
                <thead>
                  <tr>
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

                    return (
                      <tr
                        key={task.id}
                        className="done-table-row"
                        onClick={() => onSelectTask?.(task)}
                      >
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
                            onClick={() => onReopenTask(task)}
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
