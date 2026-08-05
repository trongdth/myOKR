import {
  createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, type ReactNode,
} from 'react';
import {
  loadSettings, saveSettings, loadTasks, saveTasks, loadHistory, saveHistory,
  loadTimerState, saveTimerState, clearTimerState,
  playCompletionSound, sendNotification,
  requestNotificationPermission, DEFAULT_SETTINGS, completePomodoroForTask, recordSessionInHistory,
  stampUpdatedAt, resolveSessionEndedAt,
  type PomodoroSettings, type SessionType, type PomodoroTask, type DailyRecord,
} from '../../lib/pomodoro-storage';
import { startFocusMusic, stopFocusMusic } from '../../lib/focus-music';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import ConfirmModal from '../ConfirmModal';

// Tauri injects __TAURI_INTERNALS__ at runtime; no type definitions exist for it.
const IS_TAURI = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;

// Structural equality for the background-sync refresh path. Sync runs every
// ~5 min, so the cost is negligible — and it lets us skip setState (and the
// resulting re-render) when a merge produced no actual data change.
const jsonEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Minutes for a session phase — the single focus/short/long lookup (PR #37 review #9). */
function durationMinutes(s: PomodoroSettings, type: SessionType): number {
  const minutes: Record<SessionType, number> = {
    focus: s.focusDuration,
    shortBreak: s.shortBreakDuration,
    longBreak: s.longBreakDuration,
  };
  return minutes[type];
}

// A completion delivered more than this long after the timer's estimated end
// is a missed event being processed late (suspended webview / listener gap),
// not normal delivery jitter (~1s) — the session must be recorded with its
// true end, not `now` (see resolveSessionEndedAt).
const LATE_COMPLETION_THRESHOLD_MS = 30_000;

export interface SessionContextValue {
  // data
  settings: PomodoroSettings;
  tasks: PomodoroTask[];
  history: DailyRecord[];
  // timer runtime
  sessionType: SessionType;
  timeLeft: number;
  isRunning: boolean;
  completedPomos: number;
  activeTaskId: string | null;
  activeTask: PomodoroTask | null;
  activeFocusTaskId: string | null; // decision A — task currently being focused
  isLoading: boolean;
  pulse: boolean;
  // derived display
  totalSeconds: number;
  progress: number;
  minutes: number;
  seconds: number;
  // controls
  toggleTimer: () => void;
  startTimer: () => void;
  resetTimer: () => void;
  switchSession: (type: SessionType) => void;
  setActiveTask: (id: string | null) => void; // guarded (confirms on switch while running)
  updateSetting: <K extends keyof PomodoroSettings>(key: K, value: PomodoroSettings[K]) => void;
  handleTasksChange: (tasks: PomodoroTask[]) => void;
  clearSessionData: () => Promise<void>; // history clear + timer reset (Analytics clear)
  importSessionData: (data: { settings: PomodoroSettings; tasks: PomodoroTask[]; history: DailyRecord[] }) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  // ----- State -----
  const [settings, setSettings] = useState<PomodoroSettings>(DEFAULT_SETTINGS);
  const [sessionType, setSessionType] = useState<SessionType>('focus');
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [completedPomos, setCompletedPomos] = useState(0);
  const [tasks, setTasks] = useState<PomodoroTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [history, setHistory] = useState<DailyRecord[]>([]);
  const [pulse, setPulse] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isConfirmNoTaskOpen, setIsConfirmNoTaskOpen] = useState(false);
  const [isConfirmSwitchTaskOpen, setIsConfirmSwitchTaskOpen] = useState(false);
  const [isConfirmTaskChangedOpen, setIsConfirmTaskChangedOpen] = useState(false);

  const sessionStartRef = useRef<string | null>(null);
  const autoStartTimeoutRef = useRef<number | null>(null);
  const lastFocusTaskId = useRef<string | null>(null);
  const pendingAutoStart = useRef<(() => void) | null>(null);
  const pendingSwitchTaskId = useRef<string | null>(null);
  // The true end of the current Rust timer: set when a timer starts (now +
  // remaining seconds), refined by every tick. Survives a pause (the Rust
  // end_timestamp is frozen across it) and is cleared when the session
  // completes or is reset — so a completion processed late (missed event) can
  // still record the honest end instead of inflating the session by the gap.
  const completionAtRef = useRef<number | null>(null);
  // Guards against a session completion being handled more than once. Completion
  // can be signalled from up to three places (timer-complete event, window-focus
  // sync, and the timeLeft===0 effect); without this, a double signal would
  // double-count pomodoros, history records, and notifications.
  const completionHandledRef = useRef(false);
  // resetTimer is recreated each render (it closes over the current
  // totalSeconds). clearSessionData is memoized with [], so it must read the
  // latest resetTimer through this ref — otherwise it captures the first
  // render's resetTimer and resets the timer to the default 25-min focus even
  // after the user has customized the duration.
  const resetTimerRef = useRef<() => void>(() => {});

  // ----- Load on mount -----
  useEffect(() => {
    async function init() {
      const s = await loadSettings();
      setSettings(s);

      // Restore timer state
      const saved = await loadTimerState();

      let timerStateSynced = false;
      if (IS_TAURI) {
        try {
          const res = await invoke<[number, boolean, string]>('get_timer_state');
          if (res) {
            const [secs, running, type] = res;
            if (running) {
              setTimeLeft(secs);
              setIsRunning(true);
              setSessionType(type as SessionType);
              timerStateSynced = true;
              if (saved) {
                setActiveTaskId(saved.activeTaskId);
                setCompletedPomos(saved.completedPomos);
                sessionStartRef.current = saved.sessionStartedAt;
              }
            }
          }
        } catch (e) {
          console.error('Failed to sync initial timer state from Rust', e);
        }
      }

      if (!timerStateSynced && saved) {
        setSessionType(saved.sessionType);
        setActiveTaskId(saved.activeTaskId);
        setCompletedPomos(saved.completedPomos);
        sessionStartRef.current = saved.sessionStartedAt;

        if (saved.isRunning && saved.sessionStartedAt) {
          const now = new Date().getTime();
          const lastUpdated = new Date(saved.lastUpdated).getTime();
          const elapsedSeconds = Math.floor((now - lastUpdated) / 1000);
          const newTimeLeft = Math.max(0, saved.timeLeft - elapsedSeconds);
          setTimeLeft(newTimeLeft);
          setIsRunning(true);
        } else {
          setTimeLeft(saved.timeLeft);
          setIsRunning(false);
        }
      } else if (!timerStateSynced) {
        setTimeLeft(s.focusDuration * 60);
      }

      setTasks(await loadTasks());
      setHistory(await loadHistory());

      requestNotificationPermission();
      setIsLoading(false);
    }
    init();
  }, []);

  // Keep sessionTypeRef in sync so background sync callbacks don't capture stale state
  const sessionTypeRef = useRef(sessionType);
  useEffect(() => {
    sessionTypeRef.current = sessionType;
  }, [sessionType]);

  const timeLeftRef = useRef(timeLeft);
  useEffect(() => {
    timeLeftRef.current = timeLeft;
  }, [timeLeft]);

  // Keep tasksRef in sync so handleTasksChange (a stable useCallback) can diff
  // incoming tasks against the latest without a stale closure. Powers the
  // updatedAt stamp on the Task-detail footer's "updated X ago" readout.
  const tasksRef = useRef(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // Listen to background sync and reload the session data dynamically.
  useEffect(() => {
    async function refreshData() {
      const s = await loadSettings();
      setSettings(prev => (jsonEqual(prev, s) ? prev : s));

      if (!isRunning) {
        const curType = sessionTypeRef.current;
        const dur = durationMinutes(s, curType);
        const oldDur = durationMinutes(settings, curType);
        if (timeLeftRef.current === oldDur * 60) {
          setTimeLeft(dur * 60);
        }
      }

      const loadedTasks = await loadTasks();
      setTasks(prev => (jsonEqual(prev, loadedTasks) ? prev : loadedTasks));
      const loadedHistory = await loadHistory();
      setHistory(prev => (jsonEqual(prev, loadedHistory) ? prev : loadedHistory));
    }

    const handleSync = () => { refreshData(); };
    window.addEventListener('myokr-data-synced', handleSync);
    return () => window.removeEventListener('myokr-data-synced', handleSync);
  }, [isRunning, settings.focusDuration, settings.shortBreakDuration, settings.longBreakDuration]);

  // ----- Persist timer state to localStorage -----
  useEffect(() => {
    if (isLoading) return;
    saveTimerState({
      sessionType,
      timeLeft,
      isRunning,
      lastUpdated: new Date().toISOString(),
      activeTaskId,
      completedPomos,
      sessionStartedAt: sessionStartRef.current,
    });
    // Intentionally omitting timeLeft to avoid writing to disk every second.
    // Timer recovery correctly uses lastUpdated to deduce elapsed time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionType, isRunning, activeTaskId, completedPomos, isLoading, sessionStartRef.current]);

  // ----- Derived values -----
  const activeTask = useMemo(
    () => (activeTaskId ? tasks.find(t => t.id === activeTaskId && !t.isCompleted) ?? null : null),
    [activeTaskId, tasks],
  );

  // Decision A — the task currently being focused (running). Drives the "pomo N
  // of M" position display so the count reflects the pomo you're ON, not finished.
  const activeFocusTaskId = isRunning && sessionType === 'focus' ? activeTaskId : null;

  const totalSeconds = durationMinutes(settings, sessionType) * 60;

  const progress = totalSeconds > 0 ? (totalSeconds - timeLeft) / totalSeconds : 0;
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  // ----- Handle timer reaching zero -----
  const handleSessionComplete = useCallback(() => {
    // Idempotency guard: only the first completion signal per session is honored.
    // The guard is reset when a new session starts (isRunning goes true again).
    if (completionHandledRef.current) return;
    completionHandledRef.current = true;

    setIsRunning(false);
    playCompletionSound();
    setPulse(true);
    setTimeout(() => setPulse(false), 2000);

    const nowMs = Date.now();
    // A completion processed long after the timer actually ended (missed
    // timer-complete event, suspended webview) must record the session's true
    // end — otherwise the gap inflates the record (observed: hours-long
    // "focuses"). On-time completions use `now` unchanged.
    const endedAt = resolveSessionEndedAt(completionAtRef.current, nowMs, LATE_COMPLETION_THRESHOLD_MS);
    completionAtRef.current = null;
    const now = new Date(nowMs).toISOString();
    const session = {
      startedAt: sessionStartRef.current || now,
      endedAt,
      type: sessionType,
      taskId: activeTaskId || undefined,
      completed: true,
    };
    sessionStartRef.current = null;

    if (sessionType === 'focus') {
      const newCompleted = completedPomos + 1;
      setCompletedPomos(newCompleted);

      lastFocusTaskId.current = activeTaskId;

      // Update active task IN-PLACE in the Automerge doc (rule 11: never overwrite
      // d.tasks with React state — that wiped tasks created mid-session once).
      if (activeTaskId) {
        const completedTaskId = activeTaskId;
        completePomodoroForTask(completedTaskId, now)
          .then(updatedTasks => {
            setTasks(updatedTasks);
            const completedTask = updatedTasks.find(t => t.id === completedTaskId);
            if (completedTask?.isCompleted) {
              setActiveTaskId(prev => (prev === completedTaskId ? null : prev));
            }
          })
          .catch(err => {
            console.error('Failed to complete pomodoro for task:', err);
          });
      }

      sendNotification('Pomodoro Complete!', 'Great work! Time for a break.');

      // Auto-transition to break
      const isLongBreak = newCompleted % settings.pomosBeforeLongBreak === 0;
      const nextType: SessionType = isLongBreak ? 'longBreak' : 'shortBreak';
      setSessionType(nextType);
      setTimeLeft(isLongBreak ? settings.longBreakDuration * 60 : settings.shortBreakDuration * 60);
      if (settings.autoStartBreaks) {
        if (autoStartTimeoutRef.current) clearTimeout(autoStartTimeoutRef.current);
        autoStartTimeoutRef.current = window.setTimeout(() => { autoStartTimeoutRef.current = null; setIsRunning(true); }, 500);
      }

      // Record the focus session in-place (rule 11) — no load-modify-save race.
      recordSessionInHistory(session, settings.focusDuration)
        .then(setHistory)
        .catch(console.error);
    } else {
      // Break completed
      sendNotification('Break Over!', 'Ready to focus again?');

      // Auto-transition to focus
      setSessionType('focus');
      setTimeLeft(settings.focusDuration * 60);
      if (settings.autoStartFocus) {
        const prevId = lastFocusTaskId.current;
        const prevTask = prevId ? tasks.find(t => t.id === prevId) : null;

        if (activeTaskId && prevId && activeTaskId !== prevId && prevTask && !prevTask.isCompleted) {
          pendingAutoStart.current = () => {
            if (!sessionStartRef.current) sessionStartRef.current = new Date().toISOString();
            setIsRunning(true);
          };
          setIsConfirmTaskChangedOpen(true);
        } else if (!activeTask) {
          setIsConfirmNoTaskOpen(true);
        } else {
          if (autoStartTimeoutRef.current) clearTimeout(autoStartTimeoutRef.current);
          autoStartTimeoutRef.current = window.setTimeout(() => { autoStartTimeoutRef.current = null; setIsRunning(true); }, 500);
        }
      }

      // Record the break session in-place (rule 11).
      recordSessionInHistory(session, 0)
        .then(setHistory)
        .catch(console.error);
    }
  }, [sessionType, completedPomos, activeTaskId, activeTask, tasks, settings]);

  // ----- Timer tick (Tauri Rust / Browser Fallback) -----
  useEffect(() => {
    if (!IS_TAURI) {
      // Browser fallback (e.g. Playwright tests)
      if (!isRunning) return;
      if (!sessionStartRef.current) sessionStartRef.current = new Date().toISOString();
      completionAtRef.current = Date.now() + timeLeftRef.current * 1000;

      const id = window.setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(id);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(id);
    }

    // Tauri Rust Backend implementation
    // `cancelled` guards the async `listen()` registration: if the effect re-runs
    // (or unmounts) before the listen() promises resolve, the unlisten functions
    // would still be null and the handlers would leak — firing duplicate ticks.
    let cancelled = false;
    let unlistenTick: (() => void) | null = null;
    let unlistenComplete: (() => void) | null = null;

    listen<number>('timer-tick', (event) => {
      // The timer's true end: this tick's arrival time plus its remaining
      // seconds. Refined every second; survives a pause; used as the honest
      // endedAt when the completion event is processed late.
      completionAtRef.current = Date.now() + event.payload * 1000;
      setTimeLeft(event.payload);
    }).then(fn => {
      if (cancelled) fn();
      else unlistenTick = fn;
    }).catch(console.error);

    listen('timer-complete', () => {
      handleSessionComplete();
    }).then(fn => {
      if (cancelled) fn();
      else unlistenComplete = fn;
    }).catch(console.error);

    return () => {
      cancelled = true;
      if (unlistenTick) unlistenTick();
      if (unlistenComplete) unlistenComplete();
    };
  }, [isRunning, handleSessionComplete]);

  // Sync state on window focus
  useEffect(() => {
    if (!IS_TAURI) return;

    const handleFocus = () => {
      invoke<[number, boolean, string]>('get_timer_state').then((res) => {
        if (!res) return;
        const [secs, running, type] = res;

        // If frontend was running, but backend is not, it means the timer completed in the background
        if (isRunning && !running && secs === 0) {
          setTimeLeft(0);
          handleSessionComplete();
        } else if (running) {
          setTimeLeft(secs);
          setIsRunning(true);
          setSessionType(type as SessionType);
        } else {
          setIsRunning(false);
        }
      }).catch(console.error);
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [isRunning, handleSessionComplete]);

  // Control Rust timer state
  useEffect(() => {
    if (!IS_TAURI || isLoading) return;

    if (isRunning) {
      // The timer froze at its final second because its completion event was
      // missed (suspended webview / listener gap). Restarting it now would run
      // a 1-second Rust timer whose record inherits the stale sessionStartRef —
      // inflating the focus by the whole gap. Close the session out first; the
      // auto-transition stages the next phase.
      if (timeLeftRef.current <= 1 && sessionStartRef.current) {
        handleSessionComplete();
        return;
      }
      if (!sessionStartRef.current) sessionStartRef.current = new Date().toISOString();
      // Track the true end of this Rust timer (start + remaining seconds). Not
      // cleared on pause — the Rust end_timestamp is frozen across it, so the
      // estimate stays the honest end if the completion is processed late.
      completionAtRef.current = Date.now() + timeLeftRef.current * 1000;
      invoke('start_timer', { secs: timeLeftRef.current, sessionType }).catch(console.error);
    } else {
      invoke('pause_timer').catch(console.error);
    }
  }, [isRunning, sessionType, isLoading, handleSessionComplete]);

  useEffect(() => {
    if (timeLeft === 0 && !isRunning) return;
    if (timeLeft === 0) handleSessionComplete();
  }, [timeLeft, isRunning, handleSessionComplete]);

  // A new session begins whenever isRunning goes true (manual start, auto-start
  // after a break, or the switch-task confirm flow) — clear the completion guard
  // so the next completion is honored.
  useEffect(() => {
    if (isRunning) completionHandledRef.current = false;
  }, [isRunning]);

  // ----- Focus music -----
  // Plays looping ambient audio while a focus session is actively running and
  // the user has enabled it. Stops on pause, on session end/break, or when the
  // setting is toggled off.
  useEffect(() => {
    if (isRunning && sessionType === 'focus' && settings.focusMusicEnabled) {
      startFocusMusic();
    } else {
      stopFocusMusic();
    }
    return () => stopFocusMusic();
  }, [isRunning, sessionType, settings.focusMusicEnabled]);

  // ----- Update window title + system tray -----
  useEffect(() => {
    const timerText = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    const sessionLabel = sessionType === 'focus' ? 'Focus' : 'Break';

    if (isRunning) {
      document.title = `${timerText} — ${sessionLabel}`;
    } else {
      document.title = 'myOKR — Pomodoro Timer';
      // Only update tray title when not running (Rust timer updates it natively when running)
      if (IS_TAURI) {
        invoke('update_tray_title', {
          title: timerText,
          tooltip: `Ready to ${sessionLabel} (${timerText})`
        }).catch(() => {});
      }
    }

    return () => {
      document.title = 'myOKR — Pomodoro Timer';
      if (IS_TAURI) invoke('reset_tray').catch(() => {});
    };
  }, [isRunning, minutes, seconds, sessionType]);

  // ----- Controls -----
  const toggleTimer = () => {
    if (!isRunning && sessionType === 'focus' && !activeTask) {
      setIsConfirmNoTaskOpen(true);
      return;
    }
    if (!isRunning && !sessionStartRef.current) sessionStartRef.current = new Date().toISOString();
    setIsRunning(!isRunning);
  };

  const startTimer = () => {
    if (!sessionStartRef.current) sessionStartRef.current = new Date().toISOString();
    setIsRunning(true);
  };

  const resetTimer = () => {
    setIsRunning(false);
    sessionStartRef.current = null;
    completionAtRef.current = null;
    if (autoStartTimeoutRef.current) { clearTimeout(autoStartTimeoutRef.current); autoStartTimeoutRef.current = null; }
    setTimeLeft(totalSeconds);
    if (IS_TAURI) invoke('reset_timer_state').catch(console.error);
  };
  resetTimerRef.current = resetTimer;

  const switchSession = (type: SessionType) => {
    setIsRunning(false);
    sessionStartRef.current = null;
    completionAtRef.current = null;
    if (autoStartTimeoutRef.current) { clearTimeout(autoStartTimeoutRef.current); autoStartTimeoutRef.current = null; }
    setSessionType(type);
    const dur = durationMinutes(settings, type);
    setTimeLeft(dur * 60);
    if (IS_TAURI) invoke('reset_timer_state').catch(console.error);
  };

  const updateSetting = <K extends keyof PomodoroSettings>(key: K, value: PomodoroSettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings(next).catch(console.error); // rule 3: act first, persist non-blocking
    if (key === 'focusDuration' && sessionType === 'focus') setTimeLeft((value as number) * 60);
    if (key === 'shortBreakDuration' && sessionType === 'shortBreak') setTimeLeft((value as number) * 60);
    if (key === 'longBreakDuration' && sessionType === 'longBreak') setTimeLeft((value as number) * 60);
  };

  // useCallback so task views (React.memo) don't re-render on every 1-second
  // timer tick — these only reference stable setters / refs / scalar state.
  // Stamps `updatedAt` on any task whose object identity changed vs the last
  // persisted array (callers preserve refs for unchanged tasks via `.map`, so
  // reference inequality pinpoints the edited task — or a brand-new one). This
  // is the single funnel for all task writes, so every edit path — detail modal,
  // TaskList inline cells, task creation, pomodoro completion — gets stamped.
  const handleTasksChange = useCallback((incoming: PomodoroTask[]) => {
    const prev = tasksRef.current;
    const now = new Date().toISOString();
    const stamped = incoming.map(t => {
      const p = prev.find(x => x.id === t.id);
      return (!p || p !== t) ? stampUpdatedAt(t, now) : t;
    });
    setTasks(stamped);
    saveTasks(stamped).catch(console.error); // rule 3: act (setState) first, persist non-blocking
  }, []);

  // Guarded active-task setter: switching task during a running focus confirms.
  const setActiveTask = useCallback((id: string | null) => {
    if (isRunning && sessionType === 'focus' && id !== activeTaskId && id !== null && activeTaskId !== null) {
      pendingSwitchTaskId.current = id;
      setIsRunning(false);
      setIsConfirmSwitchTaskOpen(true);
      return;
    }
    if (isRunning && sessionType === 'focus' && id === null) {
      setIsRunning(false);
    }
    setActiveTaskId(id);
  }, [isRunning, sessionType, activeTaskId]);

  // Analytics: clear history + reset timer
  const clearSessionData = useCallback(async () => {
    setHistory([]); saveHistory([]).catch(console.error);
    setCompletedPomos(0);
    await clearTimerState();
    resetTimerRef.current();
  }, []);

  // Analytics: import replaces settings/tasks/history and resets the timer
  const importSessionData = useCallback(async (data: { settings: PomodoroSettings; tasks: PomodoroTask[]; history: DailyRecord[] }) => {
    const s = data.settings;
    setSettings(s);
    saveSettings(s).catch(console.error);
    setTasks(data.tasks);
    saveTasks(data.tasks).catch(console.error);
    setHistory(data.history);
    saveHistory(data.history).catch(console.error);
    setCompletedPomos(0);
    setSessionType('focus');
    setTimeLeft(s.focusDuration * 60);
    setIsRunning(false);
    sessionStartRef.current = null;
    await clearTimerState();
  }, []);

  const value: SessionContextValue = {
    settings, tasks, history,
    sessionType, timeLeft, isRunning, completedPomos, activeTaskId, activeTask, activeFocusTaskId,
    isLoading, pulse,
    totalSeconds, progress, minutes, seconds,
    toggleTimer, startTimer, resetTimer, switchSession,
    setActiveTask, updateSetting, handleTasksChange,
    clearSessionData, importSessionData,
  };

  return (
    <SessionContext.Provider value={value}>
      {children}
      {/* Session-coupled confirms — always mounted so they surface on any page. */}
      <ConfirmModal
        isOpen={isConfirmNoTaskOpen}
        onClose={() => setIsConfirmNoTaskOpen(false)}
        onConfirm={startTimer}
        title="No Task Selected"
        message="You haven't selected a task for this focus session. Start anyway?"
        confirmText="Start Anyway"
        danger={false}
      />
      <ConfirmModal
        isOpen={isConfirmSwitchTaskOpen}
        onClose={() => { setIsConfirmSwitchTaskOpen(false); pendingSwitchTaskId.current = null; startTimer(); }}
        onConfirm={() => { setActiveTaskId(pendingSwitchTaskId.current); pendingSwitchTaskId.current = null; startTimer(); }}
        title="Switch Task?"
        message="The timer is running. Do you want to switch to a different task?"
        confirmText="Switch"
        danger={false}
      />
      <ConfirmModal
        isOpen={isConfirmTaskChangedOpen}
        onClose={() => { setIsConfirmTaskChangedOpen(false); pendingAutoStart.current = null; }}
        onConfirm={() => {
          const fn = pendingAutoStart.current;
          pendingAutoStart.current = null;
          fn?.();
        }}
        title="Task Changed"
        message="The active task changed during your break. Continue with the new task?"
        confirmText="Continue"
        danger={false}
      />
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
