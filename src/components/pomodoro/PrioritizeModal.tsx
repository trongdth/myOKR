import { useState, useCallback } from 'react';
import type { PomodoroTask, EisenhowerCategory } from '../../lib/pomodoro-storage';
import { EISENHOWER_META, EISENHOWER_PRIORITY_ORDER } from '../../lib/pomodoro-storage';
import { useModalEffects } from '../../hooks/useModalEffects';

interface Props {
  tasks: PomodoroTask[];
  activeTaskId: string | null;
  onTasksChange: (tasks: PomodoroTask[]) => void;
  onClose: () => void;
}

export default function PrioritizeModal({ tasks, activeTaskId, onTasksChange, onClose}: Props) {
  // Work with a local copy so changes aren't applied until user clicks Apply
  const [localTasks, setLocalTasks] = useState<PomodoroTask[]>(() =>
    tasks.map(t => ({ ...t, category: t.category || 'do' }))
  );
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);

  useModalEffects(onClose);

  const activeTasks = localTasks.filter(t => !t.isCompleted);

  const getQuadrantTasks = (quadrant: EisenhowerCategory) =>
    activeTasks.filter(t => (t.category || 'do') === quadrant);

  const reorder = useCallback((taskId: string, to: EisenhowerCategory, beforeTaskId: string | null) => {
    setLocalTasks(prev => {
      const idx = prev.findIndex(t => t.id === taskId);
      if (idx === -1) return prev;
      const [removed] = prev.splice(idx, 1);
      removed.category = to;
      if (beforeTaskId) {
        const beforeIdx = prev.findIndex(t => t.id === beforeTaskId);
        if (beforeIdx !== -1) {
          prev.splice(beforeIdx, 0, removed);
        } else {
          prev.push(removed);
        }
      } else {
        prev.push(removed);
      }
      return [...prev];
    });
  }, []);

  const handleDragStart = (taskId: string) => {
    setDraggedTaskId(taskId);
  };

  const handleDrop = (e: React.DragEvent, quadrant: EisenhowerCategory) => {
    e.preventDefault();
    if (draggedTaskId) {
      reorder(draggedTaskId, quadrant, null);
      setDraggedTaskId(null);
    }
  };

  const handleQuadrantClick = (quadrant: EisenhowerCategory) => {
    if (selectedTaskId) {
      reorder(selectedTaskId, quadrant, null);
      setSelectedTaskId(null);
    }
  };

  const handleApply = () => {
    const sorted = EISENHOWER_PRIORITY_ORDER.flatMap(cat =>
      localTasks.filter(t => (t.category || 'do') === cat)
    );
    onTasksChange(sorted);
    onClose();
  };

  const quadrants: [EisenhowerCategory, EisenhowerCategory, EisenhowerCategory, EisenhowerCategory] = ['do', 'decide', 'delegate', 'delete'];

  return (
    <div className="prioritize-overlay" onClick={onClose}>
      <div className="prioritize-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="prioritize-header">
          <div>
            <h3 className="prioritize-title">⚡ Prioritize Tasks</h3>
            <p className="prioritize-subtitle">
              Using the <strong>Eisenhower Matrix</strong> — categorize tasks by urgency and importance to focus on what matters most.
            </p>
          </div>
          <button className="prioritize-close" onClick={onClose}>✕</button>
        </div>

        {/* Axis labels */}
        <div className="matrix-axis-labels">
          <div className="matrix-axis-x">
            <span className="axis-label-item urgent-label">Urgent</span>
            <span className="axis-label-item not-urgent-label">Not Urgent</span>
          </div>
        </div>

        {/* Matrix Grid */}
        <div className="prioritize-matrix-wrapper">
          <div className="matrix-axis-y">
            <span className="axis-label-item important-label">Important</span>
            <span className="axis-label-item not-important-label">Not Important</span>
          </div>
          <div className="prioritize-matrix">
            {quadrants.map(key => {
              const meta = EISENHOWER_META[key];
              const quadTasks = getQuadrantTasks(key);
              return (
                <div
                  key={key}
                  className={`matrix-quadrant${draggedTaskId ? ' drop-target' : ''}${selectedTaskId ? ' tap-target' : ''}`}
                  style={{ borderColor: meta.color }}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                  onDrop={e => handleDrop(e, key)}
                  onClick={() => handleQuadrantClick(key)}
                >
                  <div className="quadrant-header">
                    <span className="quadrant-icon">{meta.icon}</span>
                    <span className="quadrant-label" style={{ color: meta.color }}>{meta.label.toUpperCase()}</span>
                    <span className="quadrant-count">{quadTasks.length}</span>
                  </div>
                  <div className="quadrant-desc">{meta.description}</div>
                  <div className="quadrant-tasks">
                    {quadTasks.length === 0 && (
                      <div className="quadrant-empty">Drag tasks here</div>
                    )}
                    {quadTasks.map(task => (
                      <div
                        key={task.id}
                        className={`matrix-task-chip${selectedTaskId === task.id ? ' selected-chip' : ''}${activeTaskId === task.id ? ' active-chip' : ''}${dragOverTaskId === task.id ? ' drag-over-chip' : ''}`}
                        draggable
                        onDragStart={() => handleDragStart(task.id)}
                        onDragOver={e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; setDragOverTaskId(task.id); }}
                        onDrop={e => { e.preventDefault(); e.stopPropagation(); if (draggedTaskId) { reorder(draggedTaskId, key, task.id); setDraggedTaskId(null); setDragOverTaskId(null); } }}
                        onDragLeave={() => { if (dragOverTaskId === task.id) setDragOverTaskId(null); }}
                        onClick={e => {
                          e.stopPropagation();
                          if (selectedTaskId && selectedTaskId !== task.id) {
                            reorder(selectedTaskId, key, task.id);
                            setSelectedTaskId(null);
                          } else {
                            setSelectedTaskId(selectedTaskId === task.id ? null : task.id);
                          }
                        }}
                        style={{ borderLeftColor: meta.color }}
                      >
                        <span className="chip-title">{task.title}</span>
                        <span className="chip-pomo">{task.completedPomodoros}/{task.estimatedPomodoros} 🍅</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="prioritize-footer">
          <div className="prioritize-hint">
            💡 Drag onto a task to reorder before it, drag onto empty space to add to quadrant. Tap a task then tap another to reorder.
          </div>
          <div className="prioritize-actions">
            <button className="btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn prioritize-apply-btn" onClick={handleApply}>Apply Priority Order</button>
          </div>
        </div>
      </div>
    </div>
  );
}
