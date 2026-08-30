import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import '../../styles/datepicker.css';

/**
 * DatePicker — the app's date-picker popover (2026-08-30): the DUE cell's
 * native picker rendered tiny in WKWebView and outlived the panel, so dates
 * get a real in-app calendar instead. Panel anatomy follows the Select
 * system (docs/design-system.md "Menu component"): portaled to <body>,
 * fixed-positioned from the trigger rect (flips above near the bottom
 * edge), z-1100, outside mousedown closes unchanged, Esc closes without
 * dismissing the modal (the panel prevents mousedown default so focus —
 * and therefore Esc handling — stays on the trigger).
 *
 * Values are `YYYY-MM-DD` strings composed from the viewed calendar month —
 * never `new Date(iso)`, which parses UTC and shifts the picked day across
 * timezones.
 */

const PANEL_GAP = 6;
const MIN_WIDTH = 280;
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;

const pad2 = (n: number) => String(n).padStart(2, '0');
const toIso = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`;

/** "Fri 31 Jul" (EEE d MMM) from a YYYY-MM-DD string. The string is parsed
 *  as local calendar fields — `new Date('YYYY-MM-DD')` would parse UTC and
 *  shift the shown day in negative-offset timezones. */
export function formatDueDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return value;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return value;
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'short' });
  const day = d.toLocaleDateString('en-GB', { day: 'numeric' });
  const month = d.toLocaleDateString('en-GB', { month: 'short' });
  return `${weekday} ${day} ${month}`;
}

interface PanelPos {
  top: number;
  left: number;
  minWidth: number;
  above: boolean;
}

export interface DatePickerProps {
  /** `YYYY-MM-DD` or undefined for no due date. */
  value?: string;
  onChange: (iso: string) => void;
  /** Imperative empty-state text, e.g. "Set a due date". */
  placeholder?: string;
  onClear?: () => void;
  clearLabel?: string;
  ariaLabel?: string;
  /** Trigger dressing — the surface scopes this class's look. */
  className?: string;
}

export default function DatePicker({
  value, onChange, placeholder, onClear, clearLabel, ariaLabel, className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  /** The month on display: year + 0-based month. Seeded from the value
   *  (falls back to today) every time the picker opens. */
  const [view, setView] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [pos, setPos] = useState<PanelPos | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const openAtValue = () => {
    const base = value ? value.split('-').map(Number) : null;
    const now = new Date();
    setView(
      base && base.length === 3
        ? { year: base[0], month: base[1] - 1 }
        : { year: now.getFullYear(), month: now.getMonth() },
    );
    setOpen(true);
  };

  const moveMonth = (delta: number) => {
    setView(v => {
      const next = new Date(v.year, v.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const pickDay = (day: number) => {
    onChange(toIso(view.year, view.month, day));
    setOpen(false);
  };

  // Outside mousedown closes unchanged; the trigger and the portaled panel
  // are exempt (same contract as Select — focus follows the click).
  useEffect(() => {
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
  // there is more room there. Re-runs on scroll (capture) and resize while open.
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
      setPos(prev => {
        const next: PanelPos = {
          top: above ? rect.top - PANEL_GAP - panelHeight : rect.bottom + PANEL_GAP,
          left: rect.left,
          minWidth: Math.max(rect.width, MIN_WIDTH),
          above,
        };
        return prev && prev.top === next.top && prev.left === next.left
          && prev.minWidth === next.minWidth && prev.above === next.above
          ? prev
          : next;
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  const grid = useMemo(() => {
    // Monday-start 6×7 grid of the viewed month. Days from adjacent months
    // render as empty slots; only in-month days are buttons.
    const first = new Date(view.year, view.month, 1);
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // Monday-start offset
    const cells: (number | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [view]);

  const monthLabel = new Date(view.year, view.month, 1)
    .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const todayIso = toIso(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${className ?? ''}${value ? '' : ' empty'}`}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={false}
        onClick={() => (open ? setOpen(false) : openAtValue())}
        onKeyDown={e => {
          if (e.key === 'Escape' && open) {
            e.preventDefault();
            // Swallow the modal's document-level Esc so the panel closes
            // without dismissing the task detail (Select's contract).
            e.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <span>{value ? formatDueDate(value) : placeholder}</span>
        <ChevronDown size={14} className="dp-chevron" aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={ariaLabel ? `${ariaLabel} picker` : 'Date picker'}
            className={`date-picker-panel${pos?.above ? ' dp-open-above' : ''}`}
            style={pos ? { top: pos.top, left: pos.left, minWidth: pos.minWidth } : undefined}
            onMouseDown={e => e.preventDefault()}
          >
            <div className="dp-header">
              <button
                type="button"
                className="dp-nav"
                aria-label="Previous month"
                onClick={() => moveMonth(-1)}
              >
                <ChevronLeft size={14} />
              </button>
              <span className="dp-month-label">{monthLabel}</span>
              <button
                type="button"
                className="dp-nav"
                aria-label="Next month"
                onClick={() => moveMonth(1)}
              >
                <ChevronRight size={14} />
              </button>
            </div>
            <div className="dp-weekdays">
              {WEEKDAYS.map(wd => (
                <span key={wd} className="dp-weekday">{wd}</span>
              ))}
            </div>
            <div className="dp-grid">
              {grid.map((day, i) =>
                day === null ? (
                  <span key={`slot-${i}`} className="dp-slot" />
                ) : (
                  <button
                    key={day}
                    type="button"
                    className={`dp-day${value === toIso(view.year, view.month, day) ? ' selected' : ''}${
                      todayIso === toIso(view.year, view.month, day) ? ' today' : ''
                    }`}
                    onClick={() => pickDay(day)}
                  >
                    {day}
                  </button>
                ),
              )}
            </div>
            {onClear && (
              <div className="dp-footer">
                <div
                  className="dp-clear"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    onClear();
                    setOpen(false);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onClear();
                      setOpen(false);
                    }
                  }}
                >
                  <span className="dp-clear-icon"><span className="dp-dash" /></span>
                  <span className="dp-clear-label">{clearLabel ?? 'No date'}</span>
                </div>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
