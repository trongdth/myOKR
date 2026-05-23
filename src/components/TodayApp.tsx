import { useState, useEffect, useCallback } from 'react';
import { loadTasks, loadSettings, type PomodoroTask, type PomodoroSettings } from '../lib/pomodoro-storage';
import { loadKeyResults, loadObjectives, getActiveCycle, type KeyResult, type Objective } from '../lib/okr-storage';
import { pickForBudget, getReshufflePool, getDailyPomodoroBudget, getMaxTaskBudgetShare, todaysSlice } from '../lib/today-focus';
import FocusCard from './today/FocusCard';
import LoadingState from './shared/LoadingState';

interface TodayAppProps {
  onStartTask: (taskId: string) => void;
  onGoToTasks: () => void;
}

interface ScoredTask extends PomodoroTask {
  _score: import('../lib/today-focus').ScoreBreakdown;
}

export default function TodayApp({ onStartTask, onGoToTasks }: TodayAppProps) {
  const [displayed, setDisplayed] = useState<ScoredTask[]>([]);
  const [pool, setPool] = useState<ScoredTask[]>([]);
  const [keyResults, setKeyResults] = useState<KeyResult[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [settings, setSettings] = useState<PomodoroSettings | null>(null);
  const [skippedIds, setSkippedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const compute = useCallback(async (exclude: string[] = []) => {
    const [tasks, krs, objs, cyc, sett] = await Promise.all([
      loadTasks(),
      loadKeyResults(),
      loadObjectives(),
      getActiveCycle(),
      loadSettings(),
    ]);

    const activeObjIds = new Set(
      objs.filter((o: Objective) => !cyc || o.cycleId === cyc.id).map((o: Objective) => o.id),
    );
    const activeKrs = krs.filter((kr: KeyResult) => activeObjIds.has(kr.objectiveId));

    setKeyResults(activeKrs);
    setObjectives(objs);
    setSettings(sett);

    const picked = pickForBudget(tasks, activeKrs, cyc, sett, exclude);
    const fullPool = getReshufflePool(tasks, activeKrs, cyc, sett, picked.length, exclude);
    setPool(fullPool);
    setDisplayed(picked);
  }, []);

  useEffect(() => {
    compute().then(() => setIsLoading(false));
  }, [compute]);

  const handleStart = (taskId: string) => {
    onStartTask(taskId);
  };

  const handleSkip = (taskId: string) => {
    const nextSkipped = [...skippedIds, taskId];
    setSkippedIds(nextSkipped);
    compute(nextSkipped);
  };

  const handleReshuffle = () => {
    if (!settings || pool.length <= displayed.length) return;
    // Shuffle entire pool to surface different candidates
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const budget = getDailyPomodoroBudget(settings);
    const maxShare = getMaxTaskBudgetShare(budget);
    let cumulative = 0;
    const picked: typeof shuffled = [];
    for (const t of shuffled) {
      if (picked.length >= 5) break;
      picked.push(t);
      cumulative += todaysSlice(t, maxShare);
      if (cumulative >= budget && picked.length >= 1) break;
    }
    setDisplayed(picked);
  };

  if (isLoading || !settings) return <LoadingState className="today-container" />;

  const krMap = new Map(keyResults.map(kr => [kr.id, kr]));
  const objMap = new Map(objectives.map(o => [o.id, o]));
  const budget = getDailyPomodoroBudget(settings);
  const maxShare = getMaxTaskBudgetShare(budget);

  const totalSlices = displayed.reduce(
    (sum, t) => sum + todaysSlice(t, maxShare), 0,
  );

  // Empty state
  if (displayed.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '60vh',
        gap: '1rem',
        color: 'var(--text-secondary)',
      }}>
        <span style={{ fontSize: '3rem' }}>📋</span>
        <h2 style={{ fontWeight: 600, color: 'var(--text-primary)' }}>No tasks yet</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Add tasks with priorities to get your daily focus picks.
        </p>
        <button className="btn" onClick={onGoToTasks} style={{ marginTop: '0.5rem' }}>
          Go to Tasks
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
          Today's Focus
        </h1>
        {pool.length > displayed.length && (
          <button
            onClick={handleReshuffle}
            className="btn-ghost"
          >
            🔀 Reshuffle
          </button>
        )}
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
    </div>
  );
}
