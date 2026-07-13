import { useState, useEffect, useCallback } from 'react';
import { loadTasks, loadSettings, getLocalDateString, type PomodoroSettings } from '../lib/pomodoro-storage';
import { loadKeyResults, loadObjectives, getActiveCycle, type KeyResult, type Objective } from '../lib/okr-storage';
import { loadHabits, saveHabits, type Habit } from '../lib/habit-storage';
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
import FocusCard from './today/FocusCard';
import LoadingState from './shared/LoadingState';

interface TodayAppProps {
  onStartTask: (taskId: string) => void;
  onGoToTasks: () => void;
}

export default function TodayApp({ onStartTask, onGoToTasks }: TodayAppProps) {
  const [displayed, setDisplayed] = useState<ScoredTask[]>([]);
  const [keyResults, setKeyResults] = useState<KeyResult[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [settings, setSettings] = useState<PomodoroSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const compute = useCallback(async (opts: { reset?: boolean } = {}) => {
    const [tasks, krs, objs, cyc, sett, loadedHabits] = await Promise.all([
      loadTasks(),
      loadKeyResults(),
      loadObjectives(),
      getActiveCycle(),
      loadSettings(),
      loadHabits(),
    ]);

    const activeObjIds = new Set(
      objs.filter((o: Objective) => !cyc || o.cycleId === cyc.id).map((o: Objective) => o.id),
    );
    const activeKrs = krs.filter((kr: KeyResult) => activeObjIds.has(kr.objectiveId));

    setKeyResults(activeKrs);
    setObjectives(objs);
    setSettings(sett);
    setHabits(loadedHabits);

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
          updatedAt: new Date().toISOString()
        };
      }
      return h;
    });
    setHabits(updated);
    await saveHabits(updated);
    window.dispatchEvent(new CustomEvent('myokr-data-synced'));
  };

  if (isLoading || !settings) return <LoadingState className="today-container" />;

  const krMap = new Map(keyResults.map(kr => [kr.id, kr]));
  const objMap = new Map(objectives.map(o => [o.id, o]));
  const budget = getDailyPomodoroBudget(settings);
  const maxShare = getMaxTaskBudgetShare(budget);

  const totalSlices = displayed.reduce(
    (sum, t) => sum + todaysSlice(t, maxShare), 0,
  );

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
          Today's Focus
        </h1>
        <button
          onClick={handleReplan}
          className="btn-ghost"
          title="Recompute today's plan from scratch (clears skips)"
        >
          ↻ Replan
        </button>
      </div>

      {/* Budget header strip */}
      <div style={{
        fontSize: '0.85rem',
        color: 'var(--text-muted)',
        marginBottom: '1.25rem',
        paddingBottom: '0.75rem',
        borderBottom: '1px solid var(--border-color)',
      }}>
        Today's Plan: {totalSlices} / {budget} 🍅
      </div>

      {/* Habits Today Row */}
      {habits.length > 0 && (
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '1rem',
          marginBottom: '1.25rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
        }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Habits Today
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {habits.map(habit => {
              const todayStr = getLocalDateString();
              const isTicked = habit.ticks.includes(todayStr);
              return (
                <button
                  key={habit.id}
                  onClick={() => handleToggleHabitToday(habit.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '8px',
                    background: isTicked ? 'var(--accent-gradient)' : 'var(--bg-primary)',
                    color: isTicked ? '#fff' : 'var(--text-primary)',
                    fontSize: '0.9rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isTicked ? '0 2px 6px rgba(99, 102, 241, 0.2)' : 'none',
                    border: isTicked ? '1px solid transparent' : '1px solid var(--border-color)'
                  }}
                >
                  <span style={{ fontSize: '1.2rem', lineHeight: '1' }}>{isTicked ? '✅' : '⬜'}</span>
                  <span>{habit.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {displayed.length === 0 ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '3rem 1rem',
          gap: '1rem',
          color: 'var(--text-secondary)',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
        }}>
          <span style={{ fontSize: '2.5rem' }}>📋</span>
          <h2 style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '1.2rem' }}>No tasks yet</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', maxWidth: '300px' }}>
            Add tasks with priorities to get your daily focus picks.
          </p>
          <button className="btn" onClick={onGoToTasks} style={{ marginTop: '0.5rem' }}>
            Go to Tasks
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {displayed.map((task, i) => {
            const kr = task.keyResultId ? krMap.get(task.keyResultId) : undefined;
            const obj = kr ? objMap.get(kr.objectiveId) : undefined;
            return (
              <FocusCard
                key={task.id}
                task={task}
                kr={kr}
                objective={obj}
                rank={i + 1}
                isTop={i === 0}
                maxShare={maxShare}
                onStart={() => handleStart(task.id)}
                onSkip={() => handleSkip(task.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
