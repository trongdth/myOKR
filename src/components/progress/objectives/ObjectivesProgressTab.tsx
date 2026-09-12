import { useEffect, useMemo, useState } from 'react';
import { Target } from 'lucide-react';
import {
  loadKeyResults, loadObjectives, loadReviews,
  type KeyResult, type OKRCycle, type Objective, type WeeklyReview,
} from '../../../lib/okr-storage';
import { loadHabits, type Habit } from '../../../lib/habit-storage';
import type { DailyRecord, PomodoroTask } from '../../../lib/pomodoro-storage';
import {
  buildEntitySeries, computeWhyRows, countUnlinkedSessionsLastWeek,
  getCycleElapsedPercent, getCycleSpan, getPaceStatus, getProjectedLanding,
  isCycleClosed, krValueAsOf, pctOfTarget, pickWorst,
  type CycleSpan, type PaceDataContext, type RankedEntity,
} from '../../../lib/pace';
import ObjectiveList, { type KrVM, type ObjectiveVM, type Selection } from './ObjectiveList';
import TrajectoryCard from './TrajectoryCard';
import WhyCard from './WhyCard';
import RollupCard from './RollupCard';
import { EmptyState } from '../../shared/EmptyState';
import { navigateToSection } from '../../../lib/navigation';
import '../../../styles/objectives-progress.css';

/**
 * The Objectives tab (R3): pace-marked objectives list + selection-driven
 * analytics column. Every status/pace figure here is derived at render time
 * (ADR-0020) — nothing is persisted. Scoped by a cycle-only picker
 * (ProgressApp owns the selected cycle); past cycles render identically with
 * the marker at 100% and no projection, an empty cycle lists objectives at
 * 0% with the marker in place.
 */
interface ObjectivesProgressTabProps {
  cycle: OKRCycle | null;
  tasks: PomodoroTask[];
  history: DailyRecord[];
  focusDurationMinutes: number;
}

/** Rank entities by projected landing and pick the worst — the one shape
 *  behind both the default selection (KRs) and the diagnostic callout
 *  (objectives). */
function worstOf(
  kind: 'kr' | 'objective',
  entries: { id: string; objectiveId: string; pct: number }[],
  markerPct: number,
  closed: boolean,
): RankedEntity | null {
  return pickWorst(entries.map(e => ({
    kind,
    id: e.id,
    objectiveId: e.objectiveId,
    progressPct: e.pct,
    landing: getProjectedLanding(e.pct, markerPct, closed),
  })));
}

export default function ObjectivesProgressTab({ cycle, tasks, history, focusDurationMinutes }: ObjectivesProgressTabProps) {
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [keyResults, setKeyResults] = useState<KeyResult[]>([]);
  const [reviews, setReviews] = useState<WeeklyReview[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      Promise.all([loadObjectives(), loadKeyResults(), loadReviews(), loadHabits()])
        .then(([objs, krs, revs, habs]) => {
          if (!cancelled) {
            setObjectives(objs);
            setKeyResults(krs);
            setReviews(revs);
            setHabits(habs);
          }
        })
        .catch(() => { /* non-fatal: tab renders empty */ });
    };
    load();
    window.addEventListener('myokr-data-synced', load);
    return () => {
      cancelled = true;
      window.removeEventListener('myokr-data-synced', load);
    };
  }, []);

  const todayISO = new Date().toISOString().slice(0, 10);

  const ctx: PaceDataContext = useMemo(() => ({
    tasks, history, habits, reviews, focusDurationMinutes,
  }), [tasks, history, habits, reviews, focusDurationMinutes]);

  const span: CycleSpan | null = useMemo(() => (cycle ? getCycleSpan(cycle) : null), [cycle]);
  const markerPct = span ? getCycleElapsedPercent(span, todayISO) : 0;
  const closed = span ? isCycleClosed(span, todayISO) : false;

  const cycleObjectives = useMemo(
    () => objectives.filter(o => cycle && o.cycleId === cycle.id).sort((a, b) => a.order - b.order),
    [objectives, cycle],
  );
  const cycleKrs = useMemo(() => {
    const ids = new Set(cycleObjectives.map(o => o.id));
    return keyResults.filter(kr => ids.has(kr.objectiveId));
  }, [keyResults, cycleObjectives]);

  // Picking a different cycle resets the view; the default-selection effect
  // below re-seeds it (worst-off key result).
  useEffect(() => {
    setSelected(null);
    setExpandedId(null);
  }, [cycle?.id]);

  // View models: current percents + derived pace status per KR and objective.
  const { objectiveVMs, krPctById, rollupPct, krCount } = useMemo(() => {
    const krPctById = new Map<string, number>();
    const krsByObjective = new Map<string, KrVM[]>();
    for (const o of cycleObjectives) {
      const krs = cycleKrs.filter(kr => kr.objectiveId === o.id);
      krsByObjective.set(o.id, krs.map(kr => {
        const effective = krValueAsOf(kr, cycle!, ctx, todayISO);
        const pct = Math.round(pctOfTarget(effective, kr.targetValue));
        krPctById.set(kr.id, pct);
        return {
          id: kr.id,
          objectiveId: o.id,
          title: kr.title,
          value: effective,
          target: kr.targetValue,
          pct,
          fill: pct === 0 ? 'zero' : getPaceStatus(pct, markerPct),
        };
      }));
    }
    const objectiveVMs: ObjectiveVM[] = cycleObjectives.map(o => {
      const krs = krsByObjective.get(o.id) ?? [];
      const pct = krs.length > 0 ? Math.round(krs.reduce((sum, kr) => sum + kr.pct, 0) / krs.length) : 0;
      return {
        id: o.id,
        title: o.title,
        krCount: krs.length,
        pct,
        status: getPaceStatus(pct, markerPct),
        zero: pct === 0,
        krs,
      };
    });
    const rollupPct = objectiveVMs.length > 0
      ? Math.round(objectiveVMs.reduce((sum, o) => sum + o.pct, 0) / objectiveVMs.length)
      : 0;
    const krCount = cycleKrs.length;
    return { objectiveVMs, krPctById, rollupPct, krCount };
  }, [cycleObjectives, cycleKrs, cycle, ctx, todayISO, markerPct]);

  // Default selection on load: the worst-off key result (lowest projected
  // landing), with its objective expanded so the selection is visible.
  useEffect(() => {
    if (selected !== null || !span || objectiveVMs.length === 0) return;
    const worst = worstOf('kr', cycleKrs.map(kr => ({
      id: kr.id,
      objectiveId: kr.objectiveId,
      pct: krPctById.get(kr.id) ?? 0,
    })), markerPct, closed);
    const fallback = cycleKrs[0];
    const chosen = worst ?? (fallback ? { id: fallback.id, objectiveId: fallback.objectiveId } : null);
    if (chosen) {
      setSelected({ kind: 'kr', id: chosen.id });
      setExpandedId(chosen.objectiveId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, objectiveVMs, span]);

  // Resolve the selection against current data (ids can vanish mid-session).
  const selKr = selected?.kind === 'kr' ? cycleKrs.find(kr => kr.id === selected.id) ?? null : null;
  const selObjective = selected?.kind === 'objective'
    ? cycleObjectives.find(o => o.id === selected.id) ?? null
    : selKr
      ? cycleObjectives.find(o => o.id === selKr.objectiveId) ?? null
      : null;

  const seriesEntity = selKr
    ? { kind: 'kr' as const, kr: selKr }
    : selObjective
      ? { kind: 'objective' as const, krs: cycleKrs.filter(kr => kr.objectiveId === selObjective.id) }
      : null;
  const series = span && cycle && seriesEntity
    ? buildEntitySeries(seriesEntity, cycle, span, ctx, todayISO)
    : null;

  const selStatus = selKr
    ? getPaceStatus(krPctById.get(selKr.id) ?? 0, markerPct)
    : selObjective
      ? objectiveVMs.find(o => o.id === selObjective.id)?.status ?? null
      : null;

  // Why-it-is-behind renders only while the selection is behind/at risk and
  // the cycle is still open — on pace collapses the right column (Q7), and a
  // closed cycle has nothing left to act on.
  const whyRows = span && cycle && seriesEntity && selStatus !== 'on_pace' && !closed
    ? computeWhyRows(seriesEntity, cycle, span, ctx, todayISO, closed)
    : null;
  const unlinkedNote = span ? countUnlinkedSessionsLastWeek(span, ctx, todayISO) : null;

  // Trajectory heading copy.
  const trajectoryTitle = selKr ? selKr.title : selObjective?.title ?? '';
  const trajectorySub = selKr
    ? `Selected key result · ${selObjective?.title ?? ''}`
    : selObjective
      ? `Rolled-up objective · ${selObjective.title}`
      : '';

  // The single diagnostic callout names the worst objective (lowest projected
  // landing); hidden when every objective is On pace or nothing has elapsed.
  const callout = useMemo(() => {
    if (!span || objectiveVMs.length === 0) return null;
    const worst = worstOf('objective', objectiveVMs.map(o => ({
      id: o.id,
      objectiveId: o.id,
      pct: o.pct,
    })), markerPct, closed);
    if (!worst) return null;
    const vm = objectiveVMs.find(o => o.id === worst.id);
    if (!vm || vm.status === 'on_pace') return null;
    return { title: vm.title, movedPct: vm.pct, landing: worst.landing };
  }, [span, objectiveVMs, markerPct, closed]);

  const handleObjectiveActivate = (id: string) => {
    setSelected({ kind: 'objective', id });
    setExpandedId(prev => (prev === id ? null : id));
  };
  const handleObjectiveArrow = (id: string, expand: boolean) => {
    setExpandedId(prev => (expand ? id : prev === id ? null : prev));
  };
  const handleKrActivate = (objectiveId: string, krId: string) => {
    setExpandedId(objectiveId);
    setSelected({ kind: 'kr', id: krId });
  };

  if (!cycle || cycleObjectives.length === 0) {
    return (
      <div className="obj-board obj-empty">
        <EmptyState
          icon={<Target size={28} />}
          title="No objectives in this cycle"
          message="Objectives and their key results are managed in the Plan group — create them there and they show up here with pace markers."
          actions={[{ label: 'Open Objectives', onClick: () => navigateToSection('objectives'), primary: true }]}
        />
      </div>
    );
  }

  return (
    <div className="obj-board">
      <section className="obj-left">
        <ObjectiveList
          objectives={objectiveVMs}
          marker={markerPct}
          expandedId={expandedId}
          selected={selected}
          onObjectiveActivate={handleObjectiveActivate}
          onObjectiveArrow={handleObjectiveArrow}
          onKrActivate={handleKrActivate}
        />
        {callout && (
          <div className="obj-callout" role="status">
            <span className="obj-callout-dot" />
            <span className="obj-callout-text">
              {`${callout.title} has moved ${callout.movedPct}% in ${markerPct}% of the cycle. At this rate it lands at ${callout.landing}%.`}
            </span>
          </div>
        )}
      </section>
      <aside className="obj-right">
        {series && span && (
          <TrajectoryCard
            title={trajectoryTitle}
            subtitle={trajectorySub}
            series={series}
            span={span}
            marker={markerPct}
            cycleClosed={closed}
          />
        )}
        {whyRows && (
          <WhyCard
            rows={whyRows}
            note={unlinkedNote
              ? `${unlinkedNote} of last week's sessions were unlinked. Linking them would close most of this gap.`
              : null}
          />
        )}
        <RollupCard pct={rollupPct} objectiveCount={objectiveVMs.length} krCount={krCount} marker={markerPct} />
      </aside>
    </div>
  );
}
