import { Plus } from 'lucide-react';
import type { OKRCycle } from '../../lib/okr-storage';
import { Select } from '../shared/Select';

interface Props {
  cycles: OKRCycle[];
  activeCycleId: string;
  onSelect: (cycleId: string) => void;
  onCreateCycle: () => void;
  // Omit to hide the clone button (e.g. when there is no source cycle with objectives).
  onCloneCycle?: () => void;
  // Ids that are eligible for deletion (future + empty). Determines × visibility.
  deletableCycleIds?: Set<string>;
  onDeleteCycle?: (id: string) => void;
}

/**
 * Cycle switcher on the Objectives header — the shared Select wearing this
 * screen's shape (custom-select ticket 04): the chosen row's tick replaces the
 * old "current" badge, deletable rows get the hover ×, and New/Clone run as
 * footer actions below the divider.
 */
export default function CycleSelector({ cycles, activeCycleId, onSelect, onCreateCycle, onCloneCycle, deletableCycleIds, onDeleteCycle }: Props) {
  const canRemove = Boolean(deletableCycleIds && onDeleteCycle);

  return (
    <span className="cycle-selector">
      <Select
        options={cycles.map(c => ({
          value: c.id,
          label: c.name,
          removable: canRemove ? deletableCycleIds!.has(c.id) : false,
        }))}
        value={cycles.some(c => c.id === activeCycleId) ? activeCycleId : null}
        onChange={onSelect}
        placeholder="Select cycle"
        onRemove={canRemove ? (id) => onDeleteCycle!(id) : undefined}
        actions={[
          { icon: <Plus size={14} />, label: 'New blank cycle', onSelect: onCreateCycle },
          ...(onCloneCycle ? [{ icon: <Plus size={14} />, label: 'Clone this cycle', onSelect: onCloneCycle }] : []),
        ]}
        ariaLabel="Cycle"
      />
    </span>
  );
}
