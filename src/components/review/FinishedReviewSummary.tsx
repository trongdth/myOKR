import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { CONFIDENCE_META } from '../../lib/okr-storage';
import type { ReviewEntry, KeyResult, Objective, ReviewPrompt } from '../../lib/okr-storage';
import type { WeekGlance, UnlinkedSummary } from '../../lib/review-insights';
import { fmtFocus } from './WeekAtAGlance';

// The Finished review summary (CONTEXT.md): a completed review rendered as
// one stacked page — Key results as scored, Reflection, Where the pomodoros
// went. Nothing here is interactive except the row expander; the step
// markers live outside this component.

export interface SummaryRow {
  entry: ReviewEntry;
  keyResult: KeyResult;
  objective: Objective;
}

const VISIBLE_ROWS = 3;

function SummaryDelta({ entry }: { entry: ReviewEntry }) {
  const delta = Math.round((entry.currentValue - entry.previousValue) * 100) / 100;
  if (delta > 0) return <span className="rw-delta rw-delta-pos">+{delta} that week</span>;
  if (delta < 0) return <span className="rw-delta rw-delta-neg">−{Math.abs(delta)} that week</span>;
  return <span className="rw-delta rw-delta-zero">no change</span>;
}

export default function FinishedReviewSummary({
  rows,
  prompts,
  glance,
  unlinked,
}: {
  rows: SummaryRow[];
  prompts: ReviewPrompt[];
  glance: WeekGlance;
  unlinked: UnlinkedSummary;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, VISIBLE_ROWS);
  const scoredCount = rows.filter(r => r.entry.confidence !== 'not_set').length;
  const linkedPct = unlinked.totalSessions > 0
    ? Math.round((unlinked.linkedToCycle / unlinked.totalSessions) * 100)
    : 0;

  return (
    <div className="rw-summary">
      <div className="rw-summary-head">
        <h2>Your review</h2>
        <span className="rw-summary-readonly">Read-only</span>
      </div>

      <div className="rw-panel rw-summary-panel">
        <div className="rw-summary-panel-head">
          <span className="rw-panel-title">Key results as scored</span>
          <span className="rw-summary-count">{scoredCount} of {rows.length}</span>
        </div>
        {rows.length === 0 ? (
          <p className="rw-panel-empty">This cycle has no key results.</p>
        ) : (
          <>
            <div className="rw-summary-table" role="table" aria-label="Key results as scored">
              <div className="rw-summary-headrow" role="row">
                <span role="columnheader">Key result</span>
                <span role="columnheader">Value</span>
                <span role="columnheader">Change</span>
                <span role="columnheader">Confidence</span>
              </div>
              {visible.map(({ entry, keyResult }) => {
                const meta = CONFIDENCE_META[entry.confidence];
                return (
                  <div key={keyResult.id} className="rw-summary-row" role="row">
                    <span className="rw-summary-kr" role="cell">{keyResult.title}</span>
                    <span className="rw-summary-value" role="cell">
                      {entry.currentValue} <span className="rw-summary-target">/ {keyResult.targetValue}</span>
                    </span>
                    <span role="cell"><SummaryDelta entry={entry} /></span>
                    <span role="cell">
                      <span className="rw-conf-chip" style={{ color: meta.color, background: meta.bgColor }}>
                        {meta.label}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
            {rows.length > VISIBLE_ROWS && (
              <button type="button" className="rw-summary-more" onClick={() => setExpanded(e => !e)}>
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {expanded ? 'Show fewer key results' : `Show ${rows.length - VISIBLE_ROWS} more key results`}
              </button>
            )}
          </>
        )}
      </div>

      <div className="rw-panel rw-summary-panel">
        <span className="rw-panel-title">Reflection</span>
        {prompts.length === 0 ? (
          <p className="rw-panel-empty">No prompts in this review.</p>
        ) : (
          <div className="rw-summary-qa">
            {prompts.map(prompt => (
              <div key={prompt.id} className="rw-summary-qa-row">
                <span className="rw-summary-q">{prompt.text}</span>
                <p className={`rw-summary-a${prompt.answer.trim() ? '' : ' empty'}`}>
                  {prompt.answer.trim() || 'No answer'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rw-panel rw-summary-panel rw-pomo-panel">
        <div className="rw-summary-panel-head">
          <span className="rw-panel-title">Where the pomodoros went</span>
          <span className="rw-summary-count">{glance.sessions} sessions · {fmtFocus(glance.focusMinutes)}</span>
        </div>
        <div className="rw-pomo-bar" aria-hidden="true">
          <div className="rw-pomo-bar-fill" style={{ width: `${linkedPct}%` }} />
        </div>
        <div className="rw-pomo-split">
          <div className="rw-pomo-split-cell">
            <span className="rw-pomo-split-label">Linked to this cycle's KRs</span>
            <span className="rw-pomo-split-num">{unlinked.linkedToCycle}</span>
          </div>
          <div className="rw-pomo-split-cell">
            <span className="rw-pomo-split-label">Unlinked or other cycles</span>
            <span className="rw-pomo-split-num">{unlinked.unlinked}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
