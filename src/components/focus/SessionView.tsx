import { useState, useEffect } from 'react';
import { Pause, Play, RotateCcw, Settings, CheckCircle2 } from 'lucide-react';
import ConfirmModal from '../ConfirmModal';
import NumberInput from '../NumberInput';
import LoadingState from '../shared/LoadingState';
import AmbientPresetPicker from '../shared/AmbientPresetPicker';
import AmbientAudioWidget from '../shared/AmbientAudioWidget';
import { useSession } from '../session/SessionProvider';
import type { PomodoroTask } from '../../lib/pomodoro-storage';
import { loadHistory, todayKey } from '../../lib/pomodoro-storage';
import { loadKeyResults, loadObjectives, formatKrSubtitle } from '../../lib/okr-storage';
import type { KeyResult, Objective } from '../../lib/okr-storage';
import { loadTodayPlan } from '../../lib/today-focus';
import { navigateToSection } from '../../lib/navigation';
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

  // Day plan queue (ADR-0017): SessionView reads TodayPlan directly so the
  // Queue widget + picker reflect what the user staged on the Day plan tab.
  // The resolved queue lives in state and is recomputed in an effect whenever
  // the tasks list changes or a refresh signal fires (window focus /
  // myokr-data-synced — the user edits the plan by switching tabs, which
  // remounts/refreshes on return). No live localStorage subscription in v1.
  const [queuedTasks, setQueuedTasks] = useState<PomodoroTask[]>([]);
  useEffect(() => {
    const resolve = () => {
      const plan = loadTodayPlan();
      if (!plan || plan.taskIds.length === 0) { setQueuedTasks([]); return; }
      const byId = new Map(tasks.map(t => [t.id, t]));
      setQueuedTasks(plan.taskIds
        .map(id => byId.get(id))
        .filter((t): t is PomodoroTask => !!t && !t.isCompleted));
    };
    resolve();
    const refresh = () => resolve();
    window.addEventListener('focus', refresh);
    window.addEventListener('myokr-data-synced', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('myokr-data-synced', refresh);
    };
  }, [tasks]);

  // KR + Objective maps for the Active Task Card subtitle (the KR the task
  // links to, resolved objective.title → kr.title — same idiom as NowCard /
  // FocusCard / UpNextCard). Loaded once and refreshed on data sync. The KR
  // title is intentionally NOT stored on the task (normalized in the Automerge
  // doc); it's one Map.get away here.
  const [krMap, setKrMap] = useState<Map<string, KeyResult>>(new Map());
  const [objMap, setObjMap] = useState<Map<string, Objective>>(new Map());
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [krs, objs] = await Promise.all([loadKeyResults(), loadObjectives()]);
      if (cancelled) return;
      setKrMap(new Map(krs.map(k => [k.id, k])));
      setObjMap(new Map(objs.map(o => [o.id, o])));
    };
    load();
    const refresh = () => load();
    window.addEventListener('myokr-data-synced', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('myokr-data-synced', refresh);
    };
  }, []);

  // Resolve the active task's KR/objective for the card subtitle.
  const activeKr = activeTask?.keyResultId ? krMap.get(activeTask.keyResultId) : undefined;
  const activeObj = activeKr ? objMap.get(activeKr.objectiveId) : undefined;

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
    <div className="session-view">
    <div className="timer-section">
      {/* Row 1 — Mode selector (pill container) */}
      <div className="session-tabs">
        <button className={`session-tab${sessionType === 'focus' ? ' active' : ''}`} onClick={() => switchSession('focus')}>Focus</button>
        <button className={`session-tab${sessionType === 'shortBreak' ? ' active break-tab' : ''}`} onClick={() => switchSession('shortBreak')}>Short Break</button>
        <button className={`session-tab${sessionType === 'longBreak' ? ' active break-tab' : ''}`} onClick={() => switchSession('longBreak')}>Long Break</button>
      </div>

      {/* Row 2 — Timer ring (digits centered, session-of label below).
          Solid cyan stroke (design-system.md: the cyan→violet gradient is
          logo-only; the ring uses --color-focus via CSS). */}
      <div className={`timer-ring-container${pulse ? ' pulse' : ''}`}>
        <svg className="timer-ring-svg" viewBox="0 0 260 260">
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
        kr={activeKr}
        objective={activeObj}
        onPick={() => setShowTaskPicker(s => !s)}
        pickerOpen={showTaskPicker}
      />
      {showTaskPicker && (
        <TaskPicker
          tasks={queuedTasks}
          activeTaskId={activeTaskId}
          onPick={(id) => { setActiveTask(id); setShowTaskPicker(false); }}
          onClear={() => { setActiveTask(null); setShowTaskPicker(false); }}
          onPlanDay={() => { setShowTaskPicker(false); navigateToSection('day-plan'); }}
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

    {/* Bottom utility bar (ADR-0016, ticket 04): 3-column grid fixed at the
        bottom. The stats column is wired here; audio (left) and queue (middle)
        are placeholder slots filled by tickets 05 and 06. */}
    <div className="session-bottom-bar">
      <div className="session-bottom-bar-audio">
        <AmbientAudioWidget
          value={settings.ambientPreset}
          onChange={p => updateSetting('ambientPreset', p)}
        />
      </div>
      <div className="session-bottom-bar-queue">
        <QueueWidget
          queuedTasks={queuedTasks}
          activeTaskId={activeTaskId}
          onGoToDayPlan={() => navigateToSection('day-plan')}
        />
      </div>
      <div className="session-bottom-bar-stats">
        <SessionStats />
      </div>
    </div>
    </div>
  );
}

/**
 * The Active Task Card (Row 3, ADR-0016). A centered card showing the task a
 * focus session is attributed to. Layout (mockup 2026-08-12): a decorative
 * square icon tile on the left, a stacked title + KR subtitle in the middle,
 * and a cyan "Change" button on the right edge. The whole card remains
 * clickable to open the picker; "Change" is a redundant visual affordance for
 * the same action.
 *
 * The subtitle resolves the KR the task links to (objective.title → kr.title),
 * matching NowCard / FocusCard / UpNextCard. Falls back to "No key result
 * linked" when the task has no KR (same copy as TasksView's card subtitle).
 */
function ActiveTaskCard({
  activeTask,
  kr,
  objective,
  onPick,
  pickerOpen,
}: {
  activeTask: PomodoroTask | null;
  kr?: KeyResult;
  objective?: Objective;
  onPick: () => void;
  pickerOpen: boolean;
}) {
  const subtitle = formatKrSubtitle(kr, objective);
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
      {/* Decorative square icon tile (no behavior). */}
      <span className="active-task-card-icon" aria-hidden="true">
        <CheckCircle2 size={18} />
      </span>
      <div className="active-task-card-body">
        <span className="active-task-card-label">Working on</span>
        {activeTask ? (
          <strong className="active-task-card-title">{activeTask.title}</strong>
        ) : (
          <span className="active-task-card-empty">No task — pick one</span>
        )}
        {activeTask && (
          <span className="active-task-card-subtitle">{subtitle}</span>
        )}
      </div>
      {/* Cyan "Change" button — opens the same picker as the card click. */}
      <button
        type="button"
        className="active-task-card-change"
        onClick={(e) => { e.stopPropagation(); onPick(); }}
        aria-label="Change active task"
      >
        Change
      </button>
    </div>
  );
}

/**
 * Lightweight task picker for the Active Task Card. Lists the Day plan's queued
 * tasks in order (NOW first), plus a "Clear" option. When the queue is empty
 * (no TodayPlan, or all tasks completed/skipped), offers a "Plan your day →"
 * handoff that navigates to the Day plan tab (ADR-0017).
 */
function TaskPicker({
  tasks,
  activeTaskId,
  onPick,
  onClear,
  onPlanDay,
}: {
  tasks: PomodoroTask[];
  activeTaskId: string | null;
  onPick: (id: string) => void;
  onClear: () => void;
  onPlanDay: () => void;
}) {
  // tasks is already filtered to incomplete + queue-ordered by the caller.
  const choices = tasks;
  // role="menu" (not listbox): the picker mixes task options with non-option
  // actions (Clear, Plan your day), which a listbox forbids. A menu allows
  // mixed menuitem children, matching the dropdown's actual behavior.
  return (
    <div className="task-picker" role="menu" aria-label="Pick active task">
      {choices.length === 0 && (
        <div className="task-picker-empty">
          <span>Nothing queued for today.</span>
          <button type="button" role="menuitem" className="task-picker-plan-link" onClick={onPlanDay}>
            Plan your day →
          </button>
        </div>
      )}
      {choices.map(t => (
        <button
          key={t.id}
          type="button"
          role="menuitem"
          aria-checked={t.id === activeTaskId}
          className={`task-picker-item${t.id === activeTaskId ? ' active' : ''}`}
          onClick={() => onPick(t.id)}
        >
          <span className="task-picker-item-title">{t.title}</span>
          <span className="task-picker-item-pomos">{t.completedPomodoros}/{t.estimatedPomodoros}</span>
        </button>
      ))}
      {activeTaskId && (
        <button type="button" role="menuitem" className="task-picker-clear" onClick={onClear}>
          Clear active task
        </button>
      )}
    </div>
  );
}

/**
 * Today's completed-session count, sourced from today's DailyRecord
 * (ticket 04 / ADR-0016). Reads `completedPomodoros` for today's date key; falls
 * back to 0 when there is no record for today. Reloads on mount and on the
 * `myokr-data-synced` event so it reflects sessions as they complete.
 */
function SessionStats() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const load = () => {
      loadHistory()
        .then(hist => {
          const key = todayKey();
          const today = hist.find(r => r.date === key);
          setCount(today?.completedPomodoros ?? 0);
        })
        .catch(() => { /* no history — stay at 0 */ });
    };
    load();
    window.addEventListener('myokr-data-synced', load);
    return () => window.removeEventListener('myokr-data-synced', load);
  }, []);

  return (
    <div className="session-stats" aria-label="Today's completed focus sessions">
      <span className="session-stats-count">{count}</span>
      <span className="session-stats-label">sessions today</span>
    </div>
  );
}

/**
 * The Queue widget (bottom-middle, ADR-0016 / ticket 05, redesigned 2026-08-12).
 * Shows the NEXT task in the Day-plan queue — the first queued task that isn't
 * the active one (i.e. the first item in the Day plan's UP NEXT cell). This is
 * a behavior change from ticket 05's active-task mirror: the middle card now
 * answers "what's after this?" rather than "what's running?".
 *
 * Empty state: when there is no next task (queue empty, or only the active task
 * remains), offers a link to the Day plan tab.
 */
function QueueWidget({
  queuedTasks,
  activeTaskId,
  onGoToDayPlan,
}: {
  queuedTasks: PomodoroTask[];
  activeTaskId: string | null;
  onGoToDayPlan: () => void;
}) {
  // Next = first queued task that isn't the active one (matches the Day plan's
  // UP NEXT cell — the items after NOW).
  const nextTask = queuedTasks.find(t => t.id !== activeTaskId) ?? null;

  if (!nextTask) {
    return (
      <div className="queue-widget queue-widget-empty" aria-label="No next task in queue">
        <button type="button" className="queue-plan-link" onClick={onGoToDayPlan}>
          Pick a task →
        </button>
      </div>
    );
  }
  return (
    <div className="queue-widget" aria-label={`Up next: ${nextTask.title}`}>
      <span className="queue-eyebrow">Up next in queue</span>
      <span className="queue-title">{nextTask.title}</span>
    </div>
  );
}
