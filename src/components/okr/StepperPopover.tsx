import { useState, type ReactNode } from 'react';
import { useHoldRepeat } from '../../hooks/useHoldRepeat';

interface Props {
  title: string;
  value: number;
  min?: number;
  max?: number;
  onConfirm: (value: number) => void;
  onClose: () => void;
}

/**
 * The P7 value-adjust popover: hold-repeat −/+ stepper with explicit
 * Cancel/Confirm. The single adjust interaction for KR values everywhere —
 * the KR row's value badge, and the add-KR row / creation form's current and
 * target boxes. Only Confirm writes.
 */
export default function StepperPopover({ title, value, min = 0, max, onConfirm, onClose }: Props): ReactNode {
  const [temp, setTemp] = useState(value);
  const holdDec = useHoldRepeat(() => setTemp(p => Math.max(min, p - 1)), () => temp > min);
  const holdInc = useHoldRepeat(() => setTemp(p => p + 1), () => max === undefined || temp < max);

  return (
    <div className="kr-value-popover" onClick={e => e.stopPropagation()}>
      <div className="kr-popover-title">{title}</div>
      <div className="kr-popover-field">
        <div className="kr-popover-counter">
          <button className="kr-counter-btn" {...holdDec}>−</button>
          <span className="kr-counter-value">{temp}</span>
          <button className="kr-counter-btn" {...holdInc}>+</button>
        </div>
      </div>
      <div className="kr-popover-actions">
        <button className="kr-popover-cancel" onClick={onClose}>Cancel</button>
        <button className="kr-popover-confirm" onClick={() => onConfirm(temp)}>Confirm</button>
      </div>
    </div>
  );
}
