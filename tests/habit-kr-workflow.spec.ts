import { test, expect } from '@playwright/test';

async function navTo(page: any, title: string) {
  const btn = page.locator(`button[title="${title}"], button.sidebar-nav-item:has-text("${title}")`).first();
  if (!await btn.isVisible()) {
    if (['Tasks', 'Objectives', 'Done'].includes(title)) {
      await page.locator('button[title="Plan"]').first().click();
    } else if (['Analytics', 'Weekly review'].includes(title)) {
      await page.locator('button[title="Progress"]').first().click();
    } else if (['Day plan', 'Session', 'Habits'].includes(title)) {
      await page.locator('button[title="Focus"]').first().click();
    }
  }
  await btn.click();
}

test.describe('Habit KR Linking & Progress Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Set localStorage to bypass walkthrough and open directly
    await page.clock.setFixedTime(new Date('2026-07-15T12:00:00.000Z'));
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('completes full workflow: create habit -> link KR -> tick Today -> see progress update', async ({ page }) => {
    // Seed July 2026 cycle (current month of test) to ensure ticks align with active cycle month
    await page.evaluate(async () => {
      const updateDoc = (window as any).__updateAutomergeDoc;
      if (!updateDoc) throw new Error('Automerge test hooks not exposed');
      await updateDoc('Seed July 2026 cycle', (d: any) => {
        const julyCycle = {
          id: 'cycle-july-2026',
          name: 'July 2026',
          month: 6, // 0-indexed July
          year: 2026,
          isActive: true,
          createdAt: new Date().toISOString()
        };
        if (d.cycles) {
          d.cycles.forEach((c: any) => c.isActive = false);
          d.cycles.push(julyCycle);
        } else {
          d.cycles = [julyCycle];
        }
      });
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });

    // 1. Go to Habits tab and create a habit
    await navTo(page, 'Habits');
    await expect(page.locator('.habits-title')).toHaveText('Habits');

    const habitInput = page.locator('.add-habit-input');
    await habitInput.fill('Forming E2E Habit');
    await page.locator('button:has-text("Add Habit")').click();
    await expect(page.locator('.habit-name')).toHaveText('Forming E2E Habit');

    // 2. Go to OKRs tab and create objective + KR
    await navTo(page, 'Objectives');
    await expect(page.locator('.okr-container h2.tasks-title', { hasText: 'PLAN' })).toBeVisible();

    const objInput = page.locator('.okr-add-objective >> input');
    await objInput.fill('Habit E2E Objective');
    await page.locator('button:has-text("+ Add Objective")').click();

    // Find the objective card (expanded by default)
    const objHeader = page.locator('.objective-header:has-text("Habit E2E Objective")');
    await expect(objHeader).toBeVisible();

    // Create a Habit KR
    const krInput = page.locator('.kr-add-row >> input');
    await krInput.fill('E2E Ticking KR');
    const krModeSelect = page.locator('.kr-mode-select');
    await krModeSelect.selectOption({ label: 'Habit Ticks' });
    await page.locator('button:has-text("+ Add KR")').click();

    // Select the linked habit in the newly created KR
    const linkSelect = page.locator('.kr-habit-link-row >> select');
    await expect(linkSelect).toBeVisible();
    await linkSelect.selectOption({ label: 'Forming E2E Habit' });

    // 3. Go to Habits tab, check off the habit today
    await navTo(page, 'Habits');
    await expect(page.locator('.habits-title')).toHaveText('Habits');

    // Toggle today's habit tick cell in the calendar grid
    const todayCell = page.locator('.habit-card:has-text("Forming E2E Habit") .calendar-day.today');
    await expect(todayCell).toBeVisible();
    await todayCell.click();
    await expect(todayCell).toHaveClass(/ticked/);

    // 4. Go back to OKRs and check progress
    await navTo(page, 'Objectives');
    
    const objHeader2 = page.locator('.objective-header:has-text("Habit E2E Objective")');
    await expect(objHeader2).toBeVisible();

    const krRow = page.locator('.kr-row:has-text("E2E Ticking KR")');
    await expect(krRow).toBeVisible();
    
    // Progress should be 1/10 (10%) since target defaults to 10 for habits
    await expect(krRow.locator('.kr-progress-text')).toContainText('1 / 10 ticks');
    await expect(krRow.locator('.kr-progress-percent')).toContainText('10.0%');

    // 5. Clean up habit (which also tests KR unlink fallback to manual mode)
    await navTo(page, 'Habits');
    await page.locator('.habit-delete-btn').click();
    
    // Expect ConfirmModal warning about linked KR
    await expect(page.locator('.prioritize-title')).toContainText('Delete Linked Habit?');
    await page.locator('.prioritize-actions >> button:has-text("Confirm")').click();
    await expect(page.locator('.habit-name')).toHaveCount(0);

    // Verify KR fell back to manual completion mode with preserved progress value
    await navTo(page, 'Objectives');

    const objHeader3 = page.locator('.objective-header:has-text("Habit E2E Objective")');
    await expect(objHeader3).toBeVisible();

    const krRowAfter = page.locator('.kr-row:has-text("E2E Ticking KR")');
    await expect(krRowAfter).toBeVisible();
    await expect(krRowAfter.locator('.kr-mode-badge-label')).toContainText('Manual');
    await expect(krRowAfter.locator('.kr-progress-text')).toContainText('1 / 10 %'); // Unit reverted to % for manual
  });

  test('navigates to Habits tab when selecting Create New Habit in KR dropdown', async ({ page }) => {
    // Seed active cycle
    await page.evaluate(async () => {
      const updateDoc = (window as any).__updateAutomergeDoc;
      if (!updateDoc) throw new Error('Automerge test hooks not exposed');
      await updateDoc('Seed July 2026 cycle', (d: any) => {
        const julyCycle = {
          id: 'cycle-july-2026',
          name: 'July 2026',
          month: 6, // 0-indexed July
          year: 2026,
          isActive: true,
          createdAt: new Date().toISOString()
        };
        if (d.cycles) {
          d.cycles.forEach((c: any) => c.isActive = false);
          d.cycles.push(julyCycle);
        } else {
          d.cycles = [julyCycle];
        }
      });
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });

    // Go to OKRs tab and create objective + KR
    await navTo(page, 'Objectives');
    await expect(page.locator('.okr-container h2.tasks-title', { hasText: 'PLAN' })).toBeVisible();

    const objInput = page.locator('.okr-add-objective >> input');
    await objInput.fill('Habit Link Navigation Objective');
    await page.locator('button:has-text("+ Add Objective")').click();

    const objHeader = page.locator('.objective-header:has-text("Habit Link Navigation Objective")');
    await expect(objHeader).toBeVisible();

    // Create a Habit KR
    const krInput = page.locator('.kr-add-row >> input');
    await krInput.fill('Navigation KR');
    const krModeSelect = page.locator('.kr-mode-select');
    await krModeSelect.selectOption({ label: 'Habit Ticks' });
    await page.locator('button:has-text("+ Add KR")').click();

    // Select the "+ Create new habit..." option in the newly created KR
    const linkSelect = page.locator('.kr-habit-link-row >> select');
    await expect(linkSelect).toBeVisible();
    await linkSelect.selectOption('__new__');

    // Verify it redirects to Habits tab and shows title
    await expect(page.locator('.habits-title')).toBeVisible();
    await expect(page.locator('.habits-title')).toHaveText('Habits');
  });
});
