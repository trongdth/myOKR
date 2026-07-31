import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Pause, Play, RotateCcw, Settings } from 'lucide-react';
import '../styles/pomodoro.css';
import {
  loadSettings, saveSettings, loadTasks, saveTasks, loadHistory, saveHistory,
  loadTimerState, saveTimerState, clearTimerState,
  getTodayRecord, upsertTodayRecord, playCompletionSound, sendNotification,
  requestNotificationPermission, DEFAULT_SETTINGS,
  completePomodoroForTask,
  type PomodoroSettings, type SessionType, type PomodoroTask, type DailyRecord,
} from '../lib/pomodoro-storage';
import { startFocusMusic, stopFocusMusic } from '../lib/focus-music';
import TaskList from './pomodoro/TaskList';
import TasksView from './pomodoro/TasksView';
import DoneView from './pomodoro/DoneView';
import CommandKModal from './pomodoro/CommandKModal';
import TaskDetailModal from './pomodoro/TaskDetailModal';
import Analytics from './pomodoro/Analytics';
import PrioritizeModal from './pomodoro/PrioritizeModal';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  loadKeyResults, saveKeyResults, getActiveCycle,
  loadCycles, saveCycles, loadObjectives, saveObjectives,
  loadReviews, saveReviews,
  type KeyResult, type OKRCycle, type Objective, type WeeklyReview,
} from '../lib/okr-storage';
import ConfirmModal from './ConfirmModal';
import NumberInput from './NumberInput';
import LoadingState from './shared/LoadingState';

// Tauri injects __TAURI_INTERNALS__ at runtime; no type definitions exist for it.
const IS_TAURI = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;

// Structural equality for the background-sync refresh path. Sync runs every
// ~5 min, so the cost is negligible — and it lets us skip setState (and the
// resulting re-render) when a merge produced no actual data change.
const jsonEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export default function PomodoroApp({
  tab,
  requestedTaskId,
  onRequestedTaskConsumed,
}: {
  tab: 'timer' | 'tasks' | 'analytics' | 'done';
  requestedTaskId?: string | null;
  onRequestedTaskConsumed?: () => void;
}) {
  // ----- State -----
  const [settings, setSettings] = useState<PomodoroSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [sessionType, setSessionType] = useState<SessionType>('focus');
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [completedPomos, setCompletedPomos] = useState(0);
  const [tasks, setTasks] = useState<PomodoroTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [history, setHistory] = useState<DailyRecord[]>([]);
  const [keyResults, setKeyResults] = useState<KeyResult[]>([]);
  const [cycles, setCycles] = useState<OKRCycle[]>([]);
  const [activeCycle, setActiveCycle] = useState<OKRCycle | null>(null);
  const [selectedDetailTask, setSelectedDetailTask] = useState<PomodoroTask | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [showPrioritizeModal, setShowPrioritizeModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);
  const [isConfirmImportOpen, setIsConfirmImportOpen] = useState(false);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);
  const [isConfirmNoTaskOpen, setIsConfirmNoTaskOpen] = useState(false);
  const [isConfirmSwitchTaskOpen, setIsConfirmSwitchTaskOpen] = useState(false);
  const [isConfirmTaskChangedOpen, setIsConfirmTaskChangedOpen] = useState(false);
  const [importData, setImportData] = useState<{
    settings: PomodoroSettings; tasks: PomodoroTask[]; history: DailyRecord[];
    cycles?: OKRCycle[]; objectives?: Objective[]; keyResults?: KeyResult[]; reviews?: WeeklyReview[];
  } | null>(null);

  const sessionStartRef = useRef<string | null>(null);
  const autoStartTimeoutRef = useRef<number | null>(null);
  const lastFocusTaskId = useRef<string | null>(null);
  const pendingAutoStart = useRef<(() => void) | null>(null);
  const pendingSwitchTaskId = useRef<string | null>(null);
  // Guards against a session completion being handled more than once. Completion
  // can be signalled from up to three places (timer-complete event, window-focus
  // sync, and the timeLeft===0 effect); without this, a double signal would
  // double-count pomodoros, history records, and notifications.
  const completionHandledRef = useRef(false);

  // ----- Load from Tauri Store on mount -----
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
      
      const loadedCycles = await loadCycles();
      setCycles(loadedCycles);
      const currCycle = await getActiveCycle();
      setActiveCycle(currCycle);

      if (currCycle) {
        const krs = await loadKeyResults();
        const objs = await loadObjectives();
        const activeObjs = new Set(objs.filter(o => o.cycleId === currCycle.id).map(o => o.id));
        setKeyResults(krs.filter(kr => activeObjs.has(kr.objectiveId)));
      }

      requestNotificationPermission();
      setIsLoading(false);
    }
    init();
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
      setActiveTaskId(requestedTaskId);
      onRequestedTaskConsumed?.();
    }
  }, [requestedTaskId, isLoading, onRequestedTaskConsumed]);

  // Reload keyResults when switching tabs (KR titles may have changed on OKR page)
  useEffect(() => {
    if (tab === 'tasks' || tab === 'timer') {
      (async () => {
        const activeCycle = await getActiveCycle();
        if (activeCycle) {
          const krs = await loadKeyResults();
          const objs = await loadObjectives();
          const activeObjs = new Set(objs.filter(o => o.cycleId === activeCycle.id).map(o => o.id));
          setKeyResults(krs.filter(kr => activeObjs.has(kr.objectiveId)));
        }
      })();
    }
  }, [tab]);

  // Keep sessionTypeRef in sync so background sync callbacks don't capture stale state
  const sessionTypeRef = useRef(sessionType);
  useEffect(() => {
    sessionTypeRef.current = sessionType;
  }, [sessionType]);

  // Listen to background sync and reload data dynamically
  useEffect(() => {
    async function refreshData() {
      const s = await loadSettings();
      setSettings(prev => (jsonEqual(prev, s) ? prev : s));
      
      if (!isRunning) {
        const curType = sessionTypeRef.current;
        const dur = curType === 'focus' ? s.focusDuration
          : curType === 'shortBreak' ? s.shortBreakDuration
          : s.longBreakDuration;
        const oldDur = curType === 'focus' ? settings.focusDuration
          : curType === 'shortBreak' ? settings.shortBreakDuration
          : settings.longBreakDuration;
        if (timeLeftRef.current === oldDur * 60) {
          setTimeLeft(dur * 60);
        }
      }

      const loadedTasks = await loadTasks();
      setTasks(prev => (jsonEqual(prev, loadedTasks) ? prev : loadedTasks));
      const loadedHistory = await loadHistory();
      setHistory(prev => (jsonEqual(prev, loadedHistory) ? prev : loadedHistory));

      const activeCycle = await getActiveCycle();
      if (activeCycle) {
        const krs = await loadKeyResults();
        const objs = await loadObjectives();
        const activeObjs = new Set(objs.filter(o => o.cycleId === activeCycle.id).map(o => o.id));
        const loadedKrs = krs.filter(kr => activeObjs.has(kr.objectiveId));
        setKeyResults(prev => (jsonEqual(prev, loadedKrs) ? prev : loadedKrs));
      }
    }

    const handleSync = () => {
      refreshData();
    };

    window.addEventListener('myokr-data-synced', handleSync);
    return () => window.removeEventListener('myokr-data-synced', handleSync);
  }, [isRunning]);

  // ----- Persist timer state to Tauri Store -----
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
    [activeTaskId, tasks]
  );

  const totalSeconds = sessionType === 'focus'
    ? settings.focusDuration * 60
    : sessionType === 'shortBreak'
      ? settings.shortBreakDuration * 60
      : settings.longBreakDuration * 60;

  const progress = totalSeconds > 0 ? (totalSeconds - timeLeft) / totalSeconds : 0;
  const circumference = 2 * Math.PI * 120;
  const dashOffset = circumference * (1 - progress);

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

    const now = new Date().toISOString();
    const session = {
      startedAt: sessionStartRef.current || now,
      endedAt: now,
      type: sessionType,
      taskId: activeTaskId || undefined,
      completed: true,
    };
    sessionStartRef.current = null;

    if (sessionType === 'focus') {
      const newCompleted = completedPomos + 1;
      setCompletedPomos(newCompleted);

      lastFocusTaskId.current = activeTaskId;

      // Update active task in Automerge doc in-place so newly created tasks are not wiped.
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

      // Update history (async, after state transition is applied)
      loadHistory().then(h => {
        const todayRec = getTodayRecord(h);
        todayRec.completedPomodoros += 1;
        todayRec.totalFocusMinutes += settings.focusDuration;
        todayRec.sessions.push(session);
        const newHistory = upsertTodayRecord(h, todayRec);
        setHistory(newHistory);
        saveHistory(newHistory).catch(console.error);
      }).catch(console.error);
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

      // Record break session
      loadHistory().then(h => {
        const todayRec = getTodayRecord(h);
        todayRec.sessions.push(session);
        const newHistory = upsertTodayRecord(h, todayRec);
        setHistory(newHistory);
        saveHistory(newHistory).catch(console.error);
      }).catch(console.error);
    }
  }, [sessionType, completedPomos, activeTaskId, tasks, settings]);

  // ----- Timer tick (Tauri Rust / Browser Fallback) -----
  useEffect(() => {
    if (!IS_TAURI) {
      // Browser fallback (e.g. Playwright tests)
      if (!isRunning) return;
      if (!sessionStartRef.current) sessionStartRef.current = new Date().toISOString();

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

  const timeLeftRef = useRef(timeLeft);
  useEffect(() => {
    timeLeftRef.current = timeLeft;
  }, [timeLeft]);

  // Control Rust timer state
  useEffect(() => {
    if (!IS_TAURI || isLoading) return;

    if (isRunning) {
      if (!sessionStartRef.current) sessionStartRef.current = new Date().toISOString();
      invoke('start_timer', { secs: timeLeftRef.current, sessionType }).catch(console.error);
    } else {
      invoke('pause_timer').catch(console.error);
    }
  }, [isRunning, sessionType, isLoading]);

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
  // setting is toggled off. One effect covers every start path (manual Start,
  // post-confirm start, auto-start, restore-on-load) since all funnel through
  // isRunning + sessionType.
  useEffect(() => {
    if (isRunning && sessionType === 'focus' && settings.focusMusicEnabled) {
      startFocusMusic();
    } else {
      stopFocusMusic();
    }
    return () => stopFocusMusic();
  }, [isRunning, sessionType, settings.focusMusicEnabled]);

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
    if (autoStartTimeoutRef.current) { clearTimeout(autoStartTimeoutRef.current); autoStartTimeoutRef.current = null; }
    setTimeLeft(totalSeconds);
    if (IS_TAURI) invoke('reset_timer_state').catch(console.error);
  };

  const switchSession = (type: SessionType) => {
    setIsRunning(false);
    sessionStartRef.current = null;
    if (autoStartTimeoutRef.current) { clearTimeout(autoStartTimeoutRef.current); autoStartTimeoutRef.current = null; }
    setSessionType(type);
    const dur = type === 'focus' ? settings.focusDuration
      : type === 'shortBreak' ? settings.shortBreakDuration
      : settings.longBreakDuration;
    setTimeLeft(dur * 60);
    if (IS_TAURI) invoke('reset_timer_state').catch(console.error);
  };

  // ----- Settings handlers -----
  const updateSetting = <K extends keyof PomodoroSettings>(key: K, value: PomodoroSettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings(next);
    if (key === 'focusDuration' && sessionType === 'focus') setTimeLeft((value as number) * 60);
    if (key === 'shortBreakDuration' && sessionType === 'shortBreak') setTimeLeft((value as number) * 60);
    if (key === 'longBreakDuration' && sessionType === 'longBreak') setTimeLeft((value as number) * 60);
  };

  // ----- Task handlers -----
  // useCallback so TaskList (React.memo) doesn't re-render on every 1-second
  // timer tick — these only reference stable setters / refs / scalar state that
  // doesn't change on a tick.
  const handleTasksChange = useCallback((t: PomodoroTask[]) => {
    setTasks(t);
    saveTasks(t);
  }, []);

  const handleSetActiveTask = useCallback((id: string | null) => {
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

  // ----- Analytics handlers -----
  const handleExport = async () => {
    try {
      const [cycles, objectives, krs, reviews] = await Promise.all([
        loadCycles(), loadObjectives(), loadKeyResults(), loadReviews(),
      ]);
      const data = { settings, tasks, history, cycles, objectives, keyResults: krs, reviews, exportedAt: new Date().toISOString() };
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
    const s = importData.settings;
    setSettings(s);
    saveSettings(s);
    setTasks(importData.tasks);
    saveTasks(importData.tasks);
    setHistory(importData.history);
    saveHistory(importData.history);
    if (importData.cycles) { saveCycles(importData.cycles); }
    if (importData.objectives) { saveObjectives(importData.objectives); }
    if (importData.keyResults) { saveKeyResults(importData.keyResults); setKeyResults(importData.keyResults); }
    if (importData.reviews) { saveReviews(importData.reviews); }
    setImportData(null);
    setCompletedPomos(0);
    setSessionType('focus');
    setTimeLeft(s.focusDuration * 60);
    setIsRunning(false);
    sessionStartRef.current = null;
    await clearTimerState();
  };

  const handleClearRequest = () => {
    setIsConfirmClearOpen(true);
  };

  const executeClear = async () => {
    setHistory([]); saveHistory([]);
    setCompletedPomos(0);
    await clearTimerState();
    resetTimer();
  };

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

  const isBreak = sessionType !== 'focus';

  if (isLoading) {
    return <LoadingState className="pomodoro-container" />;
  }

  return (
    <div className="pomodoro-container">

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
          <TaskList tasks={tasks} activeTaskId={activeTaskId} onTasksChange={handleTasksChange} onSetActive={handleSetActiveTask} keyResults={keyResults} hideCompleted={true} />

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
          onSetActive={handleSetActiveTask}
          onSelectTask={(t) => setSelectedDetailTask(t)}
          onStartFocusTask={(t) => {
            handleSetActiveTask(t.id);
            window.dispatchEvent(new CustomEvent('myokr-navigate-to-section', { detail: 'session' }));
          }}
          keyResults={keyResults}
          cycles={cycles}
          activeCycle={activeCycle}
          onOpenSearch={() => setIsSearchOpen(true)}
        />
      )}

      {/* Done Tab */}
      {tab === 'done' && (
        <DoneView
          tasks={tasks}
          keyResults={keyResults}
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
          cycles={cycles}
          activeCycleId={activeCycle?.id}
          onSelectTask={(t) => setSelectedDetailTask(t)}
          onStartFocusTask={(t) => {
            handleSetActiveTask(t.id);
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
          onStartFocus={(t) => {
            handleSetActiveTask(t.id);
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
