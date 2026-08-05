import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { navigateToSection } from '../pomodoro/PlanTabStrip';
import { useSession } from '../session/SessionProvider';
import { loadHabits, type Habit } from '../../lib/habit-storage';
import { getLocalDateString } from '../../lib/pomodoro-storage';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Today's date, day-first: "{Weekday}, {D} {Mon-short}" → "Sunday, 24 May".
 * Built from arrays (not toLocaleDateString) so it is locale/ICU-independent and
 * deterministic across the darwin/linux visual baselines. The old Today header
 * used en-US, which prints month-first ("May 24").
 */
export function formatTodayDayFirst(now: Date = new Date()): string {
  return `${WEEKDAYS[now.getDay()]}, ${now.getDate()} ${MONTHS_SHORT[now.getMonth()]}`;
}

/**
 * Focus-group header: today's date as the title + a "Plan day" action. Reuses
 * the Plan header's structural classes (.tasks-view-header / .plan-header-title)
 * for parity; the Focus shell provides the surrounding padding.
 */
export function FocusHeader({ onPlanDay }: { onPlanDay: () => void }) {
  return (
    <div className="tasks-view-header focus-header">
      <div className="tasks-header-left">
        <h1 className="focus-header-title plan-header-title">{formatTodayDayFirst()}</h1>
      </div>
      <div className="tasks-header-right">
        <button
          type="button"
          onClick={onPlanDay}
          className="focus-plan-day-btn"
          title="Recompute today's plan from scratch"
        >
          <RefreshCw size={13} />
          <span>Plan day</span>
        </button>
      </div>
    </div>
  );
}

export type FocusTab = 'day-plan' | 'session' | 'habits';

interface FocusTabStripProps {
  active: FocusTab;
  cycleLabel: string | null;
}

/**
 * Focus tab strip — Day plan · Session · Habits — with the cycle label as static
 * text (no dropdown: the Day plan is today-scoped, nothing to filter). Reuses
 * .plan-tab-strip / .plan-tab styles for parity with the Plan group.
 */
/** `live` marker on the Session tab while a session runs (any phase). Consumes
 *  the session provider directly so only this badge re-renders on timer ticks. */
function SessionLiveBadge() {
  const { isRunning } = useSession();
  if (!isRunning) return null;
  return <span className="plan-tab-count focus-tab-live">live</span>;
}

/** Today's habit completion (e.g. 2/3) on the Habits tab; hidden when there are
 *  no habits. Loads on mount + on `myokr-data-synced` (HabitsApp dispatches it
 *  on every add/tick/untick/delete). */
function HabitsBadge() {
  const [habits, setHabits] = useState<Habit[]>([]);
  useEffect(() => {
    const load = () => { loadHabits().then(setHabits).catch(() => {}); };
    load();
    window.addEventListener('myokr-data-synced', load);
    return () => window.removeEventListener('myokr-data-synced', load);
  }, []);
  if (habits.length === 0) return null;
  const today = getLocalDateString();
  const done = habits.filter(h => h.ticks.includes(today)).length;
  return <span className="plan-tab-count focus-tab-habits">{done}/{habits.length}</span>;
}

export default function FocusTabStrip({ active, cycleLabel }: FocusTabStripProps) {
  return (
    <div className="plan-tab-strip focus-tabs">
      <div className="plan-tabs">
        <button
          type="button"
          className={`plan-tab${active === 'day-plan' ? ' active' : ''}`}
          onClick={() => navigateToSection('day-plan')}
        >
          <span>Day plan</span>
        </button>
        <button
          type="button"
          className={`plan-tab${active === 'session' ? ' active' : ''}`}
          onClick={() => navigateToSection('session')}
        >
          <span>Session</span>
          <SessionLiveBadge />
        </button>
        <button
          type="button"
          className={`plan-tab${active === 'habits' ? ' active' : ''}`}
          onClick={() => navigateToSection('habits')}
        >
          <span>Habits</span>
          <HabitsBadge />
        </button>
      </div>
      {cycleLabel && <span className="plan-cycle-week">{cycleLabel}</span>}
    </div>
  );
}
