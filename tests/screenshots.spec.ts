import { test, expect } from '@playwright/test';

const SCREENSHOTS_DIR = 'screenshots';

test.describe('App Screenshots', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
  });

  test('capture tasks view', async ({ page }) => {
    // Click Tasks nav item
    await page.locator('button:has-text("Tasks")').click();
    // Wait for tasks to render
    await expect(page.locator('text=Design new dashboard layout')).toBeVisible({ timeout: 5000 });

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/tasks.png`,
      fullPage: false,
    });
  });

  test('capture okrs view', async ({ page }) => {
    // Click OKRs nav item
    await page.locator('button:has-text("OKRs")').click();
    // Wait for OKR content to render
    await expect(page.locator('text=Ship myOKR v2.0')).toBeVisible({ timeout: 5000 });

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/okrs.png`,
      fullPage: false,
    });
  });

  test('capture analytics view', async ({ page }) => {
    // Click Analytics nav item
    await page.locator('button:has-text("Analytics")').click();
    // Wait for analytics to render
    await expect(page.locator('text=Last 7 Days')).toBeVisible({ timeout: 5000 });

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/analytics.png`,
      fullPage: false,
    });
  });
});
