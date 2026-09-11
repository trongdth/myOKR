import type { ReviewEntry } from '../../lib/okr-storage';
import ReviewStepKR, { type ScoreRow } from './ReviewStepKR';

// Step 2 — Score key results: every key result of the cycle inside ONE card,
// one compact row each (grilling round 4). Values carry over from tasks;
// derived KRs are read-only, manual ones editable (ADR-0019 — no per-week
// overrides).

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

      <div className="rw-score-card">
        {rows.map(row => (
          <div key={row.keyResult.id} className="rw-score-row">
            <ReviewStepKR
              row={row}
              onChange={updated => onChange(row.keyResult.id, updated)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
