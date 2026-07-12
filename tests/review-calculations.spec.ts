import { test, expect } from '@playwright/test';

async function waitForApp(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
}

test.describe('Weekly Review Calculations & Repair', () => {
  test('correctly calculates previous and current values dynamically across weeks', async ({ page }) => {
    await waitForApp(page);

    // Go to Review section
    await page.locator('nav >> text=Review').click();
    await expect(page.locator('.review-header-title')).toBeVisible();

    // Seed mock cycle, objective, KR, task, and history into Automerge doc
    await page.evaluate(async () => {
      const updateDoc = (window as any).__updateAutomergeDoc;
      if (!updateDoc) throw new Error('Automerge test hooks not exposed');

      await updateDoc('Seed E2E test data', (d: any) => {
        // Create a test cycle: June 2026 (month=5, year=2026)
        const cycle = {
          id: 'cycle-test',
          name: 'June 2026',
          month: 5,
          year: 2026,
          isActive: true,
          createdAt: new Date().toISOString(),
        };
        d.cycles = [cycle];

        // Create a test objective
        const objective = {
          id: 'obj-test',
          cycleId: 'cycle-test',
          title: 'Core Work',
          order: 0,
          createdAt: new Date().toISOString(),
        };
        d.objectives = [objective];

        // Create a focus pomodoros KR: Target 80 pomodoros
        const keyResult = {
          id: 'kr-test',
          objectiveId: 'obj-test',
          title: 'Focus Pomodoros KR',
          targetValue: 80,
          currentValue: 0,
          unit: 'pomodoros',
          confidence: 'on_track',
          completionMode: 'focus_pomodoros',
          order: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        d.keyResults = [keyResult];

        // Create a task linked to the KR
        const task = {
          id: 'task-test',
          title: 'Test Coding Task',
          estimatedPomodoros: 10,
          completedPomodoros: 10,
          isCompleted: true,
          createdAt: '2026-06-01T09:00:00.000Z',
          completedAt: '2026-06-10T17:00:00.000Z',
          category: 'do',
          keyResultId: 'kr-test',
        };
        d.tasks = [task];

        // Clear completed reviews for a clean slate
        d.reviews = [];

        // Seed 2 weeks of history
        // Week 1: June 1st (Mon) to June 7th (Sun). 5 focus pomodoros on June 2nd (Tue).
        // Week 2: June 8th (Mon) to June 14th (Sun). 5 focus pomodoros on June 9th (Tue).
        const historyDays = [];
        
        // June 2nd: 5 pomos
        historyDays.push({
          date: '2026-06-02',
          completedPomodoros: 5,
          totalFocusMinutes: 125,
          tasksCompleted: 0,
          sessions: Array.from({ length: 5 }, () => ({
            startedAt: '2026-06-02T10:00:00.000Z',
            endedAt: '2026-06-02T10:25:00.000Z',
            type: 'focus',
            taskId: 'task-test',
            completed: true,
          })),
        });

        // June 9th: 5 pomos
        historyDays.push({
          date: '2026-06-09',
          completedPomodoros: 5,
          totalFocusMinutes: 125,
          tasksCompleted: 1,
          sessions: Array.from({ length: 5 }, () => ({
            startedAt: '2026-06-09T10:00:00.000Z',
            endedAt: '2026-06-09T10:25:00.000Z',
            type: 'focus',
            taskId: 'task-test',
            completed: true,
          })),
        });

        d.history = historyDays;
      });

      // Notify the React app to reload from the in-memory store
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });

    // Wait for the UI to reload and show the June 2026 cycle in the header
    await expect(page.locator('.review-header #cycle-select')).toHaveValue('cycle-test', { timeout: 10000 });

    // Select Week 1: June 1st to June 7th
    await page.locator('#week-select').selectOption({ label: '2026-06-01 to 2026-06-07' });

    // Start Week 1 Review
    await page.locator('button:has-text("Start Weekly Review")').click();
    await expect(page.locator('text=Step 1 of 3')).toBeVisible(); // 1 KR -> total 3 steps (summary + 1 KR + reflection)

    // Move past summary step
    await page.locator('button.review-nav-btn.primary').click();

    // Verify KR previous and current values on step 2 (KR step)
    // Previous should be 0 (since no pomodoros existed before June 1)
    // Current should be 5 (5 pomodoros completed in Week 1)
    await expect(page.locator('.review-kr-step')).toContainText('Focus Pomodoros KR');
    await expect(page.locator('.review-kr-previous .review-kr-previous-value')).toContainText('0');
    await expect(page.locator('.review-kr-current .review-kr-current-value')).toContainText('5');

    // Complete the wizard for Week 1
    await page.locator('button:has-text("On Track")').click();
    await page.locator('button.review-nav-btn.primary').click();
    await page.locator('textarea.review-notes-textarea').fill('Week 1 completed reflection');
    await page.locator('button:has-text("Complete Review")').click();

    // Confirm Week 1 Review is saved
    await expect(page.locator('text=This week\'s review is complete!')).toBeVisible();

    // Now select Week 2: June 8th to June 14th
    await page.locator('#week-select').selectOption({ label: '2026-06-08 to 2026-06-14' });

    // Start Week 2 Review
    await page.locator('button:has-text("Start Weekly Review")').click();
    await expect(page.locator('text=Step 1 of 3')).toBeVisible();

    // Move past summary step
    await page.locator('button.review-nav-btn.primary').click();

    // Verify KR previous and current values on step 2 (KR step)
    // Previous should be 5 (cumulative up to previous Sunday, June 7)
    // Current should be 10 (cumulative up to June 14: 5 in Week 1 + 5 in Week 2)
    await expect(page.locator('.review-kr-step')).toContainText('Focus Pomodoros KR');
    await expect(page.locator('.review-kr-previous .review-kr-previous-value')).toContainText('5');
    await expect(page.locator('.review-kr-current .review-kr-current-value')).toContainText('10');

    // Complete the wizard for Week 2
    await page.locator('button:has-text("On Track")').click();
    await page.locator('button.review-nav-btn.primary').click();
    await page.locator('textarea.review-notes-textarea').fill('Week 2 completed reflection');
    await page.locator('button:has-text("Complete Review")').click();

    // Confirm Week 2 Review is saved
    await expect(page.locator('text=This week\'s review is complete!')).toBeVisible();
  });
});
