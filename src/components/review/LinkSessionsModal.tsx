import { useMemo, useState } from 'react';
import { Link2, X } from 'lucide-react';
import type { KeyResult, Objective } from '../../lib/okr-storage';
import { assignTaskKeyResults, type DailyRecord, type PomodoroTask } from '../../lib/pomodoro-storage';
import { Select } from '../shared/Select';

// The step-1 banner's promise: assign the tasks behind this week's unlinked
// sessions to key results, and the derived numbers recompute (task-level
// linking only — sessions keep their taskId attribution, ADR-0019).

const NONE = '__none__'; // the custom Select can't take an empty-string value

export interface LinkSessionsModalProps {
  weekStart: string;
  weekEnd: string;
  cycleId: string;
  tasks: PomodoroTask[];
  history: DailyRecord[];
  keyResults: KeyResult[];
  objectives: Objective[];
  onClose: () => void;
  onLinked: () => void;
}

export default function LinkSessionsModal({
  weekStart, weekEnd, cycleId, tasks, history, keyResults, objectives,
  onClose, onLinked,
}: LinkSessionsModalProps) {
  const krIds = useMemo(() => {
    const objIds = new Set(objectives.filter(o => o.cycleId === cycleId).map(o => o.id));
    return new Set(keyResults.filter(kr => objIds.has(kr.objectiveId)).map(kr => kr.id));
  }, [keyResults, objectives, cycleId]);

  const cycleKrs = useMemo(
    () => keyResults.filter(kr => krIds.has(kr.id)),
    [keyResults, krIds],
  );

  // Unlinked sessions grouped by task: no task at all (not assignable) vs a
  // task whose key result is missing or belongs to another cycle.
  const groups = useMemo(() => {
    const taskById = new Map(tasks.map(t => [t.id, t]));
    const byTask = new Map<string, { task: PomodoroTask | null; sessions: number; minutes: number }>();
    let noTaskCount = 0;
    for (const day of history) {
      if (day.date < weekStart || day.date > weekEnd) continue;
      for (const s of day.sessions) {
        if (s.type !== 'focus' || !s.completed) continue;
        const task = s.taskId ? taskById.get(s.taskId) : undefined;
        if (task?.keyResultId && krIds.has(task.keyResultId)) continue; // linked
        const key = task?.id ?? '';
        const entry = byTask.get(key) ?? { task: task ?? null, sessions: 0, minutes: 0 };
        entry.sessions += 1;
        // Session timestamps normalize to '' when missing; Date('') is NaN,
        // which would render as "NaNm". Only count computable durations.
        const startMs = new Date(s.startedAt).getTime();
        const endMs = new Date(s.endedAt).getTime();
        if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
          entry.minutes += Math.round((endMs - startMs) / 60000);
        }
        byTask.set(key, entry);
        if (!task) noTaskCount += 1;
      }
    }
    return {
      assignable: [...byTask.values()].filter(g => g.task !== null),
      unassignableSessions: noTaskCount,
    };
  }, [history, tasks, krIds, weekStart, weekEnd]);

  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const assignableCount = groups.assignable.reduce((n, g) => n + g.sessions, 0);
  const hasSelection = Object.values(assignments).some(Boolean);

  const handleSave = async () => {
    setSaving(true);
    try {
      // In-place per-task writes (rule 11) — a snapshot save here would wipe
      // tasks created after ReviewApp loaded its state.
      await assignTaskKeyResults(assignments);
      onLinked();
    } catch (err) {
      // Persistence rule 3: non-fatal, but never silent.
      console.error('link-sessions save failed', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="prioritize-overlay confirm-modal-overlay" onClick={onClose} style={{ zIndex: 2000 }}>
      <div className="prioritize-modal confirm-modal rw-link-modal" onClick={e => e.stopPropagation()}>
        <div className="prioritize-header rw-link-header">
          <h3 className="prioritize-title"><Link2 size={16} className="icon-inline" /> Link sessions to key results</h3>
          <button type="button" className="rw-link-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p className="rw-link-intro">
          {assignableCount} session{assignableCount !== 1 ? 's' : ''} this week have no key result.
          Assign their tasks — the numbers you are about to score update immediately.
        </p>

        {groups.unassignableSessions > 0 && (
          <p className="rw-link-orphan">
            {groups.unassignableSessions} session{groups.unassignableSessions !== 1 ? 's' : ''} had no task at all and can't be linked.
          </p>
        )}

        <div className="rw-link-rows">
          {groups.assignable.map(g => (
            <div key={g.task!.id} className="rw-link-row">
              <div className="rw-link-task">
                <span className="rw-link-task-title">{g.task!.title || 'Untitled task'}</span>
                <span className="rw-link-task-sub">
                  {g.sessions} session{g.sessions !== 1 ? 's' : ''} · {g.minutes}m
                </span>
              </div>
              <div className="rw-link-picker">
                <Select
                  options={[
                    { value: NONE, label: 'Leave unlinked' },
                    ...cycleKrs.map(kr => ({ value: kr.id, label: kr.title })),
                  ]}
                  value={assignments[g.task!.id] ?? NONE}
                  onChange={val => setAssignments(prev => ({ ...prev, [g.task!.id]: val === NONE ? '' : val }))}
                  ariaLabel={`Key result for ${g.task!.title}`}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="prioritize-actions">
          <button type="button" className="btn confirm-cancel-btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn"
            disabled={!hasSelection || saving}
            onClick={handleSave}
          >
            {saving ? 'Linking…' : 'Link sessions'}
          </button>
        </div>
      </div>
    </div>
  );
}
