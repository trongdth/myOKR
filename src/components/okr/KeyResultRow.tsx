import { useState, useRef, useEffect } from 'react';
import type { KeyResult, CompletionMode } from '../../lib/okr-storage';
import type { Confidence } from '../../lib/okr-storage';
import { CONFIDENCE_META, COMPLETION_MODE_META, getEffectiveCurrentValue } from '../../lib/okr-storage';
import type { PomodoroTask } from '../../lib/pomodoro-storage';
import LinkedTasksBadge from './LinkedTasksBadge';
import NumberInput from '../NumberInput';

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
  const confidenceRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (confidenceRef.current && !confidenceRef.current.contains(e.target as Node)) {
        setShowConfidencePopup(false);
      }
      if (modeRef.current && !modeRef.current.contains(e.target as Node)) {
        setShowModePopup(false);
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

  const saveTitle = () => {
    const t = titleDraft.trim();
    if (t && t !== kr.title) {
      onUpdate({ ...kr, title: t, updatedAt: new Date().toISOString() });
    }
    setEditingTitle(false);
  };

  const updateCurrentValue = (val: number) => {
    const clamped = Math.max(0, val);
    onUpdate({ ...kr, currentValue: clamped, updatedAt: new Date().toISOString() });
  };

  const updateTargetValue = (val: number) => {
    const clamped = Math.max(1, val);
    onUpdate({ ...kr, targetValue: clamped, updatedAt: new Date().toISOString() });
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

  const confidenceClass = kr.confidence === 'not_set' ? 'not-set' : kr.confidence.replace('_', '-');
  const isAutoMode = mode !== 'manual';

  return (
    <div className="kr-row">
      {/* Confidence indicator */}
      <div style={{ position: 'relative' }} ref={confidenceRef}>
        <span
          className="kr-confidence"
          onClick={(e) => { e.stopPropagation(); setShowConfidencePopup(!showConfidencePopup); setShowModePopup(false); }}
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

      {/* Title */}
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

      {/* Linked tasks */}
      <LinkedTasksBadge tasks={tasks} keyResultId={kr.id} />

      {/* Completion mode */}
      <div style={{ position: 'relative' }} ref={modeRef}>
        <span
          className="kr-mode-badge"
          onClick={(e) => { e.stopPropagation(); setShowModePopup(!showModePopup); setShowConfidencePopup(false); }}
          title={`Mode: ${COMPLETION_MODE_META[mode].label} — Click to change`}
        >
          {COMPLETION_MODE_META[mode].icon}
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

      {/* Progress */}
      <div className="kr-progress-section">
        <div className="kr-progress-bar">
          <div
            className={`kr-progress-fill ${confidenceClass}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className={`kr-current-value${isAutoMode ? ' auto' : ''}`}>
          {isAutoMode ? effectiveCurrent : ''}
        </span>
        {!isAutoMode && (
          <NumberInput
            className="kr-value-input"
            value={kr.currentValue}
            min={0}
            stopPropagation={true}
            onChange={val => updateCurrentValue(val)}
            title="Current value"
          />
        )}
        <span className="kr-unit">/</span>
        <NumberInput
          className="kr-value-input"
          value={kr.targetValue}
          min={1}
          stopPropagation={true}
          onChange={val => updateTargetValue(val)}
          title="Target value"
        />
        <span className="kr-unit">{displayUnit}</span>
      </div>

      {/* Delete */}
      <button
        className="kr-delete-btn"
        onClick={e => { e.stopPropagation(); onDelete(kr.id); }}
        title="Delete key result"
      >
        ✕
      </button>
    </div>
  );
}
