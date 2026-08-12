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
// (the TaskList left the Session tab in ticket 03; the picker is sourced from
// the Day plan queue, ticket 05). Replan so the newly-created task joins the
// queue.
async function selectTaskOnTasksAndOpenSession(page: Page, name: string) {
  await page.locator('button[title="Day plan"]').first().click();
  await page.waitForTimeout(300);
  await page.locator('.focus-plan-day-btn').click();
  await page.waitForTimeout(500);
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
    // Replan so seeded tasks are on the Day plan queue (picker source, ticket 05).
    await page.locator('button[title="Day plan"]').first().click();
    await page.waitForTimeout(300);
    await page.locator('.focus-plan-day-btn').click();
    await page.waitForTimeout(500);
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

  test('picker uses menu semantics (not listbox) so mixed actions are accessible', async ({ page }) => {
    // The picker contains task options AND non-option actions (Clear, Plan your
    // day). A listbox may only hold options; a menu allows mixed menuitems.
    await page.locator('.active-task-card').click();
    const picker = page.locator('.task-picker');
    await expect(picker).toBeVisible();
    await expect(picker).toHaveAttribute('role', 'menu');
    // Task items are menuitems.
    await expect(picker.locator('.task-picker-item').first()).toHaveAttribute('role', 'menuitem');
  });
});

// ==========================================
// Bottom utility bar + Stats widget (ticket 04)
// ==========================================

test.describe('Bottom utility bar + Stats widget (ticket 04)', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await openSession(page);
  });

  test('3-column bottom bar is present with audio / queue / stats slots', async ({ page }) => {
    const bar = page.locator('.session-bottom-bar');
    await expect(bar).toBeVisible();
    // Three grid columns.
    await expect(bar.locator('.session-bottom-bar-audio')).toBeVisible();
    await expect(bar.locator('.session-bottom-bar-queue')).toBeVisible();
    await expect(bar.locator('.session-bottom-bar-stats')).toBeVisible();
  });

  test('Stats widget shows today\'s completed session count', async ({ page }) => {
    // The seed history includes today's record (mocks/store.ts generates 14
    // days; today's pomodorosPerDay[13] = 3). The stats widget reads today's
    // DailyRecord.completedPomodoros.
    const stats = page.locator('.session-bottom-bar-stats');
    await expect(stats).toBeVisible();
    await expect(stats.locator('.session-stats-label')).toHaveText('sessions today');
    // Today's seeded count is 3 — a real number, not 0.
    const count = await stats.locator('.session-stats-count').textContent();
    expect(Number(count)).toBeGreaterThan(0);
  });

  test('Stats widget shows 0 sessions today when no history exists', async ({ page }) => {
    // Wipe today's history, flush the Automerge queue so the write settles,
    // then signal a sync so SessionStats reloads without a full page reload
    // (which would re-seed the mock store).
    await page.evaluate(async () => {
      const { loadHistory, saveHistory, todayKey } = await import('/src/lib/pomodoro-storage.ts');
      const hist = await loadHistory();
      const key = todayKey();
      await saveHistory(hist.filter(r => r.date !== key));
      await (window as any).__flushAutomergeQueue?.();
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });

    // The count + label are flex-gap separated, so textContent concatenates;
    // assert them separately.
    const stats = page.locator('.session-bottom-bar-stats');
    await expect(stats.locator('.session-stats-count')).toHaveText('0', { timeout: 5000 });
    await expect(stats.locator('.session-stats-label')).toHaveText('sessions today');
  });

  test('audio widget shows the active ambient preset (ticket 06)', async ({ page }) => {
    const audio = page.locator('.session-bottom-bar-audio');
    await expect(audio).toBeVisible();
    // Default is 'none' → invites the user to pick.
    const widget = audio.locator('.audio-widget');
    await expect(widget).toBeVisible();
    await expect(widget).toContainText(/none|pick/i);
  });
});

// ==========================================
// Ambient audio widget (ticket 06)
// ==========================================

test.describe('Ambient audio widget (ticket 06)', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await openSession(page);
  });

  test('shows the active preset name and opens a selector', async ({ page }) => {
    const widget = page.locator('.audio-widget');
    await expect(widget).toBeVisible();

    // Open the selector.
    await widget.click();
    const selector = page.locator('.audio-selector');
    await expect(selector).toBeVisible();
    // All four options are present.
    await expect(selector.locator('.audio-option', { hasText: /Rain/i })).toBeVisible();
    await expect(selector.locator('.audio-option', { hasText: /Forest/i })).toBeVisible();
    await expect(selector.locator('.audio-option', { hasText: /Caf/i })).toBeVisible();
    await expect(selector.locator('.audio-option', { hasText: /None/i })).toBeVisible();
  });

  test('selecting a preset updates the widget display and persists', async ({ page }) => {
    const widget = page.locator('.audio-widget');
    await widget.click();
    await page.locator('.audio-option', { hasText: /^Rain/i }).click();

    // Selector closes; widget now shows Rain.
    await expect(page.locator('.audio-selector')).toHaveCount(0);
    await expect(widget).toContainText(/Rain/i);
  });

  test('selecting None turns the sound off', async ({ page }) => {
    // Set to Rain first.
    const widget = page.locator('.audio-widget');
    await widget.click();
    await page.locator('.audio-option', { hasText: /^Rain/i }).click();
    await expect(widget).toContainText(/Rain/i);

    // Now select None.
    await widget.click();
    await page.locator('.audio-option', { hasText: /^None/i }).click();
    await expect(widget).toContainText(/none|pick/i);
  });

  test('reflects the persisted preset on mount', async ({ page }) => {
    // The settings panel's AmbientPresetPicker and the bottom-bar widget share
    // settings.ambientPreset — change via settings, widget reflects it.
    await page.locator('.timer-controls button[title="Settings"]').click();
    await page.locator('.ambient-chip', { hasText: 'Forest' }).click();
    await page.locator('.timer-controls button[title="Settings"]').click();

    const widget = page.locator('.audio-widget');
    await expect(widget).toContainText(/Forest/i);
  });
});

// ==========================================
// Queue widget + Day-plan picker sourcing (ticket 05)
// ==========================================

test.describe('Queue widget + Day-plan picker (ticket 05)', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    // Replan so seeded tasks are on the Day plan queue (the Session picker is
    // sourced from TodayPlan.taskIds, ticket 05).
    await page.locator('button[title="Day plan"]').first().click();
    await page.waitForTimeout(300);
    await page.locator('.focus-plan-day-btn').click();
    await page.waitForTimeout(500);
    await openSession(page);
  });

  test('Queue widget shows the active task title + remaining pomos', async ({ page }) => {
    // Seed task 'Design new dashboard layout' has completed 3 / estimated 5 → 2 left.
    await page.locator('.active-task-card').click();
    await page.locator('.task-picker-item:has-text("Design new dashboard layout")').click();

    const queue = page.locator('.queue-widget');
    await expect(queue).toBeVisible();
    await expect(queue).toContainText('Design new dashboard layout');
    await expect(queue.locator('.queue-remaining')).toContainText('2');
  });

  test('Queue widget shows empty state linking to Day plan when no task is active', async ({ page }) => {
    const queue = page.locator('.queue-widget');
    await expect(queue).toBeVisible();
    // No active task → empty state offers a link to the Day plan.
    await expect(queue).toContainText(/pick a task|no task|plan/i);
  });
});
