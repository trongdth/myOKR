import { useState, useEffect } from 'react';
import '../styles/okr.css';
import {
  ensureCyclesExist, saveCycles,
  loadObjectives, saveObjectives,
  loadKeyResults, saveKeyResults,
  computeOverallProgress, getMonthName,
  cloneCycleStructure, resolveCurrentCycle,
  type OKRCycle, type Objective, type KeyResult,
} from '../lib/okr-storage';
import { generateId, loadSettings } from '../lib/pomodoro-storage';
import { loadTasks, type PomodoroTask } from '../lib/pomodoro-storage';
import CycleSelector from './okr/CycleSelector';
import ObjectiveCard from './okr/ObjectiveCard';
import ConfirmModal from './ConfirmModal';
import LoadingState from './shared/LoadingState';

export default function OKRApp() {
  const [isLoading, setIsLoading] = useState(true);
  const [cycles, setCycles] = useState<OKRCycle[]>([]);
  const [activeCycleId, setActiveCycleId] = useState<string>('');
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [keyResults, setKeyResults] = useState<KeyResult[]>([]);
  const [tasks, setTasks] = useState<PomodoroTask[]>([]);
  const [focusDuration, setFocusDuration] = useState(25);
  const [newObjTitle, setNewObjTitle] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'objective' | 'kr' | 'cycle', id: string, title?: string } | null>(null);

  // Load data on mount
  useEffect(() => {
    async function init() {
      const c = await ensureCyclesExist();
      setCycles(c);
      const active = resolveCurrentCycle(c);
      if (active) setActiveCycleId(active.id);

      setObjectives(await loadObjectives());
      setKeyResults(await loadKeyResults());
      setTasks(await loadTasks());
      const settings = await loadSettings();
      setFocusDuration(settings.focusDuration);

      setIsLoading(false);
    }
    init();
  }, []);

  // Derived
  const cycleObjectives = objectives
    .filter(o => o.cycleId === activeCycleId)
    .sort((a, b) => a.order - b.order);

  const overallProgress = computeOverallProgress(objectives, keyResults, activeCycleId, tasks, focusDuration);

  const activeCycle = cycles.find(c => c.id === activeCycleId);
  const canCloneActive = !!activeCycle && objectives.some(o => o.cycleId === activeCycleId);

  // A cycle is deletable when it is strictly in the future AND has no objectives.
  const now = new Date();
  const currentMonthIdx = now.getFullYear() * 12 + now.getMonth();
  const deletableCycleIds = new Set(
    cycles
      .filter(c => (c.year * 12 + c.month) > currentMonthIdx)
      .filter(c => !objectives.some(o => o.cycleId === c.id))
      .map(c => c.id),
  );

  // ----- Cycle handlers -----
  const handleSelectCycle = (id: string) => {
    setActiveCycleId(id);
  };

  const handleCreateCycle = () => {
    // Find the last cycle and create the next month
    const lastCycle = cycles.length > 0
      ? cycles.reduce((latest, c) => (c.year * 12 + c.month) > (latest.year * 12 + latest.month) ? c : latest)
      : null;

    let nextMonth: number;
    let nextYear: number;

    if (lastCycle) {
      nextMonth = lastCycle.month === 11 ? 0 : lastCycle.month + 1;
      nextYear = lastCycle.month === 11 ? lastCycle.year + 1 : lastCycle.year;
    } else {
      const now = new Date();
      nextMonth = now.getMonth();
      nextYear = now.getFullYear();
    }

    const newCycle: OKRCycle = {
      id: generateId(),
      name: getMonthName(nextMonth, nextYear),
      month: nextMonth,
      year: nextYear,
      isActive: false,
      createdAt: new Date().toISOString(),
    };

    const updated = [...cycles, newCycle];
    setCycles(updated);
    saveCycles(updated);
    setActiveCycleId(newCycle.id);
  };

  const handleCloneCycle = () => {
    const source = cycles.find(c => c.id === activeCycleId);
    if (!source) return;

    // Target month is one after the latest cycle by month — avoids colliding
    // with any existing future placeholder cycle.
    const latest = cycles.reduce(
      (acc, c) => (c.year * 12 + c.month) > (acc.year * 12 + acc.month) ? c : acc,
      source,
    );
    const nextMonth = latest.month === 11 ? 0 : latest.month + 1;
    const nextYear = latest.month === 11 ? latest.year + 1 : latest.year;

    const { cycle, objectives: newObjs, keyResults: newKRs } =
      cloneCycleStructure(source, objectives, keyResults, nextMonth, nextYear);

    const updatedCycles = [...cycles, cycle];
    const updatedObjectives = [...objectives, ...newObjs];
    const updatedKeyResults = [...keyResults, ...newKRs];

    setCycles(updatedCycles);
    setObjectives(updatedObjectives);
    setKeyResults(updatedKeyResults);
    saveCycles(updatedCycles);
    saveObjectives(updatedObjectives);
    saveKeyResults(updatedKeyResults);
    setActiveCycleId(cycle.id);
  };

  const deleteCycleRequest = (id: string) => {
    const cycle = cycles.find(c => c.id === id);
    setDeleteTarget({ type: 'cycle', id, title: cycle?.name });
  };

  const executeDeleteCycle = (id: string) => {
    const nextCycles = cycles.filter(c => c.id !== id);
    setCycles(nextCycles);
    saveCycles(nextCycles);
    // Deletable cycles are guaranteed empty (no objectives → no KRs), so nothing else to prune.
    if (activeCycleId === id) {
      const fallback = nextCycles.find(c => c.isActive) || nextCycles[0];
      setActiveCycleId(fallback ? fallback.id : '');
    }
  };

  // ----- Objective handlers -----
  const addObjective = () => {
    const title = newObjTitle.trim();
    if (!title) return;
    const obj: Objective = {
      id: generateId(),
      cycleId: activeCycleId,
      title,
      order: cycleObjectives.length,
      createdAt: new Date().toISOString(),
    };
    const updated = [...objectives, obj];
    setObjectives(updated);
    saveObjectives(updated);
    setNewObjTitle('');
  };

  const updateObjective = (updated: Objective) => {
    const next = objectives.map(o => o.id === updated.id ? updated : o);
    setObjectives(next);
    saveObjectives(next);
  };

  const deleteObjectiveRequest = (id: string) => {
    const obj = objectives.find(o => o.id === id);
    setDeleteTarget({ type: 'objective', id, title: obj?.title });
  };

  const executeDeleteObjective = (id: string) => {
    const next = objectives.filter(o => o.id !== id);
    const nextKRs = keyResults.filter(kr => kr.objectiveId !== id);
    setObjectives(next);
    setKeyResults(nextKRs);
    saveObjectives(next);
    saveKeyResults(nextKRs);
  };

  // ----- Key Result handlers -----
  const addKeyResult = (kr: KeyResult) => {
    const updated = [...keyResults, kr];
    setKeyResults(updated);
    saveKeyResults(updated);
  };

  const updateKeyResult = (updated: KeyResult) => {
    const next = keyResults.map(kr => kr.id === updated.id ? updated : kr);
    setKeyResults(next);
    saveKeyResults(next);
  };

  const deleteKeyResultRequest = (id: string) => {
    const kr = keyResults.find(k => k.id === id);
    setDeleteTarget({ type: 'kr', id, title: kr?.title });
  };

  const executeDeleteKeyResult = (id: string) => {
    const next = keyResults.filter(kr => kr.id !== id);
    setKeyResults(next);
    saveKeyResults(next);
  };

  if (isLoading) {
    return <LoadingState className="okr-container" />;
  }

  return (
    <div className="okr-container">
      {/* Header */}
      <div className="okr-header">
        <div className="okr-header-left">
          <h2 className="okr-header-title">🎯 Objectives & Key Results</h2>
          <CycleSelector
            cycles={cycles}
            activeCycleId={activeCycleId}
            onSelect={handleSelectCycle}
            onCreateCycle={handleCreateCycle}
            onCloneCycle={canCloneActive ? handleCloneCycle : undefined}
            deletableCycleIds={deletableCycleIds}
            onDeleteCycle={deleteCycleRequest}
          />
        </div>
        <div className="okr-overall-progress">
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Overall</span>
          <div className="okr-overall-bar">
            <div className="okr-overall-fill" style={{ width: `${overallProgress}%` }} />
          </div>
          <span className="okr-overall-text">{overallProgress}%</span>
        </div>
      </div>

      {/* Objectives */}
      {cycleObjectives.length === 0 && (
        <div className="okr-empty">
          <div className="okr-empty-icon">🎯</div>
          <div className="okr-empty-text">No objectives for this cycle yet</div>
          <div className="okr-empty-hint">Add your first objective below to start tracking goals</div>
        </div>
      )}

      {cycleObjectives.map(obj => (
        <ObjectiveCard
          key={obj.id}
          objective={obj}
          keyResults={keyResults}
          tasks={tasks}
          focusDurationMinutes={focusDuration}
          onUpdateObjective={updateObjective}
          onDeleteObjective={deleteObjectiveRequest}
          onUpdateKeyResult={updateKeyResult}
          onDeleteKeyResult={deleteKeyResultRequest}
          onAddKeyResult={addKeyResult}
        />
      ))}

      {/* Add Objective */}
      <div className="okr-add-objective">
        <input
          type="text"
          placeholder="Add a new objective... (e.g. 'Ship myOKR v1.0')"
          value={newObjTitle}
          onChange={e => setNewObjTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addObjective()}
        />
        <button className="okr-add-btn" onClick={addObjective}>+ Add Objective</button>
      </div>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget?.type === 'objective') executeDeleteObjective(deleteTarget.id);
          else if (deleteTarget?.type === 'kr') executeDeleteKeyResult(deleteTarget.id);
          else if (deleteTarget?.type === 'cycle') executeDeleteCycle(deleteTarget.id);
        }}
        title={
          deleteTarget?.type === 'objective' ? 'Delete Objective?'
          : deleteTarget?.type === 'kr' ? 'Delete Key Result?'
          : 'Delete Cycle?'
        }
        message={
          deleteTarget?.type === 'objective'
            ? `Are you sure you want to delete "${deleteTarget?.title}" and all its key results? This cannot be undone.`
          : deleteTarget?.type === 'cycle'
            ? `Are you sure you want to delete cycle "${deleteTarget?.title}"? This cannot be undone.`
            : `Are you sure you want to delete "${deleteTarget?.title}"? This cannot be undone.`
        }
        confirmText="Delete"
      />
    </div>
  );
}
