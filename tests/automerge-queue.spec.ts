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
    // We expect it to return false (indicating timeout) after the 200ms timeout rather than hang.
    const start = Date.now();
    const result = await page.evaluate(async () => {
      const info = (window as any).__getQueueInfoForTesting();
      info.setIsUpdating(true);
      
      // Call flushAutomergeQueue with a 200ms timeout
      const val = await (window as any).__flushAutomergeQueue(200);
      
      // Reset isUpdating back to normal so we don't pollute state
      info.setIsUpdating(false);
      return val;
    });
    const duration = Date.now() - start;

    expect(result).toBe(false); // Should indicate timeout
    // The duration should be at least 200ms (since it timed out)
    expect(duration).toBeGreaterThanOrEqual(200);
    // And it should have completed (not hung indefinitely, which would timeout the test after 60s)
    expect(duration).toBeLessThan(10000); // well below Playwright's timeout

    // 3. Verify that calling flush on an empty queue returns true immediately
    const successResult = await page.evaluate(async () => {
      return await (window as any).__flushAutomergeQueue(100);
    });
    expect(successResult).toBe(true);
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

  test('mock filesystem reads/writes binary as base64 and falls back to legacy CSV with validation', async ({ page }) => {
    await waitForApp(page);

    // 1. Verify that writing and reading binary works perfectly
    const readData = await page.evaluate(async () => {
      const writeFn = (window as any).__mockFsWriteFile;
      const readFn = (window as any).__mockFsReadFile;
      
      const testData = new Uint8Array([72, 101, 108, 108, 111, 44, 32, 119, 111, 114, 108, 100, 33]); // "Hello, world!"
      await writeFn('test-file.bin', testData);
      
      const result = await readFn('test-file.bin');
      return Array.from(result);
    });
    expect(readData).toEqual([72, 101, 108, 108, 111, 44, 32, 119, 111, 114, 108, 100, 33]);

    // 2. Verify that mock_fs stored value is actually valid Base64 string
    const storedVal = await page.evaluate(() => {
      return localStorage.getItem('mock_fs_test-file.bin');
    });
    // "Hello, world!" encoded in Base64 is "SGVsbG8sIHdvcmxkIQ=="
    expect(storedVal).toBe('SGVsbG8sIHdvcmxkIQ==');

    // 3. Verify legacy CSV fallback support
    const legacyRead = await page.evaluate(async () => {
      // Manually set CSV data in localStorage
      localStorage.setItem('mock_fs_legacy-file.bin', '1,2,3,4,5');
      const readFn = (window as any).__mockFsReadFile;
      const result = await readFn('legacy-file.bin');
      return Array.from(result);
    });
    expect(legacyRead).toEqual([1, 2, 3, 4, 5]);

    // 4. Verify corrupted CSV data throws validation error
    const throwsError = await page.evaluate(async () => {
      // Manually set invalid CSV data
      localStorage.setItem('mock_fs_corrupted.bin', '1,two,3');
      const readFn = (window as any).__mockFsReadFile;
      try {
        await readFn('corrupted.bin');
        return false;
      } catch (e: any) {
        return e.message.includes('Corrupted data');
      }
    });
    expect(throwsError).toBe(true);
  });
});
