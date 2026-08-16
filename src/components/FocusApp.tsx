import { useState, useEffect } from 'react';
import DayPlanBody from './DayPlanBody';
import SessionView from './focus/SessionView';
import HabitsApp from './HabitsApp';
import FocusTabStrip, { FocusHeader, type FocusTab } from './focus/FocusTabStrip';
import PlanDayModal from './focus/PlanDayModal';
import { cycleWeekLabel } from './pomodoro/PlanTabStrip';
import { getActiveCycle, type OKRCycle } from '../lib/okr-storage';
import { saveTodayPlan, type TodayPlan } from '../lib/today-focus';
import '../styles/focus.css';

interface FocusAppProps {
  tab: FocusTab;
  /** Task staged by "Start focus" from the Day plan — consumed by the Session tab. */
  requestedTaskId?: string | null;
  onRequestedTaskConsumed?: () => void;
  onStartTask: (taskId: string) => void;
  onGoToTasks: () => void;
}

/**
 * Focus-group shell — Day plan / Session / Habits behind one tab strip, mirroring
 * the Plan group's one-screen-tabbed structure (ADR-0014). A header + tab strip
 * wrap the existing screen bodies. "Plan day" opens the preview-and-commit
 * modal (2026-08-16); the shell persists the accepted plan and signals the
 * Day plan body to reload from it.
 */
export default function FocusApp({ tab, requestedTaskId, onRequestedTaskConsumed, onStartTask, onGoToTasks }: FocusAppProps) {
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [acceptSignal, setAcceptSignal] = useState(0);
  const [activeCycle, setActiveCycle] = useState<OKRCycle | null>(null);

  useEffect(() => {
    const load = () => {
      getActiveCycle().then(setActiveCycle).catch(() => setActiveCycle(null));
    };
    load();
    window.addEventListener('myokr-data-synced', load);
    return () => window.removeEventListener('myokr-data-synced', load);
  }, []);

  const handlePlanDay = () => setPlanModalOpen(true);

  const handleAcceptPlan = (plan: TodayPlan) => {
    saveTodayPlan(plan);
    setAcceptSignal(n => n + 1);
    setPlanModalOpen(false);
  };

  return (
    <div className="pomodoro-container focus-shell">
      <div className="focus-shell-inner">
        <FocusHeader onPlanDay={handlePlanDay} showPlanDay={tab === 'day-plan'} />
        <FocusTabStrip active={tab} cycleLabel={cycleWeekLabel(activeCycle)} />
        {tab === 'day-plan' && (
          <DayPlanBody
            acceptSignal={acceptSignal}
            onStartTask={onStartTask}
            onGoToTasks={onGoToTasks}
          />
        )}
        {tab === 'session' && (
          <SessionView requestedTaskId={requestedTaskId} onRequestedTaskConsumed={onRequestedTaskConsumed} />
        )}
        {tab === 'habits' && <HabitsApp />}
        {planModalOpen && (
          <PlanDayModal
            onClose={() => setPlanModalOpen(false)}
            onAccept={handleAcceptPlan}
            onGoToTasks={() => {
              setPlanModalOpen(false);
              onGoToTasks();
            }}
          />
        )}
      </div>
    </div>
  );
}
