import { TrendingUp } from 'lucide-react';
import type { HabitAnalytics } from '../../lib/habit-storage';
import { habitAccentClass } from './habit-accent';

interface HabitAnalyticsProps {
  analytics: HabitAnalytics;
}

/**
 * 30-day consistency: overall rate + emerald trend badge (current vs previous
 * 30-day window), per-habit bars in the derived accent, and the computed
 * weak-day insight in an amber banner. Amber normally means streak-only; this
 * banner is the one carve-out (see docs/design-system.md).
 */
export default function HabitAnalytics({ analytics }: HabitAnalyticsProps) {
  return (
    <div className="habit-analytics">
      <div className="analytics-title">CONSISTENCY — LAST 30 DAYS</div>

      {analytics.isEmpty ? (
        <div className="analytics-empty">
          No habit data in the last 30 days yet — tick a few days to see your consistency here.
        </div>
      ) : (
        <>
          <div className="analytics-metric-row">
            <span className="analytics-metric">{analytics.overallRate}%</span>
            {analytics.trend !== null && (
              <span className={`analytics-trend${analytics.trend < 0 ? ' negative' : ''}`}>
                {analytics.trend > 0 ? '+' : ''}
                {analytics.trend} pts vs last month
              </span>
            )}
          </div>

          <div className="analytics-bars">
            {analytics.perHabit.map((h) => (
              <div key={h.habitId} className={`analytics-bar-row ${habitAccentClass(h.habitId)}`}>
                <span className="analytics-bar-name">{h.name}</span>
                <span className="analytics-bar-track">
                  <span className="analytics-bar-fill" style={{ width: `${h.rate}%` }} />
                </span>
                <span className="analytics-bar-rate">{h.rate}%</span>
              </div>
            ))}
          </div>

          {analytics.weakDay && (
            <div className="analytics-insight">
              <TrendingUp size={14} aria-hidden="true" />
              {analytics.weakDay.dayLabel}s are your weak day — {analytics.weakDay.rate}%
              completion across all habits.
            </div>
          )}
        </>
      )}
    </div>
  );
}
