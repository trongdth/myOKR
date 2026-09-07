import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { getExclusiveCycleMondays } from '../../lib/cycle-windows';
import { findReviewForWeek, isDraftReview, type OKRCycle, type WeeklyReview } from '../../lib/okr-storage';
import { formatWeekSpan } from './ProgressTabStrip';

// The Weekly review tab's two-level selector (second grilling round,
// .scratch/review-cycle-picker/spec.md): cycle first (newest first,
// completed-review count as meta), then weeks by date span. Commit happens
// on week rows only — cycle rows just steer the weeks section. Unfinished
// weeks (Sunday not passed) are listed but disabled: only finished weeks
// are reviewable. Built on the Select's C1 anatomy (ADR-0018 addendum: a
// composed two-level menu, not a Select variant).

const PANEL_GAP = 6;
const SEARCH_THRESHOLD = 6; // search appears beyond this many cycles

export interface CycleWeekSelection {
  cycleId: string;
  weekStart: string;
}

interface WeekRowData {
  weekStart: string;
  span: string;
  index: number;
  total: number;
  finished: boolean;
  draft: boolean;
}

interface CycleRowData {
  cycle: OKRCycle;
  name: string;
  weeks: WeekRowData[];
  completed: number;
  meta: string;
  dim: boolean;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function endOfWeek(monday: string): string {
  const d = new Date(`${monday}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

function cycleDisplayName(cycle: OKRCycle): string {
  return cycle.name || `${MONTH_NAMES[cycle.month]} ${cycle.year}`;
}

/** Token-AND haystack for search: every date in the span, so "14 Apr" finds
 *  the week containing Apr 14 even though the label reads "13–19 Apr". */
function weekHaystack(weekStart: string): string {
  const parts: string[] = [];
  const d = new Date(`${weekStart}T00:00:00Z`);
  for (let i = 0; i < 7; i++) {
    parts.push(`${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return parts.join(' ').toLowerCase();
}

export default function CycleWeekPicker({
  cycles,
  reviews,
  selected,
  todayStr,
  onCommit,
  ariaLabel = 'Review cycle and week',
}: {
  cycles: OKRCycle[];
  reviews: WeeklyReview[];
  selected: CycleWeekSelection | null;
  todayStr: string;
  onCommit: (selection: CycleWeekSelection) => void;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [expandedCycleId, setExpandedCycleId] = useState<string | null>(selected?.cycleId ?? null);
  const [query, setQuery] = useState('');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number; above: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const cycleRows = useMemo<CycleRowData[]>(() => {
    return [...cycles]
      .sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month))
      .map(cycle => {
        const mondays = getExclusiveCycleMondays(cycle);
        const weeks: WeekRowData[] = mondays.map((monday, i) => ({
          weekStart: monday,
          span: formatWeekSpan(monday),
          index: i + 1,
          total: mondays.length,
          finished: endOfWeek(monday) < todayStr,
          draft: false,
        }));
        const completedSet = new Set(
          reviews.filter(r => r.completedAt && mondays.includes(r.weekStartDate)).map(r => r.weekStartDate));
        const completed = weeks.filter(w => completedSet.has(w.weekStart)).length;
        for (const w of weeks) {
          const found = findReviewForWeek(reviews, w.weekStart);
          w.draft = !!found && isDraftReview(found);
        }
        const meta = completed === 0
          ? 'no reviews'
          : completed === weeks.length ? `${completed} reviews` : `${completed} of ${weeks.length}`;
        return { cycle, name: cycleDisplayName(cycle), weeks, completed, meta, dim: completed === 0 };
      });
  }, [cycles, reviews, todayStr]);

  const showSearch = cycles.length > SEARCH_THRESHOLD;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { rows: cycleRows, weekFilter: null as Map<string, WeekRowData[]> | null };
    const tokens = q.split(/\s+/);
    const matches = (hay: string) => tokens.every(t => hay.includes(t));
    const weekFilter = new Map<string, WeekRowData[]>();
    const rows: CycleRowData[] = [];
    for (const row of cycleRows) {
      const cycleMatch = matches(`${row.name} ${row.cycle.year}`.toLowerCase());
      const weekMatches = row.weeks.filter(w => matches(weekHaystack(w.weekStart)));
      if (cycleMatch) {
        rows.push(row);
      } else if (weekMatches.length > 0) {
        weekFilter.set(row.cycle.id, weekMatches);
        rows.push(row);
      }
    }
    return { rows, weekFilter };
  }, [cycleRows, query]);

  const visibleWeeks = (row: CycleRowData): WeekRowData[] =>
    filtered.weekFilter?.get(row.cycle.id) ?? row.weeks;

  const expandedRow = filtered.rows.find(r => r.cycle.id === expandedCycleId) ?? filtered.rows[0];

  // Flattened interactive rows for keyboard roving: cycle rows + enabled
  // week rows of the expanded cycle (disabled weeks are skipped, like
  // Select's disabled options).
  const flatRows = useMemo(() => {
    const flat: { key: string; kind: 'cycle' | 'week'; row?: CycleRowData; week?: WeekRowData }[] = [];
    for (const row of filtered.rows) {
      flat.push({ key: `cycle:${row.cycle.id}`, kind: 'cycle', row });
      if (row.cycle.id === expandedRow?.cycle.id) {
        for (const w of visibleWeeks(row)) {
          if (w.finished) flat.push({ key: `week:${row.cycle.id}:${w.weekStart}`, kind: 'week', row, week: w });
        }
      }
    }
    return flat;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, expandedRow?.cycle.id]);

  const selectedCycleName = selected ? cycleRows.find(r => r.cycle.id === selected.cycleId)?.name : undefined;
  const selectedWeek = selected ? cycleRows.find(r => r.cycle.id === selected.cycleId)
    ?.weeks.find(w => w.weekStart === selected.weekStart) : undefined;
  const triggerLabel = selectedCycleName && selectedWeek
    ? `${selectedCycleName} · week ${selectedWeek.index} of ${selectedWeek.total}`
    : 'Choose a week';

  const openPanel = () => {
    setOpen(true);
    setQuery('');
    const firstActive = selected
      ? `week:${selected.cycleId}:${selected.weekStart}`
      : flatRows[0]?.key ?? null;
    const exists = flatRows.some(r => r.key === firstActive);
    setActiveKey(exists ? firstActive : flatRows[0]?.key ?? null);
  };

  const commitWeek = (row: CycleRowData, week: WeekRowData) => {
    if (!week.finished) return;
    onCommit({ cycleId: row.cycle.id, weekStart: week.weekStart });
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        openPanel();
      }
      return;
    }
    const idx = flatRows.findIndex(r => r.key === activeKey);
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault();
        if (flatRows.length === 0) return;
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        const next = idx < 0 ? (dir > 0 ? 0 : flatRows.length - 1) : (idx + dir + flatRows.length) % flatRows.length;
        setActiveKey(flatRows[next].key);
        break;
      }
      case 'Enter': {
        e.preventDefault();
        const current = flatRows[idx];
        if (!current) return;
        if (current.kind === 'cycle' && current.row) setExpandedCycleId(current.row.cycle.id);
        else if (current.kind === 'week' && current.row && current.week) commitWeek(current.row, current.week);
        break;
      }
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  // Outside-click closes (panel is portaled to <body>).
  useLayoutEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Fixed-position the portaled panel from the trigger rect; flip above when
  // there is more room there (Select's placement contract).
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const rect = trigger.getBoundingClientRect();
      const panelHeight = panel.offsetHeight;
      const roomBelow = window.innerHeight - rect.bottom - PANEL_GAP;
      const roomAbove = rect.top - PANEL_GAP;
      const above = roomBelow < panelHeight && roomAbove > roomBelow;
      const next = {
        top: above ? rect.top - PANEL_GAP - panelHeight : rect.bottom + PANEL_GAP,
        left: rect.left,
        minWidth: Math.max(rect.width, 300),
        above,
      };
      setPos(prev =>
        prev && prev.top === next.top && prev.left === next.left && prev.minWidth === next.minWidth && prev.above === next.above
          ? prev
          : next);
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, expandedCycleId, query]);

  // Focus the search field on open when present; keep the roving row in view.
  useLayoutEffect(() => {
    if (open && showSearch) searchRef.current?.focus();
  }, [open, showSearch]);

  useLayoutEffect(() => {
    if (!open || activeKey == null) return;
    panelRef.current
      ?.querySelector(`[data-key=${CSS.escape(activeKey)}]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeKey, open]);

  const rowClasses = (base: string, extra: string[]) =>
    `sel-row ${base}${extra.length ? ` ${extra.join(' ')}` : ''}`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`sel-trigger boxed${open ? ' sel-open' : ''}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openPanel())}
        onKeyDown={handleKeyDown}
      >
        <span className={`sel-text${selected ? '' : ' sel-placeholder'}`} title={triggerLabel}>
          {triggerLabel}
        </span>
        <ChevronDown size={14} className="sel-chevron" aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            className={`sel-panel cwp-panel${pos?.above ? ' sel-open-above' : ''}`}
            style={pos ? { top: pos.top, left: pos.left, minWidth: pos.minWidth } : undefined}
            onKeyDown={handleKeyDown}
          >
            {showSearch && (
              <div className="cwp-search">
                <Search size={13} className="icon-inline" />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Find a cycle or week"
                  aria-label="Find a cycle or week"
                />
              </div>
            )}

            <div className="cwp-section-label">Cycle</div>
            <div className="sel-rows">
              {filtered.rows.length === 0 && <div className="sel-row sel-empty cwp-empty">No cycle or week matches ‘{query.trim()}’</div>}
              {filtered.rows.map(row => {
                const isSelectedCycle = selected?.cycleId === row.cycle.id;
                const isExpanded = expandedRow?.cycle.id === row.cycle.id;
                return (
                  <div
                    key={row.cycle.id}
                    role="option"
                    aria-selected={isSelectedCycle}
                    data-key={`cycle:${row.cycle.id}`}
                    className={rowClasses('cwp-cycle-row', [
                      row.dim ? 'cwp-dim' : '',
                      isSelectedCycle ? 'cwp-selected' : '',
                      activeKey === `cycle:${row.cycle.id}` ? 'sel-active' : '',
                    ])}
                    onClick={() => setExpandedCycleId(row.cycle.id)}
                    onMouseEnter={() => setActiveKey(`cycle:${row.cycle.id}`)}
                  >
                    {isSelectedCycle && <Check size={13} className="cwp-check" />}
                    <ChevronRight size={12} className={`cwp-chevron${isExpanded ? ' expanded' : ''}`} />
                    <span className="cwp-cycle-name">{row.name}</span>
                    <span className="cwp-meta">{row.meta}</span>
                  </div>
                );
              })}
            </div>

            {expandedRow && (
              <>
                <div className="cwp-divider" />
                <div className="cwp-section-label cwp-weeks-label">Week in {expandedRow.name}</div>
                <div className="sel-rows">
                  {visibleWeeks(expandedRow).map(w => {
                    const isSelectedWeek = selected?.cycleId === expandedRow.cycle.id && selected.weekStart === w.weekStart;
                    return (
                      <div
                        key={w.weekStart}
                        role="option"
                        aria-selected={isSelectedWeek}
                        aria-disabled={!w.finished}
                        data-key={`week:${expandedRow.cycle.id}:${w.weekStart}`}
                        className={rowClasses('cwp-week-row', [
                          w.finished ? '' : 'cwp-disabled',
                          isSelectedWeek ? 'cwp-selected' : '',
                          activeKey === `week:${expandedRow.cycle.id}:${w.weekStart}` ? 'sel-active' : '',
                        ])}
                        onClick={() => commitWeek(expandedRow, w)}
                        onMouseEnter={() => { if (w.finished) setActiveKey(`week:${expandedRow.cycle.id}:${w.weekStart}`); }}
                      >
                        <span className="cwp-week-span">{w.span}</span>
                        {w.draft
                          ? <span className="cwp-draft">Draft</span>
                          : isSelectedWeek && <Check size={13} className="cwp-check" />}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

/** Default review selection: the newest cycle's most recent finished week,
 *  walking older cycles until one has any (a just-started cycle falls back
 *  to the previous cycle's last finished week). Null when nothing anywhere
 *  has finished yet. */
export function defaultReviewSelection(
  cycles: OKRCycle[],
  todayStr: string,
): CycleWeekSelection | null {
  const sorted = [...cycles].sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month));
  for (const cycle of sorted) {
    const mondays = getExclusiveCycleMondays(cycle);
    for (let i = mondays.length - 1; i >= 0; i--) {
      if (endOfWeek(mondays[i]) < todayStr) {
        return { cycleId: cycle.id, weekStart: mondays[i] };
      }
    }
  }
  return null;
}
