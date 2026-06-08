import { useState, useEffect } from 'react';
import '../styles/review.css';
import {
  loadCycles, loadObjectives, loadKeyResults,
  loadReviews, saveReviews, saveKeyResults,
  getCurrentWeekStart,
  getRecentMondays, getWeekEndFromStart,
  type OKRCycle, type Objective, type KeyResult, type WeeklyReview,
} from '../lib/okr-storage';
import { generateId } from '../lib/pomodoro-storage';
import { loadTasks, loadHistory, loadSettings, type PomodoroTask, type DailyRecord } from '../lib/pomodoro-storage';
import ReviewWizard from './review/ReviewWizard';
import ReviewHistory from './review/ReviewHistory';
import ProgressChart from './review/ProgressChart';
import LoadingState from './shared/LoadingState';

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
      setCycles(await loadCycles());
      setObjectives(await loadObjectives());
      setKeyResults(await loadKeyResults());
      setReviews(await loadReviews());
      setTasks(await loadTasks());
      setHistory(await loadHistory());
      const settings = await loadSettings();
      setFocusDuration(settings.focusDuration);
      setIsLoading(false);
    }
    init();
  }, []);

  const weekStart = selectedWeek;
  const weekEnd = selectedWeek ? getWeekEndFromStart(selectedWeek) : '';

  const selectedDate = new Date(selectedWeek);
  const targetMonth = selectedDate.getUTCMonth();
  const targetYear = selectedDate.getUTCFullYear();

  const inferredCycle = cycles.find(c => c.month === targetMonth && c.year === targetYear) 
    || cycles.find(c => c.isActive) 
    || cycles[0];

  const activeCycle = explicitCycleId 
    ? cycles.find(c => c.id === explicitCycleId) || inferredCycle 
    : inferredCycle;

  // Check if current week already has a completed review
  const currentWeekReview = reviews.find(
    r => r.weekStartDate === weekStart && r.completedAt
  );

  const handleCompleteReview = async (reviewData: Omit<WeeklyReview, 'id'>) => {
    const review: WeeklyReview = {
      id: generateId(),
      ...reviewData,
    };

    // Save review
    const updatedReviews = [...reviews, review];
    setReviews(updatedReviews);
    try { await saveReviews(updatedReviews); } catch { /* storage failure is non-fatal */ }

    // Update Key Result values from review entries
    const updatedKRs = keyResults.map(kr => {
      const entry = review.entries.find(e => e.keyResultId === kr.id);
      if (entry) {
        return {
          ...kr,
          currentValue: entry.currentValue,
          confidence: entry.confidence,
          updatedAt: new Date().toISOString(),
        };
      }
      return kr;
    });
    setKeyResults(updatedKRs);
    try { await saveKeyResults(updatedKRs); } catch { /* storage failure is non-fatal */ }

    setShowWizard(false);
  };

  const handleDeleteReview = async (reviewId: string) => {
    const updatedReviews = reviews.filter(r => r.id !== reviewId);
    setReviews(updatedReviews);
    await saveReviews(updatedReviews);
  };

  const handleEditReview = async (updatedReview: WeeklyReview) => {
    const updatedReviews = reviews.map(r => r.id === updatedReview.id ? updatedReview : r);
    setReviews(updatedReviews);
    await saveReviews(updatedReviews);

    const updatedKRs = keyResults.map(kr => {
      const entry = updatedReview.entries.find(e => e.keyResultId === kr.id);
      if (entry) {
        return {
          ...kr,
          currentValue: entry.currentValue,
          confidence: entry.confidence,
          updatedAt: new Date().toISOString(),
        };
      }
      return kr;
    });
    setKeyResults(updatedKRs);
    await saveKeyResults(updatedKRs);
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
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          {activeCycle.name}
        </span>
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
                {getRecentMondays().map(monday => (
                  <option key={monday} value={monday}>{monday}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label htmlFor="cycle-select" style={{ color: 'var(--text-muted)' }}>Cycle:</label>
              <select 
                id="cycle-select" 
                value={activeCycle.id} 
                onChange={e => setExplicitCycleId(e.target.value)}
                style={{ padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              >
                {cycles.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
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
                You can start another review or check your history below.
              </div>
              <button className="review-start-btn" onClick={() => setShowWizard(true)}>
                📋 Start Another Review
              </button>
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
      <ProgressChart reviews={reviews.filter(r => r.cycleId === activeCycle.id)} keyResults={keyResults} />

      {/* Review History */}
      <ReviewHistory
        reviews={reviews.filter(r => r.cycleId === activeCycle.id)}
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
