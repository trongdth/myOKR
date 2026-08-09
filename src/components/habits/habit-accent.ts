/**
 * Stable per-habit accent, derived from the habit id and drawn from existing
 * tokens — no category field exists on Habit (implicit every-day scheduling),
 * so the palette is presentation-only. The same id always maps to the same
 * accent; a future stored category field would replace this derivation.
 * Palette (see docs/design-system.md — Habits tracker section): green, violet,
 * emerald, orange. Cyan (primary action), amber (streaks) and rose (risk) are
 * excluded because their tokens carry reserved semantics.
 */
export function habitAccentClass(habitId: string): string {
  let hash = 0;
  for (let i = 0; i < habitId.length; i++) {
    hash = (hash * 31 + habitId.charCodeAt(i)) >>> 0;
  }
  return `habit-accent-${hash % 4}`;
}
