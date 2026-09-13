import { useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { clampPct, PACE_STATUS_CLASS, PACE_STATUS_LABEL, type PaceStatus } from '../../../lib/pace';

export type Selection = { kind: 'objective'; id: string } | { kind: 'kr'; id: string };

export interface KrVM {
  id: string;
  objectiveId: string;
  title: string;
  value: number;
  target: number;
  pct: number;
  /** 0% renders grey; behind/at-risk bars amber; on-pace/ahead cyan. */
  fill: 'zero' | 'on-pace' | 'behind-pace';
}

export interface ObjectiveVM {
  id: string;
  title: string;
  krCount: number;
  pct: number;
  status: PaceStatus;
  zero: boolean;
  krs: KrVM[];
}

interface ObjectiveListProps {
  objectives: ObjectiveVM[];
  marker: number;
  expandedId: string | null;
  selected: Selection | null;
  onObjectiveActivate: (id: string) => void;
  onObjectiveArrow: (id: string, expand: boolean) => void;
  onKrActivate: (objectiveId: string, krId: string) => void;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/**
 * The objectives list — pace-marked rows, one objective expanded at a time,
 * selection driving the right column. Keyboard is the listbox pattern of
 * CycleWeekPicker/Select (ADR-0011 carve-out: in-component roving, no global
 * hotkeys): ↑/↓ move rows, →/← expand/collapse the objective row, Enter
 * selects (and expands an objective).
 */
export default function ObjectiveList({
  objectives, marker, expandedId, selected,
  onObjectiveActivate, onObjectiveArrow, onKrActivate,
}: ObjectiveListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  // The row set can shrink without a focus event (e.g. switching cycles),
  // leaving the roving index past the end and the list untabbable — clamp
  // so exactly one row always carries tabIndex 0.
  const rowCount = objectives.reduce((sum, o) => sum + 1 + (expandedId === o.id ? o.krs.length : 0), 0);
  const rovingIdx = Math.min(activeIdx, Math.max(rowCount - 1, 0));

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[data-row-idx]') ?? []);
    if (rows.length === 0) return;
    const cur = rows.findIndex(r => r === document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = cur === -1
        ? 0
        : (cur + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      rows[next].focus();
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const row = cur >= 0 ? rows[cur] : undefined;
      const objectiveId = row?.dataset.objectiveId;
      if (!row || row.dataset.kind !== 'objective' || !objectiveId) return;
      e.preventDefault();
      onObjectiveArrow(objectiveId, e.key === 'ArrowRight');
    }
  };

  let rowIdx = -1;

  return (
    <div className="obj-list">
      <div className="obj-list-header">
        <h2 className="obj-list-title">Objectives</h2>
        <span className="obj-pace-meta">
          <span className="obj-pace-sample" /> pace marker at {marker}%
        </span>
      </div>
      <div className="obj-cards" ref={listRef} onKeyDown={handleKeyDown}>
        {objectives.map(o => {
          rowIdx++;
          const objIdx = rowIdx;
          const expanded = expandedId === o.id;
          return (
            <div key={o.id} className={`obj-card ${expanded ? 'expanded' : 'collapsed'}`}>
              <button
                type="button"
                className="obj-row"
                data-row-idx={objIdx}
                data-kind="objective"
                data-objective-id={o.id}
                tabIndex={objIdx === rovingIdx ? 0 : -1}
                aria-expanded={expanded}
                onFocus={() => setActiveIdx(objIdx)}
                onClick={() => onObjectiveActivate(o.id)}
                title={o.title}
              >
                <span className="obj-chevron">
                  <ChevronDown size={12} strokeWidth={2.6} aria-hidden="true" />
                </span>
                <span className="obj-name-cell">
                  <span className="obj-name">{o.title}</span>
                  <span className="obj-kr-count">
                    {o.krCount} key result{o.krCount === 1 ? '' : 's'}
                  </span>
                </span>
                <span className="obj-bar-cell">
                  <span
                    className="obj-bar-track"
                    role="img"
                    aria-label={`${o.pct}%, pace marker at ${marker}%`}
                  >
                    <span
                      className={`obj-bar-fill ${o.zero ? 'zero' : PACE_STATUS_CLASS[o.status]}`}
                      style={{ width: `${clampPct(o.pct)}%` }}
                    />
                    <span className="obj-pace-tick" style={{ left: `${clampPct(marker)}%` }} />
                  </span>
                  <span className={`obj-percent${o.zero ? ' zero' : ''}`}>{o.pct}%</span>
                </span>
                {/* Pill label stays the derived status; only the hue greys at 0% (Q5). */}
                <span className={`obj-pill ${o.zero ? 'zero' : PACE_STATUS_CLASS[o.status]}`}>
                  {PACE_STATUS_LABEL[o.status]}
                </span>
              </button>
              {expanded && (
                <div className="obj-krs">
                  {o.krs.map(kr => {
                    rowIdx++;
                    const krIdx = rowIdx;
                    const isSel = selected?.kind === 'kr' && selected.id === kr.id;
                    return (
                      <button
                        key={kr.id}
                        type="button"
                        className={`obj-kr-row${isSel ? ' selected' : ''}`}
                        data-row-idx={krIdx}
                        data-kind="kr"
                        tabIndex={krIdx === rovingIdx ? 0 : -1}
                        onFocus={() => setActiveIdx(krIdx)}
                        onClick={() => onKrActivate(o.id, kr.id)}
                      >
                        <span className="obj-kr-name" title={kr.title}>{kr.title}</span>
                        <span className="obj-kr-value">{fmt(kr.value)} / {fmt(kr.target)}</span>
                        <span className="obj-bar-cell">
                          <span
                            className="obj-kr-bar-track"
                            role="img"
                            aria-label={`${kr.pct}%, pace marker at ${marker}%`}
                          >
                            <span
                              className={`obj-kr-bar-fill ${kr.fill}`}
                              style={{ width: `${clampPct(kr.pct)}%` }}
                            />
                            <span className="obj-pace-tick" style={{ left: `${clampPct(marker)}%` }} />
                          </span>
                          <span className="obj-kr-percent">{kr.pct}%</span>
                        </span>
                        {/* Fourth column reserved empty so this bar's ticks
                            line up vertically with the objective bar above. */}
                        <span className="obj-kr-reserved" aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
