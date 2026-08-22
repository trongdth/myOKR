import { useState, useRef, type ReactNode } from 'react';
import { X, Pencil, Clock, Timer, CheckCheck, TrendingUp } from 'lucide-react';
import type { KeyResult, CompletionMode, Confidence, Objective, OKRCycle } from '../../lib/okr-storage';
import { CONFIDENCE_META, COMPLETION_MODE_META, getEffectiveCurrentValue } from '../../lib/okr-storage';
import type { PomodoroTask } from '../../lib/pomodoro-storage';
import { useClickOutside } from '../../hooks/useClickOutside';
import { type Habit } from '../../lib/habit-storage';
import StepperPopover from './StepperPopover';

const COMPLETION_MODE_ICONS: Record<CompletionMode, ReactNode> = {
  manual: <Pencil size={12} />,
  focus_hours: <Clock size={12} />,
  focus_pomodoros: <Timer size={12} />,
  completed_tasks: <CheckCheck size={12} />,
  habit: <TrendingUp size={12} />,
};

interface Props {
  kr: KeyResult;
  tasks: PomodoroTask[];
  focusDurationMinutes: number;
  onUpdate: (updated: KeyResult) => void;
  onDelete: (id: string) => void;
  habits: Habit[];
  objectives: Objective[];
  cycles: OKRCycle[];
}

const CONFIDENCE_CYCLE: Confidence[] = ['not_set', 'on_track', 'at_risk', 'off_track'];
const COMPLETION_MODES: CompletionMode[] = ['manual', 'focus_hours', 'focus_pomodoros', 'completed_tasks', 'habit'];

export default function KeyResultRow({ kr, tasks, focusDurationMinutes, onUpdate, onDelete, habits, objectives, cycles }: Props) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(kr.title);
  const [showConfidencePopup, setShowConfidencePopup] = useState(false);
  const [showModePopup, setShowModePopup] = useState(false);
  const [showValuePopover, setShowValuePopover] = useState(false);
  const confidenceRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLDivElement>(null);

  useClickOutside(confidenceRef, showConfidencePopup, () => setShowConfidencePopup(false));
  useClickOutside(modeRef, showModePopup, () => setShowModePopup(false));
  useClickOutside(valueRef, showValuePopover, () => setShowValuePopover(false));

  const mode = kr.completionMode || 'manual';
  const effectiveCurrent = getEffectiveCurrentValue(kr, tasks, focusDurationMinutes, habits, objectives, cycles);
  const progress = kr.targetValue > 0 ? Math.min(100, (effectiveCurrent / kr.targetValue) * 100) : 0;
  const meta = CONFIDENCE_META[kr.confidence];
  const modeMeta = COMPLETION_MODE_META[mode];
  // Every mode opens the value popover: Manual adjusts the hand-set current;
  // all derived modes (Focus Hours included) adjust their target — their
  // current is computed from linked tasks/habits and is never hand-written.
  const showCurrentAdjuster = mode === 'manual';

  const saveTitle = () => {
    const t = titleDraft.trim();
    if (t && t !== kr.title) {
      onUpdate({ ...kr, title: t, updatedAt: new Date().toISOString() });
    }
    setEditingTitle(false);
  };

  const setConfidence = (c: Confidence) => {
    onUpdate({ ...kr, confidence: c, updatedAt: new Date().toISOString() });
    setShowConfidencePopup(false);
  };

  const setMode = (m: CompletionMode) => {
    onUpdate({
      ...kr,
      completionMode: m,
      unit: COMPLETION_MODE_META[m].unit,
      updatedAt: new Date().toISOString(),
    });
    setShowModePopup(false);
  };

  const openValuePopover = () => setShowValuePopover(true);

  const confirmValuePopover = (v: number) => {
    if (showCurrentAdjuster) {
      onUpdate({ ...kr, currentValue: Math.max(0, Math.min(kr.targetValue, v)), updatedAt: new Date().toISOString() });
    } else {
      onUpdate({ ...kr, targetValue: Math.max(1, v), updatedAt: new Date().toISOString() });
    }
    setShowValuePopover(false);
  };

  const confidenceClass = kr.confidence === 'not_set' ? 'not-set' : kr.confidence.replace('_', '-');

  // Subtitle (P7 revamp): mode label + linkage, e.g. "Completed Tasks · 3 tasks
  // linked" / "Manual" / "Habit Ticks · Read before bed". Click opens the mode popup.
  const linkedTasks = tasks.filter(t => !t.isCompleted && t.keyResultId === kr.id).length;
  const linkedHabit = habits.find(h => h.id === kr.habitId);
  let subtitleLabel: string;
  let subtitleServed = true;
  if (mode === 'manual') {
    subtitleLabel = 'Manual';
  } else if (mode === 'habit') {
    subtitleLabel = `${modeMeta.label} · ${linkedHabit ? linkedHabit.name : 'no habit linked'}`;
    subtitleServed = !!linkedHabit;
  } else if (linkedTasks > 0) {
    subtitleLabel = `${modeMeta.label} · ${linkedTasks} ${linkedTasks === 1 ? 'task' : 'tasks'} linked`;
  } else {
    subtitleLabel = `${modeMeta.label} · no tasks serving this KR`;
    subtitleServed = false;
  }

  return (
    <div className="kr-row">
      {/* Column 1: title + subtitle (mode · linkage) */}
      <div className="kr-info">
        {editingTitle ? (
          <input
            className="kr-title-input"
            value={titleDraft}
            autoFocus
            onChange={e => setTitleDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
            onBlur={saveTitle}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span
            className="kr-title"
            onDoubleClick={() => { setTitleDraft(kr.title); setEditingTitle(true); }}
            title="Double-click to edit"
          >
            {kr.title}
          </span>
        )}
        <div style={{ position: 'relative' }} ref={modeRef}>
          <button
            className={`kr-subtitle${subtitleServed ? '' : ' unserved'}`}
            onClick={(e) => { e.stopPropagation(); setShowModePopup(!showModePopup); setShowConfidencePopup(false); setShowValuePopover(false); }}
            title={`Mode: ${modeMeta.label} — Click to change`}
          >
            {subtitleLabel}
          </button>
          {showModePopup && (
            <div className="mode-popup" style={{ top: '100%', left: 0, marginTop: 4 }}>
              {COMPLETION_MODES.map(m => (
                <button
                  key={m}
                  className={`mode-option${mode === m ? ' selected' : ''}`}
                  onClick={() => setMode(m)}
                >
                  {COMPLETION_MODE_ICONS[m]} {COMPLETION_MODE_META[m].label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Column 2: current value badge. Manual opens the Adjust-Current
          popover; derived modes lock it (the value is computed — pressing the
          bar/target adjusts the target instead, PR #76). */}
      <button
        className={`kr-value-badge${showCurrentAdjuster ? '' : ' locked'}`}
        onClick={e => { e.stopPropagation(); if (showCurrentAdjuster) openValuePopover(); }}
        style={{ cursor: showCurrentAdjuster ? 'pointer' : 'default' }}
        title={showCurrentAdjuster ? 'Adjust value' : undefined}
        aria-label={`Current value ${effectiveCurrent} of ${kr.targetValue}`}
      >
        {effectiveCurrent}
      </button>

      {/* Column 3: / target + progress bar + percent */}
      <div className="kr-target-group" style={{ position: 'relative' }} ref={valueRef}>
        <div
          className="kr-progress-line"
          onClick={e => { e.stopPropagation(); openValuePopover(); }}
        >
          <span className="kr-target-text">/ {kr.targetValue}</span>
          <div className="kr-progress-bar">
            <div
              className={`kr-progress-fill ${confidenceClass}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        {showValuePopover && (
          <StepperPopover
            title={showCurrentAdjuster ? 'Adjust Current' : 'Adjust Target'}
            value={showCurrentAdjuster ? kr.currentValue : kr.targetValue}
            min={showCurrentAdjuster ? 0 : 1}
            max={showCurrentAdjuster ? kr.targetValue : undefined}
            onConfirm={confirmValuePopover}
            onClose={() => setShowValuePopover(false)}
          />
        )}
      </div>

      {/* Column 4: status pill (far right) */}
      <div className="kr-status-cell" style={{ position: 'relative' }} ref={confidenceRef}>
        <span
          className={`kr-confidence-pill${kr.confidence === 'not_set' ? ' not-set' : ''}`}
          style={{ background: meta.bgColor, color: meta.color, borderColor: meta.color }}
          onClick={(e) => { e.stopPropagation(); setShowConfidencePopup(!showConfidencePopup); setShowModePopup(false); setShowValuePopover(false); }}
          title={`${meta.label} — Click to change`}
        >
          <span className="confidence-dot" style={{ background: meta.color }} />
          {meta.label}
        </span>
        {showConfidencePopup && (
          <div className="confidence-popup" style={{ top: '100%', right: 0, marginTop: 4 }}>
            {CONFIDENCE_CYCLE.filter(c => c !== 'not_set').map(c => (
              <button
                key={c}
                className={`confidence-option${kr.confidence === c ? ' selected' : ''}`}
                onClick={() => setConfidence(c)}
              >
                <span className="confidence-dot" style={{ background: CONFIDENCE_META[c].color }} /> {CONFIDENCE_META[c].label}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        className="kr-delete-btn"
        onClick={e => { e.stopPropagation(); onDelete(kr.id); }}
        title="Delete key result"
      >
        <X size={14} />
      </button>

      {/* Habits picker link row (habit mode only) */}
      {mode === 'habit' && (
        <div className="kr-habit-link-row">
          <span className="kr-habit-link-label">Linked Habit:</span>
          <select
            value={kr.habitId || ''}
            onChange={async (e) => {
              const val = e.target.value;
              if (val === '__new__') {
                window.dispatchEvent(new CustomEvent('myokr-navigate-to-section', { detail: 'habits' }));
              } else {
                onUpdate({
                  ...kr,
                  habitId: val || undefined,
                  unit: 'ticks',
                  updatedAt: new Date().toISOString()
                });
              }
            }}
          >
            <option value="">-- Select a habit --</option>
            {habits.map(h => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
            <option value="__new__" style={{ fontWeight: 'bold', color: 'var(--accent-primary)' }}>+ Create new habit...</option>
          </select>
        </div>
      )}
    </div>
  );
}
