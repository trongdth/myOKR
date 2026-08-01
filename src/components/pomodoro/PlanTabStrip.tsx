// Plan-group tab strip with counts (P1/P5/P7): Tasks / Objectives / Done +
// the cycle-week line. Present on every Plan-group screen. The sidebar itself
// is frozen (design-system.md fidelity policy); this strip is the content-area
// counterpart that carries the counts.
import type { ReactNode } from 'react';

export function navigateToSection(section: string) {
  window.dispatchEvent(new CustomEvent('myokr-navigate-to-section', { detail: section }));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Plan-group screen header (P1/P5/P7): "PLAN" + `<Month> cycle` pill on the
 * left, the screen's controls (Board/List switch, New task, Search ⌘K) on the
 * right — per-view composition is the caller's job.
 */
export function PlanHeader({
  activeCycle,
  right,
}: {
  activeCycle: { month: number; year: number } | null | undefined;
  right?: ReactNode;
}) {
  return (
    <div className="tasks-view-header">
      <div className="tasks-header-left">
        <h2 className="tasks-title">PLAN</h2>
        {activeCycle && <span className="cycle-pill">{MONTHS[activeCycle.month]} cycle</span>}
      </div>
      {right && <div className="tasks-header-right">{right}</div>}
    </div>
  );
}

/**
 * Cycle label for the strip's right side: "May 2026 · week 4 of 5" when today
 * is inside the cycle, the bare cycle name otherwise. Computed at call time —
 * never memoized — so a changed clock/date can't leave a stale label behind.
 */
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
  cycleLabel: string | null;
}

export default function PlanTabStrip({ active, tasksCount, objectivesCount, doneCount, cycleLabel }: Props) {
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
      {cycleLabel && <span className="plan-cycle-week">{cycleLabel}</span>}
    </div>
  );
}
