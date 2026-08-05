import { useState, useRef } from 'react';
import { Timer } from 'lucide-react';
import { useClickOutside } from '../../hooks/useClickOutside';
import { useHoldRepeat } from '../../hooks/useHoldRepeat';

/**
 * Clickable `{completed}/{estimated}` pomodoro count that opens a small
 * "Adjust Total Pomodoros" popover (− / value / + hold-to-repeat buttons,
 * Cancel / Confirm). Shared by the Tasks board/list rows and the Task-detail
 * weekly line so the estimate is edited the same way everywhere. `onChange`
 * fires on Confirm with the new `estimatedPomodoros` (1–20).
 */
export default function PomoEstimatePopover({ completed, estimated, onChange }: {
  completed: number;
  estimated: number;
  onChange: (n: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tempValue, setTempValue] = useState(estimated);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, () => setOpen(false));

  const holdDec = useHoldRepeat(
    () => setTempValue(p => Math.max(1, p - 1)),
    () => tempValue > 1,
  );
  const holdInc = useHoldRepeat(
    () => setTempValue(p => Math.min(20, p + 1)),
    () => tempValue < 20,
  );

  const handleOpen = () => {
    setTempValue(estimated);
    setOpen(true);
  };

  const handleConfirm = () => {
    onChange(tempValue);
    setOpen(false);
  };

  return (
    <div className="pomo-estimate-wrapper" ref={ref}>
      <div
        className="task-pomodoros"
        onClick={e => { e.stopPropagation(); handleOpen(); }}
        title="Click to set estimated pomodoros"
        style={{ cursor: 'pointer' }}
      >
        <span className="task-pomo-icon main-icon"><Timer size={14} /></span>
        <span className="task-pomo-count">{completed}/{estimated}</span>
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
