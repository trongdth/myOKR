import { useState, useRef, useEffect } from 'react';
import { Timer, ChevronDown } from 'lucide-react';
import { useClickOutside } from '../../hooks/useClickOutside';
import { useHoldRepeat } from '../../hooks/useHoldRepeat';

const clampEstimate = (v: number) => Math.min(20, Math.max(1, Math.round(v || 1)));

/**
 * Clickable pomodoro count that opens a small "Adjust Total Pomodoros"
 * popover (− / value / + hold-to-repeat buttons, Cancel / Confirm). Shared by
 * the Tasks board/list rows (`2/4` pill with ⏱ icon) and the Task-detail
 * pomodoro line (`2 / 4 planned` interactive pill with timer icon + chevron)
 * so the estimate is edited the same way everywhere. `onChange` fires on
 * Confirm with the new `estimatedPomodoros` (1–20).
 */
export default function PomoEstimatePopover({ completed, estimated, onChange, suffix, showIcon = true, showChevron = false, plain = false }: {
  completed: number;
  estimated: number;
  onChange: (n: number) => void;
  /** Appended after the count, e.g. "planned" → `2 / 4 planned` (task-detail
   *  readout; spaced slash). Absent → compact `2/4` (Tasks rows). */
  suffix?: string;
  /** Show the ⏱ icon before the count. */
  showIcon?: boolean;
  /** Show a trailing dropdown chevron to signal popover interactivity. */
  showChevron?: boolean;
  /** Task-detail readout variant. */
  plain?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tempValue, setTempValue] = useState(() => clampEstimate(estimated));
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open]);

  const holdDec = useHoldRepeat(
    () => setTempValue(p => Math.max(1, p - 1)),
    () => tempValue > 1,
  );
  const holdInc = useHoldRepeat(
    () => setTempValue(p => Math.min(20, p + 1)),
    () => tempValue < 20,
  );

  const handleOpen = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setTempValue(clampEstimate(estimated));
    setOpen(true);
  };

  const handleConfirm = () => {
    onChange(clampEstimate(tempValue));
    setOpen(false);
  };

  return (
    <div className="pomo-estimate-wrapper" ref={ref}>
      <div
        className={`task-pomodoros${plain ? ' plain' : ''}`}
        role="button"
        tabIndex={0}
        onClick={e => { e.stopPropagation(); handleOpen(); }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            handleOpen();
          }
        }}
        title="Click to set estimated pomodoros"
        style={{ cursor: 'pointer' }}
      >
        {showIcon && <span className="task-pomo-icon main-icon"><Timer size={14} /></span>}
        <span className="task-pomo-count">
          {completed}{suffix ? ' / ' : '/'}{estimated}{suffix ? ` ${suffix}` : ''}
        </span>
        {showChevron && <ChevronDown size={14} className="pomo-chevron" aria-hidden="true" />}
      </div>
      {open && (
        <div className="pomo-estimate-popover" onClick={e => e.stopPropagation()}>
          <div className="pomo-popover-title">Adjust Total Pomodoros</div>
          <div className="pomo-popover-counter">
            <button className="pomo-counter-btn" {...holdDec}>−</button>
            <span className="pomo-counter-value">{tempValue}</span>
            <button className="pomo-counter-btn" {...holdInc}>+</button>
          </div>
          <div className="pomo-popover-actions">
            <button className="pomo-popover-cancel" onClick={() => setOpen(false)}>Cancel</button>
            <button className="pomo-popover-confirm" onClick={handleConfirm}>Confirm</button>
          </div>
        </div>
      )}
    </div>
  );
}
