import { useState, useEffect } from 'react';
import { Trash2, Flame, Trophy, Calendar, TrendingUp, ChevronRight } from 'lucide-react';
import '../styles/habits.css';
import {
  loadHabits,
  saveHabits,
  computeHabitStreaks,
  type Habit,
  type HabitStatus
} from '../lib/habit-storage';
import { loadKeyResults, getEffectiveCurrentValue, loadObjectives, loadCycles } from '../lib/okr-storage';
import { updateAutomergeDoc } from '../lib/automerge-storage';
import { generateId, getLocalDateString, loadTasks, loadSettings } from '../lib/pomodoro-storage';
import ConfirmModal from './ConfirmModal';
import LoadingState from './shared/LoadingState';

export default function HabitsApp() {
  const [isLoading, setIsLoading] = useState(true);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [newHabitName, setNewHabitName] = useState('');
  const [showFormed, setShowFormed] = useState(false);
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

  const handleAddHabit = async () => {
    if (!newHabitName.trim()) return;
    const newHabit: Habit = {
      id: generateId(),
      name: newHabitName.trim(),
      status: 'want_to_form',
      ticks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const updated = [...habits, newHabit];
    setHabits(updated);
    await saveHabits(updated);
    setNewHabitName('');
    window.dispatchEvent(new CustomEvent('myokr-data-synced'));
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

  // Calendar month grid generator
  const getCalendarDays = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sun
    const blanks = firstDayIndex === 0 ? 6 : firstDayIndex - 1; // Mon-indexed
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days: { dateStr: string; label: number; isBlank: boolean; isFuture: boolean }[] = [];
    
    for (let i = 0; i < blanks; i++) {
      days.push({ dateStr: '', label: 0, isBlank: true, isFuture: false });
    }
    
    const todayStr = getLocalDateString();
    for (let i = 1; i <= daysInMonth; i++) {
      const mm = String(month + 1).padStart(2, '0');
      const dd = String(i).padStart(2, '0');
      const dateStr = `${year}-${mm}-${dd}`;
      days.push({
        dateStr,
        label: i,
        isBlank: false,
        isFuture: dateStr > todayStr
      });
    }
    
    return days;
  };

  const getMonthTitle = () => {
    const today = new Date();
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return `${months[today.getMonth()]} ${today.getFullYear()}`;
  };


  if (isLoading) {
    return <LoadingState className="habits-container" />;
  }

  const calendarDays = getCalendarDays();
  const todayStr = getLocalDateString();

  const activeHabits = habits.filter(h => h.status !== 'formed');
  const formedHabits = habits.filter(h => h.status === 'formed');

  const renderHabitCard = (habit: Habit) => {
    const { current: currentStreak, best: bestStreak } = computeHabitStreaks(habit.ticks);

    return (
      <div key={habit.id} className="habit-card">
        <div className="habit-card-header">
          <div className="habit-info">
            <span className="habit-name">{habit.name}</span>
            <div className="habit-meta">
              <select
                className="habit-status-select"
                value={habit.status}
                onChange={e => handleUpdateStatus(habit.id, e.target.value as HabitStatus)}
              >
                <option value="want_to_form">Want to form</option>
                <option value="in_progress">In progress</option>
                <option value="formed">Formed</option>
              </select>
            </div>
          </div>
          <div className="habit-actions">
            <button
              className="habit-delete-btn"
              onClick={() => handleDeleteHabit(habit.id)}
              title="Delete habit"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="habit-stats-section">
          <div className="habit-stat-box">
            <span className="habit-stat-val"><Flame size={14} className="icon-inline" /> {currentStreak}</span>
            <span className="habit-stat-lbl">Current Streak</span>
          </div>
          <div className="habit-stat-box">
            <span className="habit-stat-val"><Trophy size={14} className="icon-inline" /> {bestStreak}</span>
            <span className="habit-stat-lbl">Best Streak</span>
          </div>
          <div className="habit-stat-box">
            <span className="habit-stat-val"><Calendar size={14} className="icon-inline" /> {habit.ticks.length}</span>
            <span className="habit-stat-lbl">Total Ticks</span>
          </div>
        </div>

        {/* Tick Grid (Calendar) */}
        <div className="calendar-section">
          <div className="calendar-title">{getMonthTitle()}</div>
          <div className="calendar-grid">
            <div className="calendar-weekday">M</div>
            <div className="calendar-weekday">T</div>
            <div className="calendar-weekday">W</div>
            <div className="calendar-weekday">T</div>
            <div className="calendar-weekday">F</div>
            <div className="calendar-weekday">S</div>
            <div className="calendar-weekday">S</div>
            
            {calendarDays.map((day, idx) => {
              if (day.isBlank) {
                return <div key={`blank-${idx}`} className="calendar-day blank" />;
              }
              const isTicked = habit.ticks.includes(day.dateStr);
              const isToday = day.dateStr === todayStr;
              return (
                <button
                  key={day.dateStr}
                  className={`calendar-day${isTicked ? ' ticked' : ''}${isToday ? ' today' : ''}`}
                  disabled={day.isFuture}
                  onClick={() => handleToggleTick(habit.id, day.dateStr)}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="habits-container">
      <div className="habits-header">
        <h2 className="habits-title"><TrendingUp size={18} className="icon-inline" /> Habits</h2>
      </div>

      <div className="add-habit-card">
        <input
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

      <div className="habits-grid">
        {activeHabits.map(renderHabitCard)}
      </div>

      {formedHabits.length > 0 && (
        <div className="formed-habits-section" style={{ marginTop: '2rem' }}>
          <button
            className="formed-habits-toggle"
            onClick={() => setShowFormed(!showFormed)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary, #475569)',
              cursor: 'pointer',
              fontWeight: '600',
              padding: '0.5rem 0',
              fontSize: '0.95rem'
            }}
          >
            <span style={{
              transform: showFormed ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
              display: 'inline-block'
            }}>
              <ChevronRight size={12} />
            </span>
            Formed Habits ({formedHabits.length})
          </button>
          
          {showFormed && (
            <div className="habits-grid formed-habits-grid" style={{ marginTop: '1rem' }}>
              {formedHabits.map(renderHabitCard)}
            </div>
          )}
        </div>
      )}

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
