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

// The Session picker is sourced from the Day plan queue (ticket 05); replan so
// the seeded task joins the queue, then use the Session picker.
async function selectTask(page: Page, name: string) {
  await page.locator('button[title="Day plan"]').first().click();
  await page.waitForTimeout(300);
  await page.locator('.focus-plan-day-btn').click();
  // "Plan day" opens the preview-and-commit modal (was a silent replan);
  // Accept commits the fresh ranking so the queue updates.
  await page.locator('.planday-accept-btn').click();
  await page.locator('.planday-overlay').waitFor({ state: 'detached' });
  await page.waitForTimeout(500);
  await page.locator('button[title="Session"]').first().click();
  await page.waitForTimeout(300);
  await page.locator('.active-task-card-change').click();
  await page.locator(`.switcher-task:has-text("${name}")`).click();
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

// The seed generates focus sessions only — any shortBreak record is the
// app's own recording.
async function readAppRecordedBreakSessions(page: Page) {
  await page.evaluate(async () => {
    await (window as any).__flushAutomergeQueue();
  });
  return page.evaluate(async () => {
    const d = await (window as any).__getAutomergeDoc();
    const today = (d.history || []).find((r: any) => r.date === '2026-05-24');
    return (today?.sessions || []).filter((s: any) => s.type === 'shortBreak');
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

    // The resume's click was an explicit start, so the staged break RUNS —
    // one-click recovery (a staged-only resume eats the click). That makes
    // exactly one fresh Rust timer beyond the original: a full next-phase
    // timer on a fresh sessionStartRef, never a 1-second stale restart.
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();
    const invokes = await page.evaluate(() => (window as any).__tauriInvokes ?? []);
    expect(invokes.filter((i: string) => i === 'start_timer')).toHaveLength(2);
  });
});

// The break-phase sibling of the frozen-at-00:01 report: a short break whose
// completion event was missed freezes at 00:01 (Pause showing). The user's
// recovery attempt — pause the frozen clock, then click Start — must CLOSE the
// expired break AND begin the next focus session. Staging-only recovery eats
// the click ("I click start, nothing starts"), which is the reported bug.
test.describe('Missed break completion', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date('2026-05-24T09:00:00Z') });
    await page.addInitScript(() => {
      (window as any).__TAURI_INTERNALS__ = {};
    });
  });

  test('clicking Start on a short break frozen at 00:01 begins the next focus session', async ({ page }) => {
    await waitForApp(page);
    await selectTask(page, 'Design new dashboard layout');
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    // The focus completes normally (event delivered). The seed's
    // autoStartBreaks=false stages the break; start it manually.
    await page.evaluate(() => (window as any).__triggerTauriEvent('timer-tick', 1));
    await page.evaluate(() => (window as any).__triggerTauriEvent('timer-complete'));
    await expect(page.locator('button.session-tab.active:has-text("Short Break")')).toBeVisible();
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    // The break's last tick arrives; its completion event is missed (suspended
    // webview / listener gap). The clock freezes at 00:01 with Pause showing —
    // the exact reported state.
    const tickMs = await page.evaluate(() => Date.now());
    await page.evaluate(() => (window as any).__triggerTauriEvent('timer-tick', 1));
    await page.clock.fastForward(60_000);
    await expect(page.locator('.timer-digits')).toHaveText('00:01');
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    // The user's recovery attempt: pause the frozen clock, then click Start.
    await page.locator('button:has-text("Pause")').click();
    await page.locator('button:has-text("Start")').click();

    // The expired break closes out with its true end (tick time + 1s)...
    const sessions = await readAppRecordedBreakSessions(page);
    expect(sessions).toHaveLength(1);
    expect(Math.abs(new Date(sessions[0].endedAt).getTime() - (tickMs + 1000))).toBeLessThan(1500);

    // ...and the Start click BEGINS the next session: focus is running (Pause
    // showing) and Rust ticks move the clock again.
    await expect(page.locator('button.session-tab.active:has-text("Focus")')).toBeVisible();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();
    await page.evaluate(() => (window as any).__triggerTauriEvent('timer-tick', 1499));
    await expect(page.locator('.timer-digits')).toHaveText('24:59');
  });

  // Contract pin for the Rust half of the missed-completion recovery:
  // `get_timer_state` must report (0, false, type) for a timer that completed
  // naturally — the frontend's window-focus sync keys its missed-completion
  // detection on `!running && secs === 0`. The Rust side upholds this by
  // zeroing paused_secs on completion; if either side regresses, a completion
  // missed by a suspended webview freezes at 00:01 even after refocusing.
  test('refocusing the window processes a missed break completion when Rust reports 0 remaining', async ({ page }) => {
    await waitForApp(page);
    await selectTask(page, 'Design new dashboard layout');
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    // Complete the focus, stage + start the break manually (seed posture).
    await page.evaluate(() => (window as any).__triggerTauriEvent('timer-tick', 1));
    await page.evaluate(() => (window as any).__triggerTauriEvent('timer-complete'));
    await expect(page.locator('button.session-tab.active:has-text("Short Break")')).toBeVisible();
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    // The break's completion is missed; Rust truthfully reports the completed
    // timer: not running, 0 seconds left.
    await page.evaluate(() => (window as any).__triggerTauriEvent('timer-tick', 1));
    await page.clock.fastForward(60_000);
    await page.evaluate(() => (window as any).__setMockTimerState([0, false, 'shortBreak']));

    // The user refocuses the window: the sync must process the missed
    // completion — closing the break and staging focus — not just stop the
    // clock and leave it frozen at 00:01.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('button.session-tab.active:has-text("Focus")')).toBeVisible();
    await expect(page.locator('.timer-digits')).toHaveText('25:00');

    // The break was recorded (the completion really processed)...
    const sessions = await readAppRecordedBreakSessions(page);
    expect(sessions).toHaveLength(1);
    // ...and with autoStartFocus off (seed posture) focus waits for a tap.
    await expect(page.locator('button:has-text("Start")')).toBeVisible();
  });

  test('recovery on a frozen break with no active task asks No Task before starting focus', async ({ page }) => {
    await waitForApp(page);

    // Run a taskless focus: Start → the No-Task confirm → Start Anyway.
    await page.locator('button:has-text("Start")').click();
    const confirm = page.locator('.confirm-modal');
    await expect(confirm).toBeVisible();
    await confirm.locator('button:has-text("Start Anyway")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    // The focus completes; the break stages (seed posture) and starts manually.
    await page.evaluate(() => (window as any).__triggerTauriEvent('timer-tick', 1));
    await page.evaluate(() => (window as any).__triggerTauriEvent('timer-complete'));
    await expect(page.locator('button.session-tab.active:has-text("Short Break")')).toBeVisible();
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    // Freeze the break at 00:01 (missed completion); the user's pause→start.
    await page.evaluate(() => (window as any).__triggerTauriEvent('timer-tick', 1));
    await page.clock.fastForward(60_000);
    await page.locator('button:has-text("Pause")').click();
    await page.locator('button:has-text("Start")').click();

    // The staged next phase is a TASKLESS focus: the same No-Task confirm the
    // normal start path enforces must appear — not a silent taskless start.
    const confirm2 = page.locator('.confirm-modal');
    await expect(confirm2).toBeVisible();
    await expect(confirm2.locator('.prioritize-title')).toHaveText('No Task Selected');

    // Start Anyway begins the session (Pause showing, ticking).
    await confirm2.locator('button:has-text("Start Anyway")').click();
    await expect(page.locator('button.session-tab.active:has-text("Focus")')).toBeVisible();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();
    await page.evaluate(() => (window as any).__triggerTauriEvent('timer-tick', 1499));
    await expect(page.locator('.timer-digits')).toHaveText('24:59');
  });
});
