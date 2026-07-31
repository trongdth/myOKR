import { useState, useMemo } from 'react';
import { ClipboardList, BarChart3, Timer, Clock, CheckCircle, MessageSquare } from 'lucide-react';
import type { ReviewEntry, WeeklyReview, KeyResult, Objective, OKRCycle } from '../../lib/okr-storage';
import { getEffectiveCurrentValueAsOf } from '../../lib/okr-storage';
import type { PomodoroTask, DailyRecord } from '../../lib/pomodoro-storage';
import { computeWeekTaskPomos } from '../../lib/pomodoro-storage';
import type { Habit } from '../../lib/habit-storage';
import ReviewStepKR from './ReviewStepKR';

interface Props {
  weekStart: string;
  weekEnd: string;
  cycleId: string;
  objectives: Objective[];
  keyResults: KeyResult[];
  tasks: PomodoroTask[];
  history: DailyRecord[];
  reviews: WeeklyReview[];
  focusDurationMinutes: number;
  habits: Habit[];
  cycles: OKRCycle[];
  onComplete: (review: Omit<WeeklyReview, 'id'>) => void;
  onCancel: () => void;
}

export default function ReviewWizard({
  weekStart, weekEnd, cycleId,
  objectives, keyResults, tasks, history, reviews, focusDurationMinutes,
  habits, cycles,
  onComplete, onCancel,
}: Props) {
  // Build list of KRs to review (only those belonging to objectives in the active cycle)
  const cycleObjectives = objectives.filter(o => o.cycleId === cycleId);
  const cycleKRs = keyResults.filter(kr =>
    cycleObjectives.some(o => o.id === kr.objectiveId)
  );

  // Steps: 0 = summary, 1..N = KR steps, N+1 = reflection
  const totalSteps = cycleKRs.length + 2; // summary + KR steps + reflection
  const [currentStep, setCurrentStep] = useState(0);
  const [entries, setEntries] = useState<ReviewEntry[]>(() => {
    const completedReviews = reviews
      .filter(r => r.completedAt)
      .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));

    // Calculate previous Sunday timezone-safely (day before weekStart)
    const [y, m, dayVal] = weekStart.split('-').map(Number);
    const prevDate = new Date(Date.UTC(y, m - 1, dayVal));
    prevDate.setUTCDate(prevDate.getUTCDate() - 1);
    const previousSunday = prevDate.toISOString().slice(0, 10);

    return cycleKRs.map(kr => {
      const lastEntry = completedReviews
        .flatMap(r => r.entries)
        .find(e => e.keyResultId === kr.id);

      const isManual = kr.completionMode === 'manual' || !kr.completionMode;
      const previousValue = isManual
        ? (lastEntry ? lastEntry.currentValue : 0)
        : getEffectiveCurrentValueAsOf(kr, tasks, history, previousSunday, focusDurationMinutes, habits, objectives, cycles);

      const currentValue = isManual
        ? kr.currentValue
        : getEffectiveCurrentValueAsOf(kr, tasks, history, weekEnd, focusDurationMinutes, habits, objectives, cycles);

      return {
        keyResultId: kr.id,
        previousValue,
        currentValue,
        confidence: kr.confidence === 'not_set' ? 'on_track' : kr.confidence,
      };
    });
  });
  const [reflection, setReflection] = useState('');

  // Compute Pomodoro stats for this week
  const pomodoroStats = useMemo(() => {
    const weekDays = history.filter(r => r.date >= weekStart && r.date <= weekEnd);
    const totalPomodoros = weekDays.reduce((s, d) => s + d.completedPomodoros, 0);
    const totalFocusMinutes = weekDays.reduce((s, d) => s + d.totalFocusMinutes, 0);
    const tasksCompleted = tasks.filter(t =>
      t.isCompleted && t.completedAt && t.completedAt >= weekStart && t.completedAt <= weekEnd
    ).length;

    const weekTaskPomos = computeWeekTaskPomos(history, weekStart, weekEnd);
    const taskMap = new Map(tasks.map(t => [t.id, t]));

    const pomodorosByKeyResult: Record<string, number> = {};
    const linked: Record<string, Array<{ task: PomodoroTask | null; pomos: number }>> = {};

    for (const kr of cycleKRs) {
      const krTasks: Array<{ task: PomodoroTask | null; pomos: number }> = [];
      for (const [taskId, pomos] of weekTaskPomos) {
        const task = taskMap.get(taskId) || null;
        if (task?.keyResultId === kr.id || (!task && false)) {
          // Include deleted tasks — check if any remaining linked task matches
          // For deleted tasks we can't know the KR, so skip them for per-KR breakdown
        }
        if (task?.keyResultId === kr.id) {
          krTasks.push({ task, pomos });
        }
      }
      krTasks.sort((a, b) => b.pomos - a.pomos);
      linked[kr.id] = krTasks;
      pomodorosByKeyResult[kr.id] = krTasks.reduce((s, t) => s + t.pomos, 0);
    }

    return { totalPomodoros, totalFocusMinutes, tasksCompleted, pomodorosByKeyResult, linked };
  }, [weekStart, weekEnd, history, tasks, cycleKRs]);

  const updateEntry = (idx: number, updated: ReviewEntry) => {
    const next = [...entries];
    next[idx] = updated;
    setEntries(next);
  };

  const handleComplete = () => {
    const { linked, ...statsToSave } = pomodoroStats;
    onComplete({
      weekStartDate: weekStart,
      weekEndDate: weekEnd,
      cycleId,
      completedAt: new Date().toISOString(),
      entries,
      reflection: reflection.trim() || undefined,
      pomodoroStats: statsToSave,
    });
  };

  const isSummaryStep = currentStep === 0;
  const isReflectionStep = currentStep === totalSteps - 1;
  const krStepIndex = currentStep - 1; // 0-based index into cycleKRs

  return (
    <div className="review-wizard">
      {/* Header */}
      <div className="review-wizard-header">
        <span className="review-wizard-title">
          <ClipboardList size={16} className="icon-inline" /> Weekly review — Week of {weekStart}
        </span>
        <span className="review-wizard-step-info">
          Step {currentStep + 1} of {totalSteps}
        </span>
      </div>

      {/* Step indicator */}
      <div className="review-step-indicator">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            className={`review-step-dot${i < currentStep ? ' completed' : ''}${i === currentStep ? ' current' : ''}`}
          />
        ))}
      </div>

      {/* Step content */}
      <div className="review-step-content" key={currentStep}>
        {/* Summary step */}
        {isSummaryStep && (
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1em' }}>
              <BarChart3 size={16} className="icon-inline" /> This Week's Summary
            </div>
            <div className="review-stats-grid">
              <div className="review-stat-card">
                <div className="review-stat-icon"><Timer size={18} /></div>
                <div className="review-stat-value">{pomodoroStats.totalPomodoros}</div>
                <div className="review-stat-label">Pomodoros</div>
              </div>
              <div className="review-stat-card">
                <div className="review-stat-icon"><Clock size={18} /></div>
                <div className="review-stat-value">{pomodoroStats.totalFocusMinutes}m</div>
                <div className="review-stat-label">Focus Time</div>
              </div>
              <div className="review-stat-card">
                <div className="review-stat-icon"><CheckCircle size={18} /></div>
                <div className="review-stat-value">{pomodoroStats.tasksCompleted}</div>
                <div className="review-stat-label">Tasks Done</div>
              </div>
            </div>
            
            <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--bg-surface-hover)', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <strong>Pomodoro Breakdown:</strong> {Object.values(pomodoroStats.pomodorosByKeyResult).reduce((a, b) => a + b, 0)} linked to this cycle's KRs, {pomodoroStats.totalPomodoros - Object.values(pomodoroStats.pomodorosByKeyResult).reduce((a, b) => a + b, 0)} unlinked or other cycles
            </div>

            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.6, marginTop: '1.5rem' }}>
              You'll now review each of your <strong style={{ color: 'var(--text-primary)' }}>{cycleKRs.length} key result{cycleKRs.length !== 1 ? 's' : ''}</strong> to
              update progress and assess confidence. Let's go!
            </div>
          </div>
        )}

        {/* KR steps */}
        {!isSummaryStep && !isReflectionStep && krStepIndex >= 0 && krStepIndex < cycleKRs.length && (
          <ReviewStepKR
            entry={entries[krStepIndex]}
            keyResult={cycleKRs[krStepIndex]}
            objective={cycleObjectives.find(o => o.id === cycleKRs[krStepIndex].objectiveId)!}
            linkedTasksThisWeek={pomodoroStats.linked[cycleKRs[krStepIndex].id] || []}
            onChange={updated => updateEntry(krStepIndex, updated)}
          />
        )}

        {/* Reflection step */}
        {isReflectionStep && (
          <div className="review-reflection">
            <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5em' }}>
              <MessageSquare size={16} className="icon-inline" /> Overall Reflection
            </div>
            <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '1em', lineHeight: 1.5 }}>
              What went well this week? What could be improved? Any goals for next week?
            </div>
            <textarea
              className="review-notes-textarea"
              value={reflection}
              onChange={e => setReflection(e.target.value)}
              placeholder="Write your overall reflection for this week..."
              rows={5}
            />
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="review-wizard-nav">
        <button
          className="review-nav-btn"
          onClick={currentStep === 0 ? onCancel : () => setCurrentStep(currentStep - 1)}
        >
          {currentStep === 0 ? 'Cancel' : '← Previous'}
        </button>
        {isReflectionStep ? (
          <button className="review-nav-btn primary" onClick={handleComplete}>
            <CheckCircle size={14} className="icon-inline" /> Complete Review
          </button>
        ) : (
          <button
            className="review-nav-btn primary"
            onClick={() => setCurrentStep(currentStep + 1)}
          >
            Next →
          </button>
        )}
      </div>
    </div>
  );
}
