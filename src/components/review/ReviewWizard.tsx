import { useState, useEffect, useMemo, useRef } from 'react';
import { Check } from 'lucide-react';
import type { ReviewEntry, ReviewPrompt, WeeklyReview, KeyResult, Objective, OKRCycle } from '../../lib/okr-storage';
import { getEffectiveCurrentValueAsOf, isDraftReview, findReviewForWeek, saveReviewDraft } from '../../lib/okr-storage';
import type { PomodoroTask, DailyRecord } from '../../lib/pomodoro-storage';
import { computeWeekTaskPomos } from '../../lib/pomodoro-storage';
import type { Habit } from '../../lib/habit-storage';
import {
  computeWeekGlance, computeKrMoves, computeAtRiskStreaks, countWeekSessions,
  cycleHasDerivedKrs, buildReflectPrompts, previousWeekCommitment,
  type ReviewInsightsInput,
} from '../../lib/review-insights';
import WeekAtAGlance from './WeekAtAGlance';
import ScoreKeyResults, { type ScoreRow } from './ScoreKeyResults';
import ReflectStep from './ReflectStep';

const STEP_LABELS = ['Week at a glance', 'Score key results', 'Reflect'];
const STEP_FOOTNOTES = [
  'Step 1 of 3 · about 4 minutes left',
  'Step 2 of 3 · about 2 minutes left',
  'Step 3 of 3 · answers autosave',
];

interface Props {
  weekStart: string;
  weekEnd: string;
  cycleId: string;
  todayStr: string;
  objectives: Objective[];
  keyResults: KeyResult[];
  tasks: PomodoroTask[];
  history: DailyRecord[];
  reviews: WeeklyReview[];
  focusDurationMinutes: number;
  habits: Habit[];
  cycles: OKRCycle[];
  onComplete: (review: Omit<WeeklyReview, 'id'>) => void;
  onDraftSaved?: () => void;
  onLinkSessions?: () => void;
}

export default function ReviewWizard({
  weekStart, weekEnd, cycleId, todayStr,
  objectives, keyResults, tasks, history, reviews, focusDurationMinutes,
  habits, cycles,
  onComplete, onDraftSaved, onLinkSessions,
}: Props) {
  const cycleObjectives = useMemo(() => objectives.filter(o => o.cycleId === cycleId), [objectives, cycleId]);
  const cycleKRs = useMemo(
    () => keyResults.filter(kr => cycleObjectives.some(o => o.id === kr.objectiveId)),
    [keyResults, cycleObjectives],
  );

  const existing = findReviewForWeek(reviews, weekStart);
  const draft = existing && isDraftReview(existing) ? existing : null;

  // Entries: an in-progress draft wins; otherwise values carry over from
  // tasks (derived) and the KR itself (manual). Confidence starts unset so
  // "N of M key results scored" is honest.
  const initialEntries = useMemo<ReviewEntry[]>(() => {
    if (draft && draft.entries.length > 0) return draft.entries;
    const completedReviews = reviews
      .filter(r => r.completedAt)
      .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));

    const [y, m, dayVal] = weekStart.split('-').map(Number);
    const prevDate = new Date(Date.UTC(y, m - 1, dayVal));
    prevDate.setUTCDate(prevDate.getUTCDate() - 1);
    const previousSunday = prevDate.toISOString().slice(0, 10);

    return cycleKRs.map(kr => {
      const lastEntry = completedReviews.flatMap(r => r.entries).find(e => e.keyResultId === kr.id);
      const isManual = kr.completionMode === 'manual' || !kr.completionMode;
      return {
        keyResultId: kr.id,
        previousValue: isManual
          ? (lastEntry ? lastEntry.currentValue : 0)
          : getEffectiveCurrentValueAsOf(kr, tasks, history, previousSunday, focusDurationMinutes, habits, objectives, cycles),
        currentValue: isManual
          ? kr.currentValue
          : getEffectiveCurrentValueAsOf(kr, tasks, history, weekEnd, focusDurationMinutes, habits, objectives, cycles),
        confidence: kr.confidence,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const insightsInput = useMemo<ReviewInsightsInput>(() => ({
    weekStart, weekEnd, todayStr, cycleId,
    tasks, history, habits, keyResults, objectives, cycles, reviews,
    focusDurationMinutes,
  }), [weekStart, weekEnd, todayStr, cycleId, tasks, history, habits, keyResults, objectives, cycles, reviews, focusDurationMinutes]);

  const initialPrompts = useMemo<ReviewPrompt[]>(() => {
    if (draft && draft.prompts && draft.prompts.length > 0) return draft.prompts;
    return buildReflectPrompts(insightsInput);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [entries, setEntries] = useState<ReviewEntry[]>(initialEntries);
  const [prompts, setPrompts] = useState<ReviewPrompt[]>(initialPrompts);
  const [currentStep, setCurrentStep] = useState(() => {
    // Fresh week: start at the glance. Resuming a draft: first step with
    // unanswered work (grilling decision 14).
    if (!draft) return 0;
    const unscored = initialEntries.some(e => e.confidence === 'not_set');
    if (unscored) return 1;
    const unanswered = initialPrompts.some(p => !p.answer.trim());
    if (unanswered) return 2;
    return 0;
  });

  const glance = useMemo(() => computeWeekGlance(insightsInput), [insightsInput]);
  const moves = useMemo(() => computeKrMoves(insightsInput), [insightsInput]);
  const unlinked = useMemo(() => countWeekSessions(insightsInput), [insightsInput]);
  const streaks = useMemo(() => computeAtRiskStreaks(reviews, weekStart), [reviews, weekStart]);
  const commitment = useMemo(() => previousWeekCommitment(reviews, weekStart), [reviews, weekStart]);
  const showLinkBanner = useMemo(() => cycleHasDerivedKrs(insightsInput), [insightsInput]);

  const pomodoroStats = useMemo(() => {
    const weekDays = history.filter(r => r.date >= weekStart && r.date <= weekEnd);
    const taskMap = new Map(tasks.map(t => [t.id, t]));
    const weekTaskPomos = computeWeekTaskPomos(history, weekStart, weekEnd);
    const pomodorosByKeyResult: Record<string, number> = {};
    for (const kr of cycleKRs) {
      pomodorosByKeyResult[kr.id] = [...weekTaskPomos.entries()]
        .filter(([taskId]) => taskMap.get(taskId)?.keyResultId === kr.id)
        .reduce((s, [, pomos]) => s + pomos, 0);
    }
    return {
      totalPomodoros: weekDays.reduce((s, d) => s + d.completedPomodoros, 0),
      totalFocusMinutes: weekDays.reduce((s, d) => s + d.totalFocusMinutes, 0),
      tasksCompleted: tasks.filter(t =>
        t.isCompleted && t.completedAt && t.completedAt.slice(0, 10) >= weekStart && t.completedAt.slice(0, 10) <= weekEnd).length,
      pomodorosByKeyResult,
    };
  }, [history, tasks, cycleKRs, weekStart, weekEnd]);

  const scoreRows: ScoreRow[] = useMemo(() => entries
    .map((entry): ScoreRow | null => {
      const kr = cycleKRs.find(k => k.id === entry.keyResultId);
      const objective = cycleObjectives.find(o => o.id === kr?.objectiveId);
      if (!kr || !objective) return null;
      const taskMap = new Map(tasks.map(t => [t.id, t]));
      const weekTaskPomos = computeWeekTaskPomos(history, weekStart, weekEnd);
      const linkedTasksThisWeek = [...weekTaskPomos.entries()]
        .filter(([taskId]) => taskMap.get(taskId)?.keyResultId === kr.id)
        .map(([taskId, pomos]) => ({ task: taskMap.get(taskId) ?? null, pomos }))
        .sort((a, b) => b.pomos - a.pomos);
      return {
        entry, keyResult: kr, objective, linkedTasksThisWeek,
        atRiskWeeksRunning: streaks.get(kr.id) ?? 0,
      };
    })
    .filter((r): r is ScoreRow => r !== null), [entries, cycleKRs, cycleObjectives, tasks, history, weekStart, weekEnd, streaks]);

  // ===== autosave (debounced; fire-and-forget per persistence rule 3) =====
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const dirtyRef = useRef(false);
  const draftRef = useRef<WeeklyReview | null>(draft);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!dirtyRef.current) return;
    setSaveState('saving');
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(async () => {
      const next: WeeklyReview = {
        id: draftRef.current?.id ?? `draft-${weekStart}`,
        weekStartDate: weekStart,
        weekEndDate: weekEnd,
        cycleId,
        entries,
        prompts,
        pomodoroStats,
      };
      draftRef.current = next;
      try {
        await saveReviewDraft(next);
        dirtyRef.current = false;
        setSaveState('saved');
        onDraftSaved?.();
      } catch {
        setSaveState('idle');
      }
    }, 1000);
    return () => {
      window.clearTimeout(timerRef.current);
      // Week switch / unmount with pending edits: flush instead of dropping
      // the last keystroke. The closure holds the latest entries/prompts.
      if (dirtyRef.current) {
        dirtyRef.current = false;
        saveReviewDraft({
          id: draftRef.current?.id ?? `draft-${weekStart}`,
          weekStartDate: weekStart,
          weekEndDate: weekEnd,
          cycleId,
          entries,
          prompts,
          pomodoroStats,
        }).then(() => onDraftSaved?.()).catch(() => { /* non-fatal */ });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, prompts]);

  const updateEntry = (keyResultId: string, updated: ReviewEntry) => {
    dirtyRef.current = true;
    setEntries(prev => prev.map(e => e.keyResultId === keyResultId ? updated : e));
  };
  const updatePrompt = (promptId: string, answer: string) => {
    dirtyRef.current = true;
    setPrompts(prev => prev.map(p => p.id === promptId ? { ...p, answer } : p));
  };

  // Tab-strip badge (step N/3 on the Weekly review tab).
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('myokr-review-step', { detail: { step: currentStep + 1, total: STEP_LABELS.length } }));
  }, [currentStep]);

  const scoredCount = entries.filter(e => e.confidence !== 'not_set').length;

  const handleComplete = () => {
    window.clearTimeout(timerRef.current);
    onComplete({
      weekStartDate: weekStart,
      weekEndDate: weekEnd,
      cycleId,
      entries,
      prompts,
      pomodoroStats,
    });
  };

  return (
    <div className="review-wizard rw-wizard">
      <div className="rw-columns">
        <div className="rw-side">
          <div className="rw-rail" role="tablist" aria-label="Review steps">
            {STEP_LABELS.map((label, i) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={currentStep === i}
                className={`rw-rail-item${currentStep === i ? ' current' : ''}${i < currentStep ? ' done' : ''}`}
                onClick={() => setCurrentStep(i)}
              >
                <span className="rw-rail-num">{i < currentStep ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>

          {currentStep > 0 && (
            <div className="rw-week-card">
              <span className="rw-panel-title">This week</span>
              <div className="rw-week-card-rows">
                <div><strong>{glance.sessions}</strong> sessions</div>
                <div><strong>{glance.focusMinutes}<span className="rw-stat-unit">m</span></strong> focus</div>
                <div><strong>{glance.tasksDone}</strong> tasks done</div>
                <div><strong className="rw-week-card-habits">{glance.habitsPct !== null ? `${glance.habitsPct}%` : '—'}</strong> habits</div>
              </div>
              <div className="rw-week-card-bar" aria-hidden="true">
                <div
                  className="rw-week-card-bar-fill"
                  style={{ width: `${unlinked.totalSessions > 0 ? Math.round((unlinked.linkedToCycle / unlinked.totalSessions) * 100) : 0}%` }}
                />
              </div>
              <span className="rw-week-card-sub">
                {unlinked.linkedToCycle} linked to this cycle's KRs · {unlinked.unlinked} unlinked or other cycles
              </span>
            </div>
          )}
        </div>

        <div className="rw-main">
          <div className="rw-save-row">
            <span className={`rw-save-indicator${saveState === 'saved' ? ' saved' : ''}`} data-state={saveState}>
              {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved just now' : 'Nothing to save yet'}
            </span>
          </div>

          {currentStep === 0 && (
            <WeekAtAGlance
              glance={glance}
              moves={moves}
              commitment={commitment}
              unlinked={unlinked}
              showLinkBanner={showLinkBanner}
              onLinkSessions={onLinkSessions}
            />
          )}
          {currentStep === 1 && (
            <ScoreKeyResults rows={scoreRows} onChange={updateEntry} />
          )}
          {currentStep === 2 && (
            <ReflectStep prompts={prompts} onChange={updatePrompt} />
          )}

          <div className="rw-footer">
            <span className="rw-footer-note">
              {currentStep === 1 ? `${scoredCount} of ${entries.length} key result${entries.length !== 1 ? 's' : ''} scored` : STEP_FOOTNOTES[currentStep]}
            </span>
            <div className="rw-footer-actions">
              {currentStep > 0 && (
                <button type="button" className="rw-btn" onClick={() => setCurrentStep(currentStep - 1)}>Back</button>
              )}
              {currentStep < 2 ? (
                <button type="button" className="rw-btn primary" onClick={() => setCurrentStep(currentStep + 1)}>
                  {currentStep === 0 ? 'Score key results' : 'Continue to reflection'}
                </button>
              ) : (
                <button type="button" className="rw-btn primary" onClick={handleComplete}>Finish review</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
