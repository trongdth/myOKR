import { useState, useEffect } from 'react';
import { Target, Plus } from 'lucide-react';
import '../styles/okr.css';
import {
  ensureCyclesExist, saveCycles,
  loadObjectives, saveObjectives,
  loadKeyResults, saveKeyResults,
  computeOverallProgress, getMonthName,
  cloneCycleStructure, resolveCurrentCycle,
  COMPLETION_MODE_META,
  type OKRCycle, type Objective, type KeyResult,
} from '../lib/okr-storage';
import { generateId, loadSettings, saveTasks, isTaskInCycle, buildKrCycleMap, stampUpdatedAt, type PomodoroTask } from '../lib/pomodoro-storage';
import { loadTasks } from '../lib/pomodoro-storage';
import { loadHabits, type Habit } from '../lib/habit-storage';
import CycleSelector from './okr/CycleSelector';
import ObjectiveCard from './okr/ObjectiveCard';
import NewObjectiveForm, { type NewObjectiveDraft } from './okr/NewObjectiveForm';
import PlanTabStrip, { cycleWeekLabel, cycleTitleLabel, PlanHeader } from './pomodoro/PlanTabStrip';
import CommandKModal from './pomodoro/CommandKModal';
import TaskDetailModal from './pomodoro/TaskDetailModal';
import ConfirmModal from './ConfirmModal';
import LoadingState from './shared/LoadingState';
import { EmptyState } from './shared/EmptyState';

export default function OKRApp() {
  const [isLoading, setIsLoading] = useState(true);
  const [cycles, setCycles] = useState<OKRCycle[]>([]);
  const [activeCycleId, setActiveCycleId] = useState<string>('');
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [keyResults, setKeyResults] = useState<KeyResult[]>([]);
  const [tasks, setTasks] = useState<PomodoroTask[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [focusDuration, setFocusDuration] = useState(25);
  const [showNewObjectiveForm, setShowNewObjectiveForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'objective' | 'kr' | 'cycle', id: string, title?: string } | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedDetailTask, setSelectedDetailTask] = useState<PomodoroTask | null>(null);

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
      setHabits(await loadHabits());
      const settings = await loadSettings();
      setFocusDuration(settings.focusDuration);

      setIsLoading(false);
    }
    init();
  }, []);

  // Listen to background sync and reload data dynamically
  useEffect(() => {
    async function reloadData() {
      const c = await ensureCyclesExist();
      setCycles(c);
      if (!activeCycleId || !c.some(cycle => cycle.id === activeCycleId)) {
        const active = resolveCurrentCycle(c);
        if (active) setActiveCycleId(active.id);
      }

      setObjectives(await loadObjectives());
      setKeyResults(await loadKeyResults());
      setTasks(await loadTasks());
      setHabits(await loadHabits());
      const settings = await loadSettings();
      setFocusDuration(settings.focusDuration);
    }

    const handleSync = () => {
      reloadData();
    };

    window.addEventListener('myokr-data-synced', handleSync);
    return () => window.removeEventListener('myokr-data-synced', handleSync);
  }, [activeCycleId]);

  // Meta+K opens search — the P7 revamp removed the header Search button, so the
  // keyboard path is the dedicated entry (same listener as the Tasks screen).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Derived
  const cycleObjectives = objectives
    .filter(o => o.cycleId === activeCycleId)
    .sort((a, b) => a.order - b.order);

  const overallProgress = computeOverallProgress(objectives, keyResults, activeCycleId, tasks, focusDuration, habits, cycles);

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

  // P7: cycle countdown line, counts, tab-strip numbers
  const krCountInCycle = keyResults.filter(kr => cycleObjectives.some(o => o.id === kr.objectiveId)).length;
  const isCurrentCycle = !!activeCycle && activeCycle.month === now.getMonth() && activeCycle.year === now.getFullYear();
  const daysLeftInCycle = activeCycle ? new Date(activeCycle.year, activeCycle.month + 1, 0).getDate() - now.getDate() : 0;
  const krCycleMap = buildKrCycleMap(keyResults, objectives, cycles);
  const inCycle = (t: PomodoroTask) => isTaskInCycle(t, krCycleMap.get(t.keyResultId || ''), activeCycle ?? null);
  const openInCycleCount = tasks.filter(t => !t.isCompleted && inCycle(t)).length;
  const completedInCycleCount = tasks.filter(t => t.isCompleted && inCycle(t)).length;

  const updateTask = (updated: PomodoroTask) => {
    // OKRApp holds its own task state (decoupled from SessionProvider's
    // handleTasksChange), so stamp updatedAt here too — otherwise edits made
    // from the Objectives screen wouldn't refresh the Task-detail "updated" line.
    const stamped = stampUpdatedAt(updated, new Date().toISOString());
    const next = tasks.map(t => t.id === stamped.id ? stamped : t);
    setTasks(next);
    saveTasks(next).catch(console.error); // rule 3: act first, persist non-blocking
    setSelectedDetailTask(stamped);
  };

  const deleteTask = (id: string) => {
    const next = tasks.filter(t => t.id !== id);
    setTasks(next);
    saveTasks(next).catch(console.error); // rule 3: act first, persist non-blocking
    setSelectedDetailTask(null);
  };

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
  // The inline form's Create — always writes to the viewed cycle (P7 revamp).
  const createObjective = (draft: NewObjectiveDraft) => {
    const nowIso = new Date().toISOString();
    const obj: Objective = {
      id: generateId(),
      cycleId: activeCycleId,
      title: draft.title,
      reward: draft.reward,
      order: cycleObjectives.length,
      createdAt: nowIso,
    };
    const kr: KeyResult = {
      id: generateId(),
      objectiveId: obj.id,
      title: draft.kr.title,
      targetValue: draft.kr.targetValue,
      currentValue: draft.kr.currentValue,
      unit: COMPLETION_MODE_META[draft.kr.mode].unit,
      confidence: 'not_set',
      completionMode: draft.kr.mode,
      order: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const updatedObjectives = [...objectives, obj];
    const updatedKeyResults = [...keyResults, kr];
    setObjectives(updatedObjectives);
    setKeyResults(updatedKeyResults);
    saveObjectives(updatedObjectives);
    saveKeyResults(updatedKeyResults);
    setShowNewObjectiveForm(false);
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
      {/* Header (P7 revamp): PLAN · "{Mon} cycle" + inline cycle selector; right: cycle progress + New objective */}
      <PlanHeader
        activeCycle={activeCycle}
        title={activeCycle ? cycleTitleLabel(activeCycle) : undefined}
        afterTitle={
          <CycleSelector
            cycles={cycles}
            activeCycleId={activeCycleId}
            onSelect={handleSelectCycle}
            onCreateCycle={handleCreateCycle}
            onCloneCycle={canCloneActive ? handleCloneCycle : undefined}
            deletableCycleIds={deletableCycleIds}
            onDeleteCycle={deleteCycleRequest}
          />
        }
        right={
          <>
            <div className="okr-cycle-progress">
              <span className="okr-cycle-progress-label">
                Cycle progress <span className="okr-overall-text">{overallProgress}%</span>
              </span>
              <div className="okr-overall-bar">
                <div className="okr-overall-fill" style={{ width: `${overallProgress}%` }} />
              </div>
            </div>
            <button
              className="okr-new-objective-btn"
              onClick={() => setShowNewObjectiveForm(v => !v)}
              aria-expanded={showNewObjectiveForm}
            >
              <Plus size={15} />
              <span>New objective</span>
            </button>
          </>
        }
      />

      {/* Cycle countdown line (P7) */}
      {isCurrentCycle && activeCycle && (
        <span className="okr-cycle-countdown">
          {daysLeftInCycle} days left in cycle · {cycleObjectives.length} objectives · {krCountInCycle} key results
        </span>
      )}

      {/* Tab strip with counts (P7) */}
      <PlanTabStrip
        active="objectives"
        tasksCount={openInCycleCount}
        objectivesCount={cycleObjectives.length}
        doneCount={completedInCycleCount}
        cycleLabel={cycleWeekLabel(activeCycle)}
      />

      {/* Inline creation form — inserted at the top of the list (P7 revamp) */}
      {showNewObjectiveForm && (
        <NewObjectiveForm
          onCreate={createObjective}
          onCancel={() => setShowNewObjectiveForm(false)}
        />
      )}

      {/* Objectives */}
      {cycleObjectives.length === 0 && !showNewObjectiveForm && (
        <EmptyState
          icon={<Target size={32} />}
          title="No objectives for this cycle yet"
          message="Set one goal and its first key result to start tracking the cycle."
          actions={[
            { label: 'New objective', onClick: () => setShowNewObjectiveForm(true), primary: true },
          ]}
        />
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
          habits={habits}
          objectives={objectives}
          cycles={cycles}
        />
      ))}

      {/* Global ⌘K search + task detail (P6/P4) — same modal as the Tasks screen.
          Opened via Meta+K (the header Search button was removed in the P7 revamp). */}
      {isSearchOpen && (
        <CommandKModal
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          tasks={tasks}
          keyResults={keyResults}
          objectives={objectives}
          cycles={cycles}
          activeCycleId={activeCycleId || null}
          onSelectTask={(t) => setSelectedDetailTask(t)}
          onStartFocusTask={() => {
            window.dispatchEvent(new CustomEvent('myokr-navigate-to-section', { detail: 'session' }));
            setIsSearchOpen(false);
          }}
          onReopenTask={(task) => {
            const updated = tasks.map(t => t.id === task.id ? { ...t, isCompleted: false, completedAt: undefined } : t);
            setTasks(updated);
            saveTasks(updated);
          }}
        />
      )}

      {selectedDetailTask && (
        <TaskDetailModal
          task={selectedDetailTask}
          onUpdate={updateTask}
          onDelete={deleteTask}
          onClose={() => setSelectedDetailTask(null)}
          keyResults={keyResults}
          onStartFocus={() => {
            window.dispatchEvent(new CustomEvent('myokr-navigate-to-section', { detail: 'session' }));
            setSelectedDetailTask(null);
          }}
        />
      )}

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
