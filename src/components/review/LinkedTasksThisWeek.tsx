import { BarChart3 } from 'lucide-react';
import type { PomodoroTask } from '../../lib/pomodoro-storage';
import { EISENHOWER_META } from '../../lib/pomodoro-storage';

// The step-2 linked-tasks detail, split in two so its trigger can sit on the
// row's controls line while the expanded list drops below at full width
// (grilling round 4 — a pill on its own line broke the density bar).

export interface TaskPomo {
  task: PomodoroTask | null;
  pomos: number;
}

export function LinkedTasksTrigger({
  linkedTasksThisWeek,
  expanded,
  onToggle,
}: {
  linkedTasksThisWeek: TaskPomo[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const totalPomos = linkedTasksThisWeek.reduce((s, t) => s + t.pomos, 0);
  const taskCount = linkedTasksThisWeek.length;

  return (
    <button type="button" className="review-pomo-insight" aria-expanded={expanded} onClick={onToggle}>
      <span className="review-pomo-insight-icon"><BarChart3 size={14} /></span>
      <span>
        {totalPomos} pomodoro{totalPomos !== 1 ? 's' : ''} across {taskCount} linked task{taskCount !== 1 ? 's' : ''} this week
        {expanded ? ' ▴' : ' ▾'}
      </span>
    </button>
  );
}

export function LinkedTasksList({ linkedTasksThisWeek }: { linkedTasksThisWeek: TaskPomo[] }) {
  return (
    <div className="review-pomo-insight-expand">
      {linkedTasksThisWeek.map(({ task, pomos }) => {
        const dotColor = (task?.category && EISENHOWER_META[task.category]?.color) || 'var(--text-muted)';
        const icon = <span className="confidence-dot" style={{ background: dotColor }} />;
        const title = task ? task.title : '(deleted task)';
        const isDeleted = !task;

        return (
          <div key={task?.id || 'deleted'} className="review-linked-task-row">
            <span className={`review-linked-task-icon${isDeleted ? ' deleted' : ''}`}>{icon}</span>
            <span
              className={`review-linked-task-title${task?.isCompleted ? ' completed' : ''}${isDeleted ? ' deleted' : ''}`}
            >
              {title}
            </span>
            <span className="review-linked-task-pomos">{pomos}</span>
          </div>
        );
      })}
    </div>
  );
}
