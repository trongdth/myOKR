import { useState } from 'react';
import { Gift } from 'lucide-react';
import type { CompletionMode } from '../../lib/okr-storage';
import { useKrDraft, normalizeKrDraft, KrDraftControls } from './KrDraftControls';

export interface NewObjectiveDraft {
  title: string;
  reward?: string;
  kr: {
    title: string;
    mode: CompletionMode;
    targetValue: number;
    currentValue: number;
  };
}

interface Props {
  onCreate: (draft: NewObjectiveDraft) => void;
  onCancel: () => void;
}

/**
 * P7 inline creation form — inserted at the top of the objectives list by the
 * header's "+ New objective" button. Always creates in the cycle the screen is
 * viewing (no cycle picker — the header selector scopes the list). Only the
 * explicit Create button writes; Esc/Cancel discard.
 */
export default function NewObjectiveForm({ onCreate, onCancel }: Props) {
  const [title, setTitle] = useState('');
  const [reward, setReward] = useState('');
  const [krTitle, setKrTitle] = useState('');
  const krDraft = useKrDraft('manual');

  const isValid = title.trim() !== '' && krTitle.trim() !== '';

  const submit = () => {
    if (!isValid) return;
    const { targetValue, currentValue } = normalizeKrDraft(krDraft);
    onCreate({
      title: title.trim(),
      reward: reward.trim() || undefined,
      kr: {
        title: krTitle.trim(),
        mode: krDraft.mode as CompletionMode,
        targetValue,
        currentValue,
      },
    });
  };

  return (
    <div
      className="okr-new-obj-form"
      onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}
    >
      {/* Row 1: dot + objective name */}
      <div className="okr-new-obj-row">
        <span className="objective-dot" aria-hidden="true" />
        <input
          type="text"
          className="okr-new-obj-title-input"
          placeholder="e.g. Grow the design practice"
          value={title}
          autoFocus
          onChange={e => setTitle(e.target.value)}
        />
      </div>

      {/* Row 2: reward */}
      <div className="okr-new-obj-row okr-new-obj-field-row">
        <span className="okr-form-label">Reward</span>
        <div className="okr-new-obj-reward-wrap">
          <Gift size={14} className="okr-new-obj-reward-icon" />
          <input
            type="text"
            placeholder="Something you'll actually want"
            value={reward}
            onChange={e => setReward(e.target.value)}
          />
        </div>
        <span className="okr-form-optional-tag">optional</span>
      </div>

      {/* Row 3: first key result */}
      <div className="okr-new-obj-row okr-new-obj-field-row">
        <span className="okr-form-label">First key result</span>
        <input
          type="text"
          className="okr-new-obj-kr-input"
          placeholder="Key result name"
          value={krTitle}
          onChange={e => setKrTitle(e.target.value)}
        />
        <KrDraftControls draft={krDraft} />
      </div>

      {/* Row 4: actions + validation */}
      <div className="okr-new-obj-row okr-new-obj-actions">
        <button
          className="okr-new-obj-create-btn"
          disabled={!isValid}
          onClick={submit}
        >
          Create objective
        </button>
        <button className="okr-new-obj-cancel-btn" onClick={onCancel}>
          Cancel
        </button>
        {!isValid && (
          <span className="okr-new-obj-hint">Needs a name and one key result</span>
        )}
      </div>
    </div>
  );
}
