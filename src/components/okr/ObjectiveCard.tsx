import { useState } from 'react';
import type { Objective, KeyResult, CompletionMode } from '../../lib/okr-storage';
import { computeObjectiveProgress, COMPLETION_MODE_META } from '../../lib/okr-storage';
import { generateId } from '../../lib/pomodoro-storage';
import type { PomodoroTask } from '../../lib/pomodoro-storage';
import KeyResultRow from './KeyResultRow';

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
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(objective.title);
  const [newKRTitle, setNewKRTitle] = useState('');
  const [newKRMode, setNewKRMode] = useState<CompletionMode>('manual');

  const objKRs = keyResults
    .filter(kr => kr.objectiveId === objective.id)
    .sort((a, b) => a.order - b.order);

  const progress = computeObjectiveProgress(objective.id, keyResults, tasks, focusDurationMinutes);

  const saveTitle = () => {
    const t = titleDraft.trim();
    if (t && t !== objective.title) {
      onUpdateObjective({ ...objective, title: t });
    }
    setEditingTitle(false);
  };

  const addKR = () => {
    const title = newKRTitle.trim();
    if (!title) return;
    const mode = newKRMode;
    const kr: KeyResult = {
      id: generateId(),
      objectiveId: objective.id,
      title,
      targetValue: mode === 'focus_hours' ? 10 : mode === 'focus_pomodoros' ? 20 : mode === 'completed_tasks' ? 5 : 100,
      currentValue: 0,
      unit: COMPLETION_MODE_META[mode].unit,
      confidence: 'not_set',
      completionMode: mode,
      order: objKRs.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onAddKeyResult(kr);
    setNewKRTitle('');
  };

  return (
    <div className="objective-card">
      {/* Header */}
      <div className="objective-header" onClick={() => setExpanded(!expanded)}>
        <span className={`objective-expand-icon${expanded ? ' expanded' : ''}`}>▶</span>
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
            🎯 {objective.title}
          </span>
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
            ✕
          </button>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="objective-body">
          {/* Key Results */}
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
              />
            ))}
          </div>

          {/* Add Key Result */}
          <div className="kr-add-row">
            <input
              type="text"
              placeholder="Add a key result..."
              value={newKRTitle}
              onChange={e => setNewKRTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addKR()}
            />
            <select
              className="kr-mode-select"
              value={newKRMode}
              onChange={e => setNewKRMode(e.target.value as CompletionMode)}
            >
              {Object.entries(COMPLETION_MODE_META).map(([mode, meta]) => (
                <option key={mode} value={mode}>{meta.icon} {meta.label}</option>
              ))}
            </select>
            <button className="kr-add-btn" onClick={addKR}>+ Add KR</button>
          </div>
        </div>
      )}
    </div>
  );
}
