import { useState, useEffect } from 'react';
import '../styles/pomodoro.css';
import type { PomodoroTask } from '../lib/pomodoro-storage';
import TasksView from './pomodoro/TasksView';
import DoneView from './pomodoro/DoneView';
import CommandKModal from './pomodoro/CommandKModal';
import TaskDetailModal from './pomodoro/TaskDetailModal';
import LoadingState from './shared/LoadingState';
import { useSession } from './session/SessionProvider';
import { useOkrViewData } from '../hooks/useOkrViewData';

export default function PomodoroApp({
  tab,
}: {
  tab: 'tasks' | 'done';
}) {
  const {
    settings, tasks,
    activeTaskId, activeFocusTaskId,
    isLoading,
    setActiveTask, handleTasksChange,
  } = useSession();

  // ----- OKR view data (cycle-scoped) — shared hook (also used by SessionView) -----
  const { cycles, activeCycle, keyResults, objectives, habits, reload } = useOkrViewData();

  // ----- View-local state -----
  const [selectedDetailTask, setSelectedDetailTask] = useState<PomodoroTask | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

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
          onReopenTasks={(reopening) => {
            const ids = new Set(reopening.map(t => t.id));
            const updated = tasks.map(t => ids.has(t.id) ? { ...t, isCompleted: false, completedAt: undefined } : t);
            handleTasksChange(updated);
          }}
          onSelectTask={(t) => setSelectedDetailTask(t)}
        />
      )}


      {/* Global ⌘K Search Modal */}
      {isSearchOpen && (
        <CommandKModal
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          tasks={tasks}
          keyResults={keyResults}
          onSelectTask={(t) => setSelectedDetailTask(t)}
          onStartFocusTask={(t) => {
            setActiveTask(t.id);
            window.dispatchEvent(new CustomEvent('myokr-navigate-to-section', { detail: 'session' }));
          }}
          onReopenTask={(task) => {
            const updated = tasks.map(t => t.id === task.id ? { ...t, isCompleted: false, completedAt: undefined } : t);
            handleTasksChange(updated);
          }}
          onCompleteTask={(task) => {
            const updated = tasks.map(t => t.id === task.id ? { ...t, isCompleted: true, completedAt: new Date().toISOString() } : t);
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

    </div>
  );
}
