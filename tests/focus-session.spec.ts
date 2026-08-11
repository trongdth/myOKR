import { test, expect, type Page } from '@playwright/test';

const FIXED_TIME = new Date('2026-05-24T12:00:00.000Z');

async function waitForApp(page: Page) {
  await page.clock.setFixedTime(FIXED_TIME);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
}

async function openSession(page: Page) {
  await page.locator('button[title="Session"]').first().click();
  await page.waitForTimeout(300);
}

// Navigate to the Tasks tab (the TaskList left the Session tab in ticket 03;
// task management now happens on Tasks / Day plan). The Plan nav group starts
// collapsed, so expand it first when needed.
async function openTasks(page: Page) {
  const item = page.locator('button[title="Tasks"]').first();
  if (!(await item.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
  }
  await item.click();
  await page.waitForTimeout(300);
}

// TaskList quick-add on the Tasks tab (the Session tab's TaskList is gone).
// The Tasks quick-add is a form: fill the input and press Enter to submit.
async function addTask(page: Page, name: string) {
  await openTasks(page);
  await page.locator('.quick-add-input').fill(name);
  await page.locator('form.quick-add-bar').press('Enter');
  await expect(page.locator(`.board-task-card:has-text("${name}")`)).toBeVisible();
}

// Select a task as active via the Session tab's Active Task Card picker
// (the TaskList left the Session tab in ticket 03).
async function selectTaskOnTasksAndOpenSession(page: Page, name: string) {
  await openSession(page);
  await page.locator('.active-task-card').click();
  await page.locator(`.task-picker-item:has-text("${name}")`).click();
}

test.describe('Focus shell — Session tab (ticket 02)', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await openSession(page);
  });

  test('timer renders inside the Focus shell with Session tab active', async ({ page }) => {
    await expect(page.locator('.focus-shell .timer-section')).toBeVisible();
    await expect(page.locator('.plan-tab-strip.focus-tabs .plan-tab.active')).toHaveText(/Session/);
  });

  test('live marker is absent while idle, appears when a session runs', async ({ page }) => {
    await expect(page.locator('.focus-tab-live')).toHaveCount(0);

    await addTask(page, 'Live Task');
    await selectTaskOnTasksAndOpenSession(page, 'Live Task');
    await page.locator('.timer-section button:has-text("Start")').click();

    await expect(page.locator('.focus-tab-live')).toBeVisible();
    await expect(page.locator('.focus-tab-live')).toContainText('live');
  });

  test('Start focus from Day plan opens the Session tab in the Focus shell, task staged', async ({ page }) => {
    await page.locator('button:has-text("Day plan")').first().click();
    await page.waitForTimeout(300);
    await page.locator('.focus-card .btn:has-text("Start focus")').first().click();

    await expect(page.locator('.focus-shell .timer-section')).toBeVisible();
    await expect(page.locator('.active-task-card')).toBeVisible();
    await expect(page.locator('.active-task-card')).toContainText('Refactor auth module');
  });
});

// ==========================================
// Session-of label + Active Task Card (ticket 03)
// ==========================================

test.describe('Session-of label + Active Task Card (ticket 03)', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await openSession(page);
  });

  test('session-of label shows completed/estimated for the active task', async ({ page }) => {
    // Seed task 'Design new dashboard layout' has completed 3 / estimated 5.
    await page.locator('.active-task-card').click();
    await page.locator('.task-picker-item:has-text("Design new dashboard layout")').click();

    const label = page.locator('.timer-session-of');
    await expect(label).toBeVisible();
    await expect(label).toContainText('SESSION 3 OF 5');
  });

  test('session-of label is hidden when no task is active', async ({ page }) => {
    // No task staged at start — the label must be absent (only digits show).
    await expect(page.locator('.timer-session-of')).toHaveCount(0);
  });

  test('session-of label is hidden during a break', async ({ page }) => {
    await page.locator('.active-task-card').click();
    await page.locator('.task-picker-item:has-text("Design new dashboard layout")').click();

    // Switch to Short Break — the label must disappear (breaks aren't task-attributed).
    await page.locator('button.session-tab:has-text("Short Break")').click();
    await expect(page.locator('.timer-session-of')).toHaveCount(0);
  });

  test('Active Task Card shows empty state when no task is active', async ({ page }) => {
    const card = page.locator('.active-task-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('No task');
  });

  test('Active Task Card picker lists incomplete tasks and selects one', async ({ page }) => {
    await page.locator('.active-task-card').click();
    const picker = page.locator('.task-picker');
    await expect(picker).toBeVisible();
    // Seeded open tasks appear (completed ones are filtered out).
    await expect(picker.locator('.task-picker-item:has-text("Design new dashboard layout")')).toBeVisible();

    await page.locator('.task-picker-item:has-text("Write API documentation")').click();
    await expect(page.locator('.active-task-card')).toContainText('Write API documentation');
    // Picker closes after selection.
    await expect(page.locator('.task-picker')).toHaveCount(0);
  });
});
