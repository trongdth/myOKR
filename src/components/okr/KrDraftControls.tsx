import { useState, type ReactNode } from 'react';
import {
  COMPLETION_MODE_META,
  DEFAULT_KR_TARGET,
  type CompletionMode,
} from '../../lib/okr-storage';
import { useHoldRepeat } from '../../hooks/useHoldRepeat';

/**
 * Shared draft state for "a KR being created" — used by both the P7 creation
 * form (NewObjectiveForm) and the expandable add-KR row (ObjectiveCard), so
 * the mode/target/current rules live in exactly one place.
 */
export function useKrDraft(initialMode: CompletionMode = 'manual') {
  const [mode, setDraftMode] = useState<CompletionMode>(initialMode);
  const [current, setCurrent] = useState(0);
  const [target, setTarget] = useState(DEFAULT_KR_TARGET[initialMode]);

  // Picking a type swaps in that mode's default target; derived modes lock the
  // current value back to 0 (only Manual is hand-updatable).
  const changeMode = (m: CompletionMode) => {
    setDraftMode(m);
    setTarget(DEFAULT_KR_TARGET[m]);
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
 * Type dropdown + the `− current / − target +` stepper pair — the same stepper
 * interaction as the KR row's value popover (hold to repeat), compact-sized
 * for the inline rows.
 */
export function KrDraftControls({ draft }: { draft: KrDraftState }): ReactNode {
  const manual = draft.mode === 'manual';
  const holdCurrentDec = useHoldRepeat(() => draft.setCurrent(p => Math.max(0, p - 1)), () => draft.current > 0);
  const holdCurrentInc = useHoldRepeat(() => draft.setCurrent(p => p + 1), () => manual);
  const holdTargetDec = useHoldRepeat(() => draft.setTarget(p => Math.max(1, p - 1)), () => draft.target > 1);
  const holdTargetInc = useHoldRepeat(() => draft.setTarget(p => p + 1), () => true);

  return (
    <>
      <select
        className="kr-mode-select"
        value={draft.mode}
        onChange={e => draft.changeMode(e.target.value as CompletionMode)}
        aria-label="Key result type"
      >
        {Object.entries(COMPLETION_MODE_META).map(([mode, meta]) => (
          <option key={mode} value={mode}>{meta.label}</option>
        ))}
      </select>
      <span className="kr-num-group">
        <span className={`kr-stepper${manual ? '' : ' disabled'}`} data-part="current">
          <button type="button" className="kr-counter-btn" aria-label="Decrease current value" {...holdCurrentDec}>−</button>
          <span className="kr-counter-value">{draft.current}</span>
          <button type="button" className="kr-counter-btn" aria-label="Increase current value" {...holdCurrentInc}>+</button>
        </span>
        <span className="kr-num-sep">/</span>
        <span className="kr-stepper" data-part="target">
          <button type="button" className="kr-counter-btn" aria-label="Decrease target value" {...holdTargetDec}>−</button>
          <span className="kr-counter-value">{draft.target}</span>
          <button type="button" className="kr-counter-btn" aria-label="Increase target value" {...holdTargetInc}>+</button>
        </span>
      </span>
    </>
  );
}
