import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Check, Flame, ClipboardList, Plus, ChevronRight } from 'lucide-react';
import {
  loadTasks,
  loadSettings,
  loadHistory,
  getLocalDateString,
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
  todaysSlice,
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
  const [allTasksCount, setAllTasksCount] = useState(0);
  const [keyResults, setKeyResults] = useState<KeyResult[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [activeCycle, setActiveCycle] = useState<OKRCycle | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [history, setHistory] = useState<DailyRecord[]>([]);
  const [settings, setSettings] = useState<PomodoroSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Drag and drop state for UP NEXT list
  const draggedIndexRef = useRef<number | null>(null);

  const compute = useCallback(async (opts: { reset?: boolean } = {}) => {
    const [tasks, krs, objs, cyc, sett, loadedHabits, loadedHistory] = await Promise.all([
      loadTasks(),
      loadKeyResults(),
      loadObjectives(),
      getActiveCycle(),
      loadSettings(),
      loadHabits(),
      loadHistory(),
    ]);

    setAllTasksCount(tasks.length);
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
    const { picked, plan } = buildTodayList(tasks, activeKrs, cyc, sett, savedPlan);
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
    compute({ reset: true });
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

  const handleDropUpNext = (targetIdx: number) => {
    const draggedIdx = draggedIndexRef.current;
    if (draggedIdx === null || draggedIdx === targetIdx) return;

    const newDisplayed = [...displayed];
    const [moved] = newDisplayed.splice(draggedIdx, 1);
    newDisplayed.splice(targetIdx, 0, moved);

    setDisplayed(newDisplayed);
    draggedIndexRef.current = null;

    const plan = loadTodayPlan();
    if (plan) {
      saveTodayPlan({
        ...plan,
        taskIds: newDisplayed.map(t => t.id),
      });
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

  const totalSlices = displayed.reduce((sum, t) => sum + todaysSlice(t, maxShare), 0);
  const sessionsLeft = Math.max(0, budget - totalSlices);

  // Habits calculations
  const todayStr = getLocalDateString();
  const habitsTickedTodayCount = habits.filter(h => h.ticks.includes(todayStr)).length;

  // Streak calculations (combine habits ticks and history)
  const historyDates = history
    .filter(r => r.completedPomodoros > 0 || r.totalFocusMinutes > 0)
    .map(r => r.date);
  const allHabitTicks = habits.flatMap(h => h.ticks);
  const combinedTicks = Array.from(new Set([...historyDates, ...allHabitTicks])).sort();
  const streakInfo = computeHabitStreaks(combinedTicks);

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

  const remainingBacklogCount = Math.max(0, allTasksCount - displayed.length);

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
          <span>Replan</span>
        </button>
      </header>

      {/* Empty State fallback when no tasks exist */}
      {displayed.length === 0 ? (
        <div style={{ background: '#10141A', border: '1px solid rgba(255, 255, 255, 0.07)', borderRadius: '14px' }}>
          <EmptyState
            icon={<ClipboardList size={40} />}
            title="No tasks in your daily plan"
            message="Add tasks with priorities to generate your daily focus picks."
            actions={[{ label: 'Go to Tasks', onClick: onGoToTasks, primary: true }]}
          />
        </div>
      ) : (
        <>
          {/* Top Hero Row */}
          <section className="today-hero-row">
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

            {/* Daily Plan Progress Card */}
            <div className="today-hero-stat-card">
              <div className="today-stat-label">
                Today's Plan: {totalSlices} / {budget}
              </div>
              <div className="today-stat-val-row">
                <span className="today-stat-value">
                  {totalSlices}/{budget}
                </span>
                <span className="today-stat-subtext">pomodoros</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#727C8C' }}>
                {sessionsLeft === 0
                  ? 'Daily target reached'
                  : `${sessionsLeft} session${sessionsLeft > 1 ? 's' : ''} left today`}
              </div>
            </div>

            {/* Streak Stat Card */}
            <div className="today-hero-stat-card">
              <div className="today-stat-label">STREAK</div>
              <div className="today-stat-val-row">
                <span className="today-streak-badge">
                  <Flame size={20} fill="currentColor" />
                  <span className="today-stat-value">{streakInfo.current}</span>
                </span>
                <span className="today-stat-subtext">days</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#727C8C' }}>
                Best: {streakInfo.best} day{streakInfo.best !== 1 ? 's' : ''}
              </div>
            </div>
          </section>

          {/* Bottom 3-Column Grid */}
          <section className="today-grid-3col">
            {/* Column 1: UP NEXT */}
            <div className="today-card-panel">
              <div className="today-panel-header">
                <div className="today-panel-title">UP NEXT</div>
                <div className="today-panel-subtitle">drag to reorder</div>
              </div>

              {upNextTasks.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: '#4E5766', fontStyle: 'italic', padding: '0.5rem 0' }}>
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
                        onPromote={() => handlePromoteToNow(actualIndex)}
                        onDragStart={() => {
                          draggedIndexRef.current = actualIndex;
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                        }}
                        onDrop={() => handleDropUpNext(actualIndex)}
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
            <div className="today-card-panel">
              <div className="today-panel-header">
                <div className="today-panel-title">
                  HABITS · {habitsTickedTodayCount} OF {habits.length}
                </div>
                <button
                  onClick={handleNavigateToHabits}
                  style={{ background: 'none', border: 'none', color: '#727C8C', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  title="Manage habits"
                >
                  <Plus size={14} />
                </button>
              </div>

              {habits.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: '#4E5766', fontStyle: 'italic', padding: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div>No habits tracked yet.</div>
                  <button
                    onClick={handleNavigateToHabits}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      color: '#22D3EE',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      padding: 0,
                    }}
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
            <div className="today-card-panel cycle-panel">
              <div className="today-panel-header">
                <div className="today-panel-title">
                  {activeCycle ? activeCycle.name : 'CYCLE'} · {overallCycleProgress}%
                </div>
              </div>

              {objectiveProgresses.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: '#4E5766', fontStyle: 'italic', padding: '0.5rem 0' }}>
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
