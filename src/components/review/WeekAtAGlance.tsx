import { Link } from 'lucide-react';
import type { WeekGlance, KrMovesResult, UnlinkedSummary } from '../../lib/review-insights';

// Step 1 — Week at a glance: a read-only recap of the selected week. Nothing
// here takes input (CONTEXT.md: Week at a glance).

function fmtFocus(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function DeltaChip({ value, unit }: { value: number; unit?: string }) {
  if (value > 0) return <span className="rw-delta rw-delta-pos">+{value}{unit}</span>;
  if (value < 0) return <span className="rw-delta rw-delta-neg">−{Math.abs(value)}{unit}</span>;
  return <span className="rw-delta rw-delta-zero">0{unit}</span>;
}

export default function WeekAtAGlance({
  glance,
  moves,
  commitment,
  unlinked,
  showLinkBanner,
  onLinkSessions,
}: {
  glance: WeekGlance;
  moves: KrMovesResult;
  commitment: string | null;
  unlinked: UnlinkedSummary;
  showLinkBanner: boolean;
  onLinkSessions?: () => void;
}) {
  const maxDay = Math.max(1, ...glance.sessionsPerDay.map(d => d.sessions));
  const missedLabel = glance.habitsMissedWeekdays.length === 0
    ? 'Every day ticked'
    : `Missed ${glance.habitsMissedWeekdays.join(' and ')}`;

  return (
    <div className="rw-glance">
      <div className="rw-step-heading">
        <h2>Here is the week you just had</h2>
        <p>Read it, then score your key results. Nothing on this step needs input.</p>
      </div>

      <div className="rw-stat-cards">
        <div className="rw-stat-card">
          <span className="rw-stat-label">Sessions</span>
          <span className="rw-stat-value">
            {glance.sessions}
            {glance.sessions !== glance.sessionsPrevWeek && (
              <DeltaChip value={glance.sessions - glance.sessionsPrevWeek} />
            )}
          </span>
          <span className="rw-stat-sub">vs {glance.sessionsPrevWeek} last week</span>
        </div>
        <div className="rw-stat-card">
          <span className="rw-stat-label">Focus time</span>
          <span className="rw-stat-value">
            {fmtFocus(glance.focusMinutes).split(' ').map((part, i) => (
              <span key={i}>{i > 0 && ' '}<span className="rw-stat-unit">{part.replace(/\d/g, '')}</span>{part.replace(/\D/g, '')}</span>
            ))}
          </span>
          <span className="rw-stat-sub">{fmtFocus(glance.avgFocusMinutesPerDay)} a day</span>
        </div>
        <div className="rw-stat-card">
          <span className="rw-stat-label">Tasks done</span>
          <span className="rw-stat-value">
            {glance.tasksDone} <span className="rw-stat-of">of {glance.tasksTotal}</span>
          </span>
          <span className="rw-stat-sub">{glance.tasksCarried} carried to next week</span>
        </div>
        <div className="rw-stat-card">
          <span className="rw-stat-label">Habits</span>
          <span className="rw-stat-value">
            {glance.habitsPct !== null ? <><span className="rw-stat-unit">%</span>{glance.habitsPct}</> : '—'}
          </span>
          <span className="rw-stat-sub">{glance.habitsPct !== null ? missedLabel : 'No habits yet'}</span>
        </div>
      </div>

      <div className="rw-glance-columns">
        <div className="rw-panel">
          <span className="rw-panel-title">Sessions per day</span>
          <div className="rw-bars" role="img" aria-label={`Sessions per day: ${glance.sessionsPerDay.map(d => `${d.weekday} ${d.sessions}`).join(', ')}`}>
            {glance.sessionsPerDay.map(d => (
              <div key={d.weekday} className="rw-bar-col" title={`${d.weekday}: ${d.sessions} session${d.sessions === 1 ? '' : 's'}`}>
                <span className="rw-bar-count">{d.sessions > 0 ? d.sessions : ''}</span>
                <div className="rw-bar-track">
                  <div className="rw-bar-fill" style={{ height: `${Math.round((d.sessions / maxDay) * 100)}%` }} />
                </div>
                <span className="rw-bar-label">{d.weekday}</span>
              </div>
            ))}
          </div>
          {glance.insight.length > 0 && (
            <p className="rw-insight">{glance.insight.join(' ')}</p>
          )}
        </div>

        <div className="rw-panel">
          <span className="rw-panel-title">Key results that moved</span>
          {moves.moves.length === 0 ? (
            <p className="rw-panel-empty">No key result activity this week yet.</p>
          ) : (
            <div className="rw-moved-rows">
              {moves.moves.map(m => (
                <div key={m.keyResultId} className="rw-moved-row">
                  <span className="rw-moved-title">{m.title}</span>
                  <DeltaChip value={m.delta} />
                </div>
              ))}
            </div>
          )}
          {moves.othersNoSessions > 0 && (
            <p className="rw-panel-footnote">
              {moves.othersNoSessions} other key result{moves.othersNoSessions !== 1 ? 's had' : ' had'} no linked sessions this week.
            </p>
          )}
        </div>
      </div>

      {commitment && (
        <div className="rw-commitment">
          Last week you committed to: <strong>{commitment}</strong>
        </div>
      )}

      {showLinkBanner && unlinked.unlinked > 0 && (
        <div className="rw-link-banner">
          <p>
            {unlinked.unlinked} of {unlinked.totalSessions} sessions were not linked to a key result.
            Linking them takes about a minute and changes the numbers you are about to score.
          </p>
          <button type="button" className="rw-link-btn" onClick={onLinkSessions}>
            <Link size={14} className="icon-inline" /> Link sessions
          </button>
        </div>
      )}
    </div>
  );
}
