import { useState, useEffect } from 'react';
import { ClipboardList, Target } from 'lucide-react';
import '../styles/review.css';
import {
  loadCycles, loadObjectives, loadKeyResults,
  loadReviews, saveReviews, saveKeyResults, saveCompletedReview,
  getCurrentWeekStart,
  getWeekEndFromStart,
  getEffectiveCurrentValueAsOf,
  type OKRCycle, type Objective, type KeyResult, type WeeklyReview,
} from '../lib/okr-storage';
import { generateId } from '../lib/pomodoro-storage';
import { loadHabits, type Habit } from '../lib/habit-storage';
import { loadTasks, loadHistory, loadSettings, type PomodoroTask, type DailyRecord } from '../lib/pomodoro-storage';
import { reviewInCycle } from '../lib/review-utils';
import ReviewWizard from './review/ReviewWizard';
import LinkSessionsModal from './review/LinkSessionsModal';
import ReviewHistory from './review/ReviewHistory';
import LoadingState from './shared/LoadingState';
import { Select } from './shared/Select';

async function repairReviews(
  loadedReviews: WeeklyReview[],
  loadedKRs: KeyResult[],
  loadedTasks: PomodoroTask[],
  loadedHistory: DailyRecord[],
  focusDur: number,
  loadedHabits: Habit[],
  loadedObjectives: Objective[],
  loadedCycles: OKRCycle[],
): Promise<{ repaired: WeeklyReview[]; changed: boolean }> {
  let changed = false;
  const repaired = loadedReviews.map(r => {
    if (!r.completedAt) return r;

    const [y, m, dayVal] = r.weekStartDate.split('-').map(Number);
    const prevDate = new Date(Date.UTC(y, m - 1, dayVal));
    prevDate.setUTCDate(prevDate.getUTCDate() - 1);
    const previousSunday = prevDate.toISOString().slice(0, 10);

    let entriesChanged = false;
    const updatedEntries = r.entries.map(entry => {
      const kr = loadedKRs.find(k => k.id === entry.keyResultId);
      if (!kr || kr.completionMode === 'manual' || !kr.completionMode) return entry;

      const correctPrev = getEffectiveCurrentValueAsOf(kr, loadedTasks, loadedHistory, previousSunday, focusDur, loadedHabits, loadedObjectives, loadedCycles);
      const correctCurr = getEffectiveCurrentValueAsOf(kr, loadedTasks, loadedHistory, r.weekEndDate, focusDur, loadedHabits, loadedObjectives, loadedCycles);

      if (entry.previousValue !== correctPrev || entry.currentValue !== correctCurr) {
        entriesChanged = true;
        return {
          ...entry,
          previousValue: correctPrev,
          currentValue: correctCurr,
        };
      }
      return entry;
    });

    if (entriesChanged) {
      changed = true;
      return {
        ...r,
        entries: updatedEntries,
      };
    }
    return r;
  });

  return { repaired, changed };
}

// The review tab's week and cycle come from the CycleWeekPicker (only
// finished weeks are selectable there, so no in-progress/future guards
// exist in this component — the 2026-09-07 second-round decision).
export default function ReviewApp({ hideHeader = false, weekStart: weekStartProp = null, cycleId: cycleIdProp = null }: { hideHeader?: boolean; weekStart?: string | null; cycleId?: string | null } = {}) {
  const [isLoading, setIsLoading] = useState(true);
  const [cycles, setCycles] = useState<OKRCycle[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [keyResults, setKeyResults] = useState<KeyResult[]>([]);
  const [reviews, setReviews] = useState<WeeklyReview[]>([]);
  const [tasks, setTasks] = useState<PomodoroTask[]>([]);
  const [history, setHistory] = useState<DailyRecord[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [focusDuration, setFocusDuration] = useState(25);
  const [explicitCycleId, setExplicitCycleId] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);

  useEffect(() => {
    async function init() {
      const loadedCycles = await loadCycles();
      const loadedObjectives = await loadObjectives();
      const loadedKRs = await loadKeyResults();
      const loadedReviews = await loadReviews();
      const loadedTasks = await loadTasks();
      const loadedHistory = await loadHistory();
      const loadedHabits = await loadHabits();
      const settings = await loadSettings();
      const focusDur = settings.focusDuration;

      setCycles(loadedCycles);
      setObjectives(loadedObjectives);
      setKeyResults(loadedKRs);
      setReviews(loadedReviews);
      setTasks(loadedTasks);
      setHistory(loadedHistory);
      setHabits(loadedHabits);
      setFocusDuration(focusDur);
      setIsLoading(false);

      // Run review database repair to correct legacy entries timezone-safely
      const { repaired, changed } = await repairReviews(
        loadedReviews,
        loadedKRs,
        loadedTasks,
        loadedHistory,
        focusDur,
        loadedHabits,
        loadedObjectives,
        loadedCycles
      );
      if (changed) {
        setReviews(repaired);
        try {
          await saveReviews(repaired);
        } catch {
          /* storage failure is non-fatal */
        }
        // Sync Key Results with the repaired reviews
        const updatedKRs = loadedKRs.map(kr => {
          const krReviews = repaired
            .filter(r => r.completedAt && r.entries.some(e => e.keyResultId === kr.id))
            .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate)); // latest first

          if (krReviews.length > 0) {
            const latestReview = krReviews[0];
            const entry = latestReview.entries.find(e => e.keyResultId === kr.id);
            if (entry) {
              return {
                ...kr,
                currentValue: entry.currentValue,
                confidence: entry.confidence,
                updatedAt: new Date().toISOString(),
              };
            }
          }
          return kr;
        });
        setKeyResults(updatedKRs);
        try {
          await saveKeyResults(updatedKRs);
        } catch {
          /* storage failure is non-fatal */
        }
      }
    }
    init();
  }, []);

  // Listen to background sync and reload data dynamically
  useEffect(() => {
    async function reloadData() {
      setCycles(await loadCycles());
      setObjectives(await loadObjectives());
      setKeyResults(await loadKeyResults());
      setReviews(await loadReviews());
      setTasks(await loadTasks());
      setHistory(await loadHistory());
      setHabits(await loadHabits());
      const settings = await loadSettings();
      setFocusDuration(settings.focusDuration);
    }

    const handleSync = () => {
      reloadData();
    };

    window.addEventListener('myokr-data-synced', handleSync);
    return () => window.removeEventListener('myokr-data-synced', handleSync);
  }, []);

  // The cycle is the picker's selection; fall back to inferring from the
  // week's START month, then the active cycle (legacy standalone mounts).
  const selectedDate = new Date(weekStartProp ?? getCurrentWeekStart());
  const targetMonth = selectedDate.getUTCMonth();
  const targetYear = selectedDate.getUTCFullYear();

  const inferredCycle = (cycleIdProp && cycles.find(c => c.id === cycleIdProp))
    || cycles.find(c => c.month === targetMonth && c.year === targetYear)
    || cycles.find(c => c.isActive)
    || cycles[0];

  const activeCycle = explicitCycleId
    ? cycles.find(c => c.id === explicitCycleId) || inferredCycle
    : inferredCycle;

  // The CycleWeekPicker drives the week (exclusive weeks, ADR-0019);
  // unset falls back to the current week.
  const weekStart = weekStartProp ?? getCurrentWeekStart();
  const weekEnd = weekStart ? getWeekEndFromStart(weekStart) : '';

  // Check if current week already has a completed review
  const currentWeekReview = reviews.find(
    r => r.weekStartDate === weekStart && r.completedAt
  );

  const todayStr = (() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  })();

  // Draft autosaves land straight in the doc; pull them back so the wizard
  // stays in sync.
  const reloadReviews = async () => {
    try { setReviews(await loadReviews()); } catch { /* non-fatal */ }
  };
  const reloadTasks = async () => {
    try { setTasks(await loadTasks()); } catch { /* non-fatal */ }
  };

  const syncKeyResultsFromReviews = async (currentReviews: WeeklyReview[], currentKRs: KeyResult[]) => {
    const updatedKRs = currentKRs.map(kr => {
      const krReviews = currentReviews
        .filter(r => r.completedAt && r.entries.some(e => e.keyResultId === kr.id))
        .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate)); // latest first

      if (krReviews.length > 0) {
        const latestReview = krReviews[0];
        const entry = latestReview.entries.find(e => e.keyResultId === kr.id);
        if (entry) {
          return {
            ...kr,
            currentValue: entry.currentValue,
            confidence: entry.confidence,
            updatedAt: new Date().toISOString(),
          };
        }
      }
      return kr;
    });
    setKeyResults(updatedKRs);
    try {
      await saveKeyResults(updatedKRs);
    } catch {
      /* storage failure is non-fatal */
    }
  };

  const handleCompleteReview = async (reviewData: Omit<WeeklyReview, 'id'>) => {
    // One review per week: replace whatever exists (draft or completed) in
    // place, then sync KR values from the latest completed reviews.
    const existing = reviews.find(r => r.weekStartDate === reviewData.weekStartDate);
    const review: WeeklyReview = {
      id: existing?.id ?? generateId(),
      ...reviewData,
      completedAt: new Date().toISOString(),
    };
    const updatedReviews = existing
      ? reviews.map(r => r.weekStartDate === review.weekStartDate ? review : r)
      : [...reviews, review];
    setReviews(updatedReviews);
    try { await saveCompletedReview(review); } catch { /* storage failure is non-fatal */ }

    // Update Key Result values based on the latest completed review
    await syncKeyResultsFromReviews(updatedReviews, keyResults);
  };

  const handleDeleteReview = async (reviewId: string) => {
    const updatedReviews = reviews.filter(r => r.id !== reviewId);
    setReviews(updatedReviews);
    try { await saveReviews(updatedReviews); } catch { /* storage failure is non-fatal */ }

    // Sync Key Result values from the remaining reviews
    await syncKeyResultsFromReviews(updatedReviews, keyResults);
  };

  const handleEditReview = async (updatedReview: WeeklyReview) => {
    const updatedReviews = reviews.map(r => r.id === updatedReview.id ? updatedReview : r);
    setReviews(updatedReviews);
    try { await saveReviews(updatedReviews); } catch { /* storage failure is non-fatal */ }

    // Update Key Result values based on the latest completed review
    await syncKeyResultsFromReviews(updatedReviews, keyResults);
  };

  if (isLoading) {
    return <LoadingState className="review-container" />;
  }

  if (!activeCycle) {
    return (
      <div className={`review-container${hideHeader ? ' embed-mode' : ''}`}>
        {!hideHeader && (
          <div className="review-header">
            <h2 className="review-header-title"><ClipboardList size={18} className="icon-inline" /> Weekly review</h2>
          </div>
        )}
        <div className="review-start-card">
          <div className="review-start-card-icon"><Target size={24} /></div>
          <div className="review-start-card-title">No OKR cycle found</div>
          <div className="review-start-card-desc">
            Create your first OKR cycle in the OKRs tab to start weekly reviews.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`review-container${hideHeader ? ' embed-mode' : ''}`}>
      {!hideHeader && (
        <div className="review-header">
          <h2 className="review-header-title"><ClipboardList size={18} className="icon-inline" /> Weekly Review</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center' }}>
              Cycle:
              <Select
                options={cycles.map(c => ({ value: c.id, label: c.name }))}
                value={activeCycle.id}
                onChange={(cycleId) => setExplicitCycleId(cycleId)}
                ariaLabel="Cycle"
              />
            </label>
          </div>
        </div>
      )}

      {/* The wizard runs for the picker-selected (always finished) week —
          read-only once completed (ADR-0019 as amended 2026-09-07). */}
      <ReviewWizard
        key={`${weekStart}-${activeCycle.id}`}
        weekStart={weekStart}
        weekEnd={weekEnd}
        cycleId={activeCycle.id}
        todayStr={todayStr}
        objectives={objectives}
        keyResults={keyResults}
        tasks={tasks}
        history={history}
        reviews={reviews}
        focusDurationMinutes={focusDuration}
        habits={habits}
        cycles={cycles}
        onComplete={handleCompleteReview}
        onDraftSaved={reloadReviews}
        onLinkSessions={() => setShowLinkModal(true)}
        readOnly={!!currentWeekReview}
        completedAt={currentWeekReview?.completedAt}
      />

      {showLinkModal && activeCycle && (
        <LinkSessionsModal
          weekStart={weekStart}
          weekEnd={weekEnd}
          cycleId={activeCycle.id}
          tasks={tasks}
          history={history}
          keyResults={keyResults}
          objectives={objectives}
          onClose={() => setShowLinkModal(false)}
          onLinked={async () => {
            setShowLinkModal(false);
            await reloadTasks();
          }}
        />
      )}

      {/* Review History — the progress chart moved to the Objectives tab.
          Continue-review jumps the shared week selector to the draft's week. */}
      <ReviewHistory
        reviews={reviews.filter(r => reviewInCycle(r, activeCycle))}
        keyResults={keyResults}
        objectives={objectives}
        tasks={tasks}
        history={history}
        onDelete={handleDeleteReview}
        onEdit={handleEditReview}
        onContinue={(weekStartDate) => {
          window.dispatchEvent(new CustomEvent('myokr-review-continue', { detail: { weekStart: weekStartDate } }));
        }}
      />
    </div>
  );
}
