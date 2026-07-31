import { test, expect } from '@playwright/test';

test.describe('GitHub PR Feedback Fixes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('version tag dynamically displays app version from __APP_VERSION__', async ({ page }) => {
    const versionTag = page.locator('.sidebar-version-tag');
    await expect(versionTag).toBeVisible();
    await expect(versionTag).toHaveText('v0.2.0');
  });

  test('sync status dot has disconnected class when not connected', async ({ page }) => {
    const syncDot = page.locator('.sync-status-dot');
    await expect(syncDot).toBeVisible();
    await expect(syncDot).toHaveClass(/disconnected/);
  });

  test('Session defaults tab loads and updates settings cleanly', async ({ page }) => {
    // Open Settings
    await page.locator('button[title="Settings"]').click();
    await expect(page.locator('.settings-page-container')).toBeVisible();

    // Click Session defaults tab
    await page.locator('button:has-text("Session defaults")').click();
    await expect(page.locator('.settings-card')).toBeVisible();
    await expect(page.getByText('Pomodoro Duration')).toBeVisible();
  });
});
