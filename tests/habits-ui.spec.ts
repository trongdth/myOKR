import { test, expect } from '@playwright/test';

test.describe('Habits Tab UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('allows creating, ticking, changing status, and deleting a habit', async ({ page }) => {
    // Navigate to Habits tab
    await page.locator('nav >> text=Habits').click();
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
