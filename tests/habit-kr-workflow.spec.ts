import { test, expect } from '@playwright/test';

test.describe('Habit KR Linking & Progress Workflow', () => {
  test.beforeEach(async ({ page }) => {
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
    await page.locator('nav >> text=Habits').click();
    await expect(page.locator('.habits-title')).toHaveText('📈 Habits');

    const habitInput = page.locator('.add-habit-input');
    await habitInput.fill('Forming E2E Habit');
    await page.locator('button:has-text("Add Habit")').click();
    await expect(page.locator('.habit-name')).toHaveText('Forming E2E Habit');

    // 2. Go to OKRs tab and create objective + KR
    await page.locator('nav >> text=OKRs').click();
    await expect(page.locator('.okr-header-title')).toBeVisible();

    const objInput = page.locator('.okr-add-objective >> input');
    await objInput.fill('Habit E2E Objective');
    await page.locator('button:has-text("+ Add Objective")').click();

    // Find and expand the objective card
    const objHeader = page.locator('.objective-header:has-text("Habit E2E Objective")');
    await expect(objHeader).toBeVisible();
    await objHeader.click();

    // Create a Habit KR
    const krInput = page.locator('.kr-add-row >> input');
    await krInput.fill('E2E Ticking KR');
    const krModeSelect = page.locator('.kr-mode-select');
    await krModeSelect.selectOption({ label: '📈 Habit Ticks' });
    await page.locator('button:has-text("+ Add KR")').click();

    // Select the linked habit in the newly created KR
    const linkSelect = page.locator('.kr-habit-link-row >> select');
    await expect(linkSelect).toBeVisible();
    await linkSelect.selectOption({ label: 'Forming E2E Habit' });

    // 3. Go to Today tab, check off the habit today
    await page.locator('nav >> text=Today').click();
    await expect(page.locator('h1:has-text("Today\'s Focus")')).toBeVisible();

    // Toggle today's habit tick
    const todayHabitBtn = page.locator('button:has-text("Forming E2E Habit")');
    await expect(todayHabitBtn).toBeVisible();
    await todayHabitBtn.click();
    
    // Check it displays ticked (contains visual indicator)
    await expect(todayHabitBtn).toContainText('✅');

    // 4. Go back to OKRs and check progress
    await page.locator('nav >> text=OKRs').click();
    
    // Expand the objective again to make the KR row visible
    const objHeader2 = page.locator('.objective-header:has-text("Habit E2E Objective")');
    await expect(objHeader2).toBeVisible();
    await objHeader2.click();

    const krRow = page.locator('.kr-row:has-text("E2E Ticking KR")');
    await expect(krRow).toBeVisible();
    
    // Progress should be 1/10 (10%) since target defaults to 10 for habits
    await expect(krRow.locator('.kr-progress-text')).toContainText('1 / 10 ticks');
    await expect(krRow.locator('.kr-progress-percent')).toContainText('10.0%');

    // 5. Clean up habit (which also tests KR unlink fallback to manual mode)
    await page.locator('nav >> text=Habits').click();
    await page.locator('.habit-delete-btn').click();
    
    // Expect ConfirmModal warning about linked KR
    await expect(page.locator('.prioritize-title')).toContainText('Delete Linked Habit?');
    await page.locator('.prioritize-actions >> button:has-text("Confirm")').click();
    await expect(page.locator('.habit-name')).toHaveCount(0);

    // Verify KR fell back to manual completion mode with preserved progress value
    await page.locator('nav >> text=OKRs').click();

    const objHeader3 = page.locator('.objective-header:has-text("Habit E2E Objective")');
    await expect(objHeader3).toBeVisible();
    await objHeader3.click();

    const krRowAfter = page.locator('.kr-row:has-text("E2E Ticking KR")');
    await expect(krRowAfter).toBeVisible();
    await expect(krRowAfter.locator('.kr-mode-badge-label')).toContainText('✏️ Manual');
    await expect(krRowAfter.locator('.kr-progress-text')).toContainText('1 / 10 %'); // Unit reverted to % for manual
  });
});
