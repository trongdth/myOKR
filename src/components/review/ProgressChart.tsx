import { useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import type { WeeklyReview, KeyResult } from '../../lib/okr-storage';

interface Props {
  reviews: WeeklyReview[];
  keyResults: KeyResult[];
}

const KR_COLORS = [
  '#06b6d4', '#a855f7', '#f97316', '#22c55e', '#eab308',
  '#ec4899', '#3b82f6', '#14b8a6', '#f43e5e', '#8b5cf6',
];

export default function ProgressChart({ reviews, keyResults }: Props) {
  const sortedReviews = useMemo(
    () => [...reviews].sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate)),
    [reviews],
  );

  // Get unique KR IDs that appear in reviews
  const krIds = useMemo(() => {
    const ids = new Set<string>();
    sortedReviews.forEach(r => r.entries.forEach(e => ids.add(e.keyResultId)));
    return Array.from(ids);
  }, [sortedReviews]);

  // Build data series
  const series = useMemo(() => {
    return krIds.map((krId, idx) => {
      const kr = keyResults.find(k => k.id === krId);
      const points = sortedReviews.map((review, reviewIdx) => {
        const entry = review.entries.find(e => e.keyResultId === krId);
        if (!entry || !kr || kr.targetValue === 0) return { x: reviewIdx, y: 0 };
        return { x: reviewIdx, y: Math.min(100, (entry.currentValue / kr.targetValue) * 100) };
      });
      return {
        krId,
        label: kr?.title || 'Unknown',
        color: KR_COLORS[idx % KR_COLORS.length],
        points,
      };
    });
  }, [krIds, sortedReviews, keyResults]);

  if (sortedReviews.length < 2) {
    return (
      <div className="progress-chart-container">
        <div className="progress-chart-title"><TrendingUp size={16} className="icon-inline" /> Progress Over Time</div>
        <div style={{ textAlign: 'center', padding: '2em', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
          Complete at least 2 weekly reviews to see your progress chart
        </div>
      </div>
    );
  }

  // Chart dimensions
  const width = 600;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const xScale = (i: number) => padding.left + (i / (sortedReviews.length - 1)) * chartW;
  const yScale = (v: number) => padding.top + chartH - (v / 100) * chartH;

  return (
    <div className="progress-chart-container">
      <div className="progress-chart-title"><TrendingUp size={16} className="icon-inline" /> Progress Over Time</div>
      <svg className="progress-chart-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(v => (
          <g key={v}>
            <line
              className="progress-chart-grid-line"
              x1={padding.left} y1={yScale(v)}
              x2={width - padding.right} y2={yScale(v)}
            />
            <text className="progress-chart-label" x={padding.left - 6} y={yScale(v) + 3} textAnchor="end">
              {v}%
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {sortedReviews.map((review, i) => {
          const label = review.weekStartDate.slice(5); // MM-DD
          return (
            <text
              key={i}
              className="progress-chart-label"
              x={xScale(i)}
              y={height - 5}
              textAnchor="middle"
            >
              {label}
            </text>
          );
        })}

        {/* Lines and dots */}
        {series.map(s => {
          const pathD = s.points
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.x)} ${yScale(p.y)}`)
            .join(' ');
          return (
            <g key={s.krId}>
              <path className="progress-chart-line" d={pathD} stroke={s.color} />
              {s.points.map((p, i) => (
                <circle
                  key={i}
                  className="progress-chart-dot"
                  cx={xScale(p.x)}
                  cy={yScale(p.y)}
                  r={3}
                  fill={s.color}
                  stroke="var(--bg-card)"
                >
                  <title>{`${s.label}: ${Math.round(p.y)}%`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="progress-chart-legend">
        {series.map(s => (
          <div key={s.krId} className="progress-chart-legend-item">
            <div className="progress-chart-legend-swatch" style={{ background: s.color }} />
            <span>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
