import { useMemo } from 'react';
import { RotateCcw, CheckCircle2, Clock } from 'lucide-react';
import type { PomodoroTask } from '../../lib/pomodoro-storage';
import type { KeyResult } from '../../lib/okr-storage';

interface Props {
  tasks: PomodoroTask[];
  onReopenTask: (task: PomodoroTask) => void;
  keyResults?: KeyResult[];
  onSelectTask?: (task: PomodoroTask) => void;
}

interface GroupedDone {
  label: string;
  tasks: PomodoroTask[];
  totalPomos: number;
}

export default function DoneView({ tasks, onReopenTask, keyResults = [], onSelectTask }: Props) {
  const completedTasks = useMemo(() => {
    return tasks
      .filter(t => t.isCompleted)
      .sort((a, b) => new Date(b.completedAt || b.createdAt).getTime() - new Date(a.completedAt || a.createdAt).getTime());
  }, [tasks]);

  const totalSpentPomos = useMemo(() => {
    return completedTasks.reduce((sum, t) => sum + (t.completedPomodoros || 0), 0);
  }, [completedTasks]);

  const averagePerTask = useMemo(() => {
    if (completedTasks.length === 0) return 0;
    return (totalSpentPomos / completedTasks.length).toFixed(1);
  }, [completedTasks, totalSpentPomos]);

  const groups = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const map = new Map<string, PomodoroTask[]>();

    completedTasks.forEach(task => {
      const dateStr = task.completedAt ? task.completedAt.slice(0, 10) : 'Earlier';
      let groupKey = 'EARLIER';
      if (dateStr === todayStr) groupKey = 'TODAY';
      else if (dateStr === yesterdayStr) groupKey = 'YESTERDAY';
      else if (dateStr !== 'Earlier') {
        const d = new Date(dateStr);
        groupKey = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
      }

      const list = map.get(groupKey) || [];
      list.push(task);
      map.set(groupKey, list);
    });

    const result: GroupedDone[] = [];
    map.forEach((tList, label) => {
      const totalPomos = tList.reduce((s, t) => s + (t.completedPomodoros || 0), 0);
      result.push({ label, tasks: tList, totalPomos });
    });

    return result;
  }, [completedTasks]);

  return (
    <div className="done-view-container">
      {/* Overview Stats Bar */}
      <div className="done-view-header">
        <div className="done-view-summary">
          <span className="summary-count">{completedTasks.length} tasks completed</span>
          <span className="summary-dot">•</span>
          <span className="summary-pomos">{totalSpentPomos} pomodoros spent ({averagePerTask} avg per task)</span>
        </div>
      </div>

      {completedTasks.length === 0 ? (
        <div className="done-view-empty">
          <CheckCircle2 size={36} className="empty-icon" />
          <p>No completed tasks yet. Completed tasks leave the board but stay searchable here.</p>
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

              <div className="done-group-list">
                {group.tasks.map(task => {
                  const linkedKr = keyResults.find(k => k.id === task.keyResultId);
                  const finishedTime = task.completedAt
                    ? new Date(task.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : 'Done';

                  return (
                    <div
                      key={task.id}
                      className="done-task-row"
                      onClick={() => onSelectTask?.(task)}
                    >
                      <div className="done-task-main">
                        <CheckCircle2 size={16} className="done-check-icon" />
                        <span className="done-task-title">{task.title}</span>
                        {linkedKr && (
                          <span className="done-task-kr" title={`Key Result: ${linkedKr.title}`}>
                            🎯 {linkedKr.title}
                          </span>
                        )}
                      </div>

                      <div className="done-task-right">
                        <span className="done-task-pomos" title="Pomodoros completed / estimated">
                          🍅 {task.completedPomodoros} / {task.estimatedPomodoros || 1}
                        </span>
                        <span className="done-task-time">
                          <Clock size={12} />
                          {finishedTime}
                        </span>
                        <button
                          className="done-reopen-btn"
                          onClick={e => {
                            e.stopPropagation();
                            onReopenTask(task);
                          }}
                          title="Reopen task and return to bucket"
                        >
                          <RotateCcw size={13} />
                          <span>Reopen</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
