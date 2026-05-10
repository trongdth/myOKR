import { useState, useRef, useEffect } from 'react';
import type { KeyResult } from '../../lib/okr-storage';
import type { Confidence } from '../../lib/okr-storage';
import { CONFIDENCE_META } from '../../lib/okr-storage';
import type { PomodoroTask } from '../../lib/pomodoro-storage';
import LinkedTasksBadge from './LinkedTasksBadge';

interface Props {
  kr: KeyResult;
  tasks: PomodoroTask[];
  onUpdate: (updated: KeyResult) => void;
  onDelete: (id: string) => void;
}

const CONFIDENCE_CYCLE: Confidence[] = ['not_set', 'on_track', 'at_risk', 'off_track'];

export default function KeyResultRow({ kr, tasks, onUpdate, onDelete }: Props) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(kr.title);
  const [showConfidencePopup, setShowConfidencePopup] = useState(false);
  const confidenceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (confidenceRef.current && !confidenceRef.current.contains(e.target as Node)) {
        setShowConfidencePopup(false);
      }
    };
    if (showConfidencePopup) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showConfidencePopup]);

  const progress = kr.targetValue > 0 ? Math.min(100, (kr.currentValue / kr.targetValue) * 100) : 0;
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

  const confidenceClass = kr.confidence === 'not_set' ? 'not-set' : kr.confidence.replace('_', '-');

  return (
    <div className="kr-row">
      {/* Confidence indicator */}
      <div style={{ position: 'relative' }} ref={confidenceRef}>
        <span
          className="kr-confidence"
          onClick={(e) => { e.stopPropagation(); setShowConfidencePopup(!showConfidencePopup); }}
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

      {/* Progress */}
      <div className="kr-progress-section">
        <div className="kr-progress-bar">
          <div
            className={`kr-progress-fill ${confidenceClass}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <input
          type="number"
          className="kr-value-input"
          value={kr.currentValue}
          min={0}
          onChange={e => updateCurrentValue(parseInt(e.target.value) || 0)}
          onClick={e => e.stopPropagation()}
          title="Current value"
        />
        <span className="kr-unit">/</span>
        <input
          type="number"
          className="kr-value-input"
          value={kr.targetValue}
          min={1}
          onChange={e => updateTargetValue(parseInt(e.target.value) || 1)}
          onClick={e => e.stopPropagation()}
          title="Target value"
        />
        <span className="kr-unit">{kr.unit}</span>
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
