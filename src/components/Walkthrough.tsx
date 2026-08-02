import { useState, useRef, useCallback } from 'react';
import '../styles/walkthrough.css';

interface WalkthroughProps {
  onComplete: (dismissed: boolean) => void;
}

interface SlideData {
  title: string;
  description: string;
}

const SLIDES: SlideData[] = [
  {
    title: 'Set Your Objectives & Key Results',
    description:
      'Define what you want to achieve and how you\'ll measure success. Objectives inspire direction — Key Results quantify progress.',
  },
  {
    title: 'Create Tasks & Link to Key Results',
    description:
      'Break your Key Results into actionable tasks. Track focus hours and pomodoros to measure progress automatically.',
  },
  {
    title: 'Review Your Progress Weekly',
    description:
      'Reflect on your achievements every week. Update confidence levels, capture insights, and stay on track toward your goals.',
  },
];

// ===== ILLUSTRATIONS =====

function ObjectiveIllustration() {
  return (
    <svg viewBox="0 0 280 240" fill="none" className="walkthrough-svg">
      <defs>
        <linearGradient id="wt-grad1" x1="0" y1="0" x2="280" y2="240">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
        <linearGradient id="wt-grad2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0.1" />
        </linearGradient>
        <filter id="wt-glow">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background glow */}
      <circle cx="140" cy="120" r="90" fill="url(#wt-grad2)" />

      {/* Outer ring - animated pulse */}
      <circle cx="140" cy="120" r="85" stroke="url(#wt-grad1)" strokeWidth="2" opacity="0.2" className="wt-ring-pulse" />
      {/* Middle ring */}
      <circle cx="140" cy="120" r="60" stroke="url(#wt-grad1)" strokeWidth="2.5" opacity="0.4" />
      {/* Inner ring */}
      <circle cx="140" cy="120" r="35" stroke="url(#wt-grad1)" strokeWidth="2" opacity="0.6" />

      {/* Center bullseye */}
      <circle cx="140" cy="120" r="14" fill="url(#wt-grad1)" filter="url(#wt-glow)" />

      {/* KR badges */}
      <g className="wt-float-1">
        <rect x="195" y="55" width="60" height="26" rx="13" fill="rgba(6,182,212,0.12)" stroke="#06b6d4" strokeWidth="1.2" />
        <text x="225" y="72" fill="#06b6d4" fontSize="11" textAnchor="middle" fontWeight="600">KR 1</text>
      </g>
      <g className="wt-float-2">
        <rect x="200" y="150" width="60" height="26" rx="13" fill="rgba(168,85,247,0.12)" stroke="#a855f7" strokeWidth="1.2" />
        <text x="230" y="167" fill="#a855f7" fontSize="11" textAnchor="middle" fontWeight="600">KR 2</text>
      </g>
      <g className="wt-float-3">
        <rect x="30" y="90" width="60" height="26" rx="13" fill="rgba(6,182,212,0.12)" stroke="#06b6d4" strokeWidth="1.2" />
        <text x="60" y="107" fill="#06b6d4" fontSize="11" textAnchor="middle" fontWeight="600">KR 3</text>
      </g>

      {/* Dotted connection lines from KRs to target */}
      <line x1="195" y1="68" x2="180" y2="100" stroke="#06b6d4" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
      <line x1="200" y1="163" x2="178" y2="140" stroke="#a855f7" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
      <line x1="90" y1="103" x2="108" y2="110" stroke="#06b6d4" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />

      {/* Floating particles */}
      <circle cx="40" cy="50" r="3" fill="#a855f7" opacity="0.4" className="wt-float-2" />
      <circle cx="250" cy="200" r="2.5" fill="#06b6d4" opacity="0.35" className="wt-float-1" />
      <circle cx="230" cy="35" r="2" fill="#a855f7" opacity="0.3" className="wt-float-3" />
    </svg>
  );
}

function TasksIllustration() {
  return (
    <svg viewBox="0 0 280 240" fill="none" className="walkthrough-svg">
      <defs>
        <linearGradient id="wt-tgrad" x1="0" y1="0" x2="280" y2="240">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>

      {/* Central KR badge */}
      <rect x="105" y="95" width="70" height="50" rx="12" fill="rgba(6,182,212,0.1)" stroke="url(#wt-tgrad)" strokeWidth="2" />
      <text x="140" y="117" fill="#06b6d4" fontSize="11" textAnchor="middle" fontWeight="600">Key Result</text>
      <text x="140" y="134" fill="#a855f7" fontSize="10" textAnchor="middle" fontWeight="500">75%</text>

      {/* Task 1 - completed */}
      <g className="wt-float-1">
        <rect x="15" y="35" width="90" height="36" rx="8" fill="rgba(34,197,94,0.08)" stroke="#22c55e" strokeWidth="1.2" />
        <circle cx="33" cy="53" r="8" fill="rgba(34,197,94,0.15)" stroke="#22c55e" strokeWidth="1.2" />
        <polyline points="29,53 32,56 38,50" fill="none" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <text x="50" y="57" fill="#e4e4e7" fontSize="10">Task A</text>
      </g>

      {/* Task 2 - in progress */}
      <g className="wt-float-2">
        <rect x="175" y="35" width="90" height="36" rx="8" fill="rgba(6,182,212,0.08)" stroke="#06b6d4" strokeWidth="1.2" />
        {/* Pomodoro icon */}
        <circle cx="193" cy="53" r="8" fill="rgba(6,182,212,0.15)" stroke="#06b6d4" strokeWidth="1.2" />
        <text x="193" y="56" fill="#06b6d4" fontSize="8" textAnchor="middle">🍅</text>
        <text x="210" y="57" fill="#e4e4e7" fontSize="10">Task B</text>
      </g>

      {/* Task 3 - pending */}
      <g className="wt-float-3">
        <rect x="15" y="175" width="90" height="36" rx="8" fill="rgba(168,85,247,0.08)" stroke="#a855f7" strokeWidth="1.2" />
        <circle cx="33" cy="193" r="8" fill="rgba(168,85,247,0.15)" stroke="#a855f7" strokeWidth="1.2" />
        <text x="50" y="197" fill="#e4e4e7" fontSize="10">Task C</text>
      </g>

      {/* Task 4 - completed */}
      <g className="wt-float-1">
        <rect x="175" y="175" width="90" height="36" rx="8" fill="rgba(34,197,94,0.08)" stroke="#22c55e" strokeWidth="1.2" />
        <circle cx="193" cy="193" r="8" fill="rgba(34,197,94,0.15)" stroke="#22c55e" strokeWidth="1.2" />
        <polyline points="189,193 192,196 198,190" fill="none" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <text x="210" y="197" fill="#e4e4e7" fontSize="10">Task D</text>
      </g>

      {/* Connection lines from tasks to KR */}
      <line x1="105" y1="53" x2="105" y2="95" stroke="#22c55e" strokeWidth="1.2" strokeDasharray="4 3" opacity="0.5" />
      <line x1="175" y1="53" x2="175" y2="95" stroke="#06b6d4" strokeWidth="1.2" strokeDasharray="4 3" opacity="0.5" />
      <line x1="105" y1="145" x2="105" y2="175" stroke="#a855f7" strokeWidth="1.2" strokeDasharray="4 3" opacity="0.5" />
      <line x1="175" y1="145" x2="175" y2="175" stroke="#22c55e" strokeWidth="1.2" strokeDasharray="4 3" opacity="0.5" />

      {/* Link icon in center */}
      <g>
        <circle cx="140" cy="80" r="10" fill="var(--bg-primary)" stroke="url(#wt-tgrad)" strokeWidth="1.5" />
        <path d="M137,78 L143,78 M137,82 L143,82 M137,78 L137,82 M143,78 L143,82" stroke="url(#wt-tgrad)" strokeWidth="1" />
      </g>

      {/* Floating particles */}
      <circle cx="260" cy="120" r="3" fill="#06b6d4" opacity="0.3" className="wt-float-2" />
      <circle cx="20" cy="130" r="2.5" fill="#a855f7" opacity="0.35" className="wt-float-3" />
    </svg>
  );
}

function ReviewIllustration() {
  return (
    <svg viewBox="0 0 280 240" fill="none" className="walkthrough-svg">
      <defs>
        <linearGradient id="wt-rgrad" x1="0" y1="0" x2="280" y2="240">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>

      {/* Calendar/clipboard background */}
      <rect x="50" y="30" width="180" height="190" rx="16" fill="rgba(6,182,212,0.04)" stroke="rgba(6,182,212,0.15)" strokeWidth="1.5" />
      {/* Calendar header */}
      <rect x="50" y="30" width="180" height="40" rx="16" fill="rgba(6,182,212,0.08)" />
      <rect x="50" y="55" width="180" height="15" fill="rgba(6,182,212,0.08)" />
      <text x="140" y="57" fill="#06b6d4" fontSize="13" textAnchor="middle" fontWeight="600">Weekly Review</text>

      {/* Progress bars */}
      {/* Bar 1 - high */}
      <rect x="75" y="90" width="130" height="8" rx="4" fill="rgba(255,255,255,0.05)" />
      <rect x="75" y="90" width="110" height="8" rx="4" fill="url(#wt-rgrad)" opacity="0.8" />
      <text x="67" y="98" fill="#22c55e" fontSize="9" textAnchor="end">🟢</text>

      {/* Bar 2 - medium */}
      <rect x="75" y="110" width="130" height="8" rx="4" fill="rgba(255,255,255,0.05)" />
      <rect x="75" y="110" width="75" height="8" rx="4" fill="url(#wt-rgrad)" opacity="0.6" />
      <text x="67" y="118" fill="#eab308" fontSize="9" textAnchor="end">🟡</text>

      {/* Bar 3 - high */}
      <rect x="75" y="130" width="130" height="8" rx="4" fill="rgba(255,255,255,0.05)" />
      <rect x="75" y="130" width="95" height="8" rx="4" fill="url(#wt-rgrad)" opacity="0.7" />
      <text x="67" y="138" fill="#22c55e" fontSize="9" textAnchor="end">🟢</text>

      {/* Separator */}
      <line x1="75" y1="155" x2="205" y2="155" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

      {/* Reflection section */}
      <text x="75" y="175" fill="var(--text-muted)" fontSize="9">Reflections</text>
      <rect x="75" y="182" width="130" height="6" rx="3" fill="rgba(255,255,255,0.05)" />
      <rect x="75" y="193" width="100" height="6" rx="3" fill="rgba(255,255,255,0.05)" />

      {/* Trend arrow */}
      <g className="wt-float-2">
        <circle cx="230" cy="120" r="22" fill="rgba(34,197,94,0.08)" stroke="#22c55e" strokeWidth="1.2" />
        <polyline points="222,128 230,110 238,128" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="230" y1="110" x2="230" y2="132" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />
      </g>

      {/* Week dots at bottom */}
      <g>
        <circle cx="95" cy="212" r="5" fill="#06b6d4" opacity="0.7" />
        <circle cx="115" cy="212" r="5" fill="#06b6d4" opacity="0.5" />
        <circle cx="135" cy="212" r="5" fill="#a855f7" opacity="0.7" />
        <circle cx="155" cy="212" r="5" fill="#a855f7" opacity="0.5" />
        <circle cx="175" cy="212" r="5" fill="url(#wt-rgrad)" className="wt-ring-pulse" />
      </g>

      {/* Floating particles */}
      <circle cx="35" cy="60" r="3" fill="#a855f7" opacity="0.3" className="wt-float-1" />
      <circle cx="255" cy="60" r="2" fill="#06b6d4" opacity="0.35" className="wt-float-3" />
    </svg>
  );
}

const ILLUSTRATIONS = [<ObjectiveIllustration />, <TasksIllustration />, <ReviewIllustration />];

export default function Walkthrough({ onComplete }: WalkthroughProps) {
  const [current, setCurrent] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const startXRef = useRef(0);
  const draggingRef = useRef(false);

  const goTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= SLIDES.length) return;
      setCurrent(index);
    },
    [],
  );

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    startXRef.current = e.clientX;
    draggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      const delta = e.clientX - startXRef.current;
      if (Math.abs(delta) > 50) {
        goTo(delta < 0 ? current + 1 : current - 1);
      }
    },
    [current, goTo],
  );

  return (
    <div className="walkthrough-overlay">
      <div className="walkthrough-header">
        <div className="walkthrough-logo">
          <span>🎯</span>
          <strong>myOKR</strong>
        </div>
      </div>

      <div
        className="walkthrough-slides"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        <div
          className="walkthrough-track"
          style={{ transform: `translateX(-${current * 100}%)` }}
        >
          {SLIDES.map((slide, i) => (
            <div key={i} className="walkthrough-slide">
              <div className="walkthrough-illustration">{ILLUSTRATIONS[i]}</div>
              <h2 className="walkthrough-title">{slide.title}</h2>
              <p className="walkthrough-description">{slide.description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="walkthrough-indicators">
        <div className="walkthrough-dots">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              className={`walkthrough-dot${i === current ? ' active' : ''}`}
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      </div>

      <div className="walkthrough-footer">
        <label className="walkthrough-dont-show">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
          />
          <span>Don't show again</span>
        </label>

        <button className="walkthrough-btn-start" onClick={() => onComplete(dontShowAgain)}>
          Get Started
        </button>
      </div>
    </div>
  );
}
