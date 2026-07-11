import { test, expect } from '@playwright/test';

async function waitForApp(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
}

test.describe('Automerge Queue Resilience', () => {
  test('flushAutomergeQueue times out and returns instead of hanging indefinitely when the queue is stuck', async ({ page }) => {
    await waitForApp(page);

    // 1. Verify the global test hooks are defined
    const hasHooks = await page.evaluate(() => {
      return (
        typeof (window as any).__flushAutomergeQueue === 'function' &&
        typeof (window as any).__getQueueInfoForTesting === 'function'
      );
    });
    expect(hasHooks).toBe(true);

    // 2. Set isUpdating to true manually to simulate a hung background task
    // and attempt to flush the queue with a short timeout.
    // We expect it to resolve successfully after the timeout (e.g., 200ms) rather than hang.
    const start = Date.now();
    await page.evaluate(async () => {
      const info = (window as any).__getQueueInfoForTesting();
      info.setIsUpdating(true);
      
      // Call flushAutomergeQueue with a 200ms timeout
      await (window as any).__flushAutomergeQueue(200);
      
      // Reset isUpdating back to normal so we don't pollute state
      info.setIsUpdating(false);
    });
    const duration = Date.now() - start;

    // The duration should be at least 200ms (since it timed out)
    expect(duration).toBeGreaterThanOrEqual(200);
    // And it should have completed (not hung indefinitely, which would timeout the test after 60s)
    expect(duration).toBeLessThan(10000); // well below Playwright's timeout
  });

  test('verifies that rapid successive close events only trigger flush and hide_window once due to isClosing guard', async ({ page }) => {
    await waitForApp(page);

    // Clear any previous invokes
    await page.evaluate(() => {
      (window as any).__tauriInvokes = [];
    });

    // Trigger window-close-requested twice in rapid succession
    await page.evaluate(() => {
      (window as any).__triggerTauriEvent('window-close-requested');
      (window as any).__triggerTauriEvent('window-close-requested');
    });

    // Wait a brief moment to let async operations settle
    await page.waitForTimeout(100);

    // Assert that 'hide_window' was invoked exactly once
    const invokes = await page.evaluate(() => {
      return (window as any).__tauriInvokes || [];
    });
    const hideWindowCalls = invokes.filter((cmd: string) => cmd === 'hide_window');
    expect(hideWindowCalls.length).toBe(1);
  });
});
