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
    await page.locator('button:has-text("Day plan")').first().click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/today.png`,
      fullPage: false,
    });
  });

  test('capture plan day modal', async ({ page }) => {
    await page.locator('button:has-text("Day plan")').first().click();
    await page.waitForTimeout(500);

    await page.locator('.focus-plan-day-btn').click();
    await expect(page.locator('.planday-modal')).toBeVisible();
    await expect(page.locator('.planday-card').first()).toBeVisible();
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/plan-day-modal.png`,
      fullPage: false,
    });
  });

async function navTo(page: Page, title: string) {
  const btn = page.locator(`button[title="${title}"], button:has-text("${title}")`).first();
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

  test('capture timer view', async ({ page }) => {
    await navTo(page, 'Session');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/timer.png`,
      fullPage: false,
    });
  });

  test('capture tasks view', async ({ page }) => {
    await navTo(page, 'Tasks');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/tasks.png`,
      fullPage: false,
    });
  });

  test('capture analytics view', async ({ page }) => {
    await navTo(page, 'Analytics');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/analytics.png`,
      fullPage: false,
    });
  });

  test('capture okrs view', async ({ page }) => {
    await navTo(page, 'Objectives');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/okrs.png`,
      fullPage: false,
    });
  });

  test('capture habits view', async ({ page }) => {
    await navTo(page, 'Habits');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/habits.png`,
      fullPage: false,
    });
  });

  test('capture review view', async ({ page }) => {
    await navTo(page, 'Weekly review');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/review.png`,
      fullPage: false,
    });
  });

  test('capture sync view', async ({ page }) => {
    await navTo(page, 'Settings');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/sync.png`,
      fullPage: false,
    });
  });
});
