import { useState, useEffect } from 'react';
import DayPlanBody from './DayPlanBody';
import FocusTabStrip, { FocusHeader, type FocusTab } from './focus/FocusTabStrip';
import { cycleWeekLabel } from './pomodoro/PlanTabStrip';
import { getActiveCycle, type OKRCycle } from '../lib/okr-storage';
import '../styles/focus.css';

interface FocusAppProps {
  tab: FocusTab;
  onStartTask: (taskId: string) => void;
  onGoToTasks: () => void;
}

/**
 * Focus-group shell — Day plan / Session / Habits behind one tab strip, mirroring
 * the Plan group's one-screen-tabbed structure (ADR-0014). A header + tab strip
 * wrap the existing screen bodies. This ticket wires only the Day plan tab;
 * Session and Habits tabs land in tickets 02/03.
 */
export default function FocusApp({ tab, onStartTask, onGoToTasks }: FocusAppProps) {
  const [replanSignal, setReplanSignal] = useState(0);
  const [activeCycle, setActiveCycle] = useState<OKRCycle | null>(null);

  useEffect(() => {
    const load = () => {
      getActiveCycle().then(setActiveCycle).catch(() => setActiveCycle(null));
    };
    load();
    window.addEventListener('myokr-data-synced', load);
    return () => window.removeEventListener('myokr-data-synced', load);
  }, []);

  const handlePlanDay = () => setReplanSignal((n) => n + 1);

  return (
    <div className="pomodoro-container focus-shell">
      <div className="focus-shell-inner">
        <FocusHeader onPlanDay={handlePlanDay} />
        <FocusTabStrip active={tab} cycleLabel={cycleWeekLabel(activeCycle)} />
        {tab === 'day-plan' && (
          <DayPlanBody
            replanSignal={replanSignal}
            onStartTask={onStartTask}
            onGoToTasks={onGoToTasks}
          />
        )}
        {/* tab === 'session' → ticket 02 · tab === 'habits' → ticket 03 */}
      </div>
    </div>
  );
}
