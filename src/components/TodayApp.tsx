import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Check, ClipboardList, Plus, ChevronRight } from 'lucide-react';
import {
  loadTasks,
  loadSettings,
  loadHistory,
  getLocalDateString,
  computeFocusStreak,
  type PomodoroSettings,
  type DailyRecord,
} from '../lib/pomodoro-storage';
import {
  loadKeyResults,
  loadObjectives,
  getActiveCycle,
  type KeyResult,
  type Objective,
  type OKRCycle,
} from '../lib/okr-storage';
import { loadHabits, saveHabits, computeHabitStreaks, type Habit } from '../lib/habit-storage';
import {
  buildTodayList,
  loadTodayPlan,
  saveTodayPlan,
  clearTodayPlan,
  getDailyPomodoroBudget,
  getMaxTaskBudgetShare,
  type ScoredTask,
} from '../lib/today-focus';
import NowCard from './today/NowCard';
import UpNextCard from './today/UpNextCard';
import LoadingState from './shared/LoadingState';
import { EmptyState } from './shared/EmptyState';
import '../styles/today.css';

interface TodayAppProps {
  onStartTask: (taskId: string) => void;
  onGoToTasks: () => void;
}

export default function TodayApp({ onStartTask, onGoToTasks }: TodayAppProps) {
  const [displayed, setDisplayed] = useState<ScoredTask[]>([]);
  const [activeTaskCount, setActiveTaskCount] = useState(0);
  const [keyResults, setKeyResults] = useState<KeyResult[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [activeCycle, setActiveCycle] = useState<OKRCycle | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [history, setHistory] = useState<DailyRecord[]>([]);
  const [settings, setSettings] = useState<PomodoroSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Click-to-reorder selection in the UP NEXT list (Prioritize-style: click to
  // select, click another task to place the selected one before it).
  const [selectedUpNextId, setSelectedUpNextId] = useState<string | null>(null);

  const compute = useCallback(async (opts: { reset?: boolean; shuffleTies?: boolean } = {}) => {
    const [tasks, krs, objs, cyc, sett, loadedHabits, loadedHistory] = await Promise.all([
      loadTasks(),
      loadKeyResults(),
      loadObjectives(),
      getActiveCycle(),
      loadSettings(),
      loadHabits(),
      loadHistory(),
    ]);

    // Only actionable tasks count toward the backlog — those not marked complete
    // and not in the delete quadrant. (Reaching the pomodoro estimate now auto-
    // completes a task via applyPomodoroCompletion, so isCompleted is the single
    // source of truth for "done" — no separate remaining>0 gate needed.)
    setActiveTaskCount(tasks.filter(t => !t.isCompleted && t.category !== 'delete').length);
    setActiveCycle(cyc);

    const activeObjIds = new Set(
      objs.filter((o: Objective) => !cyc || o.cycleId === cyc.id).map((o: Objective) => o.id),
    );
    const activeKrs = krs.filter((kr: KeyResult) => activeObjIds.has(kr.objectiveId));

    setKeyResults(activeKrs);
    setObjectives(objs);
    setSettings(sett);
    setHabits(loadedHabits);
    setHistory(loadedHistory);

    if (opts.reset) clearTodayPlan();
    const savedPlan = opts.reset ? null : loadTodayPlan();
    const { picked, plan } = buildTodayList(tasks, activeKrs, cyc, sett, savedPlan, opts);
    saveTodayPlan(plan);
    setDisplayed(picked);
  }, []);

  useEffect(() => {
    compute().then(() => setIsLoading(false));
  }, [compute]);

  useEffect(() => {
    const handleSync = () => {
      compute();
    };
    window.addEventListener('myokr-data-synced', handleSync);
    return () => window.removeEventListener('myokr-data-synced', handleSync);
  }, [compute]);

  const handleStart = (taskId: string) => {
    onStartTask(taskId);
  };

  const handleSkip = (taskId: string) => {
    const plan = loadTodayPlan();
    if (plan) {
      saveTodayPlan({
        ...plan,
        taskIds: plan.taskIds.filter(id => id !== taskId),
        skippedIds: [...plan.skippedIds, taskId],
      });
    }
    compute();
  };

  const handleReplan = () => {
    compute({ reset: true, shuffleTies: true });
  };

  const handlePromoteToNow = (promoteIdx: number) => {
    if (promoteIdx <= 0 || promoteIdx >= displayed.length) return;
    const newDisplayed = [...displayed];
    const [promoted] = newDisplayed.splice(promoteIdx, 1);
    newDisplayed.unshift(promoted);

    setDisplayed(newDisplayed);

    const plan = loadTodayPlan();
    if (plan) {
      saveTodayPlan({
        ...plan,
        taskIds: newDisplayed.map(t => t.id),
      });
    }
  };

  // Click-to-reorder: click selects; clicking a different task swaps positions
  // of the selected task and target task. Persists the order.
  const handleUpNextCardClick = (taskId: string) => {
    if (selectedUpNextId && selectedUpNextId !== taskId) {
      const selectedIdx = displayed.findIndex(t => t.id === selectedUpNextId);
      const targetIdx = displayed.findIndex(t => t.id === taskId);
      if (selectedIdx === -1 || targetIdx === -1) {
        setSelectedUpNextId(null);
        return;
      }
      const newDisplayed = [...displayed];
      const temp = newDisplayed[selectedIdx];
      newDisplayed[selectedIdx] = newDisplayed[targetIdx];
      newDisplayed[targetIdx] = temp;
      setDisplayed(newDisplayed);
      const plan = loadTodayPlan();
      if (plan) saveTodayPlan({ ...plan, taskIds: newDisplayed.map(t => t.id) });
      setSelectedUpNextId(null);
    } else {
      setSelectedUpNextId(selectedUpNextId === taskId ? null : taskId);
    }
  };

  const handleToggleHabitToday = async (habitId: string) => {
    const todayStr = getLocalDateString();
    const updated = habits.map(h => {
      if (h.id === habitId) {
        const ticks = h.ticks.includes(todayStr)
          ? h.ticks.filter(t => t !== todayStr)
          : [...h.ticks, todayStr].sort();
        return {
          ...h,
          ticks,
          updatedAt: new Date().toISOString(),
        };
      }
      return h;
    });
    setHabits(updated);
    await saveHabits(updated);
    window.dispatchEvent(new CustomEvent('myokr-data-synced'));
  };

  const handleNavigateToReview = () => {
    window.dispatchEvent(
      new CustomEvent('myokr-navigate-to-section', { detail: 'review' })
    );
  };

  const handleNavigateToHabits = () => {
    window.dispatchEvent(
      new CustomEvent('myokr-navigate-to-section', { detail: 'habits' })
    );
  };

  if (isLoading || !settings) return <LoadingState className="today-container" />;

  const krMap = new Map(keyResults.map(kr => [kr.id, kr]));
  const objMap = new Map(objectives.map(o => [o.id, o]));
  const budget = getDailyPomodoroBudget(settings);
  const maxShare = getMaxTaskBudgetShare(budget);

  const nowTask = displayed.length > 0 ? displayed[0] : null;
  const upNextTasks = displayed.length > 1 ? displayed.slice(1) : [];

  // Today's local date drives several same-day computations.
  const todayStr = getLocalDateString();
  const todayRecord = history.find(r => r.date === todayStr);
  const completedToday = todayRecord?.completedPomodoros ?? 0;
  const sessionsLeft = Math.max(0, budget - completedToday);

  const habitsTickedTodayCount = habits.filter(h => h.ticks.includes(todayStr)).length;

  // Focus-day streak — the canonical definition shared with Analytics. A habit
  // tick on a non-focus day must not inflate the streak. See computeFocusStreak.
  const streakInfo = computeFocusStreak(history);

  // Generate 7-day history for streak card day-squares ending on today
  const last7Days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dateStr = getLocalDateString(d);
    const rec = history.find(r => r.date === dateStr);
    const count = rec?.completedPomodoros ?? 0;
    return { dateStr, count, isToday: i === 6 };
  });

  // Active Cycle & Objectives progress calculation
  const cycleObjectives = objectives.filter(
    o => !activeCycle || o.cycleId === activeCycle.id
  );

  const objectiveProgresses = cycleObjectives.map(obj => {
    const objKrs = keyResults.filter(kr => kr.objectiveId === obj.id);
    if (objKrs.length === 0) return { objective: obj, progress: 0, isAtRisk: false };

    const totalPct = objKrs.reduce((acc, kr) => {
      const pct = kr.targetValue > 0 ? (kr.currentValue / kr.targetValue) * 100 : 0;
      return acc + Math.min(100, Math.round(pct));
    }, 0);

    const avgPct = Math.round(totalPct / objKrs.length);
    const hasAtRiskKr = objKrs.some(
      kr => kr.confidence === 'at_risk' || kr.confidence === 'off_track'
    );

    return { objective: obj, progress: avgPct, isAtRisk: hasAtRiskKr || avgPct === 0 };
  });

  const overallCycleProgress =
    objectiveProgresses.length > 0
      ? Math.round(
          objectiveProgresses.reduce((sum, item) => sum + item.progress, 0) /
            objectiveProgresses.length
        )
      : 0;

  // Format date header string
  const now = new Date();
  const formattedDateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
  const cycleWeekStr = activeCycle
    ? `${formattedDateStr} · active cycle`
    : formattedDateStr;

  const remainingBacklogCount = Math.max(0, activeTaskCount - displayed.length);

  return (
    <div className="today-dashboard">
      {/* Header section */}
      <header className="today-header">
        <div className="today-title-group">
          <h1 className="today-title">Today's Focus</h1>
          <div className="today-date-subtitle">{cycleWeekStr}</div>
        </div>

        <button
          onClick={handleReplan}
          className="today-replan-btn"
          title="Recompute today's plan from scratch"
        >
          <RefreshCw size={13} />
          <span>Replan day</span>
        </button>
      </header>

      {/* Empty State fallback when no tasks exist */}
      {displayed.length === 0 ? (
        <div className="today-empty-wrap">
          <EmptyState
            icon={<ClipboardList size={40} />}
            title="No tasks in your daily plan"
            message="Add tasks with priorities to generate your daily focus picks."
            actions={[{ label: 'Go to Tasks', onClick: onGoToTasks, primary: true }]}
          />
        </div>
      ) : (
        <>
          <section className="today-body">
            {/* NOW Card (#1 Task) */}
            {nowTask && (
              <NowCard
                task={nowTask}
                kr={nowTask.keyResultId ? krMap.get(nowTask.keyResultId) : undefined}
                objective={
                  nowTask.keyResultId && krMap.get(nowTask.keyResultId)
                    ? objMap.get(krMap.get(nowTask.keyResultId)!.objectiveId)
                    : undefined
                }
                maxShare={maxShare}
                onStart={() => handleStart(nowTask.id)}
                onSkip={() => handleSkip(nowTask.id)}
              />
            )}

            {/* Daily progress: pomodoros completed today vs the daily budget */}
            <div className="today-hero-stat-card area-plan">
              <div className="today-stat-label">TODAY</div>
              <div className="today-pomo-ring-container">
                <div className="today-pomo-ring-wrap">
                  <svg className="today-pomo-ring-svg" width="124" height="124" viewBox="0 0 124 124">
                    <circle cx="62" cy="62" r="52" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="10" />
                    <circle
                      cx="62"
                      cy="62"
                      r="52"
                      fill="none"
                      stroke="var(--color-primary)"
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray="326.7"
                      strokeDashoffset={326.7 * (1 - Math.min(1, completedToday / Math.max(1, budget)))}
                      transform="rotate(-90 62 62)"
                    />
                  </svg>
                  <div className="today-pomo-ring-content">
                    <div className="today-stat-value">
                      {completedToday}<span className="today-pomo-budget">/{budget}</span>
                    </div>
                    <div className="today-stat-subtext">pomodoros</div>
                  </div>
                </div>
                <div className="today-stat-foot">
                  {sessionsLeft === 0
                    ? 'Daily target reached'
                    : `${sessionsLeft} session${sessionsLeft > 1 ? 's' : ''} left today`}
                </div>
              </div>
            </div>

            {/* Streak Stat Card */}
            <div className="today-hero-stat-card area-streak">
              <div className="today-stat-label">STREAK</div>
              <div className="today-stat-val-row">
                <span className="today-streak-badge">
                  <span className="today-streak-value today-stat-value">{streakInfo.current}</span>
                </span>
                <span className="today-stat-subtext">days</span>
              </div>
              <div className="today-streak-history">
                {last7Days.map((day) => (
                  <div
                    key={day.dateStr}
                    className={`today-streak-day-square ${day.count > 0 ? 'filled' : (day.isToday ? 'today-pending' : 'empty')}`}
                    title={`${day.dateStr}: ${day.count} pomodoros`}
                  />
                ))}
              </div>
            </div>
            {/* Column 1: UP NEXT */}
            <div className="today-card-panel area-upnext">
              <div className="today-panel-header">
                <div className="today-panel-title">UP NEXT</div>
                <div className="today-panel-subtitle">click to reorder</div>
              </div>

              {upNextTasks.length === 0 ? (
                <div className="today-panel-empty">
                  No more tasks queued for today.
                </div>
              ) : (
                <div className="today-upnext-list">
                  {upNextTasks.map((task, idx) => {
                    const actualIndex = idx + 1; // index in `displayed` array
                    const kr = task.keyResultId ? krMap.get(task.keyResultId) : undefined;
                    const obj = kr ? objMap.get(kr.objectiveId) : undefined;

                    return (
                      <UpNextCard
                        key={task.id}
                        task={task}
                        kr={kr}
                        objective={obj}
                        rank={actualIndex + 1}
                        maxShare={maxShare}
                        selected={selectedUpNextId === task.id}
                        onCardClick={() => handleUpNextCardClick(task.id)}
                        onPromote={() => handlePromoteToNow(actualIndex)}
                      />
                    );
                  })}
                </div>
              )}

              {remainingBacklogCount > 0 && (
                <div className="today-upnext-backlog-count">
                  + {remainingBacklogCount} more in the backlog
                </div>
              )}
            </div>

            {/* Column 2: HABITS */}
            <div className="today-card-panel area-habits">
              <div className="today-panel-header">
                <div className="today-panel-title">
                  HABITS · {habitsTickedTodayCount} OF {habits.length}
                </div>
                <button
                  onClick={handleNavigateToHabits}
                  className="today-icon-btn"
                  title="Manage habits"
                >
                  <Plus size={14} />
                </button>
              </div>

              {habits.length === 0 ? (
                <div className="today-panel-empty today-habits-empty">
                  <div>No habits tracked yet.</div>
                  <button
                    onClick={handleNavigateToHabits}
                    className="today-add-habit-link"
                  >
                    <Plus size={12} /> Add Habit
                  </button>
                </div>
              ) : (
                <div className="today-habit-list">
                  {habits.map(habit => {
                    const isTicked = habit.ticks.includes(todayStr);
                    const streak = computeHabitStreaks(habit.ticks);

                    return (
                      <button
                        key={habit.id}
                        className={`today-habit-item ${!isTicked ? 'active-pending' : ''}`}
                        onClick={() => handleToggleHabitToday(habit.id)}
                      >
                        <div
                          className={`today-habit-check-box ${
                            isTicked ? 'checked' : 'unchecked'
                          }`}
                        >
                          {isTicked && <Check className="lucide-check" size={12} strokeWidth={3} />}
                        </div>

                        <span
                          className={`today-habit-name ${isTicked ? 'completed' : ''}`}
                        >
                          {habit.name}
                        </span>

                        {streak.current > 0 && (
                          <span className="today-habit-streak-pill">
                            {streak.current}d
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Column 3: CURRENT CYCLE / OKRs */}
            <div className="today-card-panel cycle-panel area-cycle">
              <div className="today-panel-header">
                <div className="today-panel-title">
                  {activeCycle ? activeCycle.name : 'CYCLE'} · {overallCycleProgress}%
                </div>
              </div>

              {objectiveProgresses.length === 0 ? (
                <div className="today-panel-empty">
                  No active objectives in current cycle.
                </div>
              ) : (
                <div className="today-okr-list">
                  {objectiveProgresses.slice(0, 4).map(({ objective, progress, isAtRisk }) => (
                    <div key={objective.id} className="today-okr-item">
                      <div className="today-okr-header-line">
                        <span className="today-okr-title" title={objective.title}>
                          {objective.title}
                        </span>
                        <span className={`today-okr-pct ${isAtRisk ? 'at-risk' : ''}`}>
                          {progress}%
                        </span>
                      </div>
                      <div className="today-okr-progress-track">
                        <div
                          className={`today-okr-progress-fill ${isAtRisk ? 'at-risk' : ''}`}
                          style={{ width: `${Math.max(2, progress)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="today-review-callout" onClick={handleNavigateToReview}>
                <span>Weekly review due Sunday</span>
                <ChevronRight size={13} />
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
