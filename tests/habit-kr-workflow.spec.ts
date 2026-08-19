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

    await page.locator('.habits-new-btn').click();
    const habitInput = page.locator('.add-habit-input');
    await habitInput.fill('Forming E2E Habit');
    await page.locator('button:has-text("Add Habit")').click();
    await expect(page.locator('.habit-row:has-text("Forming E2E Habit") .habit-name')).toHaveText('Forming E2E Habit');

    // 2. Go to OKRs tab and create objective + KR
    await navTo(page, 'Objectives');
    await expect(page.locator('.okr-container h2.tasks-title', { hasText: 'PLAN' })).toBeVisible();

    // P7 revamp: the inline form creates the objective and its first KR together
    await page.locator('.okr-new-objective-btn').click();
    const form = page.locator('.okr-new-obj-form');
    await form.locator('.okr-new-obj-title-input').fill('Habit E2E Objective');
    await form.locator('.okr-new-obj-kr-input').fill('E2E Ticking KR');
    await form.locator('.kr-mode-select').selectOption({ label: 'Habit Ticks' });
    await form.locator('.okr-new-obj-create-btn').click();

    // Find the objective card (expanded by default)
    const objHeader = page.locator('.objective-header:has-text("Habit E2E Objective")');
    await expect(objHeader).toBeVisible();

    // Select the linked habit in the newly created KR
    const linkSelect = page.locator('.kr-habit-link-row >> select');
    await expect(linkSelect).toBeVisible();
    await linkSelect.selectOption({ label: 'Forming E2E Habit' });

    // 3. Go to Habits tab, check off the habit today
    await navTo(page, 'Habits');
    await expect(page.locator('.habits-title')).toHaveText('Habits');

    // Toggle today's cell in the habit's matrix row
    const habitRow = page.locator('.habit-row:has-text("Forming E2E Habit")');
    const todayCell = habitRow.locator('.habit-cell.today');
    await expect(todayCell).toBeVisible();
    await todayCell.click();
    await expect(todayCell).toHaveClass(/completed/);

    // 4. Go back to OKRs and check progress
    await navTo(page, 'Objectives');
    
    const objHeader2 = page.locator('.objective-header:has-text("Habit E2E Objective")');
    await expect(objHeader2).toBeVisible();

    const krRow = page.locator('.kr-row:has-text("E2E Ticking KR")');
    await expect(krRow).toBeVisible();
    
    // Progress should be 1/10 (10%) since target defaults to 10 for habits
    // (P7 revamp grid: value badge holds the current, the target reads "/ 10")
    await expect(krRow.locator('.kr-value-badge')).toHaveText('1');
    await expect(krRow.locator('.kr-target-text')).toContainText('/ 10');
    await expect(krRow.locator('.kr-progress-percent')).toContainText('10.0%');

    // 5. Clean up habit (which also tests KR unlink fallback to manual mode)
    await navTo(page, 'Habits');
    const habitRowDelete = page.locator('.habit-row:has-text("Forming E2E Habit")');
    await habitRowDelete.hover();
    await habitRowDelete.locator('.habit-delete-btn').click();

    // Expect ConfirmModal warning about linked KR
    await expect(page.locator('.prioritize-title')).toContainText('Delete Linked Habit?');
    await page.locator('.prioritize-actions >> button:has-text("Confirm")').click();
    await expect(page.locator('.habit-row')).toHaveCount(0);

    // Verify KR fell back to manual completion mode with preserved progress value
    await navTo(page, 'Objectives');

    const objHeader3 = page.locator('.objective-header:has-text("Habit E2E Objective")');
    await expect(objHeader3).toBeVisible();

    const krRowAfter = page.locator('.kr-row:has-text("E2E Ticking KR")');
    await expect(krRowAfter).toBeVisible();
    await expect(krRowAfter.locator('.kr-subtitle')).toContainText('Manual');
    await expect(krRowAfter.locator('.kr-value-badge')).toHaveText('1'); // progress value preserved
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

    await page.locator('.okr-new-objective-btn').click();
    const form = page.locator('.okr-new-obj-form');
    await form.locator('.okr-new-obj-title-input').fill('Habit Link Navigation Objective');
    await form.locator('.okr-new-obj-kr-input').fill('Navigation KR');
    await form.locator('.kr-mode-select').selectOption({ label: 'Habit Ticks' });
    await form.locator('.okr-new-obj-create-btn').click();

    const objHeader = page.locator('.objective-header:has-text("Habit Link Navigation Objective")');
    await expect(objHeader).toBeVisible();

    // Select the "+ Create new habit..." option in the newly created KR
    const linkSelect = page.locator('.kr-habit-link-row >> select');
    await expect(linkSelect).toBeVisible();
    await linkSelect.selectOption('__new__');

    // Verify it redirects to Habits tab and shows title
    await expect(page.locator('.habits-title')).toBeVisible();
    await expect(page.locator('.habits-title')).toHaveText('Habits');
  });
});
