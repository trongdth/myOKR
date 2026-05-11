import { useState, useEffect } from 'react';
import '../styles/review.css';
import {
  loadCycles, loadObjectives, loadKeyResults,
  loadReviews, saveReviews, saveKeyResults,
  getCurrentWeekStart, getCurrentWeekEnd,
  type OKRCycle, type Objective, type KeyResult, type WeeklyReview,
} from '../lib/okr-storage';
import { generateId } from '../lib/pomodoro-storage';
import { loadTasks, loadHistory, type PomodoroTask, type DailyRecord } from '../lib/pomodoro-storage';
import ReviewWizard from './review/ReviewWizard';
import ReviewHistory from './review/ReviewHistory';
import ProgressChart from './review/ProgressChart';

export default function ReviewApp() {
  const [isLoading, setIsLoading] = useState(true);
  const [cycles, setCycles] = useState<OKRCycle[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [keyResults, setKeyResults] = useState<KeyResult[]>([]);
  const [reviews, setReviews] = useState<WeeklyReview[]>([]);
  const [tasks, setTasks] = useState<PomodoroTask[]>([]);
  const [history, setHistory] = useState<DailyRecord[]>([]);
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    async function init() {
      setCycles(await loadCycles());
      setObjectives(await loadObjectives());
      setKeyResults(await loadKeyResults());
      setReviews(await loadReviews());
      setTasks(await loadTasks());
      setHistory(await loadHistory());
      setIsLoading(false);
    }
    init();
  }, []);

  const activeCycle = cycles.find(c => c.isActive) || cycles[0];
  const weekStart = getCurrentWeekStart();
  const weekEnd = getCurrentWeekEnd();

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
    await saveReviews(updatedReviews);

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
    await saveKeyResults(updatedKRs);

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
    return (
      <div className="review-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>Loading...</div>
      </div>
    );
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
          onComplete={handleCompleteReview}
          onCancel={() => setShowWizard(false)}
        />
      ) : (
        <div className="review-start-card">
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
      <ProgressChart reviews={reviews} keyResults={keyResults} />

      {/* Review History */}
      <ReviewHistory
        reviews={reviews}
        keyResults={keyResults}
        objectives={objectives}
        onDelete={handleDeleteReview}
        onEdit={handleEditReview}
      />
    </div>
  );
}
