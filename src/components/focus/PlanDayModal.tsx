import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { RefreshCw, X, Info, GripVertical, Star, MoreVertical, ClipboardList } from 'lucide-react';
import {
  loadTasks,
  loadSettings,
  loadHistory,
  getLocalDateString,
  EISENHOWER_META,
  displayedPomoCount,
  type EisenhowerCategory,
  type PomodoroTask,
  type PomodoroSettings,
} from '../../lib/pomodoro-storage';
import {
  loadKeyResults,
  loadObjectives,
  getActiveCycle,
  type KeyResult,
  type Objective,
  type OKRCycle,
} from '../../lib/okr-storage';
import {
  rankTasks,
  splitByCapacity,
  getDailyPomodoroBudget,
  getMaxTaskBudgetShare,
  todaysSlice,
  type ScoredTask,
  type TodayPlan,
} from '../../lib/today-focus';
import { useModalEffects } from '../../hooks/useModalEffects';
import { useSession } from '../session/SessionProvider';
import { EmptyState } from '../shared/EmptyState';
import '../../styles/plan-day-modal.css';

/**
 * Plan-day modal — the preview-and-commit surface behind the Focus shell's
 * "Plan day" button (2026-08-16 grilling session). Opens with a FRESH
 * deterministic ranking of every unfinished task (the old silent replan's
 * recompute; tie-shuffling lives on the explicit Re-rank action so the
 * preview is stable); the saved TodayPlan is untouched until Accept, so X/Esc
 * is a true cancel.
 *
 * Semantics (decided in that session):
 * - Accept writes only TodayPlan: taskIds = the in-capacity order; skippedIds =
 *   the remaining ranked candidates, so buildTodayList's top-up can't silently
 *   re-add tasks the user saw in overflow and declined. Bucket fields are never
 *   touched (badges are display-only) — no CRDT writes, no mobile impact.
 * - Capacity bar = committed pomos (done today + in-list slices) over the daily
 *   budget; fill caps at 100% and turns --color-risk when over.
 * - Card ratios use the canonical position-not-completed derivation.
 * - Reorder is click-select (grip pick-up → row click places above → Esc
 *   cancels): HTML5 drag never fires in WKWebView scrollable regions.
 * - Re-rank silently recomputes and discards in-modal edits.
 */

interface PlanDayModalProps {
  onClose: () => void;
  /** Commit: the shell persists the plan and signals the Day plan body. */
  onAccept: (plan: TodayPlan) => void;
  onGoToTasks: () => void;
}

interface PlanDayData {
  tasks: PomodoroTask[];
  krs: KeyResult[];
  cycle: OKRCycle | null;
  settings: PomodoroSettings;
  completedToday: number;
}

/** Category meta with the storage-default fallback in one place. */
const eisenhowerMeta = (task: PomodoroTask) =>
  EISENHOWER_META[(task.category ?? 'decide') as EisenhowerCategory];

const RANKED_BY_NOTE =
  'Ranked by priority, then remaining effort vs cycle time, then key-result confidence. Override from the row menu.';

export default function PlanDayModal({ onClose, onAccept, onGoToTasks }: PlanDayModalProps) {
  const { activeFocusTaskId } = useSession();
  const [data, setData] = useState<PlanDayData | null>(null);
  const [candidates, setCandidates] = useState<ScoredTask[]>([]);
  const [inCapacity, setInCapacity] = useState<ScoredTask[]>([]);
  const [overflow, setOverflow] = useState<ScoredTask[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuTaskId, setMenuTaskId] = useState<string | null>(null);
  // "No changes" flash: the ranking is deterministic, so Re-rank on untied,
  // unedited data recomputes the identical list — say so instead of looking dead.
  const [noChangeFlash, setNoChangeFlash] = useState(false);
  const flashTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    [],
  );
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  // Kept in a ref so the load effect below runs exactly once — a plain dep on
  // the prop would re-run it whenever FocusApp re-renders (fresh closures),
  // silently reloading data and wiping in-modal edits mid-session.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const applyFreshRanking = useCallback((d: PlanDayData, opts: { shuffleTies?: boolean } = {}) => {
    // No exclusions: previously-skipped tasks reappear as candidates —
    // "Plan day" has always meant recompute from scratch. Opening is
    // deterministic (momentum/createdAt tie-breaks, like the dashboard's
    // initial fill); only the explicit Re-rank action reshuffles ties.
    const ranked = rankTasks(d.tasks, d.krs, d.cycle, d.settings, [], opts);
    const budget = getDailyPomodoroBudget(d.settings);
    const maxShare = getMaxTaskBudgetShare(budget);
    const split = splitByCapacity(ranked, budget, maxShare);
    setCandidates(ranked);
    setInCapacity(split.inCapacity);
    setOverflow(split.overflow);
    setSelectedId(null);
    setMenuTaskId(null);
    return split;
  }, []);

  // Snapshot on open (PrioritizeModal precedent — no live re-sync while open).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tasks, krs, objs, cyc, sett, history] = await Promise.all([
          loadTasks(),
          loadKeyResults(),
          loadObjectives(),
          getActiveCycle(),
          loadSettings(),
          loadHistory(),
        ]);
        if (cancelled) return;
        const activeObjIds = new Set(
          objs.filter((o: Objective) => !cyc || o.cycleId === cyc.id).map((o: Objective) => o.id),
        );
        const snapshot: PlanDayData = {
          tasks,
          krs: krs.filter((kr: KeyResult) => activeObjIds.has(kr.objectiveId)),
          cycle: cyc,
          settings: sett,
          completedToday:
            history.find(r => r.date === getLocalDateString())?.completedPomodoros ?? 0,
        };
        setData(snapshot);
        applyFreshRanking(snapshot);
      } catch (err) {
        console.error('Failed to load plan-day data:', err);
        if (!cancelled) onCloseRef.current();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyFreshRanking]);

  // Esc is layered: it cancels a pick / closes the row menu before it closes
  // the modal. Routed through useModalEffects' handler so there's one listener.
  useModalEffects(() => {
    if (selectedId) {
      setSelectedId(null);
      return;
    }
    if (menuTaskId) {
      setMenuTaskId(null);
      return;
    }
    onCloseRef.current();
  });

  // Fixed-position row menu (an absolutely-positioned one would be clipped by
  // the scrolling list). Anchored to the button's viewport rect on open.
  useEffect(() => {
    if (!menuTaskId) {
      setMenuPos(null);
      return;
    }
    const rect = menuBtnRef.current?.getBoundingClientRect();
    if (rect) setMenuPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
  }, [menuTaskId]);

  const krMap = useMemo(() => new Map((data?.krs ?? []).map(kr => [kr.id, kr])), [data]);

  const budget = data ? getDailyPomodoroBudget(data.settings) : 0;
  const maxShare = getMaxTaskBudgetShare(budget);
  const plannedPomos = inCapacity.reduce((sum, t) => sum + todaysSlice(t, maxShare), 0);
  const committed = (data?.completedToday ?? 0) + plannedPomos;
  const over = committed > budget;
  const fillPct = Math.min(100, Math.round((committed / Math.max(1, budget)) * 100));

  // Click-select reorder: grip click picks the row up; a click on another row
  // places the picked task directly above it (repo-wide click-select idiom).
  const handleGripClick = (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    setMenuTaskId(null);
    setSelectedId(prev => (prev === taskId ? null : taskId));
  };

  const handleCardClick = (taskId: string) => {
    if (!selectedId) return;
    if (selectedId === taskId) {
      setSelectedId(null);
      return;
    }
    setInCapacity(prev => {
      const moving = prev.find(t => t.id === selectedId);
      if (!moving) return prev;
      const without = prev.filter(t => t.id !== selectedId);
      const idx = without.findIndex(t => t.id === taskId);
      const next = without.slice();
      next.splice(idx === -1 ? next.length : idx, 0, moving);
      return next;
    });
    setSelectedId(null);
  };

  const handlePinToTop = (taskId: string) => {
    setInCapacity(prev => {
      const task = prev.find(t => t.id === taskId);
      return task ? [task, ...prev.filter(t => t.id !== taskId)] : prev;
    });
    setMenuTaskId(null);
  };

  const handleMoveToOverflow = (taskId: string) => {
    setOverflow(prev => {
      const task = inCapacity.find(t => t.id === taskId);
      return task ? [task, ...prev] : prev;
    });
    setInCapacity(prev => prev.filter(t => t.id !== taskId));
    setMenuTaskId(null);
  };

  const handleAddAnyway = (taskId: string) => {
    const task = overflow.find(t => t.id === taskId);
    if (!task) return;
    setOverflow(prev => prev.filter(t => t.id !== taskId));
    setInCapacity(prev => [...prev, task]);
  };

  const handleRerank = () => {
    if (!data) return;
    const split = applyFreshRanking(data, { shuffleTies: true });
    const idsOf = (ts: ScoredTask[]) => ts.map(t => t.id).join('\n');
    const unchanged =
      idsOf(split.inCapacity) === idsOf(inCapacity) &&
      idsOf(split.overflow) === idsOf(overflow);
    if (unchanged) {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
      setNoChangeFlash(true);
      flashTimer.current = window.setTimeout(() => {
        setNoChangeFlash(false);
        flashTimer.current = null;
      }, 1600);
    }
  };

  const handleAccept = () => {
    onAccept({
      date: getLocalDateString(),
      taskIds: inCapacity.map(t => t.id),
      // Non-choices are recorded as "skipped" so the plan's top-up can't
      // silently re-add a task the user declined in the overflow list.
      skippedIds: overflow.map(t => t.id),
    });
  };

  const subLine = (task: ScoredTask): string => {
    const kr = task.keyResultId ? krMap.get(task.keyResultId) : undefined;
    return `${kr ? kr.title : 'No key result'} · ${eisenhowerMeta(task).label}`;
  };

  if (!data) {
    return (
      <div className="planday-overlay">
        <div className="planday-modal">
          <div className="planday-loading">Loading your day…</div>
        </div>
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="planday-overlay" onClick={onClose}>
        <div className="planday-modal" onClick={e => e.stopPropagation()}>
          <div className="planday-empty">
            <EmptyState
              icon={<ClipboardList size={40} />}
              title="Nothing to plan"
              message="No unfinished tasks to rank. Add tasks with priorities to build today's plan."
              actions={[
                {
                  label: 'Go to Tasks',
                  primary: true,
                  onClick: () => {
                    onClose();
                    onGoToTasks();
                  },
                },
              ]}
            />
          </div>
        </div>
      </div>
    );
  }

  const taskCount = inCapacity.length;
  const acceptLabel = `Accept · ${taskCount} task${taskCount === 1 ? '' : 's'}, ${plannedPomos} pomodor${plannedPomos === 1 ? 'o' : 'os'}`;

  return (
    <div className="planday-overlay" onClick={onClose}>
      <div className="planday-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="planday-header">
          <div>
            <h2 className="planday-title">Plan your day</h2>
            <p className="planday-subtitle">
              Ranked from unfinished tasks across Today, This week and Backlog buckets.
            </p>
          </div>
          <div className="planday-header-actions">
            <button
              type="button"
              className={`planday-rerank-btn${noChangeFlash ? ' is-unchanged' : ''}`}
              onClick={handleRerank}
              title="Recompute the ranking — discards edits made in this modal"
            >
              <RefreshCw size={12} />
              <span>{noChangeFlash ? 'No changes' : 'Re-rank'}</span>
            </button>
            <button
              type="button"
              className="planday-close-btn"
              onClick={onClose}
              title="Close without saving"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Capacity bar */}
        <div className="planday-capacity">
          <span className="planday-capacity-label">Capacity</span>
          <div
            className="planday-capacity-track"
            role="progressbar"
            aria-label="Daily pomodoro capacity"
            aria-valuenow={fillPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={`${committed} of ${budget} pomodoros`}
          >
            <div
              className={`planday-capacity-fill${over ? ' is-over' : ''}`}
              style={{ width: `${fillPct}%` }}
            />
          </div>
          <span className="planday-capacity-count">
            <strong>{committed}</strong>/{budget}
          </span>
        </div>

        {/* Task list */}
        <div className="planday-scroll">
          <div className={`planday-list${selectedId ? ' is-picking' : ''}`}>
            {inCapacity.map((task, idx) => {
              const bucket = task.bucket ?? 'backlog';
              const isPinned = idx === 0;
              const isSelected = selectedId === task.id;
              return (
                <div
                  key={task.id}
                  className={`planday-card${isSelected ? ' is-picked' : ''}`}
                  style={{ '--planday-accent': eisenhowerMeta(task).color } as React.CSSProperties}
                  onClick={() => handleCardClick(task.id)}
                >
                  <span className="planday-idx">{idx + 1}</span>
                  <div className="planday-card-body">
                    <div className="planday-title-line">
                      <span className="planday-card-title" title={task.title}>
                        {task.title}
                      </span>
                      <span className="planday-badges">
                        {isPinned && (
                          <span className="planday-badge is-pinned">
                            <Star size={9} fill="currentColor" strokeWidth={0} />
                            PINNED
                          </span>
                        )}
                        {bucket === 'today' && <span className="planday-badge is-today">TODAY</span>}
                        {bucket === 'this_week' && <span className="planday-badge is-week">THIS WEEK</span>}
                        {bucket === 'backlog' && <span className="planday-badge is-backlog">FROM BACKLOG</span>}
                      </span>
                    </div>
                    <span className="planday-card-sub">{subLine(task)}</span>
                  </div>
                  <div className="planday-card-right">
                    <span className="planday-ratio">
                      {displayedPomoCount(
                        task.completedPomodoros,
                        task.estimatedPomodoros,
                        task.id === activeFocusTaskId,
                      )}
                      /{task.estimatedPomodoros || 1}
                    </span>
                    <div className="planday-menu-wrap">
                      <button
                        type="button"
                        ref={menuTaskId === task.id ? menuBtnRef : undefined}
                        className="planday-menu-btn"
                        title="Row actions"
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedId(null);
                          setMenuTaskId(prev => (prev === task.id ? null : task.id));
                        }}
                      >
                        <MoreVertical size={14} />
                      </button>
                    </div>
                    <button
                      type="button"
                      className={`planday-grip${isSelected ? ' is-active' : ''}`}
                      title={isSelected ? 'Placing — click a row to drop above it (Esc cancels)' : 'Reorder — click to pick up'}
                      onClick={e => handleGripClick(e, task.id)}
                    >
                      <GripVertical size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Capacity boundary + overflow */}
          {overflow.length > 0 && (
            <>
              <div className="planday-divider">
                <span className="planday-divider-label">
                  Capacity reached — {budget} pomodoro{budget === 1 ? '' : 's'}
                </span>
              </div>
              <div className="planday-overflow">
                {overflow.map(task => (
                  <div key={task.id} className="planday-overflow-card">
                    <div className="planday-overflow-body">
                      <span className="planday-overflow-title" title={task.title}>
                        {task.title}
                      </span>
                      <span className="planday-overflow-sub">{subLine(task)}</span>
                    </div>
                    <button
                      type="button"
                      className="planday-add-anyway"
                      onClick={() => handleAddAnyway(task.id)}
                    >
                      Add anyway
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="planday-footer">
          <div className="planday-note">
            <Info size={13} />
            <span>{RANKED_BY_NOTE}</span>
          </div>
          <div className="planday-actions">
            <button type="button" className="btn planday-accept-btn" onClick={handleAccept}>
              {acceptLabel}
            </button>
          </div>
        </div>

        {/* Row menu — fixed-position so the scrolling list can't clip it */}
        {menuTaskId && menuPos && (
          <>
            <div className="planday-menu-backdrop" onClick={() => setMenuTaskId(null)} />
            <div className="planday-menu" style={{ top: menuPos.top, right: menuPos.right }}>
              <button
                type="button"
                className="planday-menu-item"
                onClick={() => handlePinToTop(menuTaskId)}
              >
                Pin to top
              </button>
              <button
                type="button"
                className="planday-menu-item"
                onClick={() => handleMoveToOverflow(menuTaskId)}
              >
                Move to overflow
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
