import { useState, useRef, type ReactNode } from 'react';
import {
  DEFAULT_KR_TARGET,
  type CompletionMode,
} from '../../lib/okr-storage';
import { useClickOutside } from '../../hooks/useClickOutside';
import StepperPopover from './StepperPopover';
import { Select } from '../shared/Select';
import { KR_MODE_OPTIONS } from './okrSelectOptions';

/**
 * Shared draft state for "a KR being created" — used by both the P7 creation
 * form (NewObjectiveForm) and the expandable add-KR row (ObjectiveCard), so
 * the mode/target/current rules live in exactly one place.
 */
export function useKrDraft(initialMode: CompletionMode = 'manual') {
  const [mode, setDraftMode] = useState<CompletionMode>(initialMode);
  const [current, setCurrent] = useState(0);
  const [target, setTargetState] = useState(DEFAULT_KR_TARGET[initialMode]);

  // A target below the current would render "80 / 50" mid-edit — clamp the
  // current along (normalizeKrDraft only fixes things at save time, PR #76).
  const setTarget = (v: number) => {
    const t = Math.max(1, v);
    setTargetState(t);
    setCurrent(c => Math.min(c, t));
  };

  // Picking a type swaps in that mode's default target; derived modes lock the
  // current value back to 0 (only Manual is hand-updatable).
  const changeMode = (m: CompletionMode) => {
    setDraftMode(m);
    setTargetState(DEFAULT_KR_TARGET[m]);
    if (m !== 'manual') setCurrent(0);
  };

  // After a successful Add — cleared current, the mode's default target, same mode.
  const reset = () => {
    setCurrent(0);
    setTarget(DEFAULT_KR_TARGET[mode]);
  };

  return { mode, current, target, setCurrent, setTarget, changeMode, reset };
}

export type KrDraftState = ReturnType<typeof useKrDraft>;

/** Clamp the draft into the values the KeyResult type accepts. */
export function normalizeKrDraft(d: KrDraftState): { targetValue: number; currentValue: number } {
  const target = Math.max(1, Math.round(d.target) || DEFAULT_KR_TARGET[d.mode]);
  return {
    targetValue: target,
    currentValue: d.mode === 'manual' ? Math.max(0, Math.min(target, Math.round(d.current) || 0)) : 0,
  };
}

/**
 * Type dropdown + the `current / target` value boxes. Pressing a box opens the
 * same StepperPopover the KR row's value badge uses (P7 feedback — one adjust
 * interaction everywhere); the current box locks for derived modes.
 */
export function KrDraftControls({ draft }: { draft: KrDraftState }): ReactNode {
  const [openPart, setOpenPart] = useState<'current' | 'target' | null>(null);
  const groupRef = useRef<HTMLSpanElement>(null);
  useClickOutside(groupRef, openPart !== null, () => setOpenPart(null));
  const manual = draft.mode === 'manual';

  return (
    <>
      <span className="kr-mode-select">
        <Select
          options={KR_MODE_OPTIONS}
          value={draft.mode}
          onChange={draft.changeMode}
          ariaLabel="Key result type"
        />
      </span>
      <span className="kr-num-group" ref={groupRef}>
        <span className="kr-draft-value-wrap">
          <button
            type="button"
            className={`kr-value-badge${manual ? '' : ' locked'}`}
            aria-label="Adjust current value"
            onClick={e => { e.stopPropagation(); if (manual) setOpenPart(openPart === 'current' ? null : 'current'); }}
          >
            {draft.current}
          </button>
          {openPart === 'current' && manual && (
            <StepperPopover
              title="Adjust Current"
              value={draft.current}
              min={0}
              max={draft.target}
              onConfirm={v => { draft.setCurrent(v); setOpenPart(null); }}
              onClose={() => setOpenPart(null)}
            />
          )}
        </span>
        <span className="kr-num-sep">/</span>
        <span className="kr-draft-value-wrap">
          <button
            type="button"
            className="kr-value-badge"
            aria-label="Adjust target value"
            onClick={e => { e.stopPropagation(); setOpenPart(openPart === 'target' ? null : 'target'); }}
          >
            {draft.target}
          </button>
          {openPart === 'target' && (
            <StepperPopover
              title="Adjust Target"
              value={draft.target}
              min={1}
              onConfirm={v => { draft.setTarget(v); setOpenPart(null); }}
              onClose={() => setOpenPart(null)}
            />
          )}
        </span>
      </span>
    </>
  );
}
