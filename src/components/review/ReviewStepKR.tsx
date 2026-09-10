import { useState } from 'react';
import type { Confidence, ReviewEntry, KeyResult, Objective } from '../../lib/okr-storage';
import { CONFIDENCE_META } from '../../lib/okr-storage';
import { PenLine, Target } from 'lucide-react';
import NumberInput from '../NumberInput';
import { LinkedTasksList, LinkedTasksTrigger, type TaskPomo } from './LinkedTasksThisWeek';

// One key result inside Score key results (step 2) — a compact row, not a
// card (grilling round 4: a card per KR cost ~850px). Line 1 carries the
// objective eyebrow, the name, the delta, the value box and `/ target`;
// line 2 the Confidence chips and the row's secondary controls.

export interface ScoreRow {
  entry: ReviewEntry;
  keyResult: KeyResult;
  objective: Objective;
  linkedTasksThisWeek: TaskPomo[];
  atRiskWeeksRunning: number; // 0 = no streak
}

const CONFIDENCE_OPTIONS: Confidence[] = ['on_track', 'at_risk', 'off_track'];

function DeltaChip({ entry }: { entry: ReviewEntry }) {
  const delta = Math.round((entry.currentValue - entry.previousValue) * 100) / 100;
  if (delta > 0) return <span className="rw-delta rw-delta-pos">+{delta} this week</span>;
  if (delta < 0) return <span className="rw-delta rw-delta-neg">−{Math.abs(delta)} this week</span>;
  return <span className="rw-delta rw-delta-zero">no change</span>;
}

export default function ReviewStepKR({
  row,
  onChange,
}: {
  row: ScoreRow;
  onChange: (updated: ReviewEntry) => void;
}) {
  const { entry, keyResult, objective, linkedTasksThisWeek, atRiskWeeksRunning } = row;
  const isManual = keyResult.completionMode === 'manual' || !keyResult.completionMode;
  // An unscored row is the one still to act on — R2 recesses it (round 4).
  const unscored = entry.confidence === 'not_set';
  // The row's two disclosures, both collapsed to start (a row's note is the
  // user's own text, but step 2 is about scoring — the toggle reads "Note"
  // when one exists, so it is never hidden by accident).
  const hasNote = !!entry.note?.trim();
  const [noteOpen, setNoteOpen] = useState(false);
  const [linkedOpen, setLinkedOpen] = useState(false);

  return (
    <div className="review-kr-step">
      <div className="rw-kr-line1">
        <span className="rw-kr-objective">
          <Target size={11} className="icon-inline" /> {objective.title}
        </span>
        <span className={`rw-kr-name${unscored ? ' muted' : ''}`}>{keyResult.title}</span>
        <div className="rw-kr-figures">
          <DeltaChip entry={entry} />
          {isManual ? (
            <NumberInput
              className="rw-kr-value-input"
              value={entry.currentValue}
              min={0}
              onChange={val => onChange({ ...entry, currentValue: val })}
            />
          ) : (
            /* Derived KRs stay read-only (ADR-0019 decision 3): the box looks
               like the input; the label says where the number came from. */
            <span
              className="rw-kr-value-auto"
              title="Computed from your tasks"
              aria-label={`Computed from your tasks: ${entry.currentValue}`}
            >
              {entry.currentValue}
            </span>
          )}
          <span className="rw-kr-target">/ {keyResult.targetValue}</span>
        </div>
      </div>

      <div className="rw-kr-controls">
        <div className="review-confidence-group" role="group" aria-label={`Confidence for ${keyResult.title}`}>
          {CONFIDENCE_OPTIONS.map(c => {
            const meta = CONFIDENCE_META[c];
            const cls = c.replace('_', '-');
            return (
              <button
                key={c}
                type="button"
                className={`review-confidence-btn ${cls}${entry.confidence === c ? ' selected' : ''}`}
                aria-pressed={entry.confidence === c}
                onClick={() => onChange({ ...entry, confidence: c })}
              >
                <span className="confidence-dot" style={{ background: meta.color }} /> {meta.label}
              </button>
            );
          })}
        </div>

        <div className="rw-kr-extras">
          {/* Pomodoro insight — only show when there's activity */}
          {linkedTasksThisWeek.length > 0 && (
            <LinkedTasksTrigger
              linkedTasksThisWeek={linkedTasksThisWeek}
              expanded={linkedOpen}
              onToggle={() => setLinkedOpen(o => !o)}
            />
          )}
          <button
            type="button"
            className="rw-kr-note-toggle"
            aria-expanded={noteOpen}
            onClick={() => setNoteOpen(o => !o)}
          >
            <PenLine size={13} className="icon-inline" /> {hasNote || noteOpen ? 'Note' : 'Add note'}
          </button>
        </div>
      </div>

      {linkedOpen && linkedTasksThisWeek.length > 0 && (
        <LinkedTasksList linkedTasksThisWeek={linkedTasksThisWeek} />
      )}

      {/* The streak warning follows the row's own content (R2's placement). */}
      {atRiskWeeksRunning > 0 && (
        <div className="rw-risk-banner">
          Flagged at risk {atRiskWeeksRunning} weeks running.
        </div>
      )}

      {noteOpen && (
        <textarea
          className="review-notes-textarea"
          value={entry.note || ''}
          onChange={e => onChange({ ...entry, note: e.target.value })}
          placeholder="What progress did you make? What's blocking you?"
          aria-label={`Note for ${keyResult.title}`}
          rows={2}
        />
      )}
    </div>
  );
}
