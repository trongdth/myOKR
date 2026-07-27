import { useState } from 'react';
import type { PomodoroTask } from '../../lib/pomodoro-storage';
import type { KeyResult, Objective } from '../../lib/okr-storage';
import type { ScoreBreakdown } from '../../lib/today-focus';
import { todaysSlice } from '../../lib/today-focus';

interface UpNextCardProps {
  task: PomodoroTask & { _score: ScoreBreakdown };
  kr?: KeyResult;
  objective?: Objective;
  rank: number;
  maxShare: number;
  onPromote: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

export default function UpNextCard({
  task,
  kr,
  objective,
  rank,
  maxShare,
  onPromote,
  onDragStart,
  onDragOver,
  onDrop,
}: UpNextCardProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const completed = task.completedPomodoros || 0;
  const estimated = task.estimatedPomodoros || 1;
  const slice = todaysSlice(task, maxShare);
  const targetForDisplay = Math.min(estimated, completed + slice);

  // Left accent border color based on Eisenhower category or KR confidence
  let accentColor = '#22D3EE'; // default cyan
  if (kr?.confidence === 'at_risk' || kr?.confidence === 'off_track' || task.category === 'do') {
    accentColor = '#F87171'; // red at-risk / urgent
  } else if (task.category === 'decide' || kr?.confidence === 'on_track') {
    accentColor = '#F5A524'; // amber/orange
  }

  return (
    <div
      className={`focus-card today-upnext-item ${isDragOver ? 'drag-over' : ''}`}
      style={{ boxShadow: `inset 2px 0 0 ${accentColor}` }}
      onClick={onPromote}
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
        onDragOver?.(e);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        setIsDragOver(false);
        onDrop?.(e);
      }}
      title="Click to promote to NOW (#1) or drag to reorder"
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
    </div>
  );
}
