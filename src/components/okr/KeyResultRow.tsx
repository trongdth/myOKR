import { useState, useRef } from 'react';
import { X, Plus } from 'lucide-react';
import type { KeyResult, CompletionMode, Confidence, Objective, OKRCycle } from '../../lib/okr-storage';
import { COMPLETION_MODE_META, getEffectiveCurrentValue } from '../../lib/okr-storage';
import type { PomodoroTask } from '../../lib/pomodoro-storage';
import { useClickOutside } from '../../hooks/useClickOutside';
import { type Habit } from '../../lib/habit-storage';
import StepperPopover from './StepperPopover';
import { Select } from '../shared/Select';
import { KR_MODE_OPTIONS, CONFIDENCE_OPTIONS } from './okrSelectOptions';
import { navigateToSection } from '../../lib/navigation';

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

export default function KeyResultRow({ kr, tasks, focusDurationMinutes, onUpdate, onDelete, habits, objectives, cycles }: Props) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(kr.title);
  const [showValuePopover, setShowValuePopover] = useState(false);
  const valueRef = useRef<HTMLDivElement>(null);

  useClickOutside(valueRef, showValuePopover, () => setShowValuePopover(false));

  const mode = kr.completionMode || 'manual';
  const effectiveCurrent = getEffectiveCurrentValue(kr, tasks, focusDurationMinutes, habits, objectives, cycles);
  const progress = kr.targetValue > 0 ? Math.min(100, (effectiveCurrent / kr.targetValue) * 100) : 0;
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
  };

  const setMode = (m: CompletionMode) => {
    onUpdate({
      ...kr,
      completionMode: m,
      unit: COMPLETION_MODE_META[m].unit,
      updatedAt: new Date().toISOString(),
    });
  };

  const linkHabit = (habitId: string | undefined) => onUpdate({
    ...kr,
    habitId: habitId || undefined,
    unit: 'ticks',
    updatedAt: new Date().toISOString(),
  });

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

  // Subtitle (P7 revamp): the bare mode Select carries the mode label; the
  // linkage suffix (tasks/habit serving this KR) renders beside it, muted and
  // only when the KR is unserved.
  const linkedTasks = tasks.filter(t => !t.isCompleted && t.keyResultId === kr.id).length;
  const linkedHabit = habits.find(h => h.id === kr.habitId);
  let subtitleSuffix = '';
  let subtitleServed = true;
  if (mode === 'habit') {
    subtitleSuffix = linkedHabit ? `· ${linkedHabit.name}` : '· no habit linked';
    subtitleServed = !!linkedHabit;
  } else if (mode !== 'manual') {
    if (linkedTasks > 0) {
      subtitleSuffix = `· ${linkedTasks} ${linkedTasks === 1 ? 'task' : 'tasks'} linked`;
    } else {
      subtitleSuffix = '· no tasks serving this KR';
      subtitleServed = false;
    }
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
        <div className="kr-subtitle-row">
          <Select
            options={KR_MODE_OPTIONS}
            value={mode}
            onChange={setMode}
            variant="bare"
            ariaLabel={`KR mode for ${kr.title}`}
          />
          {!subtitleServed && <span className="kr-subtitle-unserved">{subtitleSuffix}</span>}
          {subtitleServed && subtitleSuffix && <span className="kr-subtitle-served">{subtitleSuffix}</span>}
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

      {/* Column 4: status pill (far right) — bare Select; "not_set" shows the placeholder */}
      <div className="kr-status-cell">
        <Select
          options={CONFIDENCE_OPTIONS}
          value={kr.confidence === 'not_set' ? null : kr.confidence}
          onChange={setConfidence}
          variant="bare"
          placeholder="Set confidence"
          ariaLabel={`Confidence for ${kr.title}`}
        />
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
          <Select
            options={habits.map(h => ({ value: h.id, label: h.name }))}
            value={kr.habitId || null}
            onChange={linkHabit}
            placeholder="Link a habit"
            onClear={() => linkHabit(undefined)}
            clearLabel="No habit"
            actions={[{ icon: <Plus size={14} />, label: 'Create new habit…', onSelect: () => navigateToSection('habits') }]}
            ariaLabel="Linked habit"
          />
        </div>
      )}
    </div>
  );
}
