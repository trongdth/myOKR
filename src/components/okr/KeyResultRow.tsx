import { useState, useRef, useEffect } from 'react';
import type { KeyResult, CompletionMode } from '../../lib/okr-storage';
import type { Confidence } from '../../lib/okr-storage';
import { CONFIDENCE_META, COMPLETION_MODE_META, getEffectiveCurrentValue } from '../../lib/okr-storage';
import type { PomodoroTask } from '../../lib/pomodoro-storage';

interface Props {
  kr: KeyResult;
  tasks: PomodoroTask[];
  focusDurationMinutes: number;
  onUpdate: (updated: KeyResult) => void;
  onDelete: (id: string) => void;
}

const CONFIDENCE_CYCLE: Confidence[] = ['not_set', 'on_track', 'at_risk', 'off_track'];
const COMPLETION_MODES: CompletionMode[] = ['manual', 'focus_hours', 'focus_pomodoros', 'completed_tasks'];

export default function KeyResultRow({ kr, tasks, focusDurationMinutes, onUpdate, onDelete }: Props) {
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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (confidenceRef.current && !confidenceRef.current.contains(e.target as Node)) {
        setShowConfidencePopup(false);
      }
      if (modeRef.current && !modeRef.current.contains(e.target as Node)) {
        setShowModePopup(false);
      }
      if (valueRef.current && !valueRef.current.contains(e.target as Node)) {
        setShowValuePopover(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const mode = kr.completionMode || 'manual';
  const effectiveCurrent = getEffectiveCurrentValue(kr, tasks, focusDurationMinutes);
  const displayUnit = COMPLETION_MODE_META[mode].unit;
  const progress = kr.targetValue > 0 ? Math.min(100, (effectiveCurrent / kr.targetValue) * 100) : 0;
  const meta = CONFIDENCE_META[kr.confidence];
  const modeMeta = COMPLETION_MODE_META[mode];
  const isAutoMode = mode !== 'manual';

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
    onUpdate({
      ...kr,
      currentValue: Math.max(0, tempCurrent),
      targetValue: Math.max(1, tempTarget),
      updatedAt: new Date().toISOString(),
    });
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
          ✕
        </button>
      </div>

      {/* Line 2: progress */}
      <div className="kr-row-bottom">
        <div style={{ position: 'relative' }} ref={valueRef}>
          <div
            className="kr-progress-line"
            onClick={e => { e.stopPropagation(); if (!isAutoMode) openValuePopover(); }}
            style={{ cursor: isAutoMode ? 'default' : 'pointer' }}
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
          {showValuePopover && !isAutoMode && (
            <div className="kr-value-popover" onClick={e => e.stopPropagation()}>
              <div className="kr-popover-title">Adjust Values</div>
              <div className="kr-popover-field">
                <label>Current</label>
                <div className="kr-popover-counter">
                  <button className="kr-counter-btn" onClick={() => setTempCurrent(Math.max(0, tempCurrent - 1))}>−</button>
                  <span className="kr-counter-value">{tempCurrent}</span>
                  <button className="kr-counter-btn" onClick={() => setTempCurrent(tempCurrent + 1)}>+</button>
                </div>
              </div>
              <div className="kr-popover-field">
                <label>Target</label>
                <div className="kr-popover-counter">
                  <button className="kr-counter-btn" onClick={() => setTempTarget(Math.max(1, tempTarget - 1))}>−</button>
                  <span className="kr-counter-value">{tempTarget}</span>
                  <button className="kr-counter-btn" onClick={() => setTempTarget(tempTarget + 1)}>+</button>
                </div>
              </div>
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
