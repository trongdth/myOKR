import { Play } from 'lucide-react';
import type { PomodoroTask } from '../../lib/pomodoro-storage';
import type { KeyResult, Objective } from '../../lib/okr-storage';
import { CONFIDENCE_META, formatKrSubtitle } from '../../lib/okr-storage';
import type { ScoreBreakdown } from '../../lib/today-focus';
import { todaysSlice } from '../../lib/today-focus';

interface NowCardProps {
  task: PomodoroTask & { _score: ScoreBreakdown };
  kr?: KeyResult;
  objective?: Objective;
  maxShare: number;
  onStart: () => void;
  onSkip: () => void;
}

export default function NowCard({ task, kr, objective, maxShare, onStart, onSkip }: NowCardProps) {
  const completed = task.completedPomodoros || 0;
  const estimated = task.estimatedPomodoros || 1;
  const slice = todaysSlice(task, maxShare);
  const targetForDisplay = Math.min(estimated, completed + slice);

  const confidenceLabel = kr ? CONFIDENCE_META[kr.confidence].label : '';
  const isAtRisk = kr?.confidence === 'at_risk' || kr?.confidence === 'off_track';
  const krText = formatKrSubtitle(kr, objective);
  const statusLabel = kr ? confidenceLabel : (isAtRisk ? 'At Risk' : 'On Track');

  // Render max 8 pomo segments for compact visualization
  const maxSegments = Math.min(8, Math.max(1, targetForDisplay));
  const filledSegments = Math.min(completed, maxSegments);

  return (
    <div className="focus-card today-now-card">
      <div className="today-now-main">
        {/* Row 1: NOW · #1 + Status Pill */}
        <div className="today-now-badge-row">
          <span className="today-now-rank-pill">NOW · #1</span>
          <span className={`today-now-status-pill ${isAtRisk ? 'at-risk' : 'on-track'}`}>
            {statusLabel}
          </span>
        </div>

        {/* Row 2: Task Title & KR Link */}
        <div className="today-now-title-block">
          <h2 className="today-now-title" title={task.title}>
            {task.title}
          </h2>
          <div className="today-now-kr-row">
            <div className="today-now-kr-text" title={krText}>
              <span className="today-kr-dot" />
              <span>{krText}</span>
            </div>
          </div>
        </div>

        {/* Row 3: Pomodoro Progress Segment Row */}
        <div className="today-now-pomo-bar-row">
          <div className="today-now-pomo-bar">
            {Array.from({ length: maxSegments }).map((_, idx) => (
              <div
                key={idx}
                className={`today-pomo-segment ${idx < filledSegments ? 'filled' : ''}`}
              />
            ))}
            <span className="today-now-pomo-count">
              {completed}/{targetForDisplay} pomodoros
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons: Start focus & Skip */}
      <div className="today-now-actions">
        <button
          className="btn today-btn-start"
          onClick={onStart}
          title="Start focus session with this task"
        >
          <Play size={15} fill="currentColor" />
          <span>Start focus</span>
        </button>

        <button
          className="today-btn-skip"
          onClick={onSkip}
          title="Skip this task for today"
        >
          <span>Skip</span>
        </button>
      </div>
    </div>
  );
}
