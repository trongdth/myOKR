import { useState, useEffect, useRef } from 'react';
import ProgressTabStrip, { ProgressHeader, formatWeekLabel, type ProgressTab } from './progress/ProgressTabStrip';
import Analytics from './pomodoro/Analytics';
import ReviewApp from './ReviewApp';
import ObjectivesProgressTab from './progress/ObjectivesProgressTab';
import CycleWeekPicker, { defaultReviewSelection, type CycleWeekSelection } from './progress/CycleWeekPicker';
import { getActiveCycle, loadCycles, loadReviews, type OKRCycle, type WeeklyReview } from '../lib/okr-storage';
import { getExclusiveCycleMondays, getCycleClosedDate } from '../lib/cycle-windows';
import { useSession } from './session/SessionProvider';
import '../styles/progress.css';

interface ProgressAppProps {
  tab: ProgressTab;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatClosedLabel(closedDate: string): string {
  const [, mm, dd] = closedDate.split('-').map(Number);
  return `Cycle closed ${dd} ${MONTHS_SHORT[mm - 1]}`;
}

export default function ProgressApp({ tab }: ProgressAppProps) {
  const [activeCycle, setActiveCycle] = useState<OKRCycle | null>(null);
  const [cycles, setCycles] = useState<OKRCycle[]>([]);
  const [reviewReviews, setReviewReviews] = useState<WeeklyReview[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<number | 'all' | null>('all');
  // The Weekly review tab owns its two-level picker; analytics/objectives
  // keep the strip's week Select (one selector per tab, 2026-09-07).
  const [reviewSelection, setReviewSelection] = useState<CycleWeekSelection | null>(null);
  const reviewTouchedRef = useRef(false);
  const { history, tasks, settings } = useSession();

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      Promise.all([getActiveCycle(), loadCycles(), loadReviews()])
        .then(([active, all, reviews]) => {
          if (cancelled) return;
          setActiveCycle(active);
          setCycles(all);
          setReviewReviews(reviews);
        })
        .catch(() => { if (!cancelled) setActiveCycle(null); });
    };
    load();
    window.addEventListener('myokr-data-synced', load);
    return () => {
      cancelled = true;
      window.removeEventListener('myokr-data-synced', load);
    };
  }, []);

  // Draft autosaves refresh only the picker's data (counts / draft hints) —
  // not the app-wide reload the sync event triggers.
  useEffect(() => {
    let cancelled = false;
    const refreshReviews = () => {
      loadReviews()
        .then(reviews => { if (!cancelled) setReviewReviews(reviews); })
        .catch(() => { /* non-fatal */ });
    };
    window.addEventListener('myokr-reviews-changed', refreshReviews);
    return () => {
      cancelled = true;
      window.removeEventListener('myokr-reviews-changed', refreshReviews);
    };
  }, []);

  // Default review selection: newest cycle's most recent finished week, with
  // older-cycle fallback — computed until the user commits their own choice.
  const todayISO = new Date().toISOString().slice(0, 10);
  useEffect(() => {
    if (reviewTouchedRef.current || reviewSelection) return;
    const sel = defaultReviewSelection(cycles, todayISO);
    if (sel) setReviewSelection(sel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycles]);

  const handleReviewCommit = (sel: CycleWeekSelection) => {
    reviewTouchedRef.current = true;
    setReviewSelection(sel);
  };

  // Objectives h1 still follows the strip's week filter ('all' = current).
  const cycleMondays = activeCycle ? getExclusiveCycleMondays(activeCycle) : [];
  const currentWeekIdx = Math.max(1,
    cycleMondays.findIndex(monday => {
      const end = new Date(`${monday}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 6);
      return monday <= todayISO && todayISO <= end.toISOString().slice(0, 10);
    }) + 1
  );
  const selectedMonday = (() => {
    if (cycleMondays.length === 0) return null;
    if (selectedWeek === 'all' || selectedWeek == null) return cycleMondays[currentWeekIdx - 1] ?? cycleMondays[0];
    return cycleMondays[selectedWeek - 1] ?? null;
  })();

  const reviewCycle = cycles.find(c => c.id === reviewSelection?.cycleId) ?? null;
  const reviewClosedDate = reviewCycle ? getCycleClosedDate(reviewCycle) : null;
  const showClosedBadge = tab === 'weekly-review' && !!reviewClosedDate && reviewClosedDate < todayISO;

  const headerTitle = tab === 'weekly-review'
    ? (reviewSelection ? formatWeekLabel(reviewSelection.weekStart) : undefined)
    : tab === 'objectives-progress'
      ? (selectedMonday ? formatWeekLabel(selectedMonday) : undefined)
      : undefined;

  return (
    <div className="pomodoro-container progress-shell">
      <div className="progress-shell-inner">
        <ProgressHeader
          activeCycle={activeCycle}
          title={headerTitle}
          right={showClosedBadge ? <span className="rw-closed-badge">{formatClosedLabel(reviewClosedDate!)}</span> : undefined}
        />
        <ProgressTabStrip
          active={tab}
          activeCycle={activeCycle}
          selectedWeek={selectedWeek}
          onSelectWeek={setSelectedWeek}
          reviewPicker={
            <CycleWeekPicker
              cycles={cycles}
              reviews={reviewReviews}
              selected={reviewSelection}
              todayStr={todayISO}
              onCommit={handleReviewCommit}
            />
          }
        />
        {tab === 'analytics' && (
          <Analytics
            history={history}
            tasks={tasks}
            settings={settings}
            activeCycle={activeCycle}
            selectedWeek={selectedWeek}
            onSelectWeek={setSelectedWeek}
          />
        )}
        {tab === 'objectives-progress' && (
          <ObjectivesProgressTab activeCycle={activeCycle} />
        )}
        {tab === 'weekly-review' && (
          <ReviewApp hideHeader weekStart={reviewSelection?.weekStart} cycleId={reviewSelection?.cycleId} />
        )}
      </div>
    </div>
  );
}
