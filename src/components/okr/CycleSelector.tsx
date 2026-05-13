import { useState, useRef } from 'react';
import type { OKRCycle } from '../../lib/okr-storage';
import { useClickOutside } from '../../hooks/useClickOutside';

interface Props {
  cycles: OKRCycle[];
  activeCycleId: string;
  onSelect: (cycleId: string) => void;
  onCreateCycle: () => void;
}

export default function CycleSelector({ cycles, activeCycleId, onSelect, onCreateCycle }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, () => setOpen(false));

  const activeCycle = cycles.find(c => c.id === activeCycleId);

  return (
    <div className="cycle-selector" ref={ref}>
      <button
        className={`cycle-selector-btn${open ? ' open' : ''}`}
        onClick={() => setOpen(!open)}
      >
        <span>📅</span>
        <span>{activeCycle?.name || 'Select Cycle'}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 5l3 3 3-3" />
        </svg>
      </button>
      {open && (
        <div className="cycle-dropdown">
          {cycles.map(cycle => (
            <button
              key={cycle.id}
              className={`cycle-dropdown-item${cycle.id === activeCycleId ? ' active' : ''}`}
              onClick={() => { onSelect(cycle.id); setOpen(false); }}
            >
              <span>{cycle.name}</span>
              {cycle.isActive && <span className="cycle-badge">current</span>}
            </button>
          ))}
          <button className="cycle-create-btn" onClick={() => { onCreateCycle(); setOpen(false); }}>
            <span>+</span> New Cycle
          </button>
        </div>
      )}
    </div>
  );
}
