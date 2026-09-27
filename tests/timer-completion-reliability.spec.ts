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

// Load the app without navigating anywhere: the always-mounted SessionProvider
// (ADR-0013) still restores/completes the timer, and the doc is read directly.
async function waitForApplessLoad(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
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

  // The focus-phase sibling of the break self-heal tests below: recovery must
  // not just move the clock — it must run the FULL focus completion (one
  // honest history record with the task attached, the task's pomo count
  // bumped in-place, the break staged per cycle position).
  test('a missed focus completion self-heals: honest record, task pomo bumped, break staged', async ({ page }) => {
    await waitForApp(page);
    await selectTask(page, 'Design new dashboard layout');
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    const tickMs = await page.evaluate(() => Date.now());
    await page.evaluate(() => (window as any).__triggerTauriEvent('timer-tick', 1));
    await page.clock.fastForward(40_000);
    await page.evaluate(() => (window as any).__setMockTimerState([0, false, 'focus']));
    await page.clock.fastForward(5_000);

    // One focus record with the honest end (tick + 1s — delivered >30s late,
    // so the estimate must win) and the task attached...
    await expect.poll(async () => (await readAppRecordedFocusSessions(page)).length).toBe(1);
    const sessions = await readAppRecordedFocusSessions(page);
    expect(Math.abs(new Date(sessions[0].endedAt).getTime() - (tickMs + 1000))).toBeLessThan(1500);

    // ...the task's pomo count bumped 3 → 4 in the doc (in-place, rule 11)...
    await expect.poll(async () => page.evaluate(async () => {
      const d = await (window as any).__getAutomergeDoc();
      const t = (d.tasks || []).find((x: any) => x.id === 'task-1');
      return t ? t.completedPomodoros : -1;
    })).toBe(4);

    // ...and the short break staged (completedPomos 1, not a long-break
    // multiple; seed posture waits for a tap).
    await expect(page.locator('button.session-tab.active:has-text("Short Break")')).toBeVisible();
    await expect(page.locator('button:has-text("Start")')).toBeVisible();
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

  // The no-interaction sibling of the two recovery tests above: when the
  // completion event is lost, nothing prompts the user — the clock just sits
  // at 00:01 while the frontend still believes it is running. The app must
  // notice on its own that the timer's true end (completionAtRef, refined by
  // every tick) has passed and reconcile against the backend: a completed
  // timer reports (0, false, type), so the session closes out exactly as the
  // refocus path would — no click, no refocus required.
  test('a missed break completion self-heals with no interaction once the timer\'s end has passed', async ({ page }) => {
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

    // The break's last tick arrives; its completion event is never delivered.
    const tickMs = await page.evaluate(() => Date.now());
    await page.evaluate(() => (window as any).__triggerTauriEvent('timer-tick', 1));

    // The webview stays asleep long past the timer's end (far beyond the
    // reconcile grace) with no interaction of any kind...
    await page.clock.fastForward(40_000);
    // ...and Rust truthfully reports the completed timer: not running, 0 left.
    await page.evaluate(() => (window as any).__setMockTimerState([0, false, 'shortBreak']));
    await page.clock.fastForward(5_000);

    // The expired break closed out with its true end (tick time + 1s) — the
    // reconcile ran >30s late, so the honest estimate must win over `now`.
    // The record lands via an async chain (poll → completion → Automerge
    // queue), so poll for it rather than racing a one-shot read.
    await expect.poll(async () => (await readAppRecordedBreakSessions(page)).length).toBe(1);
    const sessions = await readAppRecordedBreakSessions(page);
    expect(Math.abs(new Date(sessions[0].endedAt).getTime() - (tickMs + 1000))).toBeLessThan(1500);

    // ...and focus is staged at full duration (seed posture: waits for a tap).
    await expect(page.locator('button.session-tab.active:has-text("Focus")')).toBeVisible();
    await expect(page.locator('.timer-digits')).toHaveText('25:00');
    await expect(page.locator('button:has-text("Start")')).toBeVisible();
  });

  // The webview can resume without a window focus event: the OS suspends it
  // underneath a window that never lost OS focus (screen lock, app nap). On
  // resume, the same reconcile the refocus path runs must fire on
  // visibilitychange — healing the frozen clock immediately, with no
  // interaction and no watchdog grace to wait out. The clock is PAUSED after
  // the freeze so nothing but the visibilitychange dispatch can drive time
  // (or the reconcile) here.
  test('an app made visible again processes a missed break completion without a refocus', async ({ page }) => {
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

    // The break's completion is missed; Rust reports the completed timer.
    const tickMs = await page.evaluate(() => Date.now());
    await page.evaluate(() => (window as any).__triggerTauriEvent('timer-tick', 1));
    await page.evaluate(() => (window as any).__setMockTimerState([0, false, 'shortBreak']));

    // Freeze real time ~1s after the tick — inside the watchdog grace — so
    // only the visibility event can drive a reconcile.
    await page.clock.pauseAt(new Date(tickMs + 1000));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

    // The expired break closed out (delivered ~on time, so `now` ≈ tick+1s).
    // Poll for the record: the reconcile → completion → Automerge chain is
    // async, and a one-shot read would race it.
    await expect.poll(async () => (await readAppRecordedBreakSessions(page)).length).toBe(1);
    const sessions = await readAppRecordedBreakSessions(page);
    expect(Math.abs(new Date(sessions[0].endedAt).getTime() - (tickMs + 1000))).toBeLessThan(1500);

    // ...and focus is staged at full duration (seed posture).
    await expect(page.locator('button.session-tab.active:has-text("Focus")')).toBeVisible();
    await expect(page.locator('.timer-digits')).toHaveText('25:00');
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

// A get_timer_state response only reflects the world when Rust processed the
// command — but its .then runs whenever the webview gets around to it. If the
// JS thread was blocked (an Automerge write at a completion can freeze it for
// seconds) while the session completed and a NEW one started, a poll issued
// for the old session resolves claiming (0, false) about a timer that no
// longer exists — and would complete the brand-new session (a phantom pomodoro
// + a full-duration history record). The reconcile must discard responses
// from a superseded session.
test.describe('Stale poll responses', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date('2026-05-24T09:00:00Z') });
    await page.addInitScript(() => {
      (window as any).__TAURI_INTERNALS__ = {};
    });
  });

  test('a poll response that resolves after a new session started is discarded', async ({ page }) => {
    await waitForApp(page);
    await selectTask(page, 'Design new dashboard layout');
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    // Complete the focus; the break stages (seed posture) and starts manually.
    await page.evaluate(() => (window as any).__triggerTauriEvent('timer-tick', 1));
    await page.evaluate(() => (window as any).__triggerTauriEvent('timer-complete'));
    await expect(page.locator('button.session-tab.active:has-text("Short Break")')).toBeVisible();
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    // The break freezes at 00:01 (missed completion). The watchdog polls at
    // 09:00:05 (grace end 09:00:04) — and its response is delayed 10s.
    await page.evaluate(() => (window as any).__triggerTauriEvent('timer-tick', 1));
    await page.evaluate(() => {
      (window as any).__setMockTimerState([0, false, 'shortBreak']);
      (window as any).__delayNextTimerState(10_000);
    });
    await page.clock.fastForward(5_000); // 09:00:05 — the delayed poll is in flight

    // While it is in flight, the REAL completion is delivered and the user
    // starts the next focus — a brand-new session (completion guard cleared).
    await page.evaluate(() => (window as any).__triggerTauriEvent('timer-complete'));
    await expect(page.locator('button.session-tab.active:has-text("Focus")')).toBeVisible();
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    // The stale response resolves now (09:00:15), claiming the OLD break
    // timer completed. It must be discarded, not honored.
    await page.clock.fastForward(10_000);

    // The new focus keeps running...
    await expect(page.locator('button.session-tab.active:has-text("Focus")')).toBeVisible();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();
    // ...exactly one break was recorded (the honest one)...
    await expect.poll(async () => (await readAppRecordedBreakSessions(page)).length).toBe(1);
    // ...and exactly one focus — the stale poll must not complete the new one.
    await expect.poll(async () => (await readAppRecordedFocusSessions(page)).length).toBe(1);
  });
});

// Boot-restore of a session that already finished while the app was gone
// (Rust's timer state is in-memory and lost on quit; the localStorage
// snapshot is the only witness). The restore-time completion must record the
// session's TRUE end — the last save plus its remaining seconds — not the
// reopen time. Otherwise a 5-minute break that ended hours ago is recorded as
// a hours-long session, the exact inflation this codebase already fought
// (observed: 178m, 626m, 3824m records).
test.describe('Boot-restore of a finished session', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date('2026-05-24T09:00:00Z') });
    await page.addInitScript(() => {
      (window as any).__TAURI_INTERNALS__ = {};
    });
  });

  test('records the true end, not the reopen time', async ({ page }) => {
    // A 5-min short break started 06:59, saved 07:03 with 60s left → its true
    // end is 07:04. The app reopens at 09:00 (mock get_timer_state reports
    // nothing, as a fresh Rust process would).
    await page.addInitScript(() => {
      localStorage.setItem('myokr_timer_state', JSON.stringify({
        sessionType: 'shortBreak',
        timeLeft: 60,
        isRunning: true,
        lastUpdated: '2026-05-24T07:03:00.000Z',
        activeTaskId: null,
        completedPomos: 0,
        sessionStartedAt: '2026-05-24T06:59:00.000Z',
      }));
    });
    await waitForApplessLoad(page);

    // The restore completes the break — with its honest end (07:04), ~2h
    // before the reopen. Poll: the completion → Automerge chain is async.
    // (The restore may also surface the No-Task confirm — the staged focus is
    // taskless — but the always-mounted provider does the recording whatever
    // tab is showing, so the doc is the thing to read.)
    await expect.poll(async () => (await readAppRecordedBreakSessions(page)).length).toBe(1);
    const sessions = await readAppRecordedBreakSessions(page);
    const endedMs = new Date(sessions[0].endedAt).getTime();
    expect(Math.abs(endedMs - Date.parse('2026-05-24T07:04:00.000Z'))).toBeLessThan(1500);
    expect(endedMs).toBeLessThan(Date.parse('2026-05-24T08:00:00.000Z'));
  });
});

// Contract pins for the reconcile branches the missed-completion tests never
// touch: production `get_timer_state` ALWAYS returns a tuple (the mock's
// default null is a test fiction), so a stalled-ticks re-sync and an
// out-of-band pause are live production behaviors — a bug in either would
// silently stop or warp healthy sessions. Also pins the watchdog's grace: a
// timer within 3s of its end must not be polled.
test.describe('Reconcile branches and watchdog grace', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date('2026-05-24T09:00:00Z') });
    await page.addInitScript(() => {
      (window as any).__TAURI_INTERNALS__ = {};
    });
  });

  // Run a taskless focus through the No-Task confirm, complete it, and start
  // the staged break manually (seed posture) — a running break, no task.
  async function runningBreak(page: Page) {
    await page.locator('button:has-text("Start")').click();
    const confirm = page.locator('.confirm-modal');
    await expect(confirm).toBeVisible();
    await confirm.locator('button:has-text("Start Anyway")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();
    await page.evaluate(() => (window as any).__triggerTauriEvent('timer-tick', 1));
    await page.evaluate(() => (window as any).__triggerTauriEvent('timer-complete'));
    await expect(page.locator('button.session-tab.active:has-text("Short Break")')).toBeVisible();
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();
  }

  test('a running backend with stalled ticks re-syncs the display on refocus', async ({ page }) => {
    await waitForApp(page);
    await runningBreak(page);

    // Ticks stall (display frozen at 05:00) while Rust runs on with 02:00
    // left. Refocus: the reconcile takes the backend's word.
    await page.evaluate(() => (window as any).__setMockTimerState([120, true, 'shortBreak']));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('.timer-digits')).toHaveText('02:00');
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();
  });

  test('a backend paused out-of-band stops the frontend instead of running blind', async ({ page }) => {
    await waitForApp(page);
    await runningBreak(page);

    await page.evaluate(() => (window as any).__setMockTimerState([120, false, 'shortBreak']));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    // The frontend matched the pause: Start shows, the clock waits.
    await expect(page.locator('button:has-text("Start")')).toBeVisible();
  });

  test('the watchdog stays quiet inside the grace window and polls after it', async ({ page }) => {
    await waitForApp(page);
    await runningBreak(page);

    const getStatePolls = () => page.evaluate(() =>
      ((window as any).__tauriInvokes ?? []).filter((c: string) => c === 'get_timer_state').length);

    // True end = tick arrival + 1s; the grace adds 3s. The fake clock's
    // sub-second phase is whatever the setup's real-time drift left it, so
    // keep both windows well clear of the threshold: end+1.5 is safely
    // inside, end+5.5 safely past.
    await page.evaluate(() => (window as any).__triggerTauriEvent('timer-tick', 1));
    const before = await getStatePolls();
    await page.clock.fastForward(1_500); // end+1.5 — inside grace
    expect(await getStatePolls()).toBe(before);
    await page.clock.fastForward(4_000); // end+5.5 — past grace
    expect(await getStatePolls()).toBeGreaterThan(before);
  });
});
