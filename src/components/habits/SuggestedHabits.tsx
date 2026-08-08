import { Plus } from 'lucide-react';

/** One-click habit templates. Daily-shaped only (habits are implicitly
 *  every-day — a weekly-only template would mislead). A chip is hidden once a
 *  habit with exactly the same name exists (exact-name dedupe). */
const SUGGESTED_HABITS = [
  'Inbox to zero',
  'Walk 8,000 steps',
  'Lights out by 23:00',
  'Plan tomorrow before closing',
];

interface SuggestedHabitsProps {
  existingNames: string[];
  onAdd: (name: string) => void;
}

export default function SuggestedHabits({ existingNames, onAdd }: SuggestedHabitsProps) {
  const existing = new Set(existingNames);
  const chips = SUGGESTED_HABITS.filter((name) => !existing.has(name));

  return (
    <div className="suggested-habits">
      <div className="suggested-title">SUGGESTED — ONE CLICK TO ADD</div>
      {chips.length === 0 ? (
        <div className="suggested-none">All suggested habits are already added.</div>
      ) : (
        <div className="suggested-chips">
          {chips.map((name) => (
            <button
              key={name}
              type="button"
              className="suggested-chip"
              onClick={() => onAdd(name)}
            >
              <Plus size={13} aria-hidden="true" />
              {name}
            </button>
          ))}
        </div>
      )}
      <div className="suggested-footer">
        A habit needs a cue and a size you can't fail at. Two or three is plenty — the
        empty state offers these instead of a blank field.
      </div>
    </div>
  );
}
