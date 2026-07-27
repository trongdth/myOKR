import { useState, useRef } from 'react';
import { X } from 'lucide-react';
import type { KeyResult, CompletionMode, Confidence, Objective, OKRCycle } from '../../lib/okr-storage';
import { CONFIDENCE_META, COMPLETION_MODE_META, getEffectiveCurrentValue } from '../../lib/okr-storage';
import type { PomodoroTask } from '../../lib/pomodoro-storage';
import { useClickOutside } from '../../hooks/useClickOutside';
import { useHoldRepeat } from '../../hooks/useHoldRepeat';
import { type Habit } from '../../lib/habit-storage';

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
  const [tempCurrent, setTempCurrent] = useState(kr.currentValue);
  const [tempTarget, setTempTarget] = useState(kr.targetValue);
  const confidenceRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLDivElement>(null);

  useClickOutside(confidenceRef, showConfidencePopup, () => setShowConfidencePopup(false));
  useClickOutside(modeRef, showModePopup, () => setShowModePopup(false));
  useClickOutside(valueRef, showValuePopover, () => setShowValuePopover(false));

  const mode = kr.completionMode || 'manual';
  const effectiveCurrent = getEffectiveCurrentValue(kr, tasks, focusDurationMinutes, habits, objectives, cycles);
  const displayUnit = COMPLETION_MODE_META[mode].unit;
  const progress = kr.targetValue > 0 ? Math.min(100, (effectiveCurrent / kr.targetValue) * 100) : 0;
  const meta = CONFIDENCE_META[kr.confidence];
  const modeMeta = COMPLETION_MODE_META[mode];
  const canShowPopover = mode === 'manual' || mode === 'focus_pomodoros' || mode === 'completed_tasks' || mode === 'habit';
  const showCurrentAdjuster = mode === 'manual';
  const showTargetAdjuster = mode === 'focus_pomodoros' || mode === 'completed_tasks' || mode === 'habit';

  // Hold-repeat handlers for current value stepper
  const holdCurrentDec = useHoldRepeat(
    () => setTempCurrent(p => Math.max(0, p - 1)),
    () => tempCurrent > 0,
  );
  const holdCurrentInc = useHoldRepeat(
    () => setTempCurrent(p => Math.min(kr.targetValue, p + 1)),
    () => tempCurrent < kr.targetValue,
  );
  // Hold-repeat handlers for target value stepper
  const holdTargetDec = useHoldRepeat(
    () => setTempTarget(p => Math.max(1, p - 1)),
    () => tempTarget > 1,
  );
  const holdTargetInc = useHoldRepeat(
    () => setTempTarget(p => p + 1),
    () => true,
  );

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

  const openValuePopover = () => {
    setTempCurrent(kr.currentValue);
    setTempTarget(kr.targetValue);
    setShowValuePopover(true);
  };

  const saveValuePopover = () => {
    if (showCurrentAdjuster) {
      onUpdate({
        ...kr,
        currentValue: Math.max(0, Math.min(kr.targetValue, tempCurrent)),
        updatedAt: new Date().toISOString(),
      });
    } else {
      onUpdate({
        ...kr,
        targetValue: Math.max(1, tempTarget),
        updatedAt: new Date().toISOString(),
      });
    }
    setShowValuePopover(false);
  };

  const confidenceClass = kr.confidence === 'not_set' ? 'not-set' : kr.confidence.replace('_', '-');

  return (
    <div className="kr-row">
      {/* Line 1: confidence + title + mode badge + delete */}
      <div className="kr-row-top">
        <div style={{ position: 'relative' }} ref={confidenceRef}>
          <span
            className="kr-confidence"
            onClick={(e) => { e.stopPropagation(); setShowConfidencePopup(!showConfidencePopup); setShowModePopup(false); setShowValuePopover(false); }}
            title={`${meta.label} — Click to change`}
          >
            {meta.icon}
          </span>
          {showConfidencePopup && (
            <div className="confidence-popup" style={{ top: '100%', left: 0, marginTop: 4 }}>
              {CONFIDENCE_CYCLE.filter(c => c !== 'not_set').map(c => (
                <button
                  key={c}
                  className={`confidence-option${kr.confidence === c ? ' selected' : ''}`}
                  onClick={() => setConfidence(c)}
                >
                  {CONFIDENCE_META[c].icon} {CONFIDENCE_META[c].label}
                </button>
              ))}
            </div>
          )}
        </div>

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
          <span
            className="kr-mode-badge-label"
            onClick={(e) => { e.stopPropagation(); setShowModePopup(!showModePopup); setShowConfidencePopup(false); setShowValuePopover(false); }}
            title={`Mode: ${modeMeta.label} — Click to change`}
          >
            {modeMeta.icon} {modeMeta.label}
          </span>
          {showModePopup && (
            <div className="mode-popup" style={{ top: '100%', right: 0, marginTop: 4 }}>
              {COMPLETION_MODES.map(m => (
                <button
                  key={m}
                  className={`mode-option${mode === m ? ' selected' : ''}`}
                  onClick={() => setMode(m)}
                >
                  {COMPLETION_MODE_META[m].icon} {COMPLETION_MODE_META[m].label}
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
      </div>

      {/* Habits picker link row */}
      {mode === 'habit' && (
        <div className="kr-habit-link-row" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', paddingLeft: '2.25em' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Linked Habit:</span>
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
            style={{
              padding: '0.2rem 0.5rem',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              fontSize: '0.8rem',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)'
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

      {/* Line 2: progress */}
      <div className="kr-row-bottom">
        <div style={{ position: 'relative' }} ref={valueRef}>
          <div
            className="kr-progress-line"
            onClick={e => { e.stopPropagation(); if (canShowPopover) openValuePopover(); }}
            style={{ cursor: canShowPopover ? 'pointer' : 'default' }}
          >
            <span className="kr-progress-text">
              {effectiveCurrent} / {kr.targetValue} {displayUnit}
            </span>
            <div className="kr-progress-bar">
              <div
                className={`kr-progress-fill ${confidenceClass}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="kr-progress-percent">
              {progress.toFixed(1)}%
            </span>
          </div>
          {showValuePopover && canShowPopover && (
            <div className="kr-value-popover" onClick={e => e.stopPropagation()}>
              <div className="kr-popover-title">
                {showCurrentAdjuster ? 'Adjust Current' : 'Adjust Target'}
              </div>
              {showCurrentAdjuster && (
                <div className="kr-popover-field">
                  <label>Current</label>
                  <div className="kr-popover-counter">
                    <button className="kr-counter-btn" {...holdCurrentDec}>−</button>
                    <span className="kr-counter-value">{tempCurrent}</span>
                    <button className="kr-counter-btn" {...holdCurrentInc}>+</button>
                  </div>
                </div>
              )}
              {showTargetAdjuster && (
                <div className="kr-popover-field">
                  <label>Target</label>
                  <div className="kr-popover-counter">
                    <button className="kr-counter-btn" {...holdTargetDec}>−</button>
                    <span className="kr-counter-value">{tempTarget}</span>
                    <button className="kr-counter-btn" {...holdTargetInc}>+</button>
                  </div>
                </div>
              )}
              <div className="kr-popover-actions">
                <button className="kr-popover-cancel" onClick={() => setShowValuePopover(false)}>Cancel</button>
                <button className="kr-popover-confirm" onClick={saveValuePopover}>Confirm</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
