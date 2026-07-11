import { useState, useEffect } from 'react';
import '../styles/review.css';
import {
  loadCycles, loadObjectives, loadKeyResults,
  loadReviews, saveReviews, saveKeyResults,
  getCurrentWeekStart,
  getMondaysForCycle, getWeekEndFromStart,
  getEffectiveCurrentValueAsOf,
  type OKRCycle, type Objective, type KeyResult, type WeeklyReview,
} from '../lib/okr-storage';
import { generateId } from '../lib/pomodoro-storage';
import { loadTasks, loadHistory, loadSettings, type PomodoroTask, type DailyRecord } from '../lib/pomodoro-storage';
import { reviewInCycle } from '../lib/review-utils';
import ReviewWizard from './review/ReviewWizard';
import ReviewHistory from './review/ReviewHistory';
import ProgressChart from './review/ProgressChart';
import LoadingState from './shared/LoadingState';

async function repairReviews(
  loadedReviews: WeeklyReview[],
  loadedKRs: KeyResult[],
  loadedTasks: PomodoroTask[],
  loadedHistory: DailyRecord[],
  focusDur: number,
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

      const correctPrev = getEffectiveCurrentValueAsOf(kr, loadedTasks, loadedHistory, previousSunday, focusDur);
      const correctCurr = getEffectiveCurrentValueAsOf(kr, loadedTasks, loadedHistory, r.weekEndDate, focusDur);

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

export default function ReviewApp() {
  const [isLoading, setIsLoading] = useState(true);
  const [cycles, setCycles] = useState<OKRCycle[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [keyResults, setKeyResults] = useState<KeyResult[]>([]);
  const [reviews, setReviews] = useState<WeeklyReview[]>([]);
  const [tasks, setTasks] = useState<PomodoroTask[]>([]);
  const [history, setHistory] = useState<DailyRecord[]>([]);
  const [focusDuration, setFocusDuration] = useState(25);
  const [showWizard, setShowWizard] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(getCurrentWeekStart());
  const [explicitCycleId, setExplicitCycleId] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const loadedCycles = await loadCycles();
      const loadedKRs = await loadKeyResults();
      const loadedReviews = await loadReviews();
      const loadedTasks = await loadTasks();
      const loadedHistory = await loadHistory();
      const settings = await loadSettings();
      const focusDur = settings.focusDuration;

      setCycles(loadedCycles);
      setObjectives(await loadObjectives());
      setKeyResults(loadedKRs);
      setReviews(loadedReviews);
      setTasks(loadedTasks);
      setHistory(loadedHistory);
      setFocusDuration(focusDur);
      setIsLoading(false);

      // Run review database repair to correct legacy entries timezone-safely
      const { repaired, changed } = await repairReviews(loadedReviews, loadedKRs, loadedTasks, loadedHistory, focusDur);
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
      const settings = await loadSettings();
      setFocusDuration(settings.focusDuration);
    }

    const handleSync = () => {
      reloadData();
    };

    window.addEventListener('myokr-data-synced', handleSync);
    return () => window.removeEventListener('myokr-data-synced', handleSync);
  }, []);

  const weekStart = selectedWeek;
  const weekEnd = selectedWeek ? getWeekEndFromStart(selectedWeek) : '';

  // Infer the cycle from the week's START month. The review is tagged with this
  // cycle (so e.g. a 06-29 → 07-05 review wraps up the June KRs it started under).
  // Visibility across cycles is handled below by `reviewInCycle` (week-overlap),
  // so a cross-month review still shows under July even though it's tagged June.
  const selectedDate = new Date(selectedWeek);
  const targetMonth = selectedDate.getUTCMonth();
  const targetYear = selectedDate.getUTCFullYear();

  const inferredCycle = cycles.find(c => c.month === targetMonth && c.year === targetYear) 
    || cycles.find(c => c.isActive) 
    || cycles[0];

  const activeCycle = explicitCycleId 
    ? cycles.find(c => c.id === explicitCycleId) || inferredCycle 
    : inferredCycle;

  // Keep selectedWeek in sync with activeCycle's weeks
  useEffect(() => {
    if (activeCycle) {
      const weeks = getMondaysForCycle(activeCycle);
      if (weeks.length > 0 && !weeks.includes(selectedWeek)) {
        const todayWeek = getCurrentWeekStart();
        if (weeks.includes(todayWeek)) {
          setSelectedWeek(todayWeek);
        } else {
          setSelectedWeek(weeks[0]);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCycle?.id]);

  // Check if current week already has a completed review
  const currentWeekReview = reviews.find(
    r => r.weekStartDate === weekStart && r.completedAt
  );

  // Check if today is before the end date of the week
  const isWeekInProgress = (() => {
    const d = new Date();
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;
    return todayStr < weekEnd;
  })();

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
    // Prevent duplicate reviews for the same week by replacing if it already exists
    const existsIdx = reviews.findIndex(r => r.weekStartDate === reviewData.weekStartDate);
    let updatedReviews: WeeklyReview[];

    if (existsIdx >= 0) {
      const updated = {
        ...reviews[existsIdx],
        ...reviewData,
        completedAt: new Date().toISOString(),
      };
      updatedReviews = reviews.map((r, idx) => idx === existsIdx ? updated : r);
    } else {
      const review: WeeklyReview = {
        id: generateId(),
        ...reviewData,
      };
      updatedReviews = [...reviews, review];
    }

    // Save review
    setReviews(updatedReviews);
    try { await saveReviews(updatedReviews); } catch { /* storage failure is non-fatal */ }

    // Update Key Result values based on the latest completed review
    await syncKeyResultsFromReviews(updatedReviews, keyResults);

    setShowWizard(false);
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
      <div className="review-container">
        <div className="review-header">
          <h2 className="review-header-title">📋 Weekly Review</h2>
        </div>
        <div className="review-start-card">
          <div className="review-start-card-icon">🎯</div>
          <div className="review-start-card-title">No OKR cycle found</div>
          <div className="review-start-card-desc">
            Create your first OKR cycle in the OKRs tab to start weekly reviews.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="review-container">
      <div className="review-header">
        <h2 className="review-header-title">📋 Weekly Review</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="cycle-select" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Cycle:</label>
          <select 
            id="cycle-select" 
            value={activeCycle.id} 
            disabled={showWizard}
            onChange={e => {
              const newCycleId = e.target.value;
              setExplicitCycleId(newCycleId);
              const newCycle = cycles.find(c => c.id === newCycleId);
              if (newCycle) {
                const weeks = getMondaysForCycle(newCycle);
                if (weeks.length > 0) {
                  setSelectedWeek(weeks[0]);
                }
              }
            }}
            style={{ padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
          >
            {cycles.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Wizard or Start card */}
      {showWizard ? (
        <ReviewWizard
          weekStart={weekStart}
          weekEnd={weekEnd}
          cycleId={activeCycle.id}
          objectives={objectives}
          keyResults={keyResults}
          tasks={tasks}
          history={history}
          reviews={reviews}
          focusDurationMinutes={focusDuration}
          onComplete={handleCompleteReview}
          onCancel={() => setShowWizard(false)}
        />
      ) : (
        <div className="review-start-card">
          <div style={{ marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label htmlFor="week-select" style={{ color: 'var(--text-muted)' }}>Review for week of:</label>
              <select 
                id="week-select" 
                value={selectedWeek} 
                onChange={e => {
                  setSelectedWeek(e.target.value);
                  setExplicitCycleId(null);
                }}
                style={{ padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              >
                {getMondaysForCycle(activeCycle).map(monday => (
                  <option key={monday} value={monday}>
                    {monday} to {getWeekEndFromStart(monday)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {currentWeekReview ? (
            <>
              <div className="review-start-card-icon">✅</div>
              <div className="review-start-card-title">This week's review is complete!</div>
              <div className="review-start-card-desc">
                Completed on {new Date(currentWeekReview.completedAt!).toLocaleDateString()}.
                If you need to edit this review, you can do so in the Past Reviews section below.
              </div>
            </>
          ) : isWeekInProgress ? (
            <>
              <div className="review-start-card-icon">⏳</div>
              <div className="review-start-card-title">Week is still in progress</div>
              <div className="review-start-card-desc">
                This week (ending {weekEnd}) is still ongoing. You can start the weekly review once the week is complete.
              </div>
            </>
          ) : (
            <>
              <div className="review-start-card-icon">📋</div>
              <div className="review-start-card-title">Time for your weekly review!</div>
              <div className="review-start-card-desc">
                Review your progress on each Key Result, assess your confidence, and
                reflect on the week. This takes about 5 minutes.
              </div>
              <button className="review-start-btn" onClick={() => setShowWizard(true)}>
                🚀 Start Weekly Review
              </button>
            </>
          )}
        </div>
      )}

      {/* Progress Chart */}
      <ProgressChart reviews={reviews.filter(r => reviewInCycle(r, activeCycle))} keyResults={keyResults} />

      {/* Review History */}
      <ReviewHistory
        reviews={reviews.filter(r => reviewInCycle(r, activeCycle))}
        keyResults={keyResults}
        objectives={objectives}
        tasks={tasks}
        history={history}
        onDelete={handleDeleteReview}
        onEdit={handleEditReview}
      />
    </div>
  );
}
