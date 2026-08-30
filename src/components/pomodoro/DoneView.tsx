import { useMemo, useState } from 'react';
import { Check, CheckCircle2, Search } from 'lucide-react';
import type { PomodoroTask } from '../../lib/pomodoro-storage';
import { isTaskInCycle, buildKrCycleMap } from '../../lib/pomodoro-storage';
import type { KeyResult, OKRCycle, Objective } from '../../lib/okr-storage';
import PlanTabStrip, { cycleWeekLabel, PlanHeader } from './PlanTabStrip';
import { Select } from '../shared/Select';
import ConfirmModal from '../ConfirmModal';
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

  // Reopen asks for confirmation (2026-08-30 feedback): unchecking a row's
  // done-state checkbox stages the task here until the modal decides.
  const [reopenCandidate, setReopenCandidate] = useState<PomodoroTask | null>(null);

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

  const handleReopenConfirmed = () => {
    if (reopenCandidate) onReopenTasks([reopenCandidate]);
    setReopenCandidate(null);
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

              {/* P5 columns in the Tasks list-view table anatomy (2026-08-29),
                  with the checkbox as the done state (2026-08-30 feedback):
                  select · TASK | KEY RESULT | POMODOROS | FINISHED */}
              <table className="list-table done-table">
                <thead>
                  <tr>
                    <th className="th-select" aria-label="Done" />
                    <th className="done-th-task">TASK</th>
                    <th className="done-th-kr">KEY RESULT</th>
                    <th className="done-th-pomos">POMODOROS</th>
                    <th className="done-th-finished">FINISHED</th>
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
                        className="list-row done-table-row"
                        onClick={() => onSelectTask?.(task)}
                      >
                        <td className="td-select" onClick={e => e.stopPropagation()}>
                          {/* Done-state tick (2026-08-30 style round): the
                              mockup's rounded-square tick, not a native box.
                              Controlled by task.isCompleted, so it never
                              flips until the confirm modal decides. */}
                          <button
                            type="button"
                            className={`done-check${task.isCompleted ? ' checked' : ''}`}
                            onClick={() => setReopenCandidate(task)}
                            role="checkbox"
                            aria-checked={task.isCompleted}
                            aria-label={`Reopen ${task.title}`}
                            title="Uncheck to reopen this task"
                          >
                            <Check size={13} />
                          </button>
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* Reopen confirm — the checkbox never flips until this decides, since
          it is controlled by task.isCompleted. */}
      <ConfirmModal
        isOpen={reopenCandidate !== null}
        onClose={() => setReopenCandidate(null)}
        onConfirm={handleReopenConfirmed}
        title="Reopen task"
        danger={false}
        confirmText="Reopen"
        message={
          reopenCandidate && (
            <>
              “{reopenCandidate.title}” will leave the Done list and return to
              its bucket as an open task. Its {reopenCandidate.completedPomodoros || 0}{' '}
              logged {reopenCandidate.completedPomodoros === 1 ? 'pomodoro is' : 'pomodoros are'} kept.
            </>
          )
        }
      />
    </div>
  );
}
