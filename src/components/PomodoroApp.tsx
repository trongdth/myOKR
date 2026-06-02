import { useState, useEffect, useRef, useCallback } from 'react';
import '../styles/pomodoro.css';
import {
  loadSettings, saveSettings, loadTasks, saveTasks, loadHistory, saveHistory,
  loadTimerState, saveTimerState, clearTimerState,
  getTodayRecord, upsertTodayRecord, playCompletionSound, sendNotification,
  requestNotificationPermission, DEFAULT_SETTINGS,
  type PomodoroSettings, type SessionType, type PomodoroTask, type DailyRecord,
} from '../lib/pomodoro-storage';
import TaskList from './pomodoro/TaskList';
import Analytics from './pomodoro/Analytics';
import PrioritizeModal from './pomodoro/PrioritizeModal';
import { invoke } from '@tauri-apps/api/core';
import { save as saveDialog, open as openDialog } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import {
  loadKeyResults, saveKeyResults, getActiveCycle,
  loadCycles, saveCycles, loadObjectives, saveObjectives,
  loadReviews, saveReviews,
  type KeyResult, type OKRCycle, type Objective, type WeeklyReview,
} from '../lib/okr-storage';
import ConfirmModal from './ConfirmModal';
import NumberInput from './NumberInput';
import LoadingState from './shared/LoadingState';

export default function PomodoroApp({ tab, requestedTaskId, onRequestedTaskConsumed }: { tab: 'timer' | 'tasks' | 'analytics'; requestedTaskId?: string | null; onRequestedTaskConsumed?: () => void }) {
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
  const intervalRef = useRef<number | null>(null);
  const sessionStartRef = useRef<string | null>(null);
  const autoStartTimeoutRef = useRef<number | null>(null);
  const lastFocusTaskId = useRef<string | null>(null);
  const pendingAutoStart = useRef<(() => void) | null>(null);
  const pendingSwitchTaskId = useRef<string | null>(null);

  // ----- Load from Tauri Store on mount -----
  useEffect(() => {
    async function init() {
      const s = await loadSettings();
      setSettings(s);

      // Restore timer state
      const saved = await loadTimerState();
      if (saved) {
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
      } else {
        setTimeLeft(s.focusDuration * 60);
      }

      setTasks(await loadTasks());
      setHistory(await loadHistory());
      
      const activeCycle = await getActiveCycle();
      if (activeCycle) {
        const krs = await loadKeyResults();
        const objs = await loadObjectives();
        const activeObjs = new Set(objs.filter(o => o.cycleId === activeCycle.id).map(o => o.id));
        setKeyResults(krs.filter(kr => activeObjs.has(kr.objectiveId)));
      }

      requestNotificationPermission();
      setIsLoading(false);
    }
    init();
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
  }, [sessionType, isRunning, activeTaskId, completedPomos, isLoading]);

  // ----- Derived values -----
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

  // ----- Timer tick -----
  useEffect(() => {
    if (!isRunning) return;
    if (!sessionStartRef.current) sessionStartRef.current = new Date().toISOString();

    intervalRef.current = window.setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning]);

  // ----- Handle timer reaching zero -----
  const handleSessionComplete = useCallback(() => {
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

      // Update active task (Synchronous state update)
      if (activeTaskId) {
        const updatedTasks = tasks.map(t =>
          t.id === activeTaskId ? { ...t, completedPomodoros: t.completedPomodoros + 1 } : t
        );
        setTasks(updatedTasks);
        saveTasks(updatedTasks).catch(console.error); // Fire and forget persistence
      }

      sendNotification('🍅 Pomodoro Complete!', 'Great work! Time for a break.');

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
      sendNotification('☕ Break Over!', 'Ready to focus again?');

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

  useEffect(() => {
    if (timeLeft === 0 && !isRunning) return;
    if (timeLeft === 0) handleSessionComplete();
  }, [timeLeft, isRunning, handleSessionComplete]);

  // ----- Controls -----
  const toggleTimer = () => {
    if (!isRunning && sessionType === 'focus' && !activeTaskId) {
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
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (autoStartTimeoutRef.current) { clearTimeout(autoStartTimeoutRef.current); autoStartTimeoutRef.current = null; }
    setTimeLeft(totalSeconds);
  };

  const switchSession = (type: SessionType) => {
    setIsRunning(false);
    sessionStartRef.current = null;
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (autoStartTimeoutRef.current) { clearTimeout(autoStartTimeoutRef.current); autoStartTimeoutRef.current = null; }
    setSessionType(type);
    const dur = type === 'focus' ? settings.focusDuration
      : type === 'shortBreak' ? settings.shortBreakDuration
      : settings.longBreakDuration;
    setTimeLeft(dur * 60);
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
  const handleTasksChange = (t: PomodoroTask[]) => { setTasks(t); saveTasks(t); };

  const handleSetActiveTask = (id: string | null) => {
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
  };

  // ----- Analytics handlers -----
  const handleExport = async () => {
    const filePath = await saveDialog({
      defaultPath: `myokr-data-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (!filePath) return;
    const [cycles, objectives, krs, reviews] = await Promise.all([
      loadCycles(), loadObjectives(), loadKeyResults(), loadReviews(),
    ]);
    const data = { settings, tasks, history, cycles, objectives, keyResults: krs, reviews, exportedAt: new Date().toISOString() };
    await writeTextFile(filePath, JSON.stringify(data, null, 2));
  };

  const handleImport = async () => {
    const filePath = await openDialog({
      filters: [{ name: 'JSON', extensions: ['json'] }],
      multiple: false,
    });
    if (!filePath) return;
    try {
      const content = await readTextFile(filePath as string);
      const data = JSON.parse(content);
      if (!data.settings || !data.tasks || !data.history) return;
      setImportData(data);
      setIsConfirmImportOpen(true);
    } catch { /* invalid file */ }
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
    if (intervalRef.current) clearInterval(intervalRef.current);
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
    }

    // Consistently update tray title with current time
    invoke('update_tray_title', { 
      title: timerText, 
      tooltip: isRunning ? `${timerText} — ${sessionLabel}` : `Ready to ${sessionLabel} (${timerText})`
    }).catch(() => {});

    return () => { 
      document.title = 'myOKR — Pomodoro Timer';
      invoke('reset_tray').catch(() => {});
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
            <button className="btn-icon" onClick={() => setIsConfirmResetOpen(true)} title="Reset">↺</button>
            <button className="btn" onClick={toggleTimer}>{isRunning ? '⏸ Pause' : '▶ Start'}</button>
            <button className="btn-icon" onClick={() => setShowSettings(!showSettings)} title="Settings">⚙</button>
          </div>

          {/* Active task indicator (fixed height to prevent layout shift) */}
          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center', minHeight: '1.5em', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {activeTaskId ? (
              <span>Working on: <strong style={{ color: 'var(--accent-cyan)' }}>{tasks.find(t => t.id === activeTaskId)?.title}</strong></span>
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
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <TaskList tasks={tasks} activeTaskId={activeTaskId} onTasksChange={handleTasksChange} onSetActive={handleSetActiveTask} keyResults={keyResults} />
        </div>
      )}

      {/* Analytics Tab */}
      {tab === 'analytics' && (
        <Analytics history={history} tasks={tasks} onExport={handleExport} onImport={handleImport} onClear={handleClearRequest} />
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
