import { useState, useEffect, useCallback } from 'react';
import {
  loadKeyResults, loadObjectives, getActiveCycle, loadCycles,
  type KeyResult, type Objective, type OKRCycle,
} from '../lib/okr-storage';
import { loadHabits, type Habit } from '../lib/habit-storage';

/**
 * Loads the cycle-scoped OKR view data — cycles, active cycle, the active
 * cycle's key results + objectives, and habits. Shared by the Plan-group views
 * (PomodoroApp) and the Focus Session tab (SessionView), so the active-cycle
 * keyResult filter lives in one place instead of being copied per consumer.
 *
 * Owns the mount load and the `myokr-data-synced` background reload; exposes
 * `reload()` for callers that need to refresh on a tab switch or after import.
 */
export function useOkrViewData() {
  const [cycles, setCycles] = useState<OKRCycle[]>([]);
  const [activeCycle, setActiveCycle] = useState<OKRCycle | null>(null);
  const [keyResults, setKeyResults] = useState<KeyResult[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);

  const reload = useCallback(async () => {
    const loadedCycles = await loadCycles();
    setCycles(loadedCycles);
    const currCycle = await getActiveCycle();
    setActiveCycle(currCycle);
    if (currCycle) {
      const [krs, objs] = await Promise.all([loadKeyResults(), loadObjectives()]);
      setObjectives(objs);
      const activeObjs = new Set(objs.filter(o => o.cycleId === currCycle.id).map(o => o.id));
      setKeyResults(krs.filter(kr => activeObjs.has(kr.objectiveId)));
    }
    setHabits(await loadHabits());
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    const onSync = () => { reload(); };
    window.addEventListener('myokr-data-synced', onSync);
    return () => window.removeEventListener('myokr-data-synced', onSync);
  }, [reload]);

  return { cycles, activeCycle, keyResults, objectives, habits, reload };
}
