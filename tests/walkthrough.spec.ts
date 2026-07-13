import { test, expect } from '@playwright/test';

async function waitForApp(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
}

test.describe('Walkthrough dismissal', () => {
  test('Get Started closes the overlay even when the background save is stuck', async ({ page }) => {
    await waitForApp(page);

    // Force walkthroughState to 'not_seen' and reload so the overlay renders on next load.
    await page.evaluate(async () => {
      await (window as any).__updateAutomergeDoc('force not_seen', (d: any) => {
        d.walkthroughState = 'not_seen';
      });
      await (window as any).__flushAutomergeQueue(2000);
    });
    await waitForApp(page);

    const overlay = page.locator('.walkthrough-overlay');
    await expect(overlay).toBeVisible();

    // Simulate a stuck persistence queue (e.g. a hung/rejected saveWalkthroughState call).
    await page.evaluate(() => {
      (window as any).__getQueueInfoForTesting().setIsUpdating(true);
    });

    await page.locator('.walkthrough-btn-start').click();

    // The overlay must close immediately, without waiting on the stuck save.
    await expect(overlay).toHaveCount(0, { timeout: 1000 });

    // Cleanup so the stuck queue doesn't leak into other tests.
    await page.evaluate(() => {
      (window as any).__getQueueInfoForTesting().setIsUpdating(false);
    });
  });
});
