import type { Confidence } from '../../lib/okr-storage';
import { CONFIDENCE_META } from '../../lib/okr-storage';
import type { ReviewEntry, KeyResult, Objective } from '../../lib/okr-storage';

interface Props {
  entry: ReviewEntry;
  keyResult: KeyResult;
  objective: Objective;
  pomodoroCount: number;
  linkedTaskCount: number;
  onChange: (updated: ReviewEntry) => void;
}

const CONFIDENCE_OPTIONS: Confidence[] = ['on_track', 'at_risk', 'off_track'];

export default function ReviewStepKR({ entry, keyResult, objective, pomodoroCount, linkedTaskCount, onChange }: Props) {
  return (
    <div className="review-kr-step">
      {/* Header */}
      <div className="review-kr-header">
        <span className="review-kr-objective-label">🎯 {objective.title}</span>
        <span className="review-kr-title">{keyResult.title}</span>
      </div>

      {/* Progress update */}
      <div className="review-kr-progress">
        <div className="review-kr-previous">
          <span className="review-kr-previous-label">Previous</span>
          <span className="review-kr-previous-value">{entry.previousValue}</span>
        </div>
        <span className="review-kr-arrow">→</span>
        <div className="review-kr-current">
          <span className="review-kr-current-label">Current</span>
          <input
            type="number"
            className="review-kr-current-input"
            value={entry.currentValue}
            min={0}
            onChange={e => onChange({ ...entry, currentValue: parseInt(e.target.value) || 0 })}
          />
        </div>
        <span className="review-kr-target">/ {keyResult.targetValue} {keyResult.unit}</span>
      </div>

      {/* Confidence */}
      <div>
        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5em' }}>
          How confident are you?
        </div>
        <div className="review-confidence-group">
          {CONFIDENCE_OPTIONS.map(c => {
            const meta = CONFIDENCE_META[c];
            const cls = c.replace('_', '-');
            return (
              <button
                key={c}
                className={`review-confidence-btn ${cls}${entry.confidence === c ? ' selected' : ''}`}
                onClick={() => onChange({ ...entry, confidence: c })}
              >
                {meta.icon} {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pomodoro insight */}
      {(pomodoroCount > 0 || linkedTaskCount > 0) && (
        <div className="review-pomo-insight">
          <span className="review-pomo-insight-icon">📊</span>
          <span>
            {pomodoroCount > 0 && `${pomodoroCount} pomodoro${pomodoroCount !== 1 ? 's' : ''} completed`}
            {pomodoroCount > 0 && linkedTaskCount > 0 && ' across '}
            {linkedTaskCount > 0 && `${linkedTaskCount} linked task${linkedTaskCount !== 1 ? 's' : ''}`}
            {pomodoroCount === 0 && linkedTaskCount === 0 && 'No activity this week'}
            {' this week'}
          </span>
        </div>
      )}

      {/* Notes */}
      <div>
        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5em' }}>
          Notes
        </div>
        <textarea
          className="review-notes-textarea"
          value={entry.note || ''}
          onChange={e => onChange({ ...entry, note: e.target.value })}
          placeholder="What progress did you make? What's blocking you?"
          rows={3}
        />
      </div>
    </div>
  );
}
