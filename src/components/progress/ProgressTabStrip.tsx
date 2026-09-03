import type { ReactNode } from 'react';
import { navigateToSection } from '../../lib/navigation';
import { Select } from '../shared/Select';
import { getCycleWeeks } from '../pomodoro/PlanTabStrip';
import type { OKRCycle } from '../../lib/okr-storage';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function ProgressHeader({
  activeCycle,
  right,
}: {
  activeCycle?: OKRCycle | null;
  right?: ReactNode;
}) {
  const cycleTitle = activeCycle
    ? (activeCycle.name || `${MONTHS[activeCycle.month]} cycle`)
    : 'Progress';

  return (
    <div className="tasks-view-header progress-header">
      <div className="tasks-header-left">
        <h2 className="plan-header-eyebrow tasks-title">PROGRESS</h2>
        <div className="plan-header-title-row">
          <h1 className="plan-header-title">{cycleTitle}</h1>
        </div>
      </div>
      {right && <div className="tasks-header-right">{right}</div>}
    </div>
  );
}

export type ProgressTab = 'analytics' | 'weekly-review';

interface ProgressTabStripProps {
  active: ProgressTab;
  activeCycle?: OKRCycle | null;
  selectedWeek?: number | 'all' | null;
  onSelectWeek?: (week: number | 'all') => void;
}

export default function ProgressTabStrip({
  active,
  activeCycle,
  selectedWeek,
  onSelectWeek,
}: ProgressTabStripProps) {
  const { currentWeek, totalWeeks, weeks } = getCycleWeeks(activeCycle);
  const cycleName = activeCycle ? (activeCycle.name || `${MONTHS[activeCycle.month]} cycle`) : 'Cycle';

  const weekOptions: { value: string; label: string }[] = [
    { value: 'all', label: `${cycleName} · all weeks` },
    ...weeks.map(w => ({
      value: String(w),
      label: `${cycleName} · week ${w} of ${totalWeeks}`,
    })),
  ];

  const currentSelectValue = selectedWeek === 'all'
    ? 'all'
    : selectedWeek != null
      ? String(selectedWeek)
      : String(currentWeek);

  return (
    <div className="plan-tab-strip progress-tab-strip">
      <div className="plan-tabs">
        <button
          type="button"
          className={`plan-tab${active === 'analytics' ? ' active' : ''}`}
          onClick={() => navigateToSection('analytics')}
        >
          <span>Analytics</span>
        </button>
        <button
          type="button"
          className={`plan-tab${active === 'weekly-review' ? ' active' : ''}`}
          onClick={() => navigateToSection('weekly-review')}
        >
          <span>Weekly review</span>
        </button>
      </div>

      <div className="plan-tab-strip-right">
        {onSelectWeek && activeCycle && (
          <div className="progress-week-select">
            <Select
              options={weekOptions}
              value={currentSelectValue}
              onChange={(val) => onSelectWeek(val === 'all' ? 'all' : Number(val))}
              ariaLabel="Filter by week"
            />
          </div>
        )}
      </div>
    </div>
  );
}
