import { test, expect, type Page } from '@playwright/test';

// --- Helpers (mirrors pomodoro-confirmations.spec.ts) ---

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
  await page.locator('button[title="Session"]').first().click();
}

// The Session tab's TaskList is gone (ticket 03); addTask uses the Tasks tab
// quick-add, selectTask uses the Session Active Task Card picker.
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
  await page.locator('.quick-add-input').fill(name);
  await page.locator('form.quick-add-bar').press('Enter');
  await expect(page.locator(`.board-task-card:has-text("${name}")`)).toBeVisible();
}

// Visit the Day plan tab and replan so newly-created tasks join the queue
// (buildTodayList honors a saved plan's taskIds; only a replan re-ranks and
// picks up new tasks). The Session picker is sourced from the Day plan queue
// (ticket 05).
async function replanDay(page: Page) {
  await page.locator('button[title="Day plan"]').first().click();
  await page.waitForTimeout(300);
  await page.locator('.focus-plan-day-btn').click();
  await page.waitForTimeout(500);
}

async function selectTask(page: Page, name: string) {
  await replanDay(page);
  await openSession(page);
  await page.locator('.active-task-card-change').click();
  await page.locator(`.switcher-task:has-text("${name}")`).click();
}

// ==========================================
// Global Session Widget (decision α)
// ==========================================

test.describe('Session Widget', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
  });

  test('is hidden when idle (no active task, nothing running)', async ({ page }) => {
    // No task selected, timer not running -> widget absent on a non-session page.
    await page.locator('button[title="Day plan"]').first().click();
    await expect(page.locator('.session-widget')).toHaveCount(0);
  });

  test('is hidden on the Session tab even with an active task', async ({ page }) => {
    await addTask(page, 'Widget Task');
    await selectTask(page, 'Widget Task');

    // The full timer is on screen here, so the floating widget is suppressed.
    await expect(page.locator('.session-widget')).toHaveCount(0);
  });

  test('appears on a non-session page with the active task + pomo count', async ({ page }) => {
    await addTask(page, 'Widget Task');
    await selectTask(page, 'Widget Task');

    // Move off the Session tab to a non-session page.
    await page.locator('button[title="Day plan"]').first().click();

    const widget = page.locator('.session-widget');
    await expect(widget).toBeVisible();
    // Staged (not running): position formula reads completed -> "pomo 0 of 1".
    await expect(widget).toContainText('Widget Task');
    await expect(widget).toContainText('pomo 0 of 1');
  });

  test('Open navigates to the Session tab and hides the widget', async ({ page }) => {
    await addTask(page, 'Widget Task');
    await selectTask(page, 'Widget Task');
    await page.locator('button[title="Day plan"]').first().click();
    await expect(page.locator('.session-widget')).toBeVisible();

    await page.locator('.session-widget .sw-open').click();

    // Lands on the Session tab (full timer visible) and the widget hides.
    await expect(page.locator('.timer-digits')).toBeVisible();
    await expect(page.locator('.session-widget')).toHaveCount(0);
  });

  test('play button starts the focus from a non-session page; pomo reads position 1 of 1', async ({ page }) => {
    await addTask(page, 'Run Task');
    await selectTask(page, 'Run Task');
    await page.locator('button[title="Day plan"]').first().click();

    const widget = page.locator('.session-widget');
    await expect(widget).toBeVisible();

    // Start focus via the widget.
    await widget.locator('.sw-play').click();

    // Running -> the control flips to Pause.
    await expect(widget.locator('.sw-play')).toHaveAttribute('title', 'Pause', { timeout: 5000 });
    // Decision A: while the focus runs, the count is the pomo you're ON (1 of 1).
    await expect(widget).toContainText('pomo 1 of 1');
  });

  test('is anchored to the bottom-right corner of the viewport', async ({ page }) => {
    await addTask(page, 'Pos Task');
    await selectTask(page, 'Pos Task');
    await page.locator('button[title="Day plan"]').first().click();

    const widget = page.locator('.session-widget');
    await expect(widget).toBeVisible();

    const vp = page.viewportSize()!;
    const box = (await widget.boundingBox())!;

    // Regression: a stray "*/" inside SessionWidget.css's header comment once
    // closed the comment early, so .session-widget's position/max-width never
    // applied and the widget rendered as a full-width static block at the page
    // bottom instead of a fixed bottom-right pill.
    expect(box.x, 'widget should sit on the right half').toBeGreaterThan(vp.width / 2);
    expect(vp.width - (box.x + box.width), 'right gap should be ~24px').toBeLessThan(60);
    expect(vp.height - (box.y + box.height), 'bottom gap should be ~24px').toBeLessThan(60);
    expect(box.width, 'should be a compact pill, not a full-width bar').toBeLessThan(420);
  });
});
