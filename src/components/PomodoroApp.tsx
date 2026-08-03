import { useState, useEffect } from 'react';
import { Pause, Play, RotateCcw, Settings } from 'lucide-react';
import '../styles/pomodoro.css';
import type {
  PomodoroSettings, PomodoroTask, DailyRecord,
} from '../lib/pomodoro-storage';
import TaskList from './pomodoro/TaskList';
import TasksView from './pomodoro/TasksView';
import DoneView from './pomodoro/DoneView';
import CommandKModal from './pomodoro/CommandKModal';
import TaskDetailModal from './pomodoro/TaskDetailModal';
import Analytics from './pomodoro/Analytics';
import PrioritizeModal from './pomodoro/PrioritizeModal';
import {
  loadKeyResults, saveKeyResults, getActiveCycle,
  loadCycles, saveCycles, loadObjectives, saveObjectives,
  loadReviews, saveReviews,
  type KeyResult, type OKRCycle, type Objective, type WeeklyReview,
} from '../lib/okr-storage';
import ConfirmModal from './ConfirmModal';
import NumberInput from './NumberInput';
import LoadingState from './shared/LoadingState';
import { loadHabits, type Habit } from '../lib/habit-storage';
import { useSession } from './session/SessionProvider';

export default function PomodoroApp({
  tab,
  requestedTaskId,
  onRequestedTaskConsumed,
}: {
  tab: 'timer' | 'tasks' | 'analytics' | 'done';
  requestedTaskId?: string | null;
  onRequestedTaskConsumed?: () => void;
}) {
  const session = useSession();
  const {
    settings, tasks, history,
    sessionType, isRunning, completedPomos, activeTaskId, activeTask, activeFocusTaskId,
    isLoading, pulse, progress, minutes, seconds,
    toggleTimer, resetTimer, switchSession, setActiveTask, updateSetting, handleTasksChange,
    clearSessionData, importSessionData,
  } = session;

  // ----- OKR view data (cycle-scoped) — not session runtime -----
  const [keyResults, setKeyResults] = useState<KeyResult[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [cycles, setCycles] = useState<OKRCycle[]>([]);
  const [activeCycle, setActiveCycle] = useState<OKRCycle | null>(null);

  // ----- View-local state -----
  const [selectedDetailTask, setSelectedDetailTask] = useState<PomodoroTask | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPrioritizeModal, setShowPrioritizeModal] = useState(false);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);
  const [isConfirmImportOpen, setIsConfirmImportOpen] = useState(false);
  const [importData, setImportData] = useState<{
    settings: PomodoroSettings; tasks: PomodoroTask[]; history: DailyRecord[];
    cycles?: OKRCycle[]; objectives?: Objective[]; keyResults?: KeyResult[]; reviews?: WeeklyReview[];
  } | null>(null);

  // ----- Load OKR view data on mount -----
  useEffect(() => {
    async function initOkr() {
      const loadedCycles = await loadCycles();
      setCycles(loadedCycles);
      const currCycle = await getActiveCycle();
      setActiveCycle(currCycle);

      if (currCycle) {
        const krs = await loadKeyResults();
        const objs = await loadObjectives();
        setObjectives(objs);
        const activeObjs = new Set(objs.filter(o => o.cycleId === currCycle.id).map(o => o.id));
        setKeyResults(krs.filter(kr => activeObjs.has(kr.objectiveId)));
      }

      setHabits(await loadHabits());
    }
    initOkr();
  }, []);

  // Global ⌘K Search shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(v => !v);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Consume requestedTaskId from Today view
  useEffect(() => {
    if (requestedTaskId && !isLoading) {
      setActiveTask(requestedTaskId);
      onRequestedTaskConsumed?.();
    }
  }, [requestedTaskId, isLoading, onRequestedTaskConsumed, setActiveTask]);

  // Reload keyResults when switching tabs (KR titles may have changed on OKR page)
  useEffect(() => {
    if (tab === 'tasks' || tab === 'timer') {
      (async () => {
        const activeCycle = await getActiveCycle();
        if (activeCycle) {
          const krs = await loadKeyResults();
          const objs = await loadObjectives();
          setObjectives(objs);
          const activeObjs = new Set(objs.filter(o => o.cycleId === activeCycle.id).map(o => o.id));
          setKeyResults(krs.filter(kr => activeObjs.has(kr.objectiveId)));
        }
      })();
    }
  }, [tab]);

  // Background sync: reload OKR view data (settings/tasks/history are the provider's job)
  useEffect(() => {
    const handleSync = () => {
      (async () => {
        const currCycle = await getActiveCycle();
        if (currCycle) {
          const krs = await loadKeyResults();
          const objs = await loadObjectives();
          setObjectives(objs);
          const activeObjs = new Set(objs.filter(o => o.cycleId === currCycle.id).map(o => o.id));
          setKeyResults(krs.filter(kr => activeObjs.has(kr.objectiveId)));
        }
      })();
    };
    window.addEventListener('myokr-data-synced', handleSync);
    return () => window.removeEventListener('myokr-data-synced', handleSync);
  }, []);

  // ----- Analytics handlers -----
  const handleExport = async () => {
    try {
      const [expCycles, expObjectives, krs, reviews] = await Promise.all([
        loadCycles(), loadObjectives(), loadKeyResults(), loadReviews(),
      ]);
      const data = { settings, tasks, history, cycles: expCycles, objectives: expObjectives, keyResults: krs, reviews, exportedAt: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `myokr-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed:', e);
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const data = JSON.parse(content);
          if (!data.settings || !data.tasks || !data.history) return;
          setImportData(data);
          setIsConfirmImportOpen(true);
        } catch (err) {
          console.error('Invalid JSON file', err);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const executeImport = async () => {
    if (!importData) return;
    await importSessionData({ settings: importData.settings, tasks: importData.tasks, history: importData.history });
    if (importData.cycles) {
      // Await so getActiveCycle reads the just-saved cycles, then refresh the
      // active-cycle state — otherwise the pill, PlanTabStrip, and cycle-scoped
      // filtering keep the pre-import cycle until a reload.
      await saveCycles(importData.cycles);
      setCycles(importData.cycles);
      setActiveCycle(await getActiveCycle());
    }
    if (importData.objectives) { saveObjectives(importData.objectives); setObjectives(importData.objectives); }
    if (importData.keyResults) { saveKeyResults(importData.keyResults); setKeyResults(importData.keyResults); }
    if (importData.reviews) { saveReviews(importData.reviews); }
    setImportData(null);
  };

  const handleClearRequest = () => {
    setIsConfirmClearOpen(true);
  };

  const executeClear = async () => {
    await clearSessionData();
  };

  // ----- Timer ring geometry (pure derivation) -----
  const circumference = 2 * Math.PI * 120;
  const dashOffset = circumference * (1 - progress);
  const isBreak = sessionType !== 'focus';

  if (isLoading) {
    return <LoadingState className="pomodoro-container" />;
  }

  return (
    <div className={`pomodoro-container${tab === 'tasks' || tab === 'done' ? ' plan-group-shell' : ''}`}>

      {/* Timer Tab */}
      {tab === 'timer' && (
        <div className="timer-section">
          {/* Session type tabs */}
          <div className="session-tabs">
            <button className={`session-tab${sessionType === 'focus' ? ' active' : ''}`} onClick={() => switchSession('focus')}>Focus</button>
            <button className={`session-tab${sessionType === 'shortBreak' ? ' active break-tab' : ''}`} onClick={() => switchSession('shortBreak')}>Short Break</button>
            <button className={`session-tab${sessionType === 'longBreak' ? ' active break-tab' : ''}`} onClick={() => switchSession('longBreak')}>Long Break</button>
          </div>

          {/* Timer ring */}
          <div className={`timer-ring-container${pulse ? ' pulse' : ''}`}>
            <svg className="timer-ring-svg" viewBox="0 0 260 260">
              <defs>
                <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#06b6d4" />
                  <stop offset="100%" stopColor="#a855f7" />
                </linearGradient>
              </defs>
              <circle className="timer-ring-bg" cx="130" cy="130" r="120" />
              <circle
                className={`timer-ring-progress${isBreak ? ' break-ring' : ''}`}
                cx="130" cy="130" r="120"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
              />
            </svg>
            <div className="timer-display">
              <div className="timer-digits">{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</div>
              <div className="timer-label">{sessionType === 'focus' ? 'Focus' : sessionType === 'shortBreak' ? 'Short Break' : 'Long Break'}</div>
            </div>
          </div>

          {/* Pomodoro count dots */}
          <div className="pomodoro-count">
            {Array.from({ length: settings.pomosBeforeLongBreak }, (_, i) => (
              <div key={i} className={`pomo-dot${i < (completedPomos % settings.pomosBeforeLongBreak) ? ' filled' : ''}`} />
            ))}
          </div>

          {/* Controls */}
          <div className="timer-controls">
            <button className="btn-icon" onClick={() => setIsConfirmResetOpen(true)} title="Reset"><RotateCcw size={16} /></button>
            <button className="btn" onClick={toggleTimer}>{isRunning ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Start</>}</button>
            <button className="btn-icon" onClick={() => setShowSettings(!showSettings)} title="Settings"><Settings size={16} /></button>
          </div>

          {/* Active task indicator (fixed height to prevent layout shift) */}
          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center', minHeight: '1.5em', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {activeTask ? (
              <span>Working on: <strong style={{ color: 'var(--accent-cyan)' }}>{activeTask.title}</strong></span>
            ) : null}
          </div>

          {/* Settings panel */}
          {showSettings && (
            <div className="settings-panel">
              <div className="settings-grid">
                <div className="setting-item">
                  <label className="setting-label">Focus (min)</label>
                  <NumberInput className="setting-input" min={1} max={120} value={settings.focusDuration}
                    onChange={val => updateSetting('focusDuration', Math.max(1, Math.min(120, val)))} />
                </div>
                <div className="setting-item">
                  <label className="setting-label">Short Break (min)</label>
                  <NumberInput className="setting-input" min={1} max={30} value={settings.shortBreakDuration}
                    onChange={val => updateSetting('shortBreakDuration', Math.max(1, Math.min(30, val)))} />
                </div>
                <div className="setting-item">
                  <label className="setting-label">Long Break (min)</label>
                  <NumberInput className="setting-input" min={1} max={60} value={settings.longBreakDuration}
                    onChange={val => updateSetting('longBreakDuration', Math.max(1, Math.min(60, val)))} />
                </div>
                <div className="setting-item">
                  <label className="setting-label">Pomos before long break</label>
                  <NumberInput className="setting-input" min={1} max={10} value={settings.pomosBeforeLongBreak}
                    onChange={val => updateSetting('pomosBeforeLongBreak', Math.max(1, Math.min(10, val)))} />
                </div>
                <div className="setting-item full-width">
                  <div className="toggle-row">
                    <span className="setting-label">Auto-start breaks</span>
                    <button className={`toggle-switch${settings.autoStartBreaks ? ' on' : ''}`}
                      onClick={() => updateSetting('autoStartBreaks', !settings.autoStartBreaks)} />
                  </div>
                </div>
                <div className="setting-item full-width">
                  <div className="toggle-row">
                    <span className="setting-label">Auto-start focus</span>
                    <button className={`toggle-switch${settings.autoStartFocus ? ' on' : ''}`}
                      onClick={() => updateSetting('autoStartFocus', !settings.autoStartFocus)} />
                  </div>
                </div>
                <div className="setting-item full-width">
                  <div className="toggle-row">
                    <span className="setting-label">Focus music</span>
                    <button className={`toggle-switch${settings.focusMusicEnabled ? ' on' : ''}`}
                      onClick={() => updateSetting('focusMusicEnabled', !settings.focusMusicEnabled)} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Prioritize button + Quick task list on timer tab */}
          <div className="timer-task-header">
            <button className="prioritize-btn" onClick={() => setShowPrioritizeModal(true)} title="Prioritize tasks using Eisenhower Matrix">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              Prioritize
            </button>
          </div>
          <TaskList tasks={tasks} activeTaskId={activeTaskId} onTasksChange={handleTasksChange} onSetActive={setActiveTask} keyResults={keyResults} hideCompleted={true} activeFocusTaskId={activeFocusTaskId} />

          {/* Prioritize Modal */}
          {showPrioritizeModal && (
            <PrioritizeModal
              tasks={tasks}
              activeTaskId={activeTaskId}
              onTasksChange={handleTasksChange}
              onClose={() => setShowPrioritizeModal(false)}
            />
          )}
        </div>
      )}

      {/* Tasks Tab */}
      {tab === 'tasks' && (
        <TasksView
          tasks={tasks}
          activeTaskId={activeTaskId}
          onTasksChange={handleTasksChange}
          onSetActive={setActiveTask}
          onSelectTask={(t) => setSelectedDetailTask(t)}
          keyResults={keyResults}
          cycles={cycles}
          activeCycle={activeCycle}
          objectives={objectives}
          habits={habits}
          focusDurationMinutes={settings.focusDuration}
          onOpenSearch={() => setIsSearchOpen(true)}
          activeFocusTaskId={activeFocusTaskId}
        />
      )}

      {/* Done Tab */}
      {tab === 'done' && (
        <DoneView
          tasks={tasks}
          keyResults={keyResults}
          objectives={objectives}
          cycles={cycles}
          activeCycle={activeCycle}
          onOpenSearch={() => setIsSearchOpen(true)}
          onReopenTask={(task) => {
            const updated = tasks.map(t => t.id === task.id ? { ...t, isCompleted: false, completedAt: undefined } : t);
            handleTasksChange(updated);
          }}
          onSelectTask={(t) => setSelectedDetailTask(t)}
        />
      )}

      {/* Analytics Tab */}
      {tab === 'analytics' && (
        <Analytics history={history} tasks={tasks} onExport={handleExport} onImport={handleImport} onClear={handleClearRequest} />
      )}

      {/* Global ⌘K Search Modal */}
      {isSearchOpen && (
        <CommandKModal
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          tasks={tasks}
          keyResults={keyResults}
          objectives={objectives}
          cycles={cycles}
          activeCycleId={activeCycle?.id}
          onSelectTask={(t) => setSelectedDetailTask(t)}
          onStartFocusTask={(t) => {
            setActiveTask(t.id);
            window.dispatchEvent(new CustomEvent('myokr-navigate-to-section', { detail: 'session' }));
          }}
          onReopenTask={(task) => {
            const updated = tasks.map(t => t.id === task.id ? { ...t, isCompleted: false, completedAt: undefined } : t);
            handleTasksChange(updated);
          }}
        />
      )}

      {/* Task Detail Modal */}
      {selectedDetailTask && (
        <TaskDetailModal
          task={selectedDetailTask}
          onUpdate={(updated) => {
            const newTasks = tasks.map(t => t.id === updated.id ? updated : t);
            handleTasksChange(newTasks);
            setSelectedDetailTask(updated);
          }}
          onClose={() => setSelectedDetailTask(null)}
          keyResults={keyResults}
          history={history}
          activeFocusTaskId={activeFocusTaskId}
          onStartFocus={(t) => {
            setActiveTask(t.id);
            window.dispatchEvent(new CustomEvent('myokr-navigate-to-section', { detail: 'session' }));
          }}
        />
      )}

      <ConfirmModal
        isOpen={isConfirmResetOpen}
        onClose={() => setIsConfirmResetOpen(false)}
        onConfirm={resetTimer}
        title="Reset Timer"
        message="Reset the current timer session? Progress will be lost."
        confirmText="Reset"
      />
      <ConfirmModal
        isOpen={isConfirmClearOpen}
        onClose={() => setIsConfirmClearOpen(false)}
        onConfirm={executeClear}
        title="Clear Data"
        message="Clear all Pomodoro history data? Your tasks and settings will be kept. This cannot be undone."
        confirmText="Clear"
      />
      <ConfirmModal
        isOpen={isConfirmImportOpen}
        onClose={() => { setIsConfirmImportOpen(false); setImportData(null); }}
        onConfirm={executeImport}
        title="Import Data"
        message="This will replace all your current settings, tasks, and history with the imported data. This cannot be undone."
        confirmText="Import"
        danger={false}
      />
    </div>
  );
}
