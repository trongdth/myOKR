import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function navigateToSection(section: string) {
  window.dispatchEvent(new CustomEvent('myokr-navigate-to-section', { detail: section }));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Plan-group screen header (P1/P5/P7): Eyebrow "PLAN" above the cycle name title
 * on the left, controls on the right (matching redesign 08.53.52.png).
 */
export function PlanHeader({
  activeCycle,
  right,
}: {
  activeCycle?: { name?: string; month: number; year: number } | null;
  right?: ReactNode;
}) {
  const cycleTitle = activeCycle
    ? (activeCycle.name || `${MONTHS[activeCycle.month]} cycle`)
    : 'PLAN';

  return (
    <div className="tasks-view-header">
      <div className="tasks-header-left">
        <h2 className="plan-header-eyebrow tasks-title">PLAN</h2>
        <h1 className="plan-header-title">{cycleTitle}</h1>
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
        <div className="plan-cycle-week-dropdown-wrapper">
          <ChevronDown size={14} className="dropdown-chevron" />
          <select
            className="plan-cycle-week-select"
            value={selectedWeek === 'all' ? 'all' : (selectedWeek ?? currentWeek)}
            onChange={e => {
              const val = e.target.value;
              onSelectWeek(val === 'all' ? 'all' : Number(val));
            }}
          >
            <option value="all">{cycleName} · All weeks</option>
            {weeks.map(w => (
              <option key={w} value={w}>
                {cycleName} · week {w} of {totalWeeks}
              </option>
            ))}
          </select>
        </div>
      ) : (cycleLabel || activeCycle) ? (
        <span className="plan-cycle-week">{cycleLabel || (activeCycle ? `${cycleName} · week ${currentWeek} of ${totalWeeks}` : '')}</span>
      ) : null}
    </div>
  );
}
