import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import type { PomodoroTask } from '../../lib/pomodoro-storage';
import { EISENHOWER_META } from '../../lib/pomodoro-storage';

interface TaskPomo {
  task: PomodoroTask | null;
  pomos: number;
}

interface Props {
  linkedTasksThisWeek: TaskPomo[];
}

export default function LinkedTasksThisWeek({ linkedTasksThisWeek }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

  const totalPomos = linkedTasksThisWeek.reduce((s, t) => s + t.pomos, 0);
  const taskCount = linkedTasksThisWeek.length;

  return (
    <div>
      <button
        className="review-pomo-insight"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="review-pomo-insight-icon"><BarChart3 size={14} /></span>
        <span>
          {totalPomos} pomodoro{totalPomos !== 1 ? 's' : ''} across {taskCount} linked task{taskCount !== 1 ? 's' : ''} this week
          {isExpanded ? ' ▴' : ' ▾'}
        </span>
      </button>
      {isExpanded && (
        <div className="review-pomo-insight-expand">
          {linkedTasksThisWeek.map(({ task, pomos }) => {
            const icon = task?.category
              ? EISENHOWER_META[task.category].icon
              : '⚫';
            const title = task
              ? task.title
              : '(deleted task)';
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
      )}
    </div>
  );
}
