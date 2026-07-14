import { test, expect } from '@playwright/test';

test.describe('Habits Tab UI', () => {
  test.beforeEach(async ({ page }) => {
    // Set localStorage to bypass walkthrough and open Habits directly
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_active_section', 'habits');
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('allows creating, ticking, changing status, and deleting a habit', async ({ page }) => {
    // Verify we are on Habits tab
    await expect(page.locator('.habits-title')).toHaveText('📈 Habits');

    // Create a new habit
    const input = page.locator('.add-habit-input');
    await input.fill('Write E2E Tests');
    await page.locator('button:has-text("Add Habit")').click();

    // Verify it is listed
    await expect(page.locator('.habit-name')).toHaveText('Write E2E Tests');

    // Verify initial stats
    await expect(page.locator('.habit-stat-val').first()).toContainText('0');

    // Find today's button in the calendar grid (it has class "today")
    const todayBtn = page.locator('.calendar-day.today');
    await expect(todayBtn).toBeVisible();
    await todayBtn.click();

    // Verify stats updated (streak should be 1, total ticks should be 1)
    await expect(page.locator('.habit-stat-val').first()).toContainText('1');
    await expect(page.locator('.habit-stat-val').last()).toContainText('1');

    // Update status
    const statusSelect = page.locator('.habit-status-select');
    await statusSelect.selectOption('formed');

    // Now the habit is hidden (collapsible). We must toggle the formed section to see it
    const toggleBtn = page.locator('.formed-habits-toggle');
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn).toContainText('Formed Habits (1)');
    await toggleBtn.click();

    // Verify it is in the formed section and has value 'formed'
    await expect(statusSelect).toHaveValue('formed');

    // Delete the habit
    await page.locator('.habit-delete-btn').click();
    // Confirm in the modal
    await expect(page.locator('.prioritize-title')).toContainText('Delete Habit');
    await page.locator('.prioritize-actions >> button:has-text("Confirm")').click();

    // Verify it is gone
    await expect(page.locator('.habit-name')).toHaveCount(0);
  });
});
