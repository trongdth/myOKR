/**
 * Cycle roll-up — the whole cycle's unweighted-mean percent with the pace
 * tick on its bar and the points-behind/ahead footer. Pinned to the right
 * column's bottom (margin-top: auto).
 */
interface RollupCardProps {
  pct: number;
  objectiveCount: number;
  krCount: number;
  marker: number;
}

export default function RollupCard({ pct, objectiveCount, krCount, marker }: RollupCardProps) {
  const diff = marker - pct;
  const footer = diff > 0
    ? `${diff} points behind the pace marker`
    : diff < 0
      ? `${-diff} points ahead of the pace marker`
      : 'right on the pace marker';

  return (
    <section className="obj-card-panel obj-rollup" aria-label="Cycle roll-up">
      <h3 className="obj-panel-eyebrow">CYCLE ROLL-UP</h3>
      <div className="obj-rollup-number-row">
        <span className="obj-rollup-number">{pct}<small>%</small></span>
        <span className="obj-rollup-caption">
          across {objectiveCount} objective{objectiveCount === 1 ? '' : 's'}, {krCount} key result{krCount === 1 ? '' : 's'}
        </span>
      </div>
      <div className="obj-rollup-track" role="img" aria-label={`Cycle roll-up ${pct}%, pace marker at ${marker}%`}>
        <span className="obj-rollup-fill" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
        <span className="obj-pace-tick" style={{ left: `${Math.min(100, Math.max(0, marker))}%` }} />
      </div>
      <span className="obj-rollup-footer">{footer}</span>
    </section>
  );
}
