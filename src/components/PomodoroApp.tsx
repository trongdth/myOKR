import { useState, useEffect } from 'react';
import '../styles/pomodoro.css';
import type {
  PomodoroSettings, PomodoroTask, DailyRecord,
} from '../lib/pomodoro-storage';
import {
  normalizeSettings, normalizeTask, normalizeDailyRecord,
} from '../lib/pomodoro-storage';
import TasksView from './pomodoro/TasksView';
import DoneView from './pomodoro/DoneView';
import CommandKModal from './pomodoro/CommandKModal';
import TaskDetailModal from './pomodoro/TaskDetailModal';
import Analytics from './pomodoro/Analytics';
import {
  saveKeyResults, saveCycles, saveObjectives, saveReviews,
  loadCycles, loadObjectives, loadKeyResults, loadReviews,
  normalizeCycle, normalizeObjective,
  type KeyResult, type OKRCycle, type Objective, type WeeklyReview,
} from '../lib/okr-storage';
import ConfirmModal from './ConfirmModal';
import LoadingState from './shared/LoadingState';
import { useSession } from './session/SessionProvider';
import { useOkrViewData } from '../hooks/useOkrViewData';

export default function PomodoroApp({
  tab,
}: {
  tab: 'tasks' | 'analytics' | 'done';
}) {
  const {
    settings, tasks, history,
    activeTaskId, activeFocusTaskId,
    isLoading,
    setActiveTask, handleTasksChange,
    clearSessionData, importSessionData,
  } = useSession();

  // ----- OKR view data (cycle-scoped) — shared hook (also used by SessionView) -----
  const { cycles, activeCycle, keyResults, objectives, habits, reload } = useOkrViewData();

  // ----- View-local state -----
  const [selectedDetailTask, setSelectedDetailTask] = useState<PomodoroTask | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);
  const [isConfirmImportOpen, setIsConfirmImportOpen] = useState(false);
  const [importData, setImportData] = useState<{
    settings: PomodoroSettings; tasks: PomodoroTask[]; history: DailyRecord[];
    cycles?: OKRCycle[]; objectives?: Objective[]; keyResults?: KeyResult[]; reviews?: WeeklyReview[];
  } | null>(null);

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

  // Reload OKR view data on the Tasks tab (KR titles may have changed on the OKR
  // page). Mount + background-sync reloads live in the useOkrViewData hook.
  useEffect(() => {
    if (tab === 'tasks') reload();
  }, [tab, reload]);

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
    const normalizedTasks = Array.isArray(importData.tasks)
      ? importData.tasks.map(normalizeTask).filter((t): t is PomodoroTask => t !== null)
      : [];
    const normalizedSettings = normalizeSettings(importData.settings);
    const normalizedHistory = Array.isArray(importData.history)
      ? importData.history.map(normalizeDailyRecord).filter((h): h is DailyRecord => h !== null)
      : [];
    await importSessionData({ settings: normalizedSettings, tasks: normalizedTasks, history: normalizedHistory });

    if (importData.cycles && Array.isArray(importData.cycles)) {
      const normalizedCycles = importData.cycles.map(normalizeCycle).filter((c): c is OKRCycle => c !== null);
      await saveCycles(normalizedCycles);
    }
    if (importData.objectives && Array.isArray(importData.objectives)) {
      const normalizedObjectives = importData.objectives.map(normalizeObjective).filter((o): o is Objective => o !== null);
      await saveObjectives(normalizedObjectives);
    }
    if (importData.keyResults && Array.isArray(importData.keyResults)) {
      await saveKeyResults(importData.keyResults);
    }
    if (importData.reviews && Array.isArray(importData.reviews)) {
      await saveReviews(importData.reviews);
    }
    // Refresh cycle-scoped view data from storage (active cycle, KRs, objectives, …).
    await reload();
    setImportData(null);
  };

  const handleClearRequest = () => {
    setIsConfirmClearOpen(true);
  };

  const executeClear = async () => {
    await clearSessionData();
  };

  if (isLoading) {
    return <LoadingState className="pomodoro-container" />;
  }

  return (
    <div className={`pomodoro-container${tab === 'tasks' || tab === 'done' ? ' plan-group-shell' : ''}`}>

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
          tasks={tasks}
          onUpdate={(updated) => {
            const newTasks = tasks.map(t => t.id === updated.id ? updated : t);
            handleTasksChange(newTasks);
            setSelectedDetailTask(updated);
          }}
          onDelete={(id) => {
            if (activeTaskId === id) setActiveTask(null);
            handleTasksChange(tasks.filter(t => t.id !== id));
            setSelectedDetailTask(null);
          }}
          onClose={() => setSelectedDetailTask(null)}
          keyResults={keyResults}
          onStartFocus={(t) => {
            setActiveTask(t.id);
            window.dispatchEvent(new CustomEvent('myokr-navigate-to-section', { detail: 'session' }));
          }}
        />
      )}

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
