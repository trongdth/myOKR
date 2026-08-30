import { useState, useMemo, useEffect, useRef, Fragment, type ReactNode } from 'react';
import { Search, Play, Check, SquareCheck, FileText } from 'lucide-react';
import type { PomodoroTask, TaskBucket } from '../../lib/pomodoro-storage';
import { EISENHOWER_META } from '../../lib/pomodoro-storage';
import type { KeyResult } from '../../lib/okr-storage';

export type SearchScope = 'everything' | 'open' | 'completed' | 'subtasks' | 'notes';

const SCOPE_LABELS: Record<SearchScope, string> = {
  everything: 'Everything',
  open: 'Open',
  completed: 'Completed',
  subtasks: 'Sub-tasks',
  notes: 'Notes',
};

const BUCKET_LABELS: Record<TaskBucket, string> = {
  today: 'Today',
  this_week: 'This week',
  backlog: 'Backlog',
};

/** Scope survives close/reopen for the app session (the component unmounts
 *  while closed, so state alone can't hold it) — never persisted to storage:
 *  every launch starts fresh on Everything. */
let sessionScope: SearchScope = 'everything';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  tasks: PomodoroTask[];
  keyResults?: KeyResult[];
  onSelectTask: (task: PomodoroTask) => void;
  onStartFocusTask?: (task: PomodoroTask) => void;
  onReopenTask?: (task: PomodoroTask) => void;
}

/** A match found *inside* a task — a sub-task or a note (description /
 *  comment). Renders as its own INSIDE TASKS row under the parent's context. */
interface InsideMatch {
  parent: PomodoroTask;
  kind: 'subtask' | 'note';
  text: string;
}

type Row =
  | { kind: 'open'; task: PomodoroTask }
  | { kind: 'completed'; task: PomodoroTask }
  | { kind: 'inside'; match: InsideMatch };

/** Parse an ISO stamp or date-only string; null when absent/invalid. */
function toDate(iso: string | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Fri 21 May" — weekday-first short date (Finished lines, never raw ISO). */
function formatDayMonth(iso: string | undefined): string {
  const d = toDate(iso);
  return d
    ? d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    : '';
}

/** "Sunday" — weekday of a completion stamp for the note/sub-task context line. */
function formatWeekday(iso: string | undefined): string {
  const d = toDate(iso);
  return d ? d.toLocaleDateString('en-GB', { weekday: 'long' }) : '';
}

/** Trim long note bodies to a ±radius window around the first match so a row
 *  stays two lines; the highlight component re-finds the match in the window. */
function snippetAround(text: string, q: string, radius = 60): string {
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + q.length + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

/** Renders `text` with every case-insensitive occurrence of the query wrapped
 *  in a cyan-tinted <mark> — the core affordance of the search screen. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const lq = q.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  let idx = lower.indexOf(lq);
  while (idx !== -1) {
    if (idx > from) parts.push(text.slice(from, idx));
    parts.push(<mark key={idx} className="command-k-hl">{text.slice(idx, idx + q.length)}</mark>);
    from = idx + q.length;
    idx = lower.indexOf(lq, from);
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
}

/** One muted meta line; each segment is its own element and the · separators
 *  are rendered between them, so segments can never glue together. */
function MetaLine({ segments }: { segments: ReactNode[] }) {
  const live = segments.filter(s => s !== null && s !== undefined && s !== '');
  return (
    <div className="command-k-item-meta">
      {live.map((seg, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="meta-sep">·</span>}
          <span className="meta-seg">{seg}</span>
        </Fragment>
      ))}
    </div>
  );
}

function rowsOf<K extends Row['kind']>(rows: Row[], kind: K): Extract<Row, { kind: K }>[] {
  return rows.filter(r => r.kind === kind) as Extract<Row, { kind: K }>[];
}

export default function CommandKModal({
  isOpen,
  onClose,
  tasks,
  keyResults = [],
  onSelectTask,
  onStartFocusTask,
  onReopenTask,
}: Props) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>(sessionScope);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const { rows, total } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hasQuery = q.length > 0;

    const subHits = (t: PomodoroTask) =>
      hasQuery ? (t.todos || []).filter(td => td.text.toLowerCase().includes(q)) : [];
    const noteHits = (t: PomodoroTask): string[] => {
      if (!hasQuery) return [];
      const hits: string[] = [];
      if ((t.description || '').toLowerCase().includes(q)) hits.push(t.description as string);
      for (const c of t.comments || []) {
        if (c.text.toLowerCase().includes(q)) hits.push(c.text);
      }
      return hits;
    };

    // Empty query = browse: every task is a "title match", no inside rows.
    const isTitleHit = (t: PomodoroTask) => !hasQuery || t.title.toLowerCase().includes(q);

    // Recency clocks: open tasks by last edit, completed by when they were
    // finished (the group's "Finished <date>" ordering).
    const editRecency = (t: PomodoroTask) => t.updatedAt ?? t.createdAt;
    const doneRecency = (t: PomodoroTask) => t.completedAt ?? t.updatedAt ?? t.createdAt;
    const byRecencyDesc = (clock: (t: PomodoroTask) => string) =>
      (a: PomodoroTask, b: PomodoroTask) => clock(b).localeCompare(clock(a));

    // Chips filter row types: Open → open rows, Completed → completed rows,
    // Sub-tasks/Notes → inside rows of that kind only.
    const openRows: Row[] = [];
    const completedRows: Row[] = [];
    const insideRows: Row[] = [];

    const wantOpen = scope === 'everything' || scope === 'open';
    const wantCompleted = scope === 'everything' || scope === 'completed';
    const wantInside = scope === 'everything' || scope === 'subtasks' || scope === 'notes';

    [...tasks].sort(byRecencyDesc(editRecency)).forEach(task => {
      if (wantOpen && !task.isCompleted && isTitleHit(task)) {
        openRows.push({ kind: 'open', task });
      }
      if (wantCompleted && task.isCompleted && isTitleHit(task)) {
        completedRows.push({ kind: 'completed', task });
      }
      if (wantInside && scope !== 'notes') {
        for (const td of subHits(task)) {
          insideRows.push({ kind: 'inside', match: { parent: task, kind: 'subtask', text: td.text } });
        }
      }
      if (wantInside && scope !== 'subtasks') {
        for (const text of noteHits(task)) {
          insideRows.push({ kind: 'inside', match: { parent: task, kind: 'note', text } });
        }
      }
    });
    const doneFirst = byRecencyDesc(doneRecency);
    const taskOf = (r: Row) => (r.kind === 'inside' ? r.match.parent : r.task);
    completedRows.sort((a, b) => doneFirst(taskOf(a), taskOf(b)));

    const all = [...openRows, ...completedRows, ...insideRows];
    return { rows: all, total: all.length };
  }, [tasks, query, scope]);

  // First result preselected; re-anchor whenever the result set re-queries.
  const activeIdx = Math.min(selectedIdx, Math.max(0, rows.length - 1));
  useEffect(() => {
    setSelectedIdx(0);
  }, [query, scope]);
  useEffect(() => {
    resultsRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, rows]);

  // Palette-intrinsic keys (scoped to this open modal — not global app
  // shortcuts): ↑/↓ move, Enter activates, Esc clears the query, then closes.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('.sel-panel')) return; // a Select menu owns the keyboard
      if (e.key === 'Escape') {
        e.preventDefault();
        if (query) setQuery('');
        else onClose();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx(i => {
          const delta = e.key === 'ArrowDown' ? 1 : -1;
          return Math.max(0, Math.min(rows.length - 1, i + delta));
        });
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        activateRow(rows[activeIdx]);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, query, rows, activeIdx, onClose]);

  // Body scroll lock (was useModalEffects; its Esc handler is replaced by the
  // clear-then-close behavior above).
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const activateRow = (row: Row | undefined) => {
    if (!row) return;
    if (row.kind === 'open') {
      if (onStartFocusTask) {
        onStartFocusTask(row.task);
        onClose();
      } else {
        onSelectTask(row.task);
        onClose();
      }
      return;
    }
    if (row.kind === 'completed') {
      // Reopen keeps the modal open — the row simply leaves the group.
      onReopenTask?.(row.task);
      return;
    }
    onSelectTask(row.match.parent);
    onClose();
  };

  const pickScope = (s: SearchScope) => {
    sessionScope = s;
    setScope(s);
  };

  if (!isOpen) return null;

  const openRows = rowsOf(rows, 'open');
  const completedRows = rowsOf(rows, 'completed');
  const insideRows = rowsOf(rows, 'inside');
  const groups = [
    { label: 'OPEN', groupRows: openRows, start: 0 },
    { label: 'COMPLETED', groupRows: completedRows, start: openRows.length },
    { label: 'INSIDE TASKS', groupRows: insideRows, start: openRows.length + completedRows.length },
  ];

  return (
    <div className="app-modal-overlay" onClick={onClose}>
      <div
        className="app-modal-content command-k-modal"
        role="dialog"
        aria-label="Search tasks"
        onClick={e => e.stopPropagation()}
      >
        {/* Flat header row — no boxed input, no clear button: Esc clears. */}
        <div className="command-k-header">
          <Search size={16} className="search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="command-k-input"
            placeholder="Search tasks, sub-tasks and notes…"
            aria-label="Search tasks"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <span className="command-k-result-count">
            {total} {total === 1 ? 'result' : 'results'}
          </span>
          <kbd className="command-k-esc-chip">esc</kbd>
        </div>

        {/* Scope chips — the only filter; the choice persists for the session. */}
        <div className="command-k-controls">
          <div className="command-k-scopes">
            {(Object.keys(SCOPE_LABELS) as SearchScope[]).map(s => (
              <button
                key={s}
                className={`command-k-scope-chip${scope === s ? ' active' : ''}`}
                onClick={() => pickScope(s)}
              >
                {SCOPE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Results — the scroll region; the header and chips stay pinned. */}
        <div className="command-k-results" ref={resultsRef} role="listbox" aria-label="Search results">
          {total === 0 ? (
            <div className="command-k-empty">
              No matching tasks found for &quot;{query}&quot;
            </div>
          ) : (
            groups.map(({ label, groupRows, start }) =>
              groupRows.length === 0 ? null : (
                <div className="command-k-group" key={label}>
                  <div className="command-k-group-header">
                    <span>{label}</span>
                    <span className="meta-sep">·</span>
                    <span>{groupRows.length}</span>
                  </div>
                  {groupRows.map((row, i) => (
                    <CommandKRow
                      key={rowKey(row, start + i)}
                      row={row}
                      index={start + i}
                      selected={start + i === activeIdx}
                      query={query}
                      keyResults={keyResults}
                      onHighlight={setSelectedIdx}
                      onStart={onStartFocusTask}
                      onReopen={onReopenTask}
                      onOpenParent={onSelectTask}
                      onClose={onClose}
                    />
                  ))}
                </div>
              ),
            )
          )}
        </div>
      </div>
    </div>
  );
}

function rowKey(row: Row, flatIndex: number): string {
  if (row.kind === 'inside') {
    return `inside:${row.match.parent.id}:${row.match.kind}:${flatIndex}`;
  }
  return `${row.kind}:${row.task.id}`;
}

function CommandKRow({
  row,
  index,
  selected,
  query,
  keyResults,
  onHighlight,
  onStart,
  onReopen,
  onOpenParent,
  onClose,
}: {
  row: Row;
  index: number;
  selected: boolean;
  query: string;
  keyResults: KeyResult[];
  onHighlight: (idx: number) => void;
  onStart?: (task: PomodoroTask) => void;
  onReopen?: (task: PomodoroTask) => void;
  onOpenParent: (task: PomodoroTask) => void;
  onClose: () => void;
}) {
  return (
    <div
      className={`command-k-item${selected ? ' selected' : ''}`}
      data-selected={selected || undefined}
      role="option"
      aria-selected={selected}
      onMouseEnter={() => onHighlight(index)}
      onClick={() => {
        if (row.kind === 'inside') {
          // Inside rows are annotations, not tasks: clicking opens the parent.
          onOpenParent(row.match.parent);
          onClose();
          return;
        }
        onHighlight(index);
      }}
    >
      <RowLeading row={row} />
      <div className="command-k-item-main">
        <RowTitle row={row} query={query} />
        <RowMeta row={row} query={query} keyResults={keyResults} />
      </div>
      <RowAction
        row={row}
        selected={selected}
        onStart={onStart}
        onReopen={onReopen}
        onClose={onClose}
      />
    </div>
  );
}

function RowLeading({ row }: { row: Row }) {
  if (row.kind === 'inside') {
    return (
      <span className="command-k-inside-icon">
        {row.match.kind === 'subtask' ? <SquareCheck size={15} /> : <FileText size={15} />}
      </span>
    );
  }
  return (
    <span className={`command-k-check${row.task.isCompleted ? ' done' : ''}`}>
      {row.task.isCompleted && <Check size={12} strokeWidth={3} />}
    </span>
  );
}

function RowTitle({ row, query }: { row: Row; query: string }) {
  if (row.kind === 'inside') {
    const label = row.match.kind === 'subtask' ? 'Sub-task' : 'Note';
    const snippet = snippetAround(row.match.text, query.trim());
    return (
      <div className="command-k-item-title">
        {label} — &quot;<Highlight text={snippet} query={query} />&quot;
      </div>
    );
  }
  return (
    <div className="command-k-item-title">
      <Highlight text={row.task.title} query={query} />
    </div>
  );
}

function RowMeta({
  row,
  query,
  keyResults,
}: {
  row: Row;
  query: string;
  keyResults: KeyResult[];
}) {
  if (row.kind === 'completed') {
    // Legacy tasks can lack completedAt — fall back so "Finished" always
    // carries a date.
    const finishedIso = row.task.completedAt ?? row.task.updatedAt ?? row.task.createdAt;
    return (
      <MetaLine
        segments={[
          `Finished ${formatDayMonth(finishedIso)}`,
          `${row.task.completedPomodoros} ${row.task.completedPomodoros === 1 ? 'pomodoro' : 'pomodoros'}`,
        ]}
      />
    );
  }
  if (row.kind === 'inside') {
    const { parent } = row.match;
    const context = parent.isCompleted
      ? `completed ${formatWeekday(parent.completedAt)}`
      : parent.bucket
        ? BUCKET_LABELS[parent.bucket]
        : null;
    return (
      <MetaLine
        segments={[
          <>
            in <Highlight text={parent.title} query={query} />
          </>,
          context,
        ]}
      />
    );
  }
  const task = row.task;
  const kr = keyResults.find(k => k.id === task.keyResultId);
  const todos = task.todos || [];
  return (
    <MetaLine
      segments={[
        task.bucket ? BUCKET_LABELS[task.bucket] : null,
        task.category ? EISENHOWER_META[task.category].label : null,
        <Highlight text={kr ? kr.title : 'no key result'} query={query} />,
        todos.length > 0
          ? `${todos.filter(t => t.completed).length}/${todos.length}`
          : null,
      ]}
    />
  );
}

function RowAction({
  row,
  selected,
  onStart,
  onReopen,
  onClose,
}: {
  row: Row;
  selected: boolean;
  onStart?: (task: PomodoroTask) => void;
  onReopen?: (task: PomodoroTask) => void;
  onClose: () => void;
}) {
  if (row.kind === 'completed') {
    if (!onReopen) return null;
    return (
      <button
        className="command-k-reopen-link"
        title="Reopen task"
        onClick={e => {
          e.stopPropagation();
          onReopen(row.task);
        }}
      >
        Reopen
      </button>
    );
  }
  if (row.kind !== 'open' || !selected || !onStart) return null;
  // The Start pill exists only on the highlighted row.
  return (
    <button
      className="command-k-start-btn"
      title="Start focus timer with this task"
      onClick={e => {
        e.stopPropagation();
        onStart(row.task);
        onClose();
      }}
    >
      <Play size={11} fill="currentColor" />
      <span>Start</span>
    </button>
  );
}
