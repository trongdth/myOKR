import { test, expect, type Page } from '@playwright/test';

// Missed timer-complete events in the packaged app (suspended webview, listener
// re-registration gap): the Rust timer finishes but the frontend never hears
// about it, staying frozen at 00:01 with a stale sessionStartRef. The completion
// is only processed later (window refocus, or a pause→resume click on the
// widget), and the record then uses `now` as endedAt — inflating a 40-min focus
// into hours or days (observed in real data: 178m, 626m, 3824m sessions).
//
// These tests run the app with the Tauri runtime emulated (mocks/tauri-api.ts),
// so the timer is driven by mocked Rust events and the wall clock is advanced
// via page.clock — a completion can be delivered "long after" the timer ended.

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
  await page.locator('button[title="Session"]').first().click();
}

// The Session tab's TaskList is gone (ticket 03); selectTask uses the Session
// Active Task Card picker.
async function selectTask(page: Page, name: string) {
  await page.locator('.active-task-card').click();
  await page.locator(`.task-picker-item:has-text("${name}")`).click();
}

// The seeded history already holds focus sessions for today (no taskId);
// sessions recorded by the app carry the task id — filter to those.
async function readAppRecordedFocusSessions(page: Page) {
  await page.evaluate(async () => {
    await (window as any).__flushAutomergeQueue();
  });
  return page.evaluate(async () => {
    const d = await (window as any).__getAutomergeDoc();
    const today = (d.history || []).find((r: any) => r.date === '2026-05-24');
    return (today?.sessions || []).filter((s: any) => s.type === 'focus' && s.taskId);
  });
}

test.describe('Missed timer completion', () => {
  test.beforeEach(async ({ page }) => {
    // Fixed clock: tick timestamps and the true-end estimate are deterministic.
    // (clock.install is required for fastForward to move Date.now().)
    await page.clock.install({ time: new Date('2026-05-24T09:00:00Z') });
    // Emulate the Tauri runtime: the timer is driven by mocked Rust events.
    await page.addInitScript(() => {
      (window as any).__TAURI_INTERNALS__ = {};
    });
  });

  test('a completion processed long after the timer ended records the true end, not now', async ({ page }) => {
    await waitForApp(page);
    await selectTask(page, 'Design new dashboard layout');
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    // The last tick before the timer ended: 1 second left → true end ≈ now + 1s.
    const tickMs = await page.evaluate(() => Date.now());
    await page.evaluate(() => (window as any).__triggerTauriEvent('timer-tick', 1));

    // The timer ended; the completion event is only delivered 35s later
    // (simulating a suspended webview / missed event).
    await page.clock.fastForward(35_000);
    await page.evaluate(() => (window as any).__triggerTauriEvent('timer-complete'));

    const sessions = await readAppRecordedFocusSessions(page);
    expect(sessions).toHaveLength(1);
    // The record must reflect the session's true end (tick time + 1s), not the
    // delivery time (35s later) — otherwise the focus is inflated by the gap.
    const endedMs = new Date(sessions[0].endedAt).getTime();
    expect(Math.abs(endedMs - (tickMs + 1000))).toBeLessThan(1500);
  });

  test('resuming a timer frozen at 00:01 closes the completed session instead of restarting a 1-second focus', async ({ page }) => {
    await waitForApp(page);
    await selectTask(page, 'Design new dashboard layout');
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    // Last tick: 1 second left. The timer completes unseen (frozen at 00:01).
    const tickMs = await page.evaluate(() => Date.now());
    await page.evaluate(() => (window as any).__triggerTauriEvent('timer-tick', 1));
    await page.clock.fastForward(60_000);

    // The user's pause→resume on the frozen timer.
    await page.locator('button:has-text("Pause")').click();
    await page.locator('button:has-text("Start")').click();

    // The completed session is closed out with its true end (tick time + 1s)...
    const sessions = await readAppRecordedFocusSessions(page);
    expect(sessions).toHaveLength(1);
    expect(Math.abs(new Date(sessions[0].endedAt).getTime() - (tickMs + 1000))).toBeLessThan(1500);

    // ...and the app moves to the break phase rather than starting a fresh
    // 1-second focus on a stale timer.
    await expect(page.locator('button.session-tab.active:has-text("Short Break")')).toBeVisible();

    // No fresh Rust timer was started for the resume — only the original start.
    const invokes = await page.evaluate(() => (window as any).__tauriInvokes ?? []);
    expect(invokes.filter((i: string) => i === 'start_timer')).toHaveLength(1);
  });
});
