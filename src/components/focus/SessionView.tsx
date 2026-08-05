import { useState, useEffect } from 'react';
import { Pause, Play, RotateCcw, Settings } from 'lucide-react';
import TaskList from '../pomodoro/TaskList';
import PrioritizeModal from '../pomodoro/PrioritizeModal';
import ConfirmModal from '../ConfirmModal';
import NumberInput from '../NumberInput';
import LoadingState from '../shared/LoadingState';
import { useSession } from '../session/SessionProvider';
import { useOkrViewData } from '../../hooks/useOkrViewData';
import '../../styles/pomodoro.css';

/**
 * The Session tab body — the focus (pomodoro) timer. Extracted verbatim from the
 * old PomodoroApp timer block (ADR-0014: session moved out of PomodoroApp into the
 * Focus shell). Reads the global session state via useSession(); loads key results
 * for the quick TaskList's KR links. Renders inside FocusApp's shell.
 */
export default function SessionView({
  requestedTaskId,
  onRequestedTaskConsumed,
}: {
  requestedTaskId?: string | null;
  onRequestedTaskConsumed?: () => void;
}) {
  const {
    settings, tasks, sessionType, isRunning, completedPomos, activeTaskId, activeTask, activeFocusTaskId,
    isLoading, pulse, progress, minutes, seconds,
    toggleTimer, resetTimer, switchSession, setActiveTask, updateSetting, handleTasksChange,
  } = useSession();

  const { keyResults } = useOkrViewData();
  const [showSettings, setShowSettings] = useState(false);
  const [showPrioritizeModal, setShowPrioritizeModal] = useState(false);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);

  // Consume requestedTaskId — e.g. "Start focus" staged from the Day plan.
  useEffect(() => {
    if (requestedTaskId && !isLoading) {
      setActiveTask(requestedTaskId);
      onRequestedTaskConsumed?.();
    }
  }, [requestedTaskId, isLoading, onRequestedTaskConsumed, setActiveTask]);

  // Key results for the TaskList's KR links load via useOkrViewData (shared with
  // PomodoroApp; mount + sync refresh live there).

  const circumference = 2 * Math.PI * 120;
  const dashOffset = circumference * (1 - progress);
  const isBreak = sessionType !== 'focus';

  if (isLoading) {
    return <LoadingState />;
  }

  return (
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

      {/* Prioritize button + Quick task list */}
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

      <ConfirmModal
        isOpen={isConfirmResetOpen}
        onClose={() => setIsConfirmResetOpen(false)}
        onConfirm={resetTimer}
        title="Reset Timer"
        message="Reset the current timer session? Progress will be lost."
        confirmText="Reset"
      />
    </div>
  );
}
