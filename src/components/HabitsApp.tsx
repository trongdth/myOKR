import { useState, useEffect, useRef } from 'react';
import { Plus, TrendingUp } from 'lucide-react';
import '../styles/habits.css';
import {
  loadHabits,
  saveHabits,
  buildHabitAnalytics,
  type Habit,
  type HabitStatus,
} from '../lib/habit-storage';
import { loadKeyResults, getEffectiveCurrentValue, loadObjectives, loadCycles } from '../lib/okr-storage';
import { updateAutomergeDoc } from '../lib/automerge-storage';
import { generateId, getLocalDateString, loadTasks, loadSettings } from '../lib/pomodoro-storage';
import ConfirmModal from './ConfirmModal';
import LoadingState from './shared/LoadingState';
import HabitMatrix from './habits/HabitMatrix';
import SuggestedHabits from './habits/SuggestedHabits';
import HabitAnalytics from './habits/HabitAnalytics';

export default function HabitsApp() {
  const [isLoading, setIsLoading] = useState(true);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [view, setView] = useState<'week' | 'month'>('week');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  const addInputRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    habitId: string;
    title: string;
    message: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  // Load habits
  useEffect(() => {
    async function init() {
      setHabits(await loadHabits());
      setIsLoading(false);
    }
    init();
  }, []);

  // Listen to background sync and reload data dynamically
  useEffect(() => {
    async function reloadData() {
      setHabits(await loadHabits());
    }

    const handleSync = () => {
      reloadData();
    };

    window.addEventListener('myokr-data-synced', handleSync);
    return () => window.removeEventListener('myokr-data-synced', handleSync);
  }, []);

  const todayStr = getLocalDateString();

  const createHabit = async (name: string) => {
    const newHabit: Habit = {
      id: generateId(),
      name,
      status: 'want_to_form',
      ticks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = [...habits, newHabit];
    setHabits(updated);
    await saveHabits(updated);
    window.dispatchEvent(new CustomEvent('myokr-data-synced'));
  };

  const handleAddHabit = async () => {
    if (!newHabitName.trim()) return;
    await createHabit(newHabitName.trim());
    setNewHabitName('');
    setShowAddForm(false);
  };

  const handleToggleView = (next: 'week' | 'month') => {
    setView(next);
  };

  const handleToggleTick = async (habitId: string, dateStr: string) => {
    const updated = habits.map(h => {
      if (h.id === habitId) {
        const ticks = h.ticks.includes(dateStr)
          ? h.ticks.filter(t => t !== dateStr)
          : [...h.ticks, dateStr].sort();
        return {
          ...h,
          ticks,
          updatedAt: new Date().toISOString()
        };
      }
      return h;
    });
    setHabits(updated);
    await saveHabits(updated);
    window.dispatchEvent(new CustomEvent('myokr-data-synced'));
  };

  const handleUpdateStatus = async (habitId: string, status: HabitStatus) => {
    const updated = habits.map(h => {
      if (h.id === habitId) {
        return {
          ...h,
          status,
          updatedAt: new Date().toISOString()
        };
      }
      return h;
    });
    setHabits(updated);
    await saveHabits(updated);
    window.dispatchEvent(new CustomEvent('myokr-data-synced'));
  };

  const handleDeleteHabit = async (habitId: string) => {
    const krs = await loadKeyResults();
    const linkedKRs = krs.filter(kr => kr.habitId === habitId);

    const performDelete = async () => {
      const tasks = await loadTasks();
      const settings = await loadSettings();
      const objectives = await loadObjectives();
      const cycles = await loadCycles();

      const computedValuesMap: Record<string, number> = {};
      linkedKRs.forEach(kr => {
        computedValuesMap[kr.id] = getEffectiveCurrentValue(
          kr,
          tasks,
          settings?.focusDuration || 25,
          habits,
          objectives,
          cycles
        );
      });

      await updateAutomergeDoc('Delete habit', (d) => {
        if (d.keyResults) {
          d.keyResults.forEach(kr => {
            if (kr.habitId === habitId) {
              kr.completionMode = 'manual';
              kr.currentValue = computedValuesMap[kr.id] || 0;
              delete kr.habitId;
            }
          });
        }

        if (d.habits) {
          const idx = d.habits.findIndex(h => h.id === habitId);
          if (idx !== -1) {
            d.habits.splice(idx, 1);
          }
        }
      });
      setHabits(await loadHabits());
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    };

    if (linkedKRs.length > 0) {
      setConfirmDelete({
        habitId,
        title: 'Delete Linked Habit?',
        message: `The habit "${habits.find(h => h.id === habitId)?.name}" is currently linked to the Key Result: "${linkedKRs[0].title}". If you delete it, the Key Result will fall back to Manual completion mode and preserve its current count of ${linkedKRs[0].currentValue}.`,
        onConfirm: performDelete
      });
    } else {
      setConfirmDelete({
        habitId,
        title: 'Delete Habit?',
        message: 'Are you sure you want to delete this habit? This action cannot be undone.',
        onConfirm: performDelete
      });
    }
  };

  useEffect(() => {
    if (showAddForm) addInputRef.current?.focus();
  }, [showAddForm]);

  if (isLoading) {
    return <LoadingState className="habits-container" />;
  }

  const analytics = buildHabitAnalytics(habits, todayStr);

  return (
    <div className="habits-container">
      <div className="habits-header">
        <div className="habits-header-left">
          <h2 className="habits-title"><TrendingUp size={18} className="icon-inline" /> Habits</h2>
          <div className="habits-view-toggle" role="group" aria-label="Habits view">
            <button
              type="button"
              className={`habits-view-btn${view === 'week' ? ' active' : ''}`}
              onClick={() => handleToggleView('week')}
            >
              Week
            </button>
            <button
              type="button"
              className={`habits-view-btn${view === 'month' ? ' active' : ''}`}
              onClick={() => handleToggleView('month')}
            >
              Month
            </button>
          </div>
        </div>
        <div className="habits-header-right">
          <button type="button" className="btn habits-new-btn" onClick={() => setShowAddForm(s => !s)}>
            <Plus size={14} strokeWidth={2.5} /> New habit
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="add-habit-card">
          <input
            ref={addInputRef}
            type="text"
            className="add-habit-input"
            placeholder="I want to form a habit to..."
            value={newHabitName}
            onChange={e => setNewHabitName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddHabit()}
          />
          <button className="btn add-habit-btn" onClick={handleAddHabit}>
            Add Habit
          </button>
        </div>
      )}

      <HabitMatrix
        habits={habits}
        view={view}
        todayStr={todayStr}
        onToggleTick={handleToggleTick}
        onUpdateStatus={handleUpdateStatus}
        onDelete={handleDeleteHabit}
      />

      <div className="habits-bottom-grid">
        <SuggestedHabits existingNames={habits.map(h => h.name)} onAdd={createHabit} />
        <HabitAnalytics analytics={analytics} />
      </div>

      <ConfirmModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={confirmDelete ? confirmDelete.onConfirm : () => Promise.resolve()}
        title={confirmDelete ? confirmDelete.title : ''}
        message={confirmDelete ? confirmDelete.message : ''}
      />
    </div>
  );
}
