import { test, expect, type Page } from '@playwright/test';

// --- Helpers ---

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
  // Navigate to Timer since Today is now the default landing tab
  await page.locator('button[title="Session"]').first().click();
}

// The Session tab's TaskList was removed in ticket 03 (ADR-0016); the Active
// Task Card's picker (pulled forward into 03) is now the in-Session selection
// surface. Task creation still happens on the Tasks tab (quick-add lands in
// Backlog). selectTask opens the card picker on Session and picks the task.
async function openTasks(page: Page) {
  const item = page.locator('button[title="Tasks"]').first();
  if (!(await item.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
  }
  await item.click();
  await page.waitForTimeout(300);
}

async function openSession(page: Page) {
  await page.locator('button[title="Session"]').first().click();
  await page.waitForTimeout(300);
}

async function addTask(page: Page, name: string) {
  await openTasks(page);
  // Tasks tab quick-add bar (ticket 03): .quick-add-input + Enter submits the
  // <form className="quick-add-bar">. New tasks land in the Backlog bucket.
  const input = page.locator('.quick-add-input');
  await input.fill(name);
  await input.press('Enter');
  // Board card appears in the Backlog column.
  await expect(page.locator(`.board-task-card:has-text("${name}")`)).toBeVisible();
}

// Open the Task detail modal for a task by clicking its board card title on
// the Tasks tab. The modal (TaskDetailModal.tsx) is the new home of the
// PomoEstimatePopover and the Complete affordance after the Session TaskList
// was removed (ticket 03 / ADR-0016).
async function openTaskDetail(page: Page, name: string) {
  await openTasks(page);
  await page.locator(`.board-task-card:has-text("${name}") .card-title`).click();
  await expect(page.locator('.task-detail-panel')).toBeVisible();
}

// Mark a task complete via its board card's tick button (Tasks tab). Faster
// than opening the modal; equivalent to the old .task-checkbox inline click.
// Tolerant of the task already being completed (e.g. auto-completed by Option
// C when its estimate was met) — completed tasks leave the board, so the card
// and its tick are gone; in that case this is a no-op.
async function completeTaskInline(page: Page, name: string) {
  await openTasks(page);
  const tick = page.locator(`.board-task-card:has-text("${name}") .card-tick`);
  if (await tick.count().catch(() => 0) > 0) {
    await tick.click();
  }
}

async function selectTask(page: Page, name: string) {
  // Replan the Day plan so newly-created tasks join the queue (the Session
  // picker is sourced from TodayPlan.taskIds, ticket 05; a saved plan doesn't
  // re-rank on its own).
  await page.locator('button[title="Day plan"]').first().click();
  await page.waitForTimeout(300);
  await page.locator('.focus-plan-day-btn').click();
  await page.waitForTimeout(500);
  await openSession(page);
  await page.locator('.active-task-card').click();
  await page.locator(`.task-picker-item:has-text("${name}")`).click();
  // When switching while a focus timer is running, setActiveTask stages the
  // switch behind a "Switch Task" confirmation modal instead of updating the
  // card immediately — so accept EITHER the card updating OR the modal. Tests
  // that care about which path they're on assert it themselves afterwards.
  await expect(async () => {
    const cardHasName = await page.locator('.active-task-card').textContent().then(t => (t || '').includes(name));
    const modalUp = await page.locator('.confirm-modal').count().then(c => c > 0);
    expect(cardHasName || modalUp).toBeTruthy();
  }).toPass({ timeout: 5000 });
}

// Bump a task's pomodoro estimate to 2 via the Adjust Total Pomodoros popover
// in the Task detail modal (Tasks tab). Under Option C a task auto-completes
// when its estimate is met; new tasks default to estimate=1, so one session
// would finish them. Tests that need a task to stay NOT-done after a single
// session bump it to 2 first (1/2).
async function bumpEstimateToTwo(page: Page, name: string) {
  await openTaskDetail(page, name);
  // The modal's pomodoro line renders PomoEstimatePopover with plain readout.
  const pomoBadge = page.locator('.task-detail-panel .task-pomodoros');
  await pomoBadge.click();
  const popover = page.locator('.pomo-estimate-popover');
  await expect(popover).toBeVisible();
  await popover.locator('button.pomo-counter-btn:has-text("+")').click();
  await popover.locator('button.pomo-popover-confirm').click();
  await expect(popover).toHaveCount(0);
  // Close the modal via its close button and confirm it's gone.
  await page.locator('.task-detail-panel .modal-close-btn').click();
  await expect(page.locator('.task-detail-panel')).toHaveCount(0);
}

async function openSettings(page: Page) {
  await page.locator('.timer-controls button[title="Settings"]').click();
  await expect(page.locator('.settings-panel')).toBeVisible();
}

async function enableAutoStart(page: Page) {
  await openSettings(page);
  const breakToggle = page.locator('.toggle-row:has-text("Auto-start breaks") .toggle-switch');
  if (await breakToggle.evaluate(el => !el.classList.contains('on'))) {
    await breakToggle.click();
  }
  const focusToggle = page.locator('.toggle-row:has-text("Auto-start focus") .toggle-switch');
  if (await focusToggle.evaluate(el => !el.classList.contains('on'))) {
    await focusToggle.click();
  }
  await page.locator('.timer-controls button[title="Settings"]').click();
}

async function setDurations(page: Page, focus: number, shortBreak: number) {
  await openSettings(page);
  const inputs = page.locator('.settings-grid input[type="number"]');
  await inputs.nth(0).fill(String(focus));
  await inputs.nth(1).fill(String(shortBreak));
  await page.locator('.timer-controls button[title="Settings"]').click();
}

// Wait for session tab to become active — detects session transitions
// without relying on the transient "00:00" state
async function waitForSessionTab(page: Page, label: string) {
  await expect(page.locator(`button.session-tab.active:has-text("${label}")`)).toBeVisible({ timeout: 90000 });
}

// Speed up setInterval/setTimeout so 1-min sessions complete in ~3s real time
async function speedUpTimers(page: Page) {
  await page.evaluate(() => {
    const origInterval = window.setInterval.bind(window);
    const origTimeout = window.setTimeout.bind(window);
    const speed = (ms: number) => ms >= 500 ? Math.max(ms / 20, 10) : ms;
    (window as any).setInterval = (fn: TimerHandler, ms?: number, ...args: any[]) =>
      origInterval(fn, ms !== undefined ? speed(ms) : ms, ...args);
    (window as any).setTimeout = (fn: TimerHandler, ms?: number, ...args: any[]) =>
      origTimeout(fn, ms !== undefined ? speed(ms) : ms, ...args);
  });
}

// ==========================================
// FEATURE 1: No task selected warning
// ==========================================

test.describe('Pomodoro: No task selected warning', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
  });

  test('shows warning when starting focus without a task, then starts on confirm', async ({ page }) => {
    await expect(page.locator('.timer-digits')).toHaveText('25:00');

    // Click Start without selecting a task
    await page.locator('button:has-text("Start")').click();

    // Warning modal should appear
    await expect(page.locator('.confirm-modal')).toBeVisible();
    await expect(page.locator('.confirm-modal .prioritize-title')).toHaveText(/No Task Selected/);
    await expect(page.locator('.confirm-modal button:has-text("Start Anyway")')).toBeVisible();

    // Confirm — timer should start
    await page.locator('.confirm-modal button:has-text("Start Anyway")').click();

    // Modal closes, timer starts counting down
    await expect(page.locator('.confirm-modal')).toHaveCount(0);
    await expect(page.locator('.timer-digits')).not.toHaveText('25:00', { timeout: 3000 });
  });

  test('shows warning when starting focus without a task, cancels and stays paused', async ({ page }) => {
    await expect(page.locator('.timer-digits')).toHaveText('25:00');

    // Click Start without selecting a task
    await page.locator('button:has-text("Start")').click();

    // Warning modal should appear
    await expect(page.locator('.confirm-modal')).toBeVisible();

    // Cancel — timer should NOT start
    await page.locator('.confirm-modal button:has-text("Cancel")').click();

    // Modal closes, timer stays at 25:00
    await expect(page.locator('.confirm-modal')).toHaveCount(0);
    await expect(page.locator('.timer-digits')).toHaveText('25:00');
    await expect(page.locator('button:has-text("Start")')).toBeVisible();
  });

  test('shows warning when starting focus if active task was completed', async ({ page }) => {
    await addTask(page, 'Task to complete');
    // Select the task on Session (sets it active), then complete it on Tasks
    // via the board card's tick (the TaskList + checkbox were removed in
    // ticket 03 / ADR-0016).
    await selectTask(page, 'Task to complete');
    await completeTaskInline(page, 'Task to complete');

    // Return to Session and click Start — warning modal should appear because
    // the active task is completed.
    await openSession(page);
    await page.locator('button:has-text("Start")').click();

    await expect(page.locator('.confirm-modal')).toBeVisible();
    await expect(page.locator('.confirm-modal .prioritize-title')).toHaveText(/No Task Selected/);
  });

  test('does NOT show warning when starting break session', async ({ page }) => {
    // Switch to Short Break
    await page.locator('button.session-tab:has-text("Short Break")').click();
    await expect(page.locator('.timer-digits')).toHaveText('05:00');

    // Click Start — no warning should appear
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('.confirm-modal')).toHaveCount(0);
    await expect(page.locator('.timer-digits')).not.toHaveText('05:00', { timeout: 3000 });
  });

  test('does NOT show warning when a task is selected', async ({ page }) => {
    // Add and select a task
    await addTask(page, 'My Task');
    await selectTask(page, 'My Task');

    // Start — no warning
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('.confirm-modal')).toHaveCount(0);
    await expect(page.locator('.timer-digits')).not.toHaveText('25:00', { timeout: 3000 });
  });
});

// ==========================================
// FEATURE 2: Task changed on auto-start focus
// ==========================================

test.describe('Pomodoro: Task changed auto-start confirmation', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await speedUpTimers(page);
  });

  test('shows confirmation when task changed during break and previous not done', async ({ page }) => {
    // Setup: 1-min focus, 1-min break, enable auto-start
    await setDurations(page, 1, 1);
    await enableAutoStart(page);

    // Create two tasks
    await addTask(page, 'Task Alpha');
    await addTask(page, 'Task Beta');
    // Alpha needs >1 pomodoro so it stays NOT-done after one session (Option C
    // auto-completes a task when its estimate is met; default estimate is 1).
    await bumpEstimateToTwo(page, 'Task Alpha');

    // Select Task Alpha and start focus
    await selectTask(page, 'Task Alpha');
    await expect(page.locator('.active-task-card')).toContainText('Task Alpha');
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    // Wait for focus to complete (~3s real time with speed-up timers)
    await waitForSessionTab(page, 'Short Break');

    // During break, switch to Task Beta
    await selectTask(page, 'Task Beta');
    await expect(page.locator('.active-task-card')).toContainText('Task Beta');

    // Wait for break to complete
    await waitForSessionTab(page, 'Focus');

    // Task Changed confirmation should appear
    await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.confirm-modal .prioritize-title')).toHaveText(/Task Changed/);
  });

  test('does NOT show confirmation when previous task is completed', async ({ page }) => {
    await setDurations(page, 1, 1);
    await enableAutoStart(page);

    await addTask(page, 'Task Done');
    await addTask(page, 'Task Next');

    await selectTask(page, 'Task Done');
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    // Wait for focus to complete
    await waitForSessionTab(page, 'Short Break');

    // Complete Task Done via the Tasks board card's tick (the TaskList +
    // checkbox were removed in ticket 03 / ADR-0016).
    await completeTaskInline(page, 'Task Done');

    // Switch to Task Next
    await selectTask(page, 'Task Next');

    // Wait for break to complete
    await waitForSessionTab(page, 'Focus');

    // No confirmation — timer should auto-start without modal
    await expect(page.locator('.confirm-modal')).toHaveCount(0, { timeout: 5000 });
    await expect(page.locator('button:has-text("Pause")')).toBeVisible({ timeout: 5000 });
  });

  test('shows No Task Selected warning when break finishes after active task auto-completed', async ({ page }) => {
    await setDurations(page, 1, 1);
    await enableAutoStart(page);

    // Create task with estimate 1 (default) so focus session completion auto-completes it
    await addTask(page, 'Single Pomo Task');
    await selectTask(page, 'Single Pomo Task');

    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    // Wait for focus to complete and auto-transition to break
    await waitForSessionTab(page, 'Short Break');

    // Wait for break to complete and auto-transition to focus
    await waitForSessionTab(page, 'Focus');

    // Since the single pomo task was auto-completed, no active uncompleted task exists.
    // "No Task Selected" warning modal should appear instead of starting focus with no task.
    await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.confirm-modal .prioritize-title')).toHaveText(/No Task Selected/);
  });

  test('cancel on task changed confirmation stops auto-start', async ({ page }) => {
    await setDurations(page, 1, 1);
    await enableAutoStart(page);

    await addTask(page, 'Task A');
    await addTask(page, 'Task B');
    // Task A needs >1 pomodoro so it stays NOT-done after one session (Option C
    // auto-completes when the estimate is met; default estimate is 1).
    await bumpEstimateToTwo(page, 'Task A');

    await selectTask(page, 'Task A');
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    // Wait for focus to complete
    await waitForSessionTab(page, 'Short Break');

    // Switch to Task B during break
    await selectTask(page, 'Task B');

    // Wait for break to complete
    await waitForSessionTab(page, 'Focus');

    // Task Changed confirmation appears
    await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 5000 });

    // Cancel — auto-start should NOT happen
    await page.locator('.confirm-modal button:has-text("Cancel")').click();
    await expect(page.locator('.confirm-modal')).toHaveCount(0);

    // Timer should NOT be running (Start button visible, not Pause)
    await expect(page.locator('button:has-text("Start")')).toBeVisible();
  });
});

// ==========================================
// FEATURE 3: Switch task while timer running
// ==========================================

test.describe('Pomodoro: Switch task while running', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
  });

  test('pauses timer and shows confirmation when switching task during focus', async ({ page }) => {
    // Create two tasks
    await addTask(page, 'Task One');
    await addTask(page, 'Task Two');

    // Select Task One and start timer
    await selectTask(page, 'Task One');
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    // Click Task Two while timer is running
    await selectTask(page, 'Task Two');

    // Timer should pause, confirmation modal should appear
    await expect(page.locator('.confirm-modal')).toBeVisible();
    await expect(page.locator('.confirm-modal .prioritize-title')).toHaveText(/Switch Task/);

    // Confirm switch — task changes and timer resumes
    await page.locator('.confirm-modal button:has-text("Switch")').click();
    await expect(page.locator('.confirm-modal')).toHaveCount(0);
    await expect(page.locator('.active-task-card')).toContainText('Task Two');
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();
  });

  test('cancels switch and keeps original task running', async ({ page }) => {
    await addTask(page, 'Task A');
    await addTask(page, 'Task B');

    await selectTask(page, 'Task A');
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    // Click Task B while running
    await selectTask(page, 'Task B');
    await expect(page.locator('.confirm-modal')).toBeVisible();

    // Cancel — keep original task, timer resumes
    await page.locator('.confirm-modal button:has-text("Cancel")').click();
    await expect(page.locator('.confirm-modal')).toHaveCount(0);
    await expect(page.locator('.active-task-card')).toContainText('Task A');
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();
  });

  test('does NOT show confirmation when timer is paused', async ({ page }) => {
    await addTask(page, 'Task X');
    await addTask(page, 'Task Y');

    await selectTask(page, 'Task X');
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    // Pause the timer
    await page.locator('button:has-text("Pause")').click();
    await expect(page.locator('button:has-text("Start")')).toBeVisible();

    // Switch task while paused — no confirmation
    await selectTask(page, 'Task Y');
    await expect(page.locator('.confirm-modal')).toHaveCount(0);
    await expect(page.locator('.active-task-card')).toContainText('Task Y');
  });

  test('does NOT show confirmation when no task was previously selected', async ({ page }) => {
    await addTask(page, 'First Task');
    // addTask ends on Tasks; return to Session to reach the timer controls.
    await openSession(page);

    // Start without task (confirm "Start Anyway")
    await page.locator('button:has-text("Start")').click();
    await page.locator('.confirm-modal button:has-text("Start Anyway")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    // Select a task while running — no previous task, so no confirmation
    await selectTask(page, 'First Task');
    await expect(page.locator('.confirm-modal')).toHaveCount(0);
    await expect(page.locator('.active-task-card')).toContainText('First Task');
  });

  test('restores running state on startup and remains paused at correct remaining time when clicking Pause', async ({ page }) => {
    // Open settings and set Focus duration to 40 mins
    await page.locator('.timer-controls button[title="Settings"]').click();
    const focusInput = page.locator('.settings-grid input[type="number"]').first();
    await focusInput.fill('40');
    // Close settings
    await page.locator('.timer-controls button[title="Settings"]').click();
    await expect(page.locator('.timer-digits')).toHaveText('40:00');

    // Save running state at 20 mins to localStorage
    const savedState = {
      sessionType: 'focus',
      timeLeft: 1200, // 20 minutes remaining
      isRunning: true,
      lastUpdated: new Date().toISOString(),
      activeTaskId: null,
      completedPomos: 0,
      sessionStartedAt: new Date().toISOString(),
    };
    await page.evaluate((state) => {
      localStorage.setItem('myokr_timer_state', JSON.stringify(state));
    }, savedState);

    // Reload app to trigger mount init()
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Loading...')).toHaveCount(0);
    // Navigate to Timer tab
    await page.locator('button[title="Session"]').first().click();

    // Verify timer is restored to 20:00 (or slightly less, e.g. 19:59 due to reload time)
    const digitsBeforePause = await page.locator('.timer-digits').textContent();
    const [minsBefore] = digitsBeforePause!.split(':').map(Number);
    expect(minsBefore).toBe(20);

    // Pause the timer
    await page.locator('button:has-text("Pause")').click();
    await expect(page.locator('button:has-text("Start")')).toBeVisible();

    // Verify it stays at 20 mins (or ~19 mins) and does NOT jump to 40:00!
    const digitsAfterPause = await page.locator('.timer-digits').textContent();
    const [minsAfter] = digitsAfterPause!.split(':').map(Number);
    expect(minsAfter).toBeLessThan(25); // Definitely should not jump back to 40!
  });

  test('does not reset paused timer progress to settings duration on data sync', async ({ page }) => {
    // Open settings and set Focus duration to 40 mins
    await page.locator('.timer-controls button[title="Settings"]').click();
    const focusInput = page.locator('.settings-grid input[type="number"]').first();
    await focusInput.fill('40');
    await page.locator('.timer-controls button[title="Settings"]').click();
    await expect(page.locator('.timer-digits')).toHaveText('40:00');

    // Save running state at 20 mins to localStorage
    const savedState = {
      sessionType: 'focus',
      timeLeft: 1200, // 20 minutes remaining
      isRunning: true,
      lastUpdated: new Date().toISOString(),
      activeTaskId: null,
      completedPomos: 0,
      sessionStartedAt: new Date().toISOString(),
    };
    await page.evaluate((state) => {
      localStorage.setItem('myokr_timer_state', JSON.stringify(state));
    }, savedState);

    // Reload app to trigger mount init()
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Loading...')).toHaveCount(0);
    // Navigate to Timer tab
    await page.locator('button[title="Session"]').first().click();

    // Verify timer is restored to 20:00
    const digitsBeforePause = await page.locator('.timer-digits').textContent();
    const [minsBefore] = digitsBeforePause!.split(':').map(Number);
    expect(minsBefore).toBe(20);

    // Pause on frontend
    await page.locator('button:has-text("Pause")').click();
    await expect(page.locator('button:has-text("Start")')).toBeVisible();

    // Dispatch the data synced event
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });

    // Wait short time to ensure sync handler runs
    await page.waitForTimeout(500);

    // Verify it stays at 20 mins and does not reset to 40:00
    const digitsAfterSync = await page.locator('.timer-digits').textContent();
    const [minsAfter] = digitsAfterSync!.split(':').map(Number);
    expect(minsAfter).toBeLessThan(25);
  });

  test('opens the Adjust Total Pomodoros popover and successfully changes estimated pomodoros', async ({ page }) => {
    await addTask(page, 'Test Pomo Adjust');

    // Open the Task detail modal — the popover's new home after the Session
    // TaskList was removed (ticket 03 / ADR-0016).
    await openTaskDetail(page, 'Test Pomo Adjust');

    // Locate the pomodoro readout in the modal and click it to open the popover
    const pomoBadge = page.locator('.task-detail-panel .task-pomodoros');
    await expect(pomoBadge).toBeVisible();
    await pomoBadge.click();

    // Verify the popover appears
    const popover = page.locator('.pomo-estimate-popover');
    await expect(popover).toBeVisible();
    await expect(popover.locator('.pomo-popover-title')).toHaveText('Adjust Total Pomodoros');

    // Click the '+' button to increment estimate to 2
    await popover.locator('button.pomo-counter-btn:has-text("+")').click();
    await expect(popover.locator('.pomo-counter-value')).toHaveText('2');

    // Click confirm
    await popover.locator('button.pomo-popover-confirm').click();

    // Verify the popover disappears and the modal readout updates to '0 / 2 planned'
    await expect(popover).toHaveCount(0);
    await expect(pomoBadge.locator('.task-pomo-count')).toHaveText('0 / 2 planned');
  });

  test('opens the Adjust Total Pomodoros popover, changes estimated pomodoros, and persists across reload', async ({ page }) => {
    await addTask(page, 'Test Pomo Persist');

    // Open the Task detail modal — the popover's new home (ticket 03).
    await openTaskDetail(page, 'Test Pomo Persist');
    const pomoBadge = page.locator('.task-detail-panel .task-pomodoros');
    await expect(pomoBadge).toBeVisible();
    await pomoBadge.click();

    const popover = page.locator('.pomo-estimate-popover');
    await expect(popover).toBeVisible();

    await popover.locator('button.pomo-counter-btn:has-text("+")').click();
    await expect(popover.locator('.pomo-counter-value')).toHaveText('2');

    await popover.locator('button.pomo-popover-confirm').click();
    await expect(popover).toHaveCount(0);
    await expect(pomoBadge.locator('.task-pomo-count')).toHaveText('0 / 2 planned');

    // Reload the page to simulate closing and reopening the app
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
    // The Tasks board is the new home of the pomo count badge (ticket 03).
    await openTasks(page);

    // Verify it persisted — the board card's .card-pomos shows '0/2'.
    const cardPomos = page.locator('.board-task-card:has-text("Test Pomo Persist") .card-pomos');
    await expect(cardPomos).toHaveText('0/2');
  });
});

test.describe('Pomodoro: Long Break session completion', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await speedUpTimers(page);
  });

  test('transitions to Focus session after Long Break when completing active task and selecting another during long break', async ({ page }) => {
    await enableAutoStart(page);

    // Open settings and set Focus=1, Short Break=1, Long Break=1, Pomos before long break=1
    await openSettings(page);
    const inputs = page.locator('.settings-grid input[type="number"]');
    await inputs.nth(0).fill('1');
    await inputs.nth(1).fill('1');
    await inputs.nth(2).fill('1');
    await inputs.nth(3).fill('1');
    await page.locator('.timer-controls button[title="Settings"]').click();

    await addTask(page, 'Task One');
    await addTask(page, 'Task Two');
    await bumpEstimateToTwo(page, 'Task One');

    // Select Task One and start focus
    await selectTask(page, 'Task One');
    await page.locator('button:has-text("Start")').click();

    // Since pomosBeforeLongBreak = 1, Focus 1 completes -> auto-transitions to Long Break and auto-starts
    await waitForSessionTab(page, 'Long Break');

    // In Long Break session:
    // 1. Complete Task One via the Tasks board card's tick (the TaskList +
    //    checkbox were removed in ticket 03 / ADR-0016).
    await completeTaskInline(page, 'Task One');

    // 2. Select Task Two
    await selectTask(page, 'Task Two');
    await expect(page.locator('.active-task-card')).toContainText('Task Two');

    // 3. Wait for Long Break to complete
    // When Long Break finishes, it MUST transition to Focus session tab
    await waitForSessionTab(page, 'Focus');
  });
});

// ==========================================
// POSTURE ii (docs/design-system.md "Session posture"): autoStartBreaks ON,
// autoStartFocus OFF. A focus ending auto-starts the break (rest is the point);
// a break ending STAGES focus and waits for a tap (the session widget's job).
// The mock seed stores autoStartBreaks=false (existing-user state), so each
// test toggles posture ii on explicitly. Reaching Focus WITHOUT a manual break
// click is the proof that the break auto-started.
// ==========================================

async function setPostureIi(page: Page) {
  await openSettings(page);
  const breakToggle = page.locator('.toggle-row:has-text("Auto-start breaks") .toggle-switch');
  if (await breakToggle.evaluate(el => !el.classList.contains('on'))) await breakToggle.click();
  const focusToggle = page.locator('.toggle-row:has-text("Auto-start focus") .toggle-switch');
  if (await focusToggle.evaluate(el => el.classList.contains('on'))) await focusToggle.click();
  await page.locator('.timer-controls button[title="Settings"]').click();
}

test.describe('Pomodoro: Posture ii — auto-break, manual-focus', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await speedUpTimers(page);
  });

  test('short break auto-starts after focus; focus stays manual after break', async ({ page }) => {
    await setDurations(page, 1, 1); // 1-min focus / 1-min break
    await setPostureIi(page);

    await addTask(page, 'PostureII Short');
    await bumpEstimateToTwo(page, 'PostureII Short'); // keep task alive past 1 pomo
    await selectTask(page, 'PostureII Short');
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    // Focus ends -> Short Break AUTO-starts (no manual Start click) => Pause.
    await waitForSessionTab(page, 'Short Break');
    await expect(page.locator('button:has-text("Pause")')).toBeVisible({ timeout: 5000 });

    // The break runs on its own and completes — reaching Focus proves auto-start.
    await waitForSessionTab(page, 'Focus');
    // autoStartFocus OFF -> focus staged at full duration, NOT running.
    await expect(page.locator('button:has-text("Start")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.timer-digits')).toHaveText('01:00');
  });

  test('long break auto-starts after focus; focus stays manual after break', async ({ page }) => {
    // Focus=1, Short=1, Long=1, pomosBeforeLongBreak=1 -> first focus goes to Long Break.
    await openSettings(page);
    const inputs = page.locator('.settings-grid input[type="number"]');
    await inputs.nth(0).fill('1');
    await inputs.nth(1).fill('1');
    await inputs.nth(2).fill('1');
    await inputs.nth(3).fill('1');
    await page.locator('.timer-controls button[title="Settings"]').click();
    await setPostureIi(page);

    await addTask(page, 'PostureII Long');
    await bumpEstimateToTwo(page, 'PostureII Long');
    await selectTask(page, 'PostureII Long');
    await page.locator('button:has-text("Start")').click();

    // Focus ends -> Long Break AUTO-starts (no manual Start click).
    await waitForSessionTab(page, 'Long Break');
    await expect(page.locator('button:has-text("Pause")')).toBeVisible({ timeout: 5000 });

    await waitForSessionTab(page, 'Focus');
    await expect(page.locator('button:has-text("Start")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.timer-digits')).toHaveText('01:00');
  });
});

// ==========================================
// DECISION (A) regression: "pomo N of M" = current POSITION, so the badge
// reads 1/2 WHILE the first focus runs — not 0/2 (completed). RED on today's
// code (which renders completedPomodoros); GREEN once the derived position
// display lands. No speedUp: the default 25-min focus stays running while read.
// ==========================================

test.describe('Pomodoro: pomo count = current position during a running focus (decision A)', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
  });

  // Decision A regression: the badge reads the pomo you're ON (position), not
  // finished. Was RED (0/2) before displayedPomoCount shipped; now green.
  test('badge shows 1/2 while the first focus runs (not 0/2)', async ({ page }) => {
    await addTask(page, 'Position Task');
    await bumpEstimateToTwo(page, 'Position Task'); // badge reads 0/2
    await selectTask(page, 'Position Task');
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    // Focus running; completedPomodoros still 0. Position semantics (A) => 1/2.
    // Read the badge on the Tasks board card (the TaskList was removed in
    // ticket 03); the timer keeps running in the background via the always-
    // mounted provider.
    await openTasks(page);
    const badge = page.locator('.board-task-card:has-text("Position Task") .card-pomos');
    await expect(badge).toHaveText('1/2', { timeout: 5000 });
  });
});


