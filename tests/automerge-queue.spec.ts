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
      const adapter = (window as any).__fsTestAdapter;
      if (!adapter) throw new Error('__fsTestAdapter not exposed on window');
      const writeFn = adapter.writeFile;
      const readFn = adapter.readFile;
      
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
      const adapter = (window as any).__fsTestAdapter;
      const readFn = adapter.readFile;
      const result = await readFn('legacy-file.bin');
      return Array.from(result);
    });
    expect(legacyRead).toEqual([1, 2, 3, 4, 5]);

    // 4. Verify corrupted CSV data throws validation error
    const throwsError = await page.evaluate(async () => {
      // Manually set invalid CSV data
      localStorage.setItem('mock_fs_corrupted.bin', '1,two,3');
      const adapter = (window as any).__fsTestAdapter;
      const readFn = adapter.readFile;
      try {
        await readFn('corrupted.bin');
        return false;
      } catch (e: any) {
        return e.message.includes('Corrupted');
      }
    });
    expect(throwsError).toBe(true);
  });

  test('verifies that hide_window is not called if close event listener is unmounted/cancelled during queue flush', async ({ page }) => {
    await waitForApp(page);

    // Verify hooks are defined
    const hasHooks = await page.evaluate(() => {
      return (
        typeof (window as any).__cleanupCloseHandler === 'function' &&
        typeof (window as any).__getQueueInfoForTesting === 'function'
      );
    });
    expect(hasHooks).toBe(true);

    // Clear tauri invokes log
    await page.evaluate(() => {
      (window as any).__tauriInvokes = [];
    });

    // 1. Set isUpdating to true manually so that flushAutomergeQueue hangs
    await page.evaluate(() => {
      const info = (window as any).__getQueueInfoForTesting();
      info.setIsUpdating(true);
    });

    // 2. Trigger window-close-requested event
    await page.evaluate(() => {
      (window as any).__triggerTauriEvent('window-close-requested');
    });

    // 3. While it's hanging, call the cleanup/unmount handler
    await page.evaluate(() => {
      (window as any).__cleanupCloseHandler();
    });

    // 4. Release the queue hang by setting isUpdating back to false
    await page.evaluate(() => {
      const info = (window as any).__getQueueInfoForTesting();
      info.setIsUpdating(false);
    });

    // Wait a brief moment for async finally block to execute
    await page.waitForTimeout(100);

    // 5. Assert that 'hide_window' was NOT invoked because the handler was cancelled/unmounted!
    const invokes = await page.evaluate(() => {
      return (window as any).__tauriInvokes || [];
    });
    const hideWindowCalls = invokes.filter((cmd: string) => cmd === 'hide_window');
    expect(hideWindowCalls.length).toBe(0);
  });

  test('verifies that setting isUpdating to false resumes queue processing if there are pending tasks', async ({ page }) => {
    await waitForApp(page);

    // 1. Manually pause queue processing
    await page.evaluate(() => {
      const info = (window as any).__getQueueInfoForTesting();
      info.setIsUpdating(true);
    });

    // 2. Queue up an update doc task (this should remain pending because queue is paused)
    const updatePromise = page.evaluate(async () => {
      const updateDoc = (window as any).__updateAutomergeDoc;
      await updateDoc('Queue resume test', (d: any) => {
        d.testProperty = 'resumed';
      });
      return true;
    });

    // Verify it is not processed yet by checking doc
    const beforeProperty = await page.evaluate(async () => {
      const getDoc = (window as any).__getAutomergeDoc;
      const doc = await getDoc();
      return doc.testProperty;
    });
    expect(beforeProperty).toBeUndefined();

    // 3. Resume queue processing
    await page.evaluate(() => {
      const info = (window as any).__getQueueInfoForTesting();
      info.setIsUpdating(false);
    });

    // 4. Await the update task to complete and verify the change was applied
    await updatePromise;
    const afterProperty = await page.evaluate(async () => {
      const getDoc = (window as any).__getAutomergeDoc;
      const doc = await getDoc();
      return doc.testProperty;
    });
    expect(afterProperty).toBe('resumed');
  });

  test('verifies close event listener is cleaned up and does not leak on unmount', async ({ page }) => {
    await waitForApp(page);

    // Get active listener count before cleanup
    const countBefore = await page.evaluate(() => {
      return window.__getActiveListenerCount ? window.__getActiveListenerCount('window-close-requested') : 0;
    });
    expect(countBefore).toBe(1);

    // Call cleanup handler
    await page.evaluate(() => {
      if (window.__cleanupCloseHandler) {
        window.__cleanupCloseHandler();
      }
    });

    // Verify active listener count is now 0
    const countAfter = await page.evaluate(() => {
      return window.__getActiveListenerCount ? window.__getActiveListenerCount('window-close-requested') : 0;
    });
    expect(countAfter).toBe(0);
  });

  test('verifies that mock listen deduplicates duplicate handler registrations', async ({ page }) => {
    await waitForApp(page);

    const count = await page.evaluate(async () => {
      const mockListen = window.__mockListen;
      const getCount = window.__getActiveListenerCount;
      if (!mockListen || !getCount) throw new Error('Helpers not exposed');
      
      const handler = () => {};
      const unlisten1 = await mockListen('test-dedup-event', handler);
      const unlisten2 = await mockListen('test-dedup-event', handler);
      
      const res = getCount('test-dedup-event');
      // Clean up to avoid leaking
      unlisten1();
      unlisten2();
      return res;
    });

    expect(count).toBe(1);
  });
});
