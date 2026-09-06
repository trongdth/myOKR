import type { ReviewEntry, KeyResult, Objective } from '../../lib/okr-storage';
import type { PomodoroTask } from '../../lib/pomodoro-storage';
import ReviewStepKR from './ReviewStepKR';

// Step 2 — Score key results: every KR of the cycle on one screen. Values
// carry over from tasks; derived KRs are read-only, manual ones editable
// (ADR-0019 — no per-week overrides).

export interface ScoreRow {
  entry: ReviewEntry;
  keyResult: KeyResult;
  objective: Objective;
  linkedTasksThisWeek: Array<{ task: PomodoroTask | null; pomos: number }>;
  atRiskWeeksRunning: number; // 0 = no streak
}

function DeltaChip({ entry }: { entry: ReviewEntry }) {
  const delta = Math.round((entry.currentValue - entry.previousValue) * 100) / 100;
  if (delta > 0) return <span className="rw-delta rw-delta-pos">+{delta} this week</span>;
  if (delta < 0) return <span className="rw-delta rw-delta-neg">−{Math.abs(delta)} this week</span>;
  return <span className="rw-delta rw-delta-zero">no change</span>;
}

export default function ScoreKeyResults({
  rows,
  onChange,
}: {
  rows: ScoreRow[];
  onChange: (keyResultId: string, updated: ReviewEntry) => void;
}) {
  return (
    <div className="rw-score">
      <div className="rw-step-heading">
        <h2>Where did each key result land?</h2>
        <p>Values carried over from your tasks — adjust anything that moved off-app.</p>
      </div>

      <div className="rw-score-rows">
        {rows.map(row => (
          <div key={row.keyResult.id} className="rw-score-row">
            {row.atRiskWeeksRunning > 0 && (
              <div className="rw-risk-banner">
                Flagged at risk {row.atRiskWeeksRunning + 1} weeks running.
              </div>
            )}
            <div className="rw-score-row-head">
              <span className="rw-score-row-title">{row.keyResult.title}</span>
              <DeltaChip entry={row.entry} />
            </div>
            <ReviewStepKR
              entry={row.entry}
              keyResult={row.keyResult}
              objective={row.objective}
              linkedTasksThisWeek={row.linkedTasksThisWeek}
              onChange={updated => onChange(row.keyResult.id, updated)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
