import { test, expect } from '@playwright/test';

test.describe('Habit Storage & Schema', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('initializes with habits as an empty array and allows save/load', async ({ page }) => {
    const habitsInitial = await page.evaluate(async () => {
      const doc = await (window as any).__getAutomergeDoc();
      return doc.habits || [];
    });
    expect(habitsInitial).toEqual([]);

    const savedHabits = await page.evaluate(async () => {
      const updateDoc = (window as any).__updateAutomergeDoc;
      await updateDoc('Add test habit', (d: any) => {
        d.habits = [{
          id: 'habit-1',
          name: 'Read Books',
          status: 'want_to_form',
          ticks: ['2026-07-12', '2026-07-10'], // Unsorted
          order: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }];
      });
      const doc = await (window as any).__getAutomergeDoc();
      return doc.habits;
    });

    expect(savedHabits).toBeDefined();
    expect(savedHabits.length).toBe(1);
    expect(savedHabits[0].id).toBe('habit-1');
  });

  test('correctly auto-counts habit ticks based on KR cycle month and end dates', async ({ page }) => {
    const result = await page.evaluate(() => {
      const getVal = (window as any).__getEffectiveCurrentValue;
      const getValAsOf = (window as any).__getEffectiveCurrentValueAsOf;
      const isTickInMonth = (window as any).__isTickInCycleMonth;

      if (!getVal || !getValAsOf || !isTickInMonth) {
        throw new Error('Calculation functions not exposed on window');
      }

      // 1. Test isTickInCycleMonth
      const isJuneTick = isTickInMonth('2026-06-02', 5, 2026); // June is month 5 (0-indexed)
      const isJulyTick = isTickInMonth('2026-07-02', 5, 2026);

      // 2. Test getEffectiveCurrentValue
      const cycle = { id: 'cycle-1', name: 'June 2026', month: 5, year: 2026, isActive: true, createdAt: '' };
      const objective = { id: 'obj-1', cycleId: 'cycle-1', title: 'Test Obj', order: 0, createdAt: '' };
      const kr = {
        id: 'kr-1',
        objectiveId: 'obj-1',
        title: 'Habit KR',
        targetValue: 10,
        currentValue: 0,
        unit: 'ticks',
        confidence: 'not_set' as const,
        completionMode: 'habit' as const,
        habitId: 'habit-test',
        order: 0,
        createdAt: '',
        updatedAt: ''
      };

      const habit = {
        id: 'habit-test',
        name: 'Exercise',
        status: 'in_progress' as const,
        ticks: ['2026-06-02', '2026-06-15', '2026-07-01'], // 2 in June, 1 in July
        order: 0,
        createdAt: '',
        updatedAt: ''
      };

      const valFull = getVal(kr, [], 25, [habit], [objective], [cycle]);
      const valAsOfJune10 = getValAsOf(kr, [], [], '2026-06-10', 25, [habit], [objective], [cycle]);

      return {
        isJuneTick,
        isJulyTick,
        valFull,
        valAsOfJune10
      };
    });

    expect(result.isJuneTick).toBe(true);
    expect(result.isJulyTick).toBe(false);
    expect(result.valFull).toBe(2); // '2026-06-02' and '2026-06-15'
    expect(result.valAsOfJune10).toBe(1); // Only '2026-06-02' (<= '2026-06-10')
  });
});
