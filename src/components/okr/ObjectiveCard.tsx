import { useState, useEffect, useRef } from 'react';
import { ChevronRight, X, Gift, Trophy, Lock, Plus } from 'lucide-react';
import type { Objective, KeyResult, OKRCycle } from '../../lib/okr-storage';
import { computeObjectiveProgress, COMPLETION_MODE_META, COMPLETION_MODE_HELPER } from '../../lib/okr-storage';
import { generateId } from '../../lib/pomodoro-storage';
import type { PomodoroTask } from '../../lib/pomodoro-storage';
import type { Habit } from '../../lib/habit-storage';
import KeyResultRow from './KeyResultRow';
import { useKrDraft, normalizeKrDraft, KrDraftControls } from './KrDraftControls';

interface Props {
  objective: Objective;
  keyResults: KeyResult[];
  tasks: PomodoroTask[];
  focusDurationMinutes: number;
  onUpdateObjective: (updated: Objective) => void;
  onDeleteObjective: (id: string) => void;
  onUpdateKeyResult: (updated: KeyResult) => void;
  onDeleteKeyResult: (id: string) => void;
  onAddKeyResult: (kr: KeyResult) => void;
  habits: Habit[];
  objectives: Objective[];
  cycles: OKRCycle[];
}

export default function ObjectiveCard({
  objective,
  keyResults,
  tasks,
  focusDurationMinutes,
  onUpdateObjective,
  onDeleteObjective,
  onUpdateKeyResult,
  onDeleteKeyResult,
  onAddKeyResult,
  habits,
  objectives,
  cycles
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(objective.title);
  const [editingReward, setEditingReward] = useState(false);
  const [rewardDraft, setRewardDraft] = useState(objective.reward || '');
  const rewardEscRef = useRef(false);
  const [showAddKR, setShowAddKR] = useState(false);
  const [newKRTitle, setNewKRTitle] = useState('');
  const newKR = useKrDraft('manual');
  const addKRInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRewardDraft(objective.reward || '');
  }, [objective.reward]);

  const saveReward = () => {
    const r = rewardDraft.trim();
    onUpdateObjective({ ...objective, reward: r || undefined });
    setEditingReward(false);
  };

  const cancelEditReward = () => {
    setRewardDraft(objective.reward || '');
    setEditingReward(false);
  };

  const objKRs = keyResults
    .filter(kr => kr.objectiveId === objective.id)
    .sort((a, b) => a.order - b.order);

  const progress = computeObjectiveProgress(objective.id, keyResults, tasks, focusDurationMinutes, habits, objectives, cycles);

  const saveTitle = () => {
    const t = titleDraft.trim();
    if (t && t !== objective.title) {
      onUpdateObjective({ ...objective, title: t });
    }
    setEditingTitle(false);
  };

  const collapseAddKR = () => {
    setNewKRTitle('');
    newKR.reset();
    setShowAddKR(false);
  };

  const addKR = () => {
    const title = newKRTitle.trim();
    if (!title) return;
    const { targetValue, currentValue } = normalizeKrDraft(newKR);
    const kr: KeyResult = {
      id: generateId(),
      objectiveId: objective.id,
      title,
      targetValue,
      currentValue,
      unit: COMPLETION_MODE_META[newKR.mode].unit,
      confidence: 'not_set',
      completionMode: newKR.mode,
      order: objKRs.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onAddKeyResult(kr);
    setNewKRTitle('');
    newKR.reset();
    addKRInputRef.current?.focus();
  };

  const rewardUnlocked = progress === 100;

  return (
    <div className="objective-card">
      {/* Header — one row: chevron · dot · title ⟷ reward pill · progress · delete (P7 revamp) */}
      <div className="objective-header" onClick={() => setExpanded(!expanded)}>
        <span className={`objective-expand-icon${expanded ? ' expanded' : ''}`}><ChevronRight size={14} /></span>
        <span className="objective-dot" aria-hidden="true" />
        {editingTitle ? (
          <input
            className="objective-title-input"
            value={titleDraft}
            autoFocus
            onClick={e => e.stopPropagation()}
            onChange={e => setTitleDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
            onBlur={saveTitle}
          />
        ) : (
          <span
            className="objective-title"
            onDoubleClick={e => { e.stopPropagation(); setTitleDraft(objective.title); setEditingTitle(true); }}
            title="Double-click to edit"
          >
            {objective.title}
          </span>
        )}

        {editingReward ? (
          <input
            type="text"
            className="objective-reward-edit-input"
            value={rewardDraft}
            autoFocus
            placeholder="Something you'll actually want"
            onClick={e => e.stopPropagation()}
            onFocus={() => { rewardEscRef.current = false; }}
            onChange={e => setRewardDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') saveReward();
              if (e.key === 'Escape') { rewardEscRef.current = true; cancelEditReward(); }
            }}
            onBlur={() => {
              if (rewardEscRef.current) { rewardEscRef.current = false; return; }
              saveReward();
            }}
          />
        ) : (
          <button
            className={`objective-reward-pill${objective.reward ? '' : ' ghost'}${rewardUnlocked ? ' unlocked' : ''}`}
            onClick={e => {
              e.stopPropagation();
              setRewardDraft(objective.reward || '');
              setEditingReward(true);
            }}
            title={objective.reward ? 'Edit reward' : 'Add a reward'}
          >
            {rewardUnlocked
              ? <Trophy size={13} />
              : <Gift size={13} />}
            <span className="objective-reward-pill-text">{objective.reward || 'Add reward'}</span>
            {objective.reward && !rewardUnlocked && <Lock size={11} />}
          </button>
        )}

        <div className="objective-progress-badge">
          <div className="objective-progress-bar">
            <div className="objective-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="objective-progress-text">{progress}%</span>
        </div>
        <div className="objective-actions">
          <button
            className="objective-action-btn"
            onClick={e => { e.stopPropagation(); onDeleteObjective(objective.id); }}
            title="Delete objective"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Body: KR list + add-KR affordance (P7 revamp — reward lives in the header pill) */}
      {expanded && (
        <div className="objective-body">
          <div className="kr-list">
            {objKRs.length === 0 && (
              <div className="kr-empty-state">
                No key results yet. Add one below to make this objective measurable.
              </div>
            )}
            {objKRs.map(kr => (
              <KeyResultRow
                key={kr.id}
                kr={kr}
                tasks={tasks}
                focusDurationMinutes={focusDurationMinutes}
                onUpdate={onUpdateKeyResult}
                onDelete={onDeleteKeyResult}
                habits={habits}
                objectives={objectives}
                cycles={cycles}
              />
            ))}
          </div>

          {/* Add Key Result — collapsed text button, expands inline (P7 revamp).
              The toggle stays mounted (hidden while expanded) so its
              aria-expanded keeps announcing the state (PR #76). */}
          {showAddKR && (
            <div className="kr-add-row" id={`kr-add-row-${objective.id}`}>
              <input
                ref={addKRInputRef}
                type="text"
                placeholder="e.g. Hold 40 focus hours a month"
                value={newKRTitle}
                autoFocus
                onChange={e => setNewKRTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') addKR();
                  if (e.key === 'Escape') collapseAddKR();
                }}
              />
              <KrDraftControls draft={newKR} />
              <button className="kr-add-btn primary" disabled={!newKRTitle.trim()} onClick={addKR}>Add</button>
              <button className="kr-add-cancel-btn" onClick={collapseAddKR}>Cancel</button>
              <div className="kr-add-helper">{COMPLETION_MODE_HELPER[newKR.mode]}</div>
            </div>
          )}
          <button
            className="kr-add-toggle"
            onClick={() => setShowAddKR(true)}
            aria-expanded={showAddKR}
            aria-controls={`kr-add-row-${objective.id}`}
            hidden={showAddKR}
          >
            <Plus size={13} /> Add key result
          </button>
        </div>
      )}
    </div>
  );
}
