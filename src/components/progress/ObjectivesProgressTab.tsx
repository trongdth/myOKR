import { useEffect, useState } from 'react';
import { loadReviews, loadKeyResults, type OKRCycle, type WeeklyReview, type KeyResult } from '../../lib/okr-storage';
import { getExclusiveCycleMondays } from '../../lib/cycle-windows';
import ProgressChart from '../review/ProgressChart';

// The Progress group's Objectives tab — the progress-over-time chart moved
// here from the Weekly review (2026-09 revamp, ADR-0019). Completed reviews
// only: drafts never chart.
export default function ObjectivesProgressTab({ activeCycle }: { activeCycle: OKRCycle | null }) {
  const [reviews, setReviews] = useState<WeeklyReview[]>([]);
  const [keyResults, setKeyResults] = useState<KeyResult[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      Promise.all([loadReviews(), loadKeyResults()])
        .then(([loadedReviews, loadedKrs]) => {
          if (!cancelled) {
            setReviews(loadedReviews);
            setKeyResults(loadedKrs);
          }
        })
        .catch(() => { /* non-fatal: tab renders empty */ });
    };
    load();
    window.addEventListener('myokr-data-synced', load);
    return () => {
      cancelled = true;
      window.removeEventListener('myokr-data-synced', load);
    };
  }, []);

  // Exclusive weeks, like every other Progress surface (ADR-0019): the week
  // that opens the next cycle belongs to that cycle, so a boundary review
  // charts once. `reviewInCycle` (intersect) would draw it here *and* there
  // while Analytics counts it for one cycle only.
  const cycleReviews = (activeCycle
    ? (() => {
        const cycleWeeks = new Set(getExclusiveCycleMondays(activeCycle));
        return reviews.filter(r => r.completedAt && cycleWeeks.has(r.weekStartDate));
      })()
    : []);

  return (
    <div className="review-container embed-mode objectives-progress-tab">
      <ProgressChart reviews={cycleReviews} keyResults={keyResults} />
    </div>
  );
}
