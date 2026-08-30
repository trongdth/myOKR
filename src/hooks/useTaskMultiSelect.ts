import { useState } from 'react';

/**
 * Bulk row-selection state shared by the Tasks list view and the Done table —
 * the two views deliberately share one selection anatomy (docs/design-system.md,
 * Done 2026-08-29), so the machinery lives here instead of being copied.
 */
export function useTaskMultiSelect() {
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  const isSelected = (id: string) => selectedTaskIds.has(id);

  const toggleTask = (id: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Select-all scopes to one group's tasks, so a selection spanning groups
  // never cross-fires another group's header checkbox.
  const isGroupSelected = (groupTasks: { id: string }[]) =>
    groupTasks.length > 0 && groupTasks.every(t => selectedTaskIds.has(t.id));

  const toggleGroup = (groupTasks: { id: string }[], checked: boolean) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      groupTasks.forEach(t => {
        if (checked) next.add(t.id);
        else next.delete(t.id);
      });
      return next;
    });
  };

  const deselect = (id: string) => {
    setSelectedTaskIds(prev => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const clear = () => setSelectedTaskIds(new Set());

  return { selectedTaskIds, isSelected, isGroupSelected, toggleTask, toggleGroup, deselect, clear };
}
