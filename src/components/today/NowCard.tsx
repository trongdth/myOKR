import { useState } from 'react';
import { Play, SkipForward } from 'lucide-react';
import type { PomodoroTask } from '../../lib/pomodoro-storage';
import type { KeyResult, Objective } from '../../lib/okr-storage';
import { CONFIDENCE_META } from '../../lib/okr-storage';
import type { ScoreBreakdown } from '../../lib/today-focus';
import { getWhyReasons, todaysSlice } from '../../lib/today-focus';

interface NowCardProps {
  task: PomodoroTask & { _score: ScoreBreakdown };
  kr?: KeyResult;
  objective?: Objective;
  maxShare: number;
  onStart: () => void;
  onSkip: () => void;
}

export default function NowCard({ task, kr, objective, maxShare, onStart, onSkip }: NowCardProps) {
  const [showWhy, setShowWhy] = useState(false);

  const completed = task.completedPomodoros || 0;
  const estimated = task.estimatedPomodoros || 1;
  const slice = todaysSlice(task, maxShare);
  const targetForDisplay = Math.min(estimated, completed + slice);

  const confidenceLabel = kr ? CONFIDENCE_META[kr.confidence].label : '';
  const isAtRisk = kr?.confidence === 'at_risk' || kr?.confidence === 'off_track';
  const whyReasons = getWhyReasons(task._score);

  // Render max 6 pomo segments for compact visualization
  const maxSegments = Math.min(6, Math.max(1, targetForDisplay));
  const filledSegments = Math.min(completed, maxSegments);

  return (
    <div className="focus-card today-now-card">
      <div className="today-now-main">
        {/* Badge row: NOW · #1 + Status Pill */}
        <div className="today-now-badge-row">
          <span className="today-now-rank-pill">NOW · #1</span>
          <span className={`today-now-status-pill ${isAtRisk ? 'at-risk' : 'on-track'}`}>
            {kr ? confidenceLabel : (isAtRisk ? 'At Risk' : 'On Track')}
          </span>
        </div>

        {/* Task Title */}
        <h2 className="today-now-title" title={task.title}>
          {task.title}
        </h2>

        {/* KR Link + Pomo Progress Segment Row */}
        <div className="today-now-kr-row">
          <div className="today-now-kr-text" title={kr ? `${objective ? objective.title + ' → ' : ''}${kr.title}` : 'No key result linked'}>
            <span className="today-kr-dot" />
            <span>
              {kr ? `${objective ? objective.title + ' → ' : ''}${kr.title}` : 'No key result linked'}
            </span>
          </div>

          <div className="today-now-pomo-bar">
            {Array.from({ length: maxSegments }).map((_, idx) => (
              <div
                key={idx}
                className={`today-pomo-segment ${idx < filledSegments ? 'filled' : ''}`}
              />
            ))}
            <span className="today-now-pomo-count">
              {completed}/{targetForDisplay}
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
          <Play size={14} fill="currentColor" />
          <span>Start</span>
        </button>

        <button
          className="today-btn-skip"
          onClick={onSkip}
          title="Skip this task for today"
        >
          <SkipForward size={14} />
          <span>Skip</span>
        </button>

        {/* Why this? tooltip */}
        <div style={{ position: 'relative' }}>
          <button
            className="btn-why"
            onMouseEnter={() => setShowWhy(true)}
            onMouseLeave={() => setShowWhy(false)}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '6px',
              color: '#727C8C',
              cursor: 'pointer',
              fontSize: '0.72rem',
              padding: '0.25rem 0.5rem',
            }}
            title="Why was this task picked for NOW?"
          >
            Why this?
          </button>

          {showWhy && (
            <div
              className="why-tooltip"
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 8px)',
                right: 0,
                background: '#151A22',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '8px',
                padding: '0.6rem 0.85rem',
                fontSize: '0.78rem',
                color: '#C6CDD8',
                whiteSpace: 'nowrap',
                zIndex: 50,
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem',
              }}
            >
              {whyReasons.map((r, i) => (
                <div key={i}>{r}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
