import { PenLine } from 'lucide-react';
import type { ReviewPrompt } from '../../lib/okr-storage';

// Step 3 — Reflect: up to three prompts drawn from what actually happened
// (at-risk streak, biggest positive mover, One change — CONTEXT.md: Reflect).
// Answers autosave into the structured prompts array; the legacy free-text
// `reflection` field is never written.

export default function ReflectStep({
  prompts,
  onChange,
  readOnly = false,
  moverDelta,
}: {
  prompts: ReviewPrompt[];
  onChange: (promptId: string, answer: string) => void;
  readOnly?: boolean;
  moverDelta?: number;
}) {
  return (
    <div className="rw-reflect">
      <div className="rw-step-heading">
        <h2>What do you want to remember about this week?</h2>
        <p>Three prompts, drawn from what actually happened. Answers autosave.</p>
      </div>

      <div className="rw-prompt-rows">
        {prompts.map(prompt => (
          <div key={prompt.id} className="rw-prompt-row">
            <div className="rw-prompt-head">
              <span className="rw-prompt-text">{prompt.text}</span>
              {prompt.type === 'one_change' && (
                <span className="rw-prompt-chip">Surfaces in next week's review</span>
              )}
              {prompt.type === 'mover' && moverDelta != null && moverDelta > 0 && (
                <span className="rw-prompt-chip">+{moverDelta} this week</span>
              )}
              {prompt.type === 'at_risk' && <span className="rw-prompt-chip rw-prompt-chip-risk">at risk</span>}
            </div>
            <textarea
              className="rw-prompt-textarea"
              value={prompt.answer}
              onChange={e => onChange(prompt.id, e.target.value)}
              placeholder={prompt.type === 'one_change'
                ? 'One sentence is enough.'
                : prompt.type === 'at_risk'
                  ? 'Name the blocker — or drop what keeps carrying over.'
                  : 'What happened, in your own words?'}
              rows={prompt.type === 'one_change' ? 2 : 3}
              aria-label={prompt.text}
              readOnly={readOnly}
            />
          </div>
        ))}
      </div>

      <div className="rw-reflect-footnote">
        <PenLine size={13} className="icon-inline" /> Answers autosave — finish the review when you're ready.
      </div>
    </div>
  );
}
