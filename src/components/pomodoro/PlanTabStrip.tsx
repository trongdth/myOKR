import type { ReactNode } from 'react';
import { navigateToSection } from '../../lib/navigation';
import { Select } from '../shared/Select';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "{Mon} cycle" — the Objectives screen's title (the cycle entity lives in the selector chip). */
export function cycleTitleLabel(cycle: { month: number }): string {
  return `${MONTHS[cycle.month]} cycle`;
}

/**
 * Plan-group screen header (P1/P5/P7): Eyebrow "PLAN" above the cycle name title
 * on the left, controls on the right (matching redesign 08.53.52.png).
 * `title` overrides the cycle-name title and `afterTitle` renders inline after it
 * (the Objectives screen puts its cycle selector there, P7 revamp).
 */
export function PlanHeader({
  activeCycle,
  title,
  afterTitle,
  right,
}: {
  activeCycle?: { name?: string; month: number; year: number } | null;
  title?: string;
  afterTitle?: ReactNode;
  right?: ReactNode;
}) {
  const cycleTitle = activeCycle
    ? (activeCycle.name || `${MONTHS[activeCycle.month]} cycle`)
    : 'PLAN';

  return (
    <div className="tasks-view-header">
      <div className="tasks-header-left">
        <h2 className="plan-header-eyebrow tasks-title">PLAN</h2>
        <div className="plan-header-title-row">
          <h1 className="plan-header-title">{title ?? cycleTitle}</h1>
          {afterTitle}
        </div>
      </div>
      {right && <div className="tasks-header-right">{right}</div>}
    </div>
  );
}

export function getCycleWeeks(activeCycle: { month: number; year: number } | null | undefined) {
  if (!activeCycle) return { currentWeek: 1, totalWeeks: 4, weeks: [1, 2, 3, 4] };
  const now = new Date();
  const sameMonth = now.getFullYear() === activeCycle.year && now.getMonth() === activeCycle.month;
  const currentWeek = sameMonth ? Math.ceil(now.getDate() / 7) : 1;
  const daysInMonth = new Date(activeCycle.year, activeCycle.month + 1, 0).getDate();
  const totalWeeks = Math.ceil(daysInMonth / 7);
  const weeks = Array.from({ length: totalWeeks }, (_, i) => i + 1);
  return { currentWeek, totalWeeks, weeks };
}

export function cycleWeekLabel(activeCycle: { name: string; month: number; year: number } | null | undefined): string | null {
  if (!activeCycle) return null;
  const now = new Date();
  const sameMonth = now.getFullYear() === activeCycle.year && now.getMonth() === activeCycle.month;
  if (!sameMonth) return activeCycle.name;
  const week = Math.ceil(now.getDate() / 7);
  const weeksInMonth = Math.ceil(new Date(activeCycle.year, activeCycle.month + 1, 0).getDate() / 7);
  return `${activeCycle.name} · week ${week} of ${weeksInMonth}`;
}

interface Props {
  active: 'tasks' | 'objectives' | 'done';
  tasksCount: number;
  objectivesCount: number;
  doneCount: number;
  cycleLabel?: string | null;
  activeCycle?: { name?: string; month: number; year: number } | null;
  selectedWeek?: number | 'all' | null;
  onSelectWeek?: (week: number | 'all') => void;
}

export default function PlanTabStrip({
  active,
  tasksCount,
  objectivesCount,
  doneCount,
  cycleLabel,
  activeCycle,
  selectedWeek,
  onSelectWeek,
}: Props) {
  const { currentWeek, totalWeeks, weeks } = getCycleWeeks(activeCycle);
  const cycleName = activeCycle ? (activeCycle.name || `${MONTHS[activeCycle.month]} cycle`) : '';

  return (
    <div className="plan-tab-strip">
      <div className="plan-tabs">
        <button
          className={`plan-tab${active === 'tasks' ? ' active' : ''}`}
          onClick={() => navigateToSection('tasks')}
        >
          <span>Tasks</span>
          <span className="plan-tab-count">{tasksCount}</span>
        </button>
        <button
          className={`plan-tab${active === 'objectives' ? ' active' : ''}`}
          onClick={() => navigateToSection('objectives')}
        >
          <span>Objectives</span>
          <span className="plan-tab-count">{objectivesCount}</span>
        </button>
        <button
          className={`plan-tab${active === 'done' ? ' active' : ''}`}
          onClick={() => navigateToSection('done')}
        >
          <span>Done</span>
          <span className="plan-tab-count">{doneCount}</span>
        </button>
      </div>

      {activeCycle && onSelectWeek ? (
        <Select
          options={[
            { value: 'all' as const, label: `${cycleName} · All weeks` },
            ...weeks.map(w => ({ value: w as number | 'all', label: `${cycleName} · week ${w} of ${totalWeeks}` })),
          ]}
          value={selectedWeek === 'all' ? 'all' : (selectedWeek ?? currentWeek)}
          onChange={(week) => onSelectWeek(week === 'all' ? 'all' : Number(week))}
          ariaLabel="Cycle week"
        />
      ) : (cycleLabel || activeCycle) ? (
        <span className="plan-cycle-week">{cycleLabel || (activeCycle ? `${cycleName} · week ${currentWeek} of ${totalWeeks}` : '')}</span>
      ) : null}
    </div>
  );
}
