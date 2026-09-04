function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function generateHistory() {
  const records = [];
  const pomodorosPerDay = [5, 8, 6, 4, 0, 7, 10, 3, 6, 8, 4, 2, 5, 3];
  for (let i = 13; i >= 0; i--) {
    const date = daysAgo(i);
    const pomos = pomodorosPerDay[13 - i];
    records.push({
      date,
      completedPomodoros: pomos,
      totalFocusMinutes: pomos * 25,
      tasksCompleted: pomos >= 5 ? 1 : 0,
      sessions: Array.from({ length: pomos }, (_, j) => ({
        startedAt: `${date}T${9 + j}:00:00.000Z`,
        endedAt: `${date}T${9 + j}:25:00.000Z`,
        type: 'focus',
        completed: true,
      })),
    });
  }
  return records;
}

const SEED_DATA: Record<string, any> = {
  settings: {
    focusDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    pomosBeforeLongBreak: 4,
    autoStartBreaks: false,
    autoStartFocus: false,
  },
  timerState: null,
  cycles: [
    (() => {
      // Current-month cycle so cycle-scoped UI (e.g. Analytics KPI cards)
      // contains the relative-date seed history. Frozen-clock tests (May
      // 2026) still see 'May 2026'. One timestamp so name/month/year can't
      // tear across a month rollover.
      const now = new Date();
      return {
        id: 'cycle-1',
        name: `${now.toLocaleString('en-US', { month: 'long' })} ${now.getFullYear()}`,
        month: now.getMonth(),
        year: now.getFullYear(),
        isActive: true,
        createdAt: now.toISOString(),
      };
    })(),
  ],
  objectives: [
    { id: 'obj-1', cycleId: 'cycle-1', title: 'Ship myOKR v2.0', order: 0, createdAt: new Date().toISOString() },
    { id: 'obj-2', cycleId: 'cycle-1', title: 'Improve Productivity', order: 1, createdAt: new Date().toISOString() },
    { id: 'obj-3', cycleId: 'cycle-1', title: 'Build Engineering Culture', order: 2, createdAt: new Date().toISOString() },
  ],
  keyResults: [
    { id: 'kr-1', objectiveId: 'obj-1', title: 'Complete 15 feature tickets', targetValue: 15, currentValue: 9, unit: 'tickets', confidence: 'on_track', completionMode: 'manual', order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'kr-2', objectiveId: 'obj-1', title: 'Achieve 90% test coverage', targetValue: 90, currentValue: 72, unit: '%', confidence: 'at_risk', completionMode: 'manual', order: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'kr-3', objectiveId: 'obj-2', title: 'Complete 40 focus hours', targetValue: 40, currentValue: 24, unit: 'hours', confidence: 'on_track', completionMode: 'focus_hours', order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'kr-4', objectiveId: 'obj-2', title: 'Finish 25 Pomodoro sessions', targetValue: 25, currentValue: 16, unit: 'pomodoros', confidence: 'on_track', completionMode: 'focus_pomodoros', order: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'kr-5', objectiveId: 'obj-3', title: 'Complete 10 learning sessions', targetValue: 10, currentValue: 6, unit: 'sessions', confidence: 'on_track', completionMode: 'manual', order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'kr-6', objectiveId: 'obj-3', title: 'Write 4 blog posts', targetValue: 4, currentValue: 1, unit: 'posts', confidence: 'not_set', completionMode: 'manual', order: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ],
  tasks: [
    { id: 'task-1', title: 'Design new dashboard layout', description: 'Create a modern dashboard with charts and KPI widgets', estimatedPomodoros: 5, completedPomodoros: 3, isCompleted: false, category: 'do', bucket: 'today', keyResultId: 'kr-1', createdAt: daysAgo(2) + 'T09:00:00.000Z', todos: [], comments: [] },
    { id: 'task-2', title: 'Review pull requests', estimatedPomodoros: 2, completedPomodoros: 2, isCompleted: true, category: 'do', completedAt: daysAgo(1) + 'T10:30:00.000Z', keyResultId: 'kr-1', createdAt: daysAgo(3) + 'T09:00:00.000Z', todos: [], comments: [] },
    { id: 'task-3', title: 'Write API documentation', estimatedPomodoros: 4, completedPomodoros: 2, isCompleted: false, category: 'decide', bucket: 'today', createdAt: daysAgo(2) + 'T14:00:00.000Z', todos: [], comments: [] },
    { id: 'task-4', title: 'Fix navigation bug', description: 'Sidebar menu not collapsing on mobile viewports', estimatedPomodoros: 3, completedPomodoros: 3, isCompleted: true, category: 'do', completedAt: daysAgo(1) + 'T16:00:00.000Z', keyResultId: 'kr-1', createdAt: daysAgo(4) + 'T11:00:00.000Z', todos: [], comments: [] },
    { id: 'task-5', title: 'Plan sprint retrospective', estimatedPomodoros: 2, completedPomodoros: 0, isCompleted: false, category: 'decide', bucket: 'today', dueDate: daysAgo(1), createdAt: daysAgo(1) + 'T08:00:00.000Z', todos: [], comments: [] },
    { id: 'task-6', title: 'Refactor auth module', estimatedPomodoros: 6, completedPomodoros: 4, isCompleted: false, category: 'do', keyResultId: 'kr-2', createdAt: daysAgo(5) + 'T09:00:00.000Z', todos: [], comments: [] },
    { id: 'task-7', title: 'Update README screenshots', estimatedPomodoros: 2, completedPomodoros: 0, isCompleted: false, category: 'delegate', createdAt: new Date().toISOString(), todos: [], comments: [] },
    { id: 'task-8', title: 'Clean up unused dependencies', estimatedPomodoros: 1, completedPomodoros: 0, isCompleted: false, category: 'delete', createdAt: daysAgo(2) + 'T15:00:00.000Z', todos: [], comments: [] },
  ],
  history: generateHistory(),
  reviews: [],
  walkthroughState: 'dismissed',
};

class MockStore {
  private data: Record<string, any>;

  constructor(defaults: Record<string, any>) {
    this.data = { ...defaults };
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.data[key] as T | undefined;
  }

  async set(key: string, value: any): Promise<void> {
    this.data[key] = value;
  }

  async delete(key: string): Promise<boolean> {
    const had = key in this.data;
    delete this.data[key];
    return had;
  }
}

export async function load(_filename: string, options?: { autoSave?: boolean; defaults?: Record<string, any> }) {
  return new MockStore({ ...(options?.defaults || {}), ...SEED_DATA });
}
