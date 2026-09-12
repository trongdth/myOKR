import { diffDays, projectedEndpoint, type CycleSpan, type EntitySeries } from '../../../lib/pace';

/**
 * Trajectory — the selected entity's weekly percent-of-target across the
 * full cycle span. Geometry is literal from the R3 spec (amended: dots plot
 * on their own W tick; every week W1..Wn is labelled plus `end` at the
 * closed date; 0% sits at y 128 so the four spec gridlines y 8/48/88/128
 * carry the labels): viewBox 0 0 380 170, plot x 30..370, baseline y 145.
 * Weeks with no data break the line (segments split where weekIndex jumps);
 * a dashed projection extends the last data point to cycle close at the
 * current rate.
 */
const X0 = 30;
const X1 = 370;
const Y_TOP = 8;
const Y_ZERO = 128;
const BASELINE = 145;
const LABEL_Y = 161;

interface TrajectoryCardProps {
  title: string;
  subtitle: string;
  series: EntitySeries;
  span: CycleSpan;
  marker: number;
  cycleClosed: boolean;
}

export default function TrajectoryCard({ title, subtitle, series, span, marker, cycleClosed }: TrajectoryCardProps) {
  const totalDays = Math.max(diffDays(span.start, span.end), 1);
  const x = (dayOffset: number) => X0 + (dayOffset / totalDays) * (X1 - X0);
  const y = (pct: number) => Y_ZERO - (Math.min(100, Math.max(0, pct)) / 100) * (Y_ZERO - Y_TOP);
  // The four spec gridlines carry the whole scale: 100 at the top, 50 mid,
  // 0 at y 128, with the axis baseline a separate rule below.
  const gridYs = [Y_TOP, (Y_TOP + Y_ZERO) / 2, Y_TOP + (Y_ZERO - Y_TOP) * 0.75, Y_ZERO];

  // Consecutive weeks join into one polyline; a weekIndex jump is a gap.
  const runs: { d: string; points: EntitySeries['points'] }[] = [];
  for (const point of series.points) {
    const last = runs[runs.length - 1];
    const prev = last?.points[last.points.length - 1];
    const joins = prev != null && point.weekIndex === prev.weekIndex + 1;
    if (!last || !joins) runs.push({ d: '', points: [point] });
    else last.points.push(point);
  }
  for (const run of runs) {
    run.d = run.points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.dayOffset).toFixed(1)},${y(p.pct).toFixed(1)}`)
      .join(' ');
  }

  const lastPoint = series.points[series.points.length - 1] ?? null;
  const showProjection = lastPoint !== null && marker > 0 && marker < 100 && !cycleClosed;
  // "Extends the last data point to cycle close at the current rate" — when
  // the last point is current this is exactly the projected landing the
  // callout quotes; a stale point starts from itself, not from today.
  const projectionEndPct = lastPoint && showProjection
    ? projectedEndpoint(lastPoint.pct, series.currentPct, marker)
    : 0;

  return (
    <section className="obj-card-panel obj-trajectory" aria-label="Trajectory">
      <h3 className="obj-panel-eyebrow">TRAJECTORY</h3>
      <h4 className="obj-trajectory-title" title={title}>{title}</h4>
      <p className="obj-trajectory-sub">{subtitle}</p>
      {series.points.length === 0 ? (
        <div className="obj-trajectory-empty">Nothing logged yet</div>
      ) : (
        <>
          <svg className="obj-trajectory-svg" viewBox="0 0 380 170" role="img" aria-label={`Weekly trajectory for ${title}`}>
            {gridYs.map(gy => (
              <line key={gy} className="obj-tj-grid" x1={X0} y1={gy} x2={X1} y2={gy} />
            ))}
            <line className="obj-tj-baseline" x1={X0} y1={BASELINE} x2={X1} y2={BASELINE} />

            <text className="obj-tj-ylab" x={X0 - 6} y={Y_TOP + 3} textAnchor="end">100</text>
            <text className="obj-tj-ylab" x={X0 - 6} y={(Y_TOP + Y_ZERO) / 2 + 3} textAnchor="end">50</text>
            <text className="obj-tj-ylab" x={X0 - 6} y={Y_ZERO + 3} textAnchor="end">0</text>

            {/* Every cycle week labelled, plus `end` at the closed date. */}
            {span.mondays.map((monday, i) => (
              <text key={monday} className="obj-tj-xlab" x={x(i * 7)} y={LABEL_Y} textAnchor="middle">
                W{i + 1}
              </text>
            ))}
            <text className="obj-tj-endlab" x={X1} y={LABEL_Y} textAnchor="end">end</text>

            <line className="obj-tj-pace" x1={x(0)} y1={y(0)} x2={X1} y2={y(100)} />

            {runs.map((run, i) => (
              <path key={i} className="obj-tj-actual" d={run.d} fill="none" />
            ))}
            {showProjection && (
              <path
                className="obj-tj-proj"
                d={`M${x(lastPoint.dayOffset).toFixed(1)},${y(lastPoint.pct).toFixed(1)} L${X1},${y(projectionEndPct).toFixed(1)}`}
                fill="none"
              />
            )}
            {series.points.map((p, i) => (
              <circle key={i} className="obj-tj-dot" cx={x(p.dayOffset)} cy={y(p.pct)} r={3.2}>
                <title>{`${p.pct}% · week ${p.weekIndex + 1}${p.live ? ' (this week)' : ''}`}</title>
              </circle>
            ))}
          </svg>
          <div className="obj-legend">
            <span className="obj-legend-item"><span className="obj-legend-swatch" /> actual</span>
            <span className="obj-legend-item"><span className="obj-legend-swatch pace" /> pace needed</span>
          </div>
        </>
      )}
    </section>
  );
}
