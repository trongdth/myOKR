import { useEffect, useLayoutEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, X } from 'lucide-react';
import '../../styles/select.css';

/**
 * Select — the app's single menu component. Every dropdown in the desktop
 * app is an instance of this: boxed (default) for form/toolbar/cell pickers,
 * `bare` for compact inline badge/dot pickers (KR mode, priority dots).
 *
 * Anatomy and states are specced in docs/design-system.md ("Menu component")
 * and .scratch/custom-select/spec.md: `[icon] text [chevron]` trigger, 32px
 * (40px ≤900px), pressed-while-open with cyan border + ring; 34px rows with
 * a single chosen row (tick + tint); clear + action rows below a divider.
 * The trailing slot holds a tick OR a quiet mono hint — never both.
 *
 * Keyboard: listbox pattern minus type-ahead (ADR-0011 bans new hotkeys) —
 * ↑/↓/Home/End rove, Enter/Space commits, Esc closes with focus returned to
 * the trigger. The panel is portaled to document.body and fixed-positioned
 * from the trigger rect so it survives overflow-clipped rows and the modal
 * layer (z-1000).
 */
export interface SelectOption<T> {
  value: T;
  label: string;
  /** Colour/glyph identity of the value (priority dot, KR swatch, bucket icon). */
  icon?: ReactNode;
  /** Quiet mono hint/count — hidden on the chosen row, where the tick wins. */
  trailing?: ReactNode;
  disabled?: boolean;
}

export interface SelectAction {
  icon?: ReactNode;
  label: string;
  /** Fires without changing the selected value. */
  onSelect: () => void;
}

export type SelectVariant = 'boxed' | 'bare';

export interface SelectProps<T> {
  options: SelectOption<T>[];
  value: T | null | undefined;
  onChange: (value: T) => void;
  /** Imperative empty-state text, e.g. "Link a key result". */
  placeholder?: string;
  /** Footer action rows (e.g. "+ Create new habit…"), rendered after the clear row. */
  actions?: SelectAction[];
  /** Providing it renders a clear row below the divider. */
  onClear?: () => void;
  clearLabel?: string;
  disabled?: boolean;
  variant?: SelectVariant;
  /** Renders a hover × per option row (destructive red hover). */
  onRemove?: (value: T) => void;
  /** Bare only: render the icon without the label (dot-only badge triggers). */
  hideTriggerLabel?: boolean;
  ariaLabel?: string;
}

const PANEL_GAP = 6;

type Row<T> =
  | { kind: 'option'; option: SelectOption<T>; i: number }
  | { kind: 'clear'; i: number }
  | { kind: 'action'; action: SelectAction; i: number };

interface PanelPos {
  top: number;
  left: number;
  minWidth: number;
  above: boolean;
}

export function Select<T>(props: SelectProps<T>) {
  const {
    options, value, onChange, placeholder, actions, onClear, clearLabel,
    disabled, variant = 'boxed', onRemove, hideTriggerLabel, ariaLabel,
  } = props;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [pos, setPos] = useState<PanelPos | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const idBase = useId();

  const chosen = options.find((o) => Object.is(o.value, value)) ?? null;

  const rows = useMemo<Row<T>[]>(() => {
    const list: Row<T>[] = options.map((option, i) => ({ kind: 'option', option, i }));
    if (onClear) list.push({ kind: 'clear', i: list.length });
    actions?.forEach((action) => list.push({ kind: 'action', action, i: list.length }));
    return list;
  }, [options, onClear, actions]);

  const rowId = (i: number) => `${idBase}-r${i}`;

  const enabledIndexes = rows
    .filter((r) => r.kind !== 'option' || !r.option.disabled)
    .map((r) => r.i);

  const initialActive = () => {
    const chosenRow = rows.find((r) => r.kind === 'option' && Object.is(r.option.value, value));
    if (chosenRow) return chosenRow.i;
    return enabledIndexes[0] ?? null;
  };

  const openAt = (index: number | null) => {
    setActiveIndex(index);
    setOpen(true);
  };

  const moveActive = (dir: 1 | -1) => {
    if (enabledIndexes.length === 0) return;
    const current = activeIndex == null ? (dir === 1 ? -1 : enabledIndexes.length) : enabledIndexes.indexOf(activeIndex);
    const next = enabledIndexes[(current + dir + enabledIndexes.length) % enabledIndexes.length];
    setActiveIndex(next);
  };

  const commit = (row: Row<T>) => {
    if (row.kind === 'option') {
      if (row.option.disabled) return;
      onChange(row.option.value);
    } else if (row.kind === 'clear') {
      onClear?.();
    } else {
      row.action.onSelect();
    }
    setOpen(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const firstIdx = enabledIndexes[0] ?? null;
    const lastIdx = enabledIndexes[enabledIndexes.length - 1] ?? null;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (open) moveActive(1);
        else openAt(initialActive());
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (open) moveActive(-1);
        else openAt(lastIdx);
        break;
      case 'Home':
        e.preventDefault();
        if (open) setActiveIndex(firstIdx);
        else openAt(firstIdx);
        break;
      case 'End':
        e.preventDefault();
        if (open) setActiveIndex(lastIdx);
        else openAt(lastIdx);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (open) {
          const row = rows.find((r) => r.i === activeIndex);
          if (row) commit(row);
        } else {
          openAt(initialActive());
        }
        break;
      case 'Escape':
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  // Outside-click closes. The panel is portaled to <body>, so the check must
  // exempt both the trigger and the panel (useClickOutside covers one ref).
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
  // there is more room there. Re-runs on scroll (capture: nested scrollers)
  // and resize while open.
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
      const next: PanelPos = {
        top: above ? rect.top - PANEL_GAP - panelHeight : rect.bottom + PANEL_GAP,
        left: rect.left,
        minWidth: rect.width,
        above,
      };
      setPos((prev) =>
        prev && prev.top === next.top && prev.left === next.left && prev.minWidth === next.minWidth && prev.above === next.above
          ? prev
          : next,
      );
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  // Keep the roving row in view while arrowing through a scrollable list.
  useEffect(() => {
    if (!open || activeIndex == null) return;
    document.getElementById(rowId(activeIndex))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, open]);

  const activeRowId = open && activeIndex != null ? rowId(activeIndex) : undefined;
  const hasFooter = Boolean(onClear) || (actions?.length ?? 0) > 0;

  const leadingSlot = chosen?.icon;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`sel-trigger ${variant}${open ? ' sel-open' : ''}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${idBase}-panel` : undefined}
        aria-activedescendant={activeRowId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openAt(initialActive()))}
        onKeyDown={handleKeyDown}
        onBlur={() => setOpen(false)}
      >
        {leadingSlot && <span className="sel-icon">{leadingSlot}</span>}
        {!(variant === 'bare' && hideTriggerLabel && leadingSlot) && (
          <span className={`sel-text${chosen ? '' : ' sel-placeholder'}`}>
            {chosen ? chosen.label : (placeholder ?? '')}
          </span>
        )}
        {variant === 'boxed' && <ChevronDown size={14} className="sel-chevron" aria-hidden="true" />}
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            id={`${idBase}-panel`}
            role="listbox"
            className="sel-panel"
            style={pos ? { top: pos.top, left: pos.left, minWidth: pos.minWidth } : undefined}
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="sel-rows">
              {options.length === 0 && <div className="sel-row sel-empty">No options yet</div>}
              {rows.map((row) => {
                if (row.kind !== 'option') return null;
                const { option } = row;
                const isChosen = Object.is(option.value, value);
                return (
                  <div
                    key={String(row.i)}
                    id={rowId(row.i)}
                    role="option"
                    aria-selected={isChosen}
                    aria-disabled={option.disabled || undefined}
                    className={[
                      'sel-row',
                      isChosen ? 'sel-chosen' : '',
                      activeIndex === row.i ? 'sel-active' : '',
                      option.disabled ? 'sel-disabled' : '',
                    ].filter(Boolean).join(' ')}
                    onMouseEnter={() => setActiveIndex(row.i)}
                    onClick={() => commit(row)}
                  >
                    {option.icon && <span className="sel-icon">{option.icon}</span>}
                    <span className="sel-row-text">{option.label}</span>
                    {isChosen
                      ? <Check size={14} className="sel-tick" aria-hidden="true" />
                      : option.trailing != null && <span className="sel-trailing">{option.trailing}</span>}
                    {onRemove && !isChosen && (
                      <button
                        type="button"
                        className="sel-remove"
                        aria-label={`Remove ${option.label}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemove(option.value);
                        }}
                      >
                        <X size={12} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {hasFooter && (
              <div className="sel-footer">
                {rows.filter((r) => r.kind !== 'option').map((row) => {
                  const label = row.kind === 'clear' ? (clearLabel ?? 'None') : row.action.label;
                  const icon = row.kind === 'clear'
                    ? <span className="sel-clear-icon"><span className="sel-dash" /></span>
                    : row.action.icon && <span className="sel-icon">{row.action.icon}</span>;
                  return (
                    <div
                      key={row.i}
                      id={rowId(row.i)}
                      role="option"
                      aria-selected="false"
                      className={`sel-row ${row.kind === 'clear' ? 'sel-clear' : 'sel-action'}${activeIndex === row.i ? ' sel-active' : ''}`}
                      onMouseEnter={() => setActiveIndex(row.i)}
                      onClick={() => commit(row)}
                    >
                      {icon}
                      <span className="sel-row-text">{label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
