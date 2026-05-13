import { useState, useEffect } from 'react';
import '../styles/okr.css';
import {
  ensureCyclesExist, saveCycles,
  loadObjectives, saveObjectives,
  loadKeyResults, saveKeyResults,
  computeOverallProgress, getMonthName,
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
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'objective' | 'kr', id: string, title?: string } | null>(null);

  // Load data on mount
  useEffect(() => {
    async function init() {
      const c = await ensureCyclesExist();
      setCycles(c);
      const active = c.find(x => x.isActive) || c[0];
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
        }}
        title={deleteTarget?.type === 'objective' ? 'Delete Objective?' : 'Delete Key Result?'}
        message={
          deleteTarget?.type === 'objective'
            ? `Are you sure you want to delete "${deleteTarget?.title}" and all its key results? This cannot be undone.`
            : `Are you sure you want to delete "${deleteTarget?.title}"? This cannot be undone.`
        }
        confirmText="Delete"
      />
    </div>
  );
}
