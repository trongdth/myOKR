import { useState } from 'react';
import type { WeeklyReview, KeyResult, Objective } from '../../lib/okr-storage';
import { CONFIDENCE_META } from '../../lib/okr-storage';

interface Props {
  reviews: WeeklyReview[];
  keyResults: KeyResult[];
  objectives: Objective[];
}

export default function ReviewHistory({ reviews, keyResults }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = [...reviews]
    .filter(r => r.completedAt)
    .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));

  if (sorted.length === 0) {
    return (
      <div className="review-history-section">
        <div className="review-history-title">📚 Past Reviews</div>
        <div className="review-history-empty">
          No completed reviews yet. Complete your first weekly review to see history here.
        </div>
      </div>
    );
  }

  return (
    <div className="review-history-section">
      <div className="review-history-title">📚 Past Reviews ({sorted.length})</div>
      <div className="review-history-list">
        {sorted.map(review => {
          const isExpanded = expandedId === review.id;
          const confidenceSummary = review.entries.map(e => e.confidence);

          return (
            <div
              key={review.id}
              className="review-history-card"
              onClick={() => setExpandedId(isExpanded ? null : review.id)}
            >
              <div className="review-history-card-header">
                <span className="review-history-date">
                  Week of {review.weekStartDate}
                </span>
                <div className="review-history-confidence-dots">
                  {confidenceSummary.map((c, i) => (
                    <div
                      key={i}
                      className="review-history-dot"
                      style={{ background: CONFIDENCE_META[c].color }}
                      title={CONFIDENCE_META[c].label}
                    />
                  ))}
                </div>
              </div>
              <div className="review-history-stats">
                <span>🍅 {review.pomodoroStats.totalPomodoros} pomodoros</span>
                <span>⏱ {review.pomodoroStats.totalFocusMinutes}m focus</span>
                <span>✅ {review.pomodoroStats.tasksCompleted} tasks</span>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="review-history-details">
                  {review.entries.map(entry => {
                    const kr = keyResults.find(k => k.id === entry.keyResultId);
                    const meta = CONFIDENCE_META[entry.confidence];
                    return (
                      <div key={entry.keyResultId} className="review-history-entry">
                        <span className="review-history-entry-icon">{meta.icon}</span>
                        <span className="review-history-entry-title">
                          {kr?.title || 'Unknown KR'}
                        </span>
                        <span className="review-history-entry-change">
                          {entry.previousValue} → {entry.currentValue}
                        </span>
                      </div>
                    );
                  })}
                  {review.reflection && (
                    <div className="review-history-reflection">
                      💭 {review.reflection}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
