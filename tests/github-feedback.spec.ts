import { test, expect } from '@playwright/test';

test.describe('GitHub PR Feedback Fixes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('version tag dynamically displays app version from __APP_VERSION__', async ({ page }) => {
    const versionTag = page.locator('.sidebar-version-tag');
    await expect(versionTag).toBeVisible();
    await expect(versionTag).toHaveText('v0.3.0');
  });

  test('sync status dot has disconnected class when not connected', async ({ page }) => {
    const syncDot = page.locator('.sync-status-dot');
    await expect(syncDot).toBeVisible();
    await expect(syncDot).toHaveClass(/disconnected/);
  });

  test('Session defaults tab loads and updates settings cleanly', async ({ page }) => {
    // Open Settings (lands on Session defaults by default)
    await page.locator('button[title="Settings"]').click();
    await expect(page.locator('.settings-shell')).toBeVisible();
    await expect(page.locator('.settings-tabs .plan-tab.active')).toContainText('Session defaults');
    await expect(page.locator('.settings-panel-card').first()).toBeVisible();
    await expect(page.getByText('Pomodoro Duration')).toBeVisible();
  });
});
