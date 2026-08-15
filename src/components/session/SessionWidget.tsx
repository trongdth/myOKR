import { Pause, Play } from 'lucide-react';
import { useSession } from './SessionProvider';
import './SessionWidget.css';

/**
 * Global, always-visible session control (decision α, docs/design-system.md).
 * Mirrors and drives the live session on every page except the Session tab
 * (where the full timer is on screen). Shown only when something is running or
 * staged — an active uncompleted task or a running session — so the idle app
 * has no floating pill.
 */
export default function SessionWidget({
  activeSection,
  onOpen,
}: {
  activeSection: string;
  onOpen: () => void;
}) {
  const {
    sessionType, isRunning, minutes, seconds, progress,
    activeTask, toggleTimer,
  } = useSession();

  // Rider a: hide on the Session tab (the full timer is already on screen).
  // Rider b: hide when idle — no active uncompleted task and nothing running.
  if (activeSection === 'session') return null;
  if (!activeTask && !isRunning) return null;

  const isFocus = sessionType === 'focus';
  const phaseLabel = isFocus ? 'Focus' : sessionType === 'shortBreak' ? 'Short Break' : 'Long Break';

  // Mini ring geometry.
  const R = 18;
  const C = 2 * Math.PI * R;
  const dashOffset = C * (1 - progress);

  return (
    <div className="session-widget" role="region" aria-label={`Session timer — ${phaseLabel}`}>
      <svg className="session-widget-ring" viewBox="0 0 44 44" aria-hidden="true">
        <circle className="sw-ring-bg" cx="22" cy="22" r={R} />
        <circle
          className={`sw-ring-progress${isFocus ? '' : ' break'}`}
          cx="22" cy="22" r={R}
          strokeDasharray={C}
          strokeDashoffset={dashOffset}
        />
      </svg>

      <div className="sw-info">
        <div className="sw-time">
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </div>
        {/* With a task staged, the subtext is its title alone — the phase
            label and pomo count are dropped so the name gets the room to be
            read; the phase label is the fallback only when a session runs
            without a task. */}
        <div className="sw-sub" title={activeTask?.title}>
          {!activeTask && phaseLabel}
          {activeTask && <span className="sw-task">{activeTask.title}</span>}
        </div>
      </div>

      <div className="sw-actions">
        <button
          className="sw-btn sw-play"
          onClick={toggleTimer}
          title={isRunning ? 'Pause' : 'Start'}
          aria-label={isRunning ? 'Pause session' : 'Start session'}
        >
          {isRunning ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
        </button>
        <button className="sw-btn sw-open" onClick={onOpen} title="Open timer">
          Open
        </button>
      </div>
    </div>
  );
}
