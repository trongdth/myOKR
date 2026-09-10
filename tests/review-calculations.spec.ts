import { test, expect } from '@playwright/test';

async function waitForApp(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
}

test.describe('Weekly Review Calculations & Repair', () => {
  test('correctly calculates previous and current values dynamically across weeks', async ({ page }) => {
    await waitForApp(page);

    // Go to Review section — since the Progress revamp it renders headerless
    // inside the Progress shell (start card, no review-header-title).
    await page.locator('button[title="Progress"]').click();
    await page.locator('button[title="Weekly review"]').click();
    await expect(page.locator('.review-container')).toBeVisible();

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

    // The review tab's CycleWeekPicker drives the week.
    const picker = page.locator('[aria-label="Review cycle and week"]');
    await expect(picker).toBeVisible({ timeout: 10000 });

    // Select Week 1: June 1st to June 7th (all June weeks are finished today)
    await picker.click();
    await page.locator('.cwp-panel .cwp-week-row').nth(0).click();
    await page.waitForTimeout(300);

    // The wizard opens directly on the glance step.
    await expect(page.locator('.rw-wizard .rw-step-heading h2')).toBeVisible();

    // Move to the scoring step.
    await page.locator('.rw-rail-item:has-text("Score key results")').click();

    // Verify the KR's values on step 2. Current should be 5 (5 pomodoros
    // completed in Week 1); the delta "+5 this week" is current − previous,
    // so it pins previous = 0 (a wrong previous of 5 would read "no change").
    const krRowW1 = page.locator('.rw-score-row:has-text("Focus Pomodoros KR")');
    await expect(krRowW1.locator('.rw-kr-value-auto')).toHaveText('5');
    await expect(krRowW1.locator('.rw-delta-pos')).toHaveText('+5 this week');

    // Score and continue to reflection, then finish.
    await page.locator('button:has-text("On Track")').click();
    await page.locator('.rw-btn:has-text("Continue to reflection")').click();
    await page.locator('.rw-prompt-textarea').first().fill('Week 1 completed reflection');
    await page.locator('button:has-text("Finish review")').click();

    // Confirm Week 1 Review is saved — the week now renders the summary.
    await expect(page.locator('.rw-summary-head h2')).toHaveText('Your review');

    // Now select Week 2: June 8th to June 14th
    await picker.click();
    await page.locator('.cwp-panel .cwp-week-row').nth(1).click();
    await page.waitForTimeout(300);
    await expect(page.locator('.rw-wizard .rw-step-heading h2')).toBeVisible();

    await page.locator('.rw-rail-item:has-text("Score key results")').click();

    // Current should be 10 (cumulative to June 14: 5 in Week 1 + 5 in Week 2)
    // and the delta stays +5, which pins previous = 5 (cumulative to the
    // previous Sunday, June 7) — a wrong previous of 0 would read "+10".
    const krRowW2 = page.locator('.rw-score-row:has-text("Focus Pomodoros KR")');
    await expect(krRowW2.locator('.rw-kr-value-auto')).toHaveText('10');
    await expect(krRowW2.locator('.rw-delta-pos')).toHaveText('+5 this week');

    await page.locator('button:has-text("On Track")').click();
    await page.locator('.rw-btn:has-text("Continue to reflection")').click();
    await page.locator('.rw-prompt-textarea').first().fill('Week 2 completed reflection');
    await page.locator('button:has-text("Finish review")').click();

    // Confirm Week 2 Review is saved — the week now renders the summary.
    await expect(page.locator('.rw-summary-head h2')).toHaveText('Your review');
});
});
