import { test, expect, type Page } from '@playwright/test';

// --- Helpers ---

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
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

async function openSettings(page: Page) {
  await page.locator('button[title="Settings"]').click();
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
  await page.locator('button[title="Settings"]').click();
}

async function setDurations(page: Page, focus: number, shortBreak: number) {
  await openSettings(page);
  const inputs = page.locator('.settings-grid input[type="number"]');
  await inputs.nth(0).fill(String(focus));
  await inputs.nth(1).fill(String(shortBreak));
  await page.locator('button[title="Settings"]').click();
}

// Wait for session tab to become active — detects session transitions
// without relying on the transient "00:00" state
async function waitForSessionTab(page: Page, label: string) {
  await expect(page.locator(`button.session-tab.active:has-text("${label}")`)).toBeVisible({ timeout: 90000 });
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
  });

  test('shows confirmation when task changed during break and previous not done', async ({ page }) => {
    test.setTimeout(180000);

    // Setup: 1-min focus, 1-min break, enable auto-start
    await setDurations(page, 1, 1);
    await enableAutoStart(page);

    // Create two tasks
    await addTask(page, 'Task Alpha');
    await addTask(page, 'Task Beta');

    // Select Task Alpha
    await selectTask(page, 'Task Alpha');
    await expect(page.locator('text=Working on:')).toContainText('Task Alpha');

    // Start focus session
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    // Wait for focus to complete — detected by session switching to Short Break
    await waitForSessionTab(page, 'Short Break');

    // During break, switch to Task Beta
    await selectTask(page, 'Task Beta');
    await expect(page.locator('text=Working on:')).toContainText('Task Beta');

    // Wait for break to complete — detected by session switching back to Focus
    await waitForSessionTab(page, 'Focus');

    // Task Changed confirmation should appear
    await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.confirm-modal .prioritize-title')).toHaveText(/Task Changed/);
  });

  test('does NOT show confirmation when previous task is completed', async ({ page }) => {
    test.setTimeout(180000);

    await setDurations(page, 1, 1);
    await enableAutoStart(page);

    // Create two tasks
    await addTask(page, 'Task Done');
    await addTask(page, 'Task Next');

    // Select Task Done
    await selectTask(page, 'Task Done');

    // Start focus
    await page.locator('button:has-text("Start")').click();

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

  test('cancel on task changed confirmation stops auto-start', async ({ page }) => {
    test.setTimeout(180000);

    await setDurations(page, 1, 1);
    await enableAutoStart(page);

    await addTask(page, 'Task A');
    await addTask(page, 'Task B');

    await selectTask(page, 'Task A');
    await page.locator('button:has-text("Start")').click();

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
});
