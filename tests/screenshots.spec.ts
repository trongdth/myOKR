import { test, expect } from '@playwright/test';

const SCREENSHOTS_DIR = 'screenshots';

test.describe('App Screenshots', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
  });

  test('capture walkthrough view', async ({ page }) => {
    await page.evaluate(async () => {
      window.localStorage.setItem('myokr_walkthrough_state', '"not_seen"');
      if ((window as any).__updateAutomergeDoc) {
        await (window as any).__updateAutomergeDoc('force not_seen', (d: any) => {
          d.walkthroughState = 'not_seen';
        });
      }
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.walkthrough-overlay')).toBeVisible({ timeout: 5000 });

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/walkthrough.png`,
      fullPage: false,
    });
  });

  test('capture today view', async ({ page }) => {
    await page.locator('button:has-text("Today")').click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/today.png`,
      fullPage: false,
    });
  });

  test('capture timer view', async ({ page }) => {
    await page.locator('button:has-text("Timer")').click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/timer.png`,
      fullPage: false,
    });
  });

  test('capture tasks view', async ({ page }) => {
    await page.locator('button:has-text("Tasks")').click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/tasks.png`,
      fullPage: false,
    });
  });

  test('capture analytics view', async ({ page }) => {
    await page.locator('button:has-text("Analytics")').click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/analytics.png`,
      fullPage: false,
    });
  });

  test('capture okrs view', async ({ page }) => {
    await page.locator('button:has-text("OKRs")').click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/okrs.png`,
      fullPage: false,
    });
  });

  test('capture habits view', async ({ page }) => {
    await page.locator('button:has-text("Habits")').click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/habits.png`,
      fullPage: false,
    });
  });

  test('capture review view', async ({ page }) => {
    await page.locator('button:has-text("Review")').click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/review.png`,
      fullPage: false,
    });
  });

  test('capture sync view', async ({ page }) => {
    await page.locator('button:has-text("Cloud Sync")').click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/sync.png`,
      fullPage: false,
    });
  });
});
