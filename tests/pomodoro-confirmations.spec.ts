import { test, expect, type Page } from '@playwright/test';

// --- Helpers ---

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
  // Navigate to Timer since Today is now the default landing tab
  await page.locator('button[title="Session"]').first().click();
}

async function addTask(page: Page, name: string) {
  const input = page.locator('input[placeholder*="What are you working on?"]');
  await input.fill(name);
  await page.locator('button.add-task-btn').click();
  await expect(page.locator(`.task-item:has-text("${name}")`)).toBeVisible();
}

async function selectTask(page: Page, name: string) {
  await page.locator(`.task-item:has-text("${name}")`).click();
}

// Bump a task's pomodoro estimate to 2 via the Adjust Total Pomodoros popover.
// Under Option C a task auto-completes when its estimate is met; new tasks
// default to estimate=1, so one session would finish them. Tests that need a
// task to stay NOT-done after a single session bump it to 2 first (1/2).
async function bumpEstimateToTwo(page: Page, name: string) {
  const pomoBadge = page.locator(`.task-item:has-text("${name}") .task-pomodoros`);
  await pomoBadge.click();
  const popover = page.locator('.pomo-estimate-popover');
  await expect(popover).toBeVisible();
  await popover.locator('button.pomo-counter-btn:has-text("+")').click();
  await popover.locator('button.pomo-popover-confirm').click();
  await expect(popover).toHaveCount(0);
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
    await selectTask(page, 'Task to complete');

    // Complete the task manually
    await page.locator('.task-item:has-text("Task to complete") .task-checkbox').click();

    // Click Start — warning modal should appear because the active task is completed
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
    await expect(page.locator('text=Working on:')).toContainText('Task Alpha');
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    // Wait for focus to complete (~3s real time with speed-up timers)
    await waitForSessionTab(page, 'Short Break');

    // During break, switch to Task Beta
    await selectTask(page, 'Task Beta');
    await expect(page.locator('text=Working on:')).toContainText('Task Beta');

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

    // Complete Task Done (toggle checkbox)
    const doneCheckbox = page.locator('.task-item:has-text("Task Done") .task-checkbox');
    if (await doneCheckbox.isVisible()) {
      await doneCheckbox.click();
    }

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
    await expect(page.locator('text=Working on:')).toContainText('Task Two');
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
    await expect(page.locator('text=Working on:')).toContainText('Task A');
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
    await expect(page.locator('text=Working on:')).toContainText('Task Y');
  });

  test('does NOT show confirmation when no task was previously selected', async ({ page }) => {
    await addTask(page, 'First Task');

    // Start without task (confirm "Start Anyway")
    await page.locator('button:has-text("Start")').click();
    await page.locator('.confirm-modal button:has-text("Start Anyway")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    // Select a task while running — no previous task, so no confirmation
    await selectTask(page, 'First Task');
    await expect(page.locator('.confirm-modal')).toHaveCount(0);
    await expect(page.locator('text=Working on:')).toContainText('First Task');
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
    
    // Locate the pomo count badge '0/1' and click it
    const pomoBadge = page.locator('.task-item:has-text("Test Pomo Adjust") .task-pomodoros');
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

    // Verify the popover disappears and the count changes to '0/2'
    await expect(popover).toHaveCount(0);
    await expect(pomoBadge.locator('.task-pomo-count')).toHaveText('0/2');
  });

  test('opens the Adjust Total Pomodoros popover, changes estimated pomodoros, and persists across reload', async ({ page }) => {
    await addTask(page, 'Test Pomo Persist');
    
    const pomoBadge = page.locator('.task-item:has-text("Test Pomo Persist") .task-pomodoros');
    await expect(pomoBadge).toBeVisible();
    await pomoBadge.click();

    const popover = page.locator('.pomo-estimate-popover');
    await expect(popover).toBeVisible();

    await popover.locator('button.pomo-counter-btn:has-text("+")').click();
    await expect(popover.locator('.pomo-counter-value')).toHaveText('2');

    await popover.locator('button.pomo-popover-confirm').click();
    await expect(popover).toHaveCount(0);
    await expect(pomoBadge.locator('.task-pomo-count')).toHaveText('0/2');

    // Reload the page to simulate closing and reopening the app
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
    await page.locator('button[title="Session"]').first().click();

    // Verify it persisted
    const pomoBadgeReloaded = page.locator('.task-item:has-text("Test Pomo Persist") .task-pomodoros');
    await expect(pomoBadgeReloaded.locator('.task-pomo-count')).toHaveText('0/2');
  });
});
