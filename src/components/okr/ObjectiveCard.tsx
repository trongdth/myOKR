import { useState } from 'react';
import type { Objective, KeyResult } from '../../lib/okr-storage';
import { computeObjectiveProgress } from '../../lib/okr-storage';
import { generateId } from '../../lib/pomodoro-storage';
import type { PomodoroTask } from '../../lib/pomodoro-storage';
import KeyResultRow from './KeyResultRow';

interface Props {
  objective: Objective;
  keyResults: KeyResult[];
  tasks: PomodoroTask[];
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
  onUpdateObjective,
  onDeleteObjective,
  onUpdateKeyResult,
  onDeleteKeyResult,
  onAddKeyResult,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(objective.title);
  const [newKRTitle, setNewKRTitle] = useState('');

  const objKRs = keyResults
    .filter(kr => kr.objectiveId === objective.id)
    .sort((a, b) => a.order - b.order);

  const progress = computeObjectiveProgress(objective.id, keyResults);

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
    const kr: KeyResult = {
      id: generateId(),
      objectiveId: objective.id,
      title,
      targetValue: 100,
      currentValue: 0,
      unit: '%',
      confidence: 'not_set',
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
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '0.5em 0', fontStyle: 'italic' }}>
                No key results yet. Add one below to make this objective measurable.
              </div>
            )}
            {objKRs.map(kr => (
              <KeyResultRow
                key={kr.id}
                kr={kr}
                tasks={tasks}
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
            <button className="kr-add-btn" onClick={addKR}>+ Add KR</button>
          </div>
        </div>
      )}
    </div>
  );
}
