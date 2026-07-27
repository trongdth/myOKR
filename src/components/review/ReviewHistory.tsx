import { useState, useMemo } from 'react';
import { BookOpen, Timer, Clock, CheckCircle, X, Pencil, MessageSquare } from 'lucide-react';
import type { WeeklyReview, ReviewEntry, KeyResult, Objective, Confidence } from '../../lib/okr-storage';
import { CONFIDENCE_META } from '../../lib/okr-storage';
import type { PomodoroTask, DailyRecord } from '../../lib/pomodoro-storage';
import { computeWeekTaskPomos } from '../../lib/pomodoro-storage';
import NumberInput from '../NumberInput';
import ConfirmModal from '../ConfirmModal';
import LinkedTasksThisWeek from './LinkedTasksThisWeek';

interface Props {
  reviews: WeeklyReview[];
  keyResults: KeyResult[];
  objectives: Objective[];
  tasks: PomodoroTask[];
  history: DailyRecord[];
  onDelete: (id: string) => void;
  onEdit: (review: WeeklyReview) => void;
}

export default function ReviewHistory({ reviews, keyResults, tasks, history, onDelete, onEdit }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editEntry, setEditEntry] = useState<ReviewEntry | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const sorted = [...reviews]
    .filter(r => r.completedAt)
    .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));

  // Memoize per-review linked task data
  const reviewLinkedMap = useMemo(() => {
    const map = new Map<string, Record<string, Array<{ task: PomodoroTask | null; pomos: number }>>>();
    const taskMap = new Map(tasks.map(t => [t.id, t]));

    for (const review of sorted) {
      const weekPomos = computeWeekTaskPomos(history, review.weekStartDate, review.weekEndDate);
      const byKr: Record<string, Array<{ task: PomodoroTask | null; pomos: number }>> = {};

      for (const entry of review.entries) {
        const krId = entry.keyResultId;
        const krTasks: Array<{ task: PomodoroTask | null; pomos: number }> = [];
        for (const [taskId, pomos] of weekPomos) {
          const task = taskMap.get(taskId) || null;
          if (task?.keyResultId === krId) {
            krTasks.push({ task, pomos });
          }
        }
        krTasks.sort((a, b) => b.pomos - a.pomos);
        byKr[krId] = krTasks;
      }
      map.set(review.id, byKr);
    }
    return map;
  }, [sorted, tasks, history]);

  const getLinkedForKr = (reviewId: string, krId: string) => {
    const byKr = reviewLinkedMap.get(reviewId);
    return byKr?.[krId] || [];
  };

  const startEntryEdit = (entry: ReviewEntry) => {
    setEditingEntryId(entry.keyResultId);
    setEditEntry({ ...entry });
  };

  const cancelEntryEdit = () => {
    setEditingEntryId(null);
    setEditEntry(null);
  };

  const saveEntryEdit = (review: WeeklyReview) => {
    if (!editEntry) return;
    onEdit({
      ...review,
      entries: review.entries.map(e => e.keyResultId === editEntry.keyResultId ? editEntry : e),
    });
    setEditingEntryId(null);
    setEditEntry(null);
  };

  if (sorted.length === 0) {
    return (
      <div className="review-history-section">
        <div className="review-history-title"><BookOpen size={16} style={{ verticalAlign: 'text-bottom' }} /> Past Reviews</div>
        <div className="review-history-empty">
          No completed reviews yet. Complete your first weekly review to see history here.
        </div>
      </div>
    );
  }

  return (
    <div className="review-history-section">
      <div className="review-history-title"><BookOpen size={16} style={{ verticalAlign: 'text-bottom' }} /> Past Reviews ({sorted.length})</div>
      <div className="review-history-list">
        {sorted.map(review => {
          const isExpanded = expandedId === review.id;
          const confidenceSummary = review.entries.map(e => e.confidence);

          return (
            <div
              key={review.id}
              className={`review-history-card${editingEntryId ? ' editing' : ''}`}
              onClick={() => {
                if (!editingEntryId) setExpandedId(isExpanded ? null : review.id);
              }}
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
                <span><Timer size={12} style={{ verticalAlign: 'text-bottom' }} /> {review.pomodoroStats.totalPomodoros} pomodoros</span>
                <span><Clock size={12} style={{ verticalAlign: 'text-bottom' }} /> {review.pomodoroStats.totalFocusMinutes}m focus</span>
                <span><CheckCircle size={12} style={{ verticalAlign: 'text-bottom' }} /> {review.pomodoroStats.tasksCompleted} tasks</span>
                <div className="review-history-inline-actions">
                  <button
                    className="review-delete-btn"
                    onClick={e => { e.stopPropagation(); setDeleteTargetId(review.id); }}
                    title="Delete review"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="review-history-details" onClick={e => { if (editingEntryId) e.stopPropagation(); }}>
                  {review.entries.map(entry => {
                    const kr = keyResults.find(k => k.id === entry.keyResultId);
                    const isEditingThis = editingEntryId === entry.keyResultId;
                    const linkedForKr = getLinkedForKr(review.id, entry.keyResultId);

                    if (isEditingThis && editEntry) {
                      return (
                        <div key={entry.keyResultId} className="review-history-edit-entry">
                          <div className="review-history-edit-entry-title">
                            {kr?.title || 'Unknown KR'}
                          </div>
                          <div className="review-history-edit-row">
                            <label className="review-history-edit-label">Value</label>
                            {kr?.completionMode && kr.completionMode !== 'manual' ? (
                              <span className="review-history-edit-readonly">
                                {editEntry.currentValue} {kr?.unit}
                                <span className="review-history-edit-auto">auto</span>
                              </span>
                            ) : (
                              <div className="review-history-edit-value">
                                <NumberInput
                                  className="review-kr-current-input"
                                  value={editEntry.currentValue}
                                  min={0}
                                  onChange={val => setEditEntry({ ...editEntry, currentValue: val })}
                                />
                                <span className="review-history-edit-unit">{kr?.unit}</span>
                              </div>
                            )}
                          </div>
                          <div className="review-history-edit-row">
                            <label className="review-history-edit-label">Confidence</label>
                            <div className="review-confidence-group" style={{ flex: 1 }}>
                              {(['on_track', 'at_risk', 'off_track'] as Confidence[]).map(c => (
                                <button
                                  key={c}
                                  className={`review-confidence-btn ${c.replace('_', '-')}${editEntry.confidence === c ? ' selected' : ''}`}
                                  onClick={() => setEditEntry({ ...editEntry, confidence: c })}
                                >
                                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: CONFIDENCE_META[c].color, display: 'inline-block', flexShrink: 0 }} /> {CONFIDENCE_META[c].label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="review-history-edit-row review-history-edit-row-note">
                            <label className="review-history-edit-label">Note</label>
                            <textarea
                              className="review-history-edit-textarea"
                              value={editEntry.note || ''}
                              onChange={e => setEditEntry({ ...editEntry, note: e.target.value })}
                              placeholder="Add a note..."
                              rows={2}
                            />
                          </div>
                          <div className="review-history-edit-actions">
                            <button className="review-nav-btn" onClick={cancelEntryEdit}>Cancel</button>
                            <button className="review-nav-btn primary" onClick={() => saveEntryEdit(review)}>Save</button>
                          </div>
                        </div>
                      );
                    }

                    const meta = CONFIDENCE_META[entry.confidence];
                    return (
                      <div key={entry.keyResultId}>
                        <div className="review-history-entry">
                          <span className="review-history-entry-icon">{meta.icon}</span>
                          <span className="review-history-entry-title">
                            {kr?.title || 'Unknown KR'}
                          </span>
                          <span className="review-history-entry-change">
                            {entry.previousValue} → {entry.currentValue}
                          </span>
                          <button
                            className="review-history-action-btn edit"
                            onClick={e => { e.stopPropagation(); startEntryEdit(entry); }}
                          >
                            <Pencil size={14} />
                          </button>
                        </div>
                        {linkedForKr.length > 0 && (
                          <div style={{ marginLeft: '2em', marginTop: '0.25em' }}>
                            <LinkedTasksThisWeek linkedTasksThisWeek={linkedForKr} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {review.reflection && (
                    <div className="review-history-reflection">
                      <MessageSquare size={14} style={{ verticalAlign: 'text-bottom' }} /> {review.reflection}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmModal
        isOpen={deleteTargetId !== null}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={() => {
          if (deleteTargetId) {
            onDelete(deleteTargetId);
            if (expandedId === deleteTargetId) setExpandedId(null);
            setDeleteTargetId(null);
          }
        }}
        title="Delete Review"
        message="Are you sure you want to delete this review? This action cannot be undone."
        confirmText="Delete"
      />
    </div>
  );
}
