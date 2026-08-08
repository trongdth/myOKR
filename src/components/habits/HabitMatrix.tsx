import { Check, Trash2 } from 'lucide-react';
import {
  buildHabitWeekMatrix,
  getMondayOf,
  parseDateKey,
  type Habit,
  type HabitStatus,
} from '../../lib/habit-storage';
import { getLocalDateString } from '../../lib/pomodoro-storage';
import { habitAccentClass } from './habit-accent';

/** Monday-start weeks whose Monday..Sunday window overlaps `monthKey` ('YYYY-MM-01'). */
function getMonthWeekStarts(monthKey: string): string[] {
  const [y, m1] = monthKey.split('-').map(Number); // month key is 1-indexed
  const first = new Date(y, m1 - 1, 1);
  const lastDay = new Date(y, m1, 0).getDate();
  const starts: string[] = [];
  let cursor = getMondayOf(first);
  while (cursor.getTime() <= new Date(y, m1 - 1, lastDay).getTime()) {
    starts.push(getLocalDateString(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7);
  }
  return starts;
}

interface HabitMatrixProps {
  habits: Habit[];
  view: 'week' | 'month';
  todayStr: string;
  onToggleTick: (habitId: string, dateStr: string) => void;
  onUpdateStatus: (habitId: string, status: HabitStatus) => void;
  onDelete: (habitId: string) => void;
}

/**
 * The weekly completion matrix — HABIT | Mon..Sun | STREAK. Always shows the
 * current period (no in-card navigation): week view renders one Mon–Sun block;
 * month view stacks one block per week of the current month. Cells: completed =
 * solid habit-accent with ✓, pending = dark with border, future = dashed +
 * faded. Past/today cells toggle, future cells are inert.
 */
export default function HabitMatrix({
  habits,
  view,
  todayStr,
  onToggleTick,
  onUpdateStatus,
  onDelete,
}: HabitMatrixProps) {
  const weekStarts =
    view === 'week'
      ? [getLocalDateString(getMondayOf(parseDateKey(todayStr)))]
      : getMonthWeekStarts(`${todayStr.slice(0, 7)}-01`);
  const matrices = weekStarts.map((weekStart) => buildHabitWeekMatrix(habits, weekStart, todayStr));

  if (habits.length === 0) {
    return (
      <div className="habit-matrix">
        <div className="habit-matrix-empty">
          No habits yet — add one with <strong>+ New habit</strong> or pick a suggestion below.
        </div>
      </div>
    );
  }

  return (
    <div className="habit-matrix">
      <div className="habit-matrix-table" role="table" aria-label="Weekly habit completion">
        <div className="habit-matrix-head" role="row">
          <span className="habit-matrix-head-cell habit-head-habit">HABIT</span>
          {matrices[0].days.map((day) => (
            <span key={day.date} className="habit-matrix-head-cell habit-head-day" role="columnheader">
              <span className="habit-head-day-label">{day.weekdayLabel}</span>
            </span>
          ))}
          <span className="habit-matrix-head-cell habit-head-streak">STREAK</span>
        </div>
        {matrices.map((matrix) => (
          <div key={matrix.weekStart} className="habit-matrix-week">
            <div className="habit-matrix-daynums" aria-hidden="true">
              <span />
              {matrix.days.map((day) => (
                <span key={day.date} className={`habit-matrix-daynum${day.isToday ? ' today' : ''}`}>
                  {day.dayOfMonth}
                </span>
              ))}
              <span />
            </div>
            {matrix.rows.map((row) => (
              <div
                key={`${matrix.weekStart}-${row.habitId}`}
                className={`habit-row ${habitAccentClass(row.habitId)}`}
                role="row"
              >
                <div className="habit-row-name-cell" role="cell">
                  <span className="habit-dot" aria-hidden="true" />
                  <span className="habit-row-text">
                    <span className="habit-name">{row.name}</span>
                    <span className="habit-sub">Every day</span>
                  </span>
                  <span className="habit-row-actions">
                    <select
                      className="habit-status-select"
                      value={row.status}
                      aria-label={`Status of ${row.name}`}
                      onChange={(e) => onUpdateStatus(row.habitId, e.target.value as HabitStatus)}
                    >
                      <option value="want_to_form">Want to form</option>
                      <option value="in_progress">In progress</option>
                      <option value="formed">Formed</option>
                    </select>
                    <button
                      type="button"
                      className="habit-delete-btn"
                      title={`Delete ${row.name}`}
                      onClick={() => onDelete(row.habitId)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                </div>
                {row.cells.map((cell) => (
                  <button
                    key={cell.date}
                    type="button"
                    className={`habit-cell ${cell.state}${cell.date === todayStr ? ' today' : ''}`}
                    title={cell.date}
                    disabled={cell.state === 'future'}
                    onClick={() => onToggleTick(row.habitId, cell.date)}
                  >
                    {cell.state === 'completed' && <Check size={16} strokeWidth={3} aria-hidden="true" />}
                  </button>
                ))}
                <span className="habit-streak-cell" role="cell">
                  {row.streakCurrent} {row.streakCurrent === 1 ? 'day' : 'days'}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
