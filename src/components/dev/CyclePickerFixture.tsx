import { useState } from 'react';
import CycleWeekPicker, { type CycleWeekSelection } from '../progress/CycleWeekPicker';
import type { OKRCycle, WeeklyReview } from '../../lib/okr-storage';
import '../../styles/select.css';
import '../../styles/progress.css';

// Dev-only fixture page for the CycleWeekPicker spec (tests/cycle-picker.spec.ts).
// Deterministic 2026 data, today = 2026-05-08 (Fri). Exclusive weeks:
// Jan 5w · Feb 3w · Mar 5w · Apr 4w (ends 26 Apr) · May 5w (w1 finished,
// w2 May 4–10 in progress → disabled).

const mkCycle = (id: string, name: string, month: number, year: number, isActive = false): OKRCycle => ({
  id, name, month, year, isActive, createdAt: `${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00.000Z`,
});

const CYCLES_2026: OKRCycle[] = [
  mkCycle('c-may', 'May 2026', 4, 2026, true),
  mkCycle('c-apr', 'April 2026', 3, 2026),
  mkCycle('c-mar', 'March 2026', 2, 2026),
  mkCycle('c-feb', 'February 2026', 1, 2026),
  mkCycle('c-jan', 'January 2026', 0, 2026),
];

const CYCLES_2025: OKRCycle[] = [
  mkCycle('c-dec', 'December 2025', 11, 2025),
  mkCycle('c-nov', 'November 2025', 10, 2025),
  mkCycle('c-oct', 'October 2025', 9, 2025),
];

const stats = { totalPomodoros: 0, totalFocusMinutes: 0, tasksCompleted: 0, pomodorosByKeyResult: {} };

const mkReview = (id: string, weekStart: string, cycleId: string, completed: boolean): WeeklyReview => ({
  id,
  weekStartDate: weekStart,
  weekEndDate: '',
  cycleId,
  ...(completed ? { completedAt: `${weekStart}T20:00:00.000Z` } : {}),
  entries: [],
  prompts: [],
  pomodoroStats: stats,
});

// April: w1 (03-30) + w3 (04-13) completed → 2 of 4. March: all 5 → 5 reviews.
// February: w1 + w2 → 2 of 3. May w1 (04-27): draft. January: none.
const REVIEWS: WeeklyReview[] = [
  mkReview('r-apr-1', '2026-03-30', 'c-apr', true),
  mkReview('r-apr-3', '2026-04-13', 'c-apr', true),
  mkReview('r-mar-1', '2026-02-23', 'c-mar', true),
  mkReview('r-mar-2', '2026-03-02', 'c-mar', true),
  mkReview('r-mar-3', '2026-03-09', 'c-mar', true),
  mkReview('r-mar-4', '2026-03-16', 'c-mar', true),
  mkReview('r-mar-5', '2026-03-23', 'c-mar', true),
  mkReview('r-feb-1', '2026-02-02', 'c-feb', true),
  mkReview('r-feb-2', '2026-02-09', 'c-feb', true),
  mkReview('r-may-draft', '2026-04-27', 'c-may', false),
];

const TODAY = '2026-05-08';

function Scenario({ id, cycles }: { id: string; cycles: OKRCycle[] }) {
  const [selected, setSelected] = useState<CycleWeekSelection | null>(
    id === 'cwp-a' ? { cycleId: 'c-apr', weekStart: '2026-04-20' } : { cycleId: 'c-apr', weekStart: '2026-04-20' },
  );
  return (
    <div className="cwp-fixture-scenario">
      <div id={id}>
        <CycleWeekPicker
          cycles={cycles}
          reviews={REVIEWS}
          selected={selected}
          todayStr={TODAY}
          onCommit={setSelected}
        />
      </div>
      <div id={`${id}-commit`} className="cwp-fixture-commit">{selected?.weekStart ?? '—'}</div>
    </div>
  );
}

export default function CyclePickerFixture() {
  return (
    <div className="cwp-fixture">
      <h1>CycleWeekPicker fixture</h1>
      <Scenario id="cwp-a" cycles={CYCLES_2026} />
      <h2>8 cycles → search visible</h2>
      <Scenario id="cwp-b" cycles={[...CYCLES_2026, ...CYCLES_2025]} />
    </div>
  );
}
