import { type CSSProperties } from 'react';
import { ChevronUp } from 'lucide-react';
import { EISENHOWER_META, type PomodoroTask } from '../../lib/pomodoro-storage';
import type { KeyResult, Objective } from '../../lib/okr-storage';
import type { ScoreBreakdown } from '../../lib/today-focus';
import { todaysSlice } from '../../lib/today-focus';

interface UpNextCardProps {
  task: PomodoroTask & { _score: ScoreBreakdown };
  kr?: KeyResult;
  objective?: Objective;
  rank: number;
  maxShare: number;
  selected: boolean;
  onCardClick: () => void;
  onPromote: () => void;
}

export default function UpNextCard({
  task,
  kr,
  objective,
  rank,
  maxShare,
  selected,
  onCardClick,
  onPromote,
}: UpNextCardProps) {
  const completed = task.completedPomodoros || 0;
  const estimated = task.estimatedPomodoros || 1;
  const slice = todaysSlice(task, maxShare);
  const targetForDisplay = Math.min(estimated, completed + slice);

  // Left accent = the task's Eisenhower category color — the canonical scheme
  // shared with Tasks/Prioritize (EISENHOWER_META). delete-category tasks are
  // filtered out before reaching UP NEXT, so only do/decide/delegate show.
  const accentVar = EISENHOWER_META[task.category ?? 'decide'].color;

  return (
    <div
      className={`focus-card today-upnext-item ${selected ? 'is-selected' : ''}`}
      style={{ '--today-accent': accentVar } as CSSProperties}
      onClick={onCardClick}
      title={
        selected
          ? 'Click another task to swap position with it'
          : 'Click to select, then click another task to reorder'
      }
    >
      <div className="today-upnext-rank">{rank}</div>

      <div className="today-upnext-body">
        <div className="today-upnext-title">{task.title}</div>
        <div className="today-upnext-kr">
          {kr
            ? `${objective ? objective.title + ' → ' : ''}${kr.title}`
            : 'No key result linked'}
        </div>
      </div>

      <div className="today-upnext-count">
        {completed}/{targetForDisplay}
      </div>

      <button
        type="button"
        className="today-upnext-promote"
        onClick={(e) => { e.stopPropagation(); onPromote(); }}
        title="Move to NOW (#1)"
      >
        <ChevronUp size={14} />
      </button>
    </div>
  );
}
