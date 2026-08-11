import { useState, useEffect } from 'react';
import { Pause, Play, RotateCcw, Settings } from 'lucide-react';
import ConfirmModal from '../ConfirmModal';
import NumberInput from '../NumberInput';
import LoadingState from '../shared/LoadingState';
import AmbientPresetPicker from '../shared/AmbientPresetPicker';
import { useSession } from '../session/SessionProvider';
import type { PomodoroTask } from '../../lib/pomodoro-storage';
import '../../styles/pomodoro.css';

/**
 * The Session tab body — the focus (pomodoro) timer. Extracted verbatim from the
 * old PomodoroApp timer block (ADR-0014: session moved out of PomodoroApp into the
 * Focus shell). Reads the global session state via useSession(). Renders inside
 * FocusApp's shell.
 *
 * Layout (ADR-0016, ticket 03): four centered rows — (1) a mode-selector pill,
 * (2) the timer ring with the timer digits and the per-task SESSION x OF y
 * label, (3) an Active Task Card, (4) the action controls. The full TaskList
 * and standalone Prioritize button are gone — task management lives on the
 * Day plan / Tasks tabs, and the active task reaches this tab via the
 * requestedTaskId handoff or the card's picker.
 *
 * Two decisions worth recording:
 * - The pomo dots (`.pomodoro-count` / `.pomo-dot`) were removed rather than
 *   kept — their cycle-position meaning is now carried by the session-of
 *   label (same units, per-task). The ticket left this to the implementer.
 * - The Active Task Card's click-to-pick was pulled forward from ticket 05 so
 *   the Session tab can still select a task after the TaskList left. It is
 *   sourced from the FULL tasks list here; ticket 05 narrows it to the Day
 *   plan queue (TodayPlan.taskIds) and adds the empty-plan handoff.
 */
export default function SessionView({
  requestedTaskId,
  onRequestedTaskConsumed,
}: {
  requestedTaskId?: string | null;
  onRequestedTaskConsumed?: () => void;
}) {
  const {
    settings, tasks, sessionType, isRunning, activeTask, activeTaskId,
    isLoading, pulse, progress, minutes, seconds,
    toggleTimer, resetTimer, switchSession, setActiveTask, updateSetting,
  } = useSession();

  const [showSettings, setShowSettings] = useState(false);
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);

  // Consume requestedTaskId — e.g. "Start focus" staged from the Day plan.
  useEffect(() => {
    if (requestedTaskId && !isLoading) {
      setActiveTask(requestedTaskId);
      onRequestedTaskConsumed?.();
    }
  }, [requestedTaskId, isLoading, onRequestedTaskConsumed, setActiveTask]);

  const circumference = 2 * Math.PI * 120;
  const dashOffset = circumference * (1 - progress);
  const isBreak = sessionType !== 'focus';

  // session-of label (CONTEXT.md): per-task progress for the active task,
  // `completedPomodoros` OF `estimatedPomodoros`. Hidden when no task is active
  // — only the digits show. Matches the dot indicator's units.
  const showSessionOf = !!activeTask && !isBreak;

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <div className="timer-section">
      {/* Row 1 — Mode selector (pill container) */}
      <div className="session-tabs">
        <button className={`session-tab${sessionType === 'focus' ? ' active' : ''}`} onClick={() => switchSession('focus')}>Focus</button>
        <button className={`session-tab${sessionType === 'shortBreak' ? ' active break-tab' : ''}`} onClick={() => switchSession('shortBreak')}>Short Break</button>
        <button className={`session-tab${sessionType === 'longBreak' ? ' active break-tab' : ''}`} onClick={() => switchSession('longBreak')}>Long Break</button>
      </div>

      {/* Row 2 — Timer ring (digits centered, session-of label below) */}
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
          {showSessionOf && activeTask && (
            <div className="timer-session-of">SESSION {activeTask.completedPomodoros} OF {activeTask.estimatedPomodoros}</div>
          )}
        </div>
      </div>

      {/* Row 3 — Active Task Card. Click opens a lightweight task picker
          (pulled forward from ticket 05 so the Session tab can still select a
          task after the TaskList left). Sourced from the full tasks list for
          now; ticket 05 narrows this to the Day plan queue + adds the empty-
          plan handoff. */}
      <ActiveTaskCard
        activeTask={activeTask}
        onPick={() => setShowTaskPicker(s => !s)}
        pickerOpen={showTaskPicker}
      />
      {showTaskPicker && (
        <TaskPicker
          tasks={tasks}
          activeTaskId={activeTaskId}
          onPick={(id) => { setActiveTask(id); setShowTaskPicker(false); }}
          onClear={() => { setActiveTask(null); setShowTaskPicker(false); }}
        />
      )}

      {/* Row 4 — Action controls */}
      <div className="timer-controls">
        <button className="btn-icon" onClick={() => setIsConfirmResetOpen(true)} title="Reset"><RotateCcw size={16} /></button>
        <button className="btn" onClick={toggleTimer}>{isRunning ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Start</>}</button>
        <button className="btn-icon" onClick={() => setShowSettings(!showSettings)} title="Settings"><Settings size={16} /></button>
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
              <AmbientPresetPicker
                value={settings.ambientPreset}
                onChange={p => updateSetting('ambientPreset', p)}
              />
            </div>
          </div>
        </div>
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

/**
 * The Active Task Card (Row 3, ADR-0016). A centered card (~500–600 px) showing
 * the task a focus session is attributed to. Click opens a lightweight task
 * picker (pulled forward from ticket 05). The empty state ("No task — pick
 * one") is itself clickable and opens the same picker.
 */
function ActiveTaskCard({
  activeTask,
  onPick,
  pickerOpen,
}: {
  activeTask: PomodoroTask | null;
  onPick: () => void;
  pickerOpen: boolean;
}) {
  return (
    <div
      className={`active-task-card${activeTask ? '' : ' empty'}${pickerOpen ? ' picker-open' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onPick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(); } }}
      aria-label={activeTask ? `Active task: ${activeTask.title}. Click to change.` : 'No active task. Click to pick one.'}
      title="Click to change the active task"
    >
      <span className="active-task-card-label">Working on</span>
      {activeTask ? (
        <strong className="active-task-card-title">{activeTask.title}</strong>
      ) : (
        <span className="active-task-card-empty">No task — pick one</span>
      )}
    </div>
  );
}

/**
 * Lightweight task picker for the Active Task Card. Lists incomplete tasks
 * (most-recently-updated first) plus a "Clear" option. Sourced from the full
 * tasks list in this slice; ticket 05 narrows the source to the Day plan queue
 * and adds the empty-plan → Day plan handoff.
 */
function TaskPicker({
  tasks,
  activeTaskId,
  onPick,
  onClear,
}: {
  tasks: PomodoroTask[];
  activeTaskId: string | null;
  onPick: (id: string) => void;
  onClear: () => void;
}) {
  const choices = tasks
    .filter(t => !t.isCompleted)
    .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
  return (
    <div className="task-picker" role="listbox" aria-label="Pick active task">
      {choices.length === 0 && (
        <div className="task-picker-empty">No open tasks. Add one on the Tasks tab.</div>
      )}
      {choices.map(t => (
        <button
          key={t.id}
          type="button"
          role="option"
          aria-selected={t.id === activeTaskId}
          className={`task-picker-item${t.id === activeTaskId ? ' active' : ''}`}
          onClick={() => onPick(t.id)}
        >
          <span className="task-picker-item-title">{t.title}</span>
          <span className="task-picker-item-pomos">{t.completedPomodoros}/{t.estimatedPomodoros}</span>
        </button>
      ))}
      {activeTaskId && (
        <button type="button" className="task-picker-clear" onClick={onClear}>
          Clear active task
        </button>
      )}
    </div>
  );
}
