import { useState, useEffect, type ReactNode } from 'react';
import { navigateToSection } from '../../lib/navigation';
import { Select } from '../shared/Select';
import { getExclusiveCycleMondays } from '../../lib/cycle-windows';
import type { OKRCycle } from '../../lib/okr-storage';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function ProgressHeader({
  activeCycle,
  title,
  right,
}: {
  activeCycle?: OKRCycle | null;
  title?: string;
  right?: ReactNode;
}) {
  const cycleTitle = title ?? (activeCycle
    ? (activeCycle.name || `${MONTHS[activeCycle.month]} cycle`)
    : 'Progress');

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

export type ProgressTab = 'analytics' | 'objectives-progress' | 'weekly-review';

// "25–31 May" (same month) / "29 Sep–5 Oct" (spanning) — shared by the
// header's week h1 and the CycleWeekPicker's week rows.
export function formatWeekSpan(monday: string): string {
  const start = new Date(`${monday}T00:00:00Z`);
  const end = new Date(`${monday}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  const monthShort = (d: Date) => MONTHS[d.getUTCMonth()];
  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `${start.getUTCDate()}–${end.getUTCDate()} ${monthShort(end)}`;
  }
  return `${start.getUTCDate()} ${monthShort(start)}–${end.getUTCDate()} ${monthShort(end)}`;
}

// "Week of 25–31 May" (same month) / "Week of 29 Sep–5 Oct" (spanning).
export function formatWeekLabel(monday: string): string {
  return `Week of ${formatWeekSpan(monday)}`;
}

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
  // The Weekly review tab carries a "step N/3" badge mirroring the wizard
  // step in view (the wizard announces it via the myokr-review-step event).
  const [reviewStep, setReviewStep] = useState<number | null>(null);
  useEffect(() => {
    const handleStep = (e: Event) => {
      const step = (e as CustomEvent).detail?.step;
      if (typeof step === 'number') setReviewStep(step);
    };
    window.addEventListener('myokr-review-step', handleStep);
    return () => window.removeEventListener('myokr-review-step', handleStep);
  }, []);
  // Weeks follow the exclusive cycle-window rule (cycle-windows.ts), so the
  // option count always matches what Analytics renders per cycle. Today is
  // taken in UTC to match the windows' UTC-midnight arithmetic.
  const cycleMondays = activeCycle ? getExclusiveCycleMondays(activeCycle) : [];
  const totalWeeks = Math.max(cycleMondays.length, 1);
  const weeks = Array.from({ length: cycleMondays.length }, (_, i) => i + 1);
  const todayISO = new Date().toISOString().slice(0, 10);
  const currentWeek = Math.max(1,
    cycleMondays.findIndex(monday => {
      const end = new Date(`${monday}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 6);
      return monday <= todayISO && todayISO <= end.toISOString().slice(0, 10);
    }) + 1
  );
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
          <span>Focus analytics</span>
        </button>
        <button
          type="button"
          className={`plan-tab${active === 'objectives-progress' ? ' active' : ''}`}
          onClick={() => navigateToSection('objectives-progress')}
        >
          <span>Objectives</span>
        </button>
        <button
          type="button"
          className={`plan-tab${active === 'weekly-review' ? ' active' : ''}`}
          onClick={() => navigateToSection('weekly-review')}
        >
          <span>Weekly review</span>
          {active === 'weekly-review' && reviewStep !== null && (
            <span className="rw-tab-badge">step {reviewStep}/3</span>
          )}
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
