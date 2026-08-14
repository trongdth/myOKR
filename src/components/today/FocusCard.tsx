import { useState } from 'react';
import { Timer, Play, X } from 'lucide-react';
import type { PomodoroTask } from '../../lib/pomodoro-storage';
import type { KeyResult, Objective } from '../../lib/okr-storage';
import { EISENHOWER_META } from '../../lib/pomodoro-storage';
import { CONFIDENCE_META, formatKrSubtitle } from '../../lib/okr-storage';
import type { ScoreBreakdown } from '../../lib/today-focus';
import { getWhyReasons } from '../../lib/today-focus';

interface FocusCardProps {
  task: PomodoroTask & { _score: ScoreBreakdown };
  kr?: KeyResult;
  objective?: Objective;
  rank: number;
  isTop: boolean;
  maxShare: number;
  onStart: () => void;
  onSkip: () => void;
}

export default function FocusCard({ task, kr, objective, rank, isTop, maxShare, onStart, onSkip }: FocusCardProps) {
  const [showWhy, setShowWhy] = useState(false);
  const catMeta = task.category ? EISENHOWER_META[task.category] || null : null;
  const confidenceColor = kr ? CONFIDENCE_META[kr.confidence].color : undefined;
  const remaining = Math.max(0, (task.estimatedPomodoros || 1) - task.completedPomodoros);
  const spansDays = remaining > maxShare;

  const whyReasons = getWhyReasons(task._score);

  return (
    <div className="focus-card" style={{
      background: 'var(--bg-card)',
      border: isTop ? '1px solid var(--accent-cyan)' : '1px solid var(--border-color)',
      borderRadius: '12px',
      padding: '1.25rem 1.5rem',
      position: 'relative',
      transition: 'all var(--transition-normal)',
    }}>
      {/* Rank badge */}
      <span style={{
        position: 'absolute',
        top: '0.75rem',
        right: '0.75rem',
        fontSize: '0.75rem',
        fontWeight: 700,
        color: 'var(--text-muted)',
        background: 'var(--bg-tertiary)',
        borderRadius: '6px',
        padding: '0.15em 0.5em',
      }}>#{rank}</span>

      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', paddingRight: '2rem' }}>
        {catMeta && <span className="confidence-dot" style={{ background: catMeta.color }} />}
        <span style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--text-primary)' }}>{task.title}</span>
      </div>

      {/* Meta row: KR link + confidence dot */}
      {kr && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
          {confidenceColor && <span className="confidence-dot" style={{ background: confidenceColor }} />}
          <span>{formatKrSubtitle(kr, objective)}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({CONFIDENCE_META[kr.confidence].label})</span>
        </div>
      )}

      {/* Progress row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><Timer size={12} /> {task.completedPomodoros} / {task.estimatedPomodoros}</span>
        {catMeta && (
          <span style={{
            background: catMeta.bgColor,
            color: catMeta.color,
            padding: '0.1em 0.5em',
            borderRadius: '4px',
            fontSize: '0.7rem',
            fontWeight: 600,
          }}>{catMeta.label}</span>
        )}
        {spansDays && (
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            spans multiple days
          </span>
        )}
      </div>

      {/* Actions row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {isTop && (
          <button className="btn" onClick={onStart} style={{ fontSize: '0.85rem', padding: '0.4em 1.2em', gap: '0.4em' }}>
            <Play size={14} /> Start
          </button>
        )}
        <button
          onClick={onSkip}
          style={{
            background: 'none',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '0.8rem',
            padding: '0.3em 0.6em',
          }}
          title="Skip this task"
        >
          <X size={12} /> Skip
        </button>

        {/* Why this? chip */}
        <div style={{ position: 'relative', marginLeft: 'auto' }}>
          <button
            onMouseEnter={() => setShowWhy(true)}
            onMouseLeave={() => setShowWhy(false)}
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '0.7rem',
              padding: '0.2em 0.5em',
            }}
          >
            Why this?
          </button>
          {showWhy && (
            <div style={{
              position: 'absolute',
              bottom: 'calc(100% + 8px)',
              right: 0,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '0.6rem 0.85rem',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              whiteSpace: 'nowrap',
              zIndex: 50,
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
            }}>
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
