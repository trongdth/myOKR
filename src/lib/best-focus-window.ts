import type { DailyRecord } from './pomodoro-storage';

/** Sessions per 2-hour window before the card will crown it "best". */
const MIN_SESSIONS_PER_WINDOW = 3;
/** Total timestamped sessions in the lookback before any insight is shown. */
const MIN_TOTAL_SESSIONS = 5;
/** Lookback window: 30 calendar days ending today. */
const LOOKBACK_DAYS = 30;

export interface BestFocusWindowResult {
  /** False when the lookback holds fewer than MIN_TOTAL_SESSIONS timestamped
   *  sessions — the card shows its unlock copy and nothing else. */
  hasData: boolean;
  /** True when some window had enough sessions to be a real recommendation. */
  hasStandout: boolean;
  /** Winning window as 'HH:00–HH:00'; '' when hasStandout is false. */
  bestWindow: string;
  /** Winning window's completion rate, 0–100. */
  rate: number;
  /** Sessions started inside the winning window (the sample behind `rate`). */
  sessionCount: number;
  insight: string;
}

interface WindowStats {
  startH: number;
  started: number;
  completed: number;
}

/**
 * BEST TIME TO FOCUS card math (Analytics screen).
 *
 * Sessions started within the last 30 calendar days are grouped into 2-hour
 * windows. A window qualifies with >= MIN_SESSIONS_PER_WINDOW starts; the
 * winner is the highest completion rate, ties broken by most sessions started
 * (volume is the habit signal when everything ties at 100%), then earliest
 * window. `now` is injectable so tests can pin the lookback cutoff.
 */
export function computeBestFocusWindow(history: DailyRecord[], now: Date = new Date()): BestFocusWindowResult {
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (LOOKBACK_DAYS - 1));
  const cutoffMs = cutoff.getTime();
  // Calendar-day lookback: [today−29d 00:00, today+30d 00:00) — everything
  // from today counts, so late-evening sessions aren't dropped mid-evening.
  const lookbackEnd = new Date(cutoff);
  lookbackEnd.setDate(lookbackEnd.getDate() + LOOKBACK_DAYS);
  const lookbackEndMs = lookbackEnd.getTime();

  const windows = new Map<string, WindowStats>();
  let afternoonStarted = 0;
  let afternoonCompleted = 0;
  let morningStarted = 0;
  let morningCompleted = 0;
  let totalTimestamped = 0;

  for (const r of history) {
    for (const s of r.sessions || []) {
      if (!s.startedAt) continue;
      const startedMs = new Date(s.startedAt).getTime();
      if (startedMs < cutoffMs || startedMs >= lookbackEndMs) continue;
      totalTimestamped++;
      const hour = new Date(s.startedAt).getHours();
      const startH = Math.floor(hour / 2) * 2;
      const endH = startH + 2;
      const key = `${String(startH).padStart(2, '0')}:00–${String(endH).padStart(2, '0')}:00`;

      const entry = windows.get(key) || { startH, started: 0, completed: 0 };
      entry.started++;
      if (s.completed) entry.completed++;
      windows.set(key, entry);

      // "Afternoon/evening" = 16:00 onward; anything before is the other bucket.
      if (hour >= 16) {
        afternoonStarted++;
        if (s.completed) afternoonCompleted++;
      } else {
        morningStarted++;
        if (s.completed) morningCompleted++;
      }
    }
  }

  if (totalTimestamped < MIN_TOTAL_SESSIONS) {
    return {
      hasData: false,
      hasStandout: false,
      bestWindow: '',
      rate: 0,
      sessionCount: 0,
      insight: 'Complete at least 5 focus sessions to unlock completion and time-of-day insights.',
    };
  }

  const qualifying = [...windows.values()].filter(w => w.started >= MIN_SESSIONS_PER_WINDOW);
  if (qualifying.length === 0) {
    return {
      hasData: true,
      hasStandout: false,
      bestWindow: '',
      rate: 0,
      sessionCount: 0,
      insight: 'Complete a few more sessions to reveal your best focus window.',
    };
  }

  const winner = qualifying.reduce((best, w) => {
    const rate = w.completed / w.started;
    const bestRate = best.completed / best.started;
    if (rate !== bestRate) return rate > bestRate ? w : best;
    if (w.started !== best.started) return w.started > best.started ? w : best;
    return w.startH < best.startH ? w : best;
  });

  const fmt = (h: number) => `${String(h).padStart(2, '0')}:00`;
  const bestWindow = `${fmt(winner.startH)}–${fmt(winner.startH + 2)}`;

  const morningAbandonment = morningStarted > 0 ? (morningStarted - morningCompleted) / morningStarted : 0;
  const afternoonAbandonment = afternoonStarted > 0 ? (afternoonStarted - afternoonCompleted) / afternoonStarted : 0;

  // When every qualifying window is at 100%, the rate is no discriminator —
  // say so instead of dressing the volume winner up as a completion insight.
  const allPerfect = qualifying.every(w => w.completed === w.started);
  let insight: string;
  if (allPerfect) {
    insight = 'You finish what you start at any hour — this is when you start the most sessions.';
  } else if (
    winner.startH < 16 &&
    morningAbandonment > 0 &&
    afternoonAbandonment / morningAbandonment >= 1.5
  ) {
    const ratio = Math.round((afternoonAbandonment / morningAbandonment) * 10) / 10;
    insight = `Sessions started after 16:00 are abandoned ${ratio}x as often.`;
  } else {
    insight = `You have completed ${winner.completed} of ${winner.started} sessions started in this window.`;
  }

  return {
    hasData: true,
    hasStandout: true,
    bestWindow,
    rate: Math.round((winner.completed / winner.started) * 100),
    sessionCount: winner.started,
    insight,
  };
}
