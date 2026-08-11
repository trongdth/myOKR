import { test, expect, type Page } from '@playwright/test';

// Reproduction of the user-reported critical bug: pomos started from the
// global session widget (bottom-right pill) on the Tasks screen are not
// counted — neither on the task (completedPomodoros stays put) nor in
// Analytics (today's record stays zero), while the same session started
// from the Session screen counts normally.

// --- Helpers (mirrors pomodoro-confirmations.spec.ts / session-widget.spec.ts) ---

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
  await page.locator('button[title="Session"]').first().click();
}

async function selectTask(page: Page, name: string) {
  // Replan so the seeded task is on the Day plan queue (the Session picker is
  // sourced from TodayPlan.taskIds, ticket 05).
  await page.locator('button[title="Day plan"]').first().click();
  await page.waitForTimeout(300);
  await page.locator('.focus-plan-day-btn').click();
  await page.waitForTimeout(500);
  await openSession(page);
  await page.locator('.active-task-card').click();
  await page.locator(`.task-picker-item:has-text("${name}")`).click();
  await expect(page.locator('.active-task-card')).toContainText(name);
}

async function openSession(page: Page) {
  await page.locator('button[title="Session"]').first().click();
  await page.waitForTimeout(300);
}

async function openSettings(page: Page) {
  await page.locator('.timer-controls button[title="Settings"]').click();
  await expect(page.locator('.settings-panel')).toBeVisible();
}

async function setDurations(page: Page, focus: number, shortBreak: number) {
  await openSettings(page);
  const inputs = page.locator('.settings-grid input[type="number"]');
  await inputs.nth(0).fill(String(focus));
  await inputs.nth(1).fill(String(shortBreak));
  await page.locator('.timer-controls button[title="Settings"]').click();
}

// Nav groups start collapsed — expand the owning group only when needed.
async function goToSection(page: Page, title: string) {
  const item = page.locator(`button[title="${title}"]`).first();
  if (!(await item.isVisible().catch(() => false))) {
    const group = title === 'Analytics' ? 'Progress' : 'Plan';
    await page.getByRole('button', { name: group, exact: true }).click();
  }
  await item.click();
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

test.describe('Session widget pomo counting', () => {
  test('focus started from the widget on the Tasks screen counts the pomo to the linked task', async ({ page }) => {
    await waitForApp(page);

    // Seed task 'Design new dashboard layout' (estimate 5, completed 3).
    // Make it the active task from the Tasks screen (the Session tab's TaskList
    // is gone in ticket 03; the Tasks tab is where task selection happens now).
    await selectTask(page, 'Design new dashboard layout');
    await openSession(page);
    await expect(page.locator('.active-task-card')).toContainText('Design new dashboard layout');

    // 1-min focus so the session completes in ~3s after speeding up timers.
    await setDurations(page, 1, 1);

    // The user's flow: stay on the Tasks screen, use the bottom-right widget.
    await goToSection(page, 'Tasks');

    const widget = page.locator('.session-widget');
    await expect(widget).toBeVisible();
    await expect(widget).toContainText('Design new dashboard layout');
    await expect(widget).toContainText('pomo 3 of 5'); // staged: finished count

    await speedUpTimers(page);

    // Analytics "today" before the session (seeded history includes today).
    await goToSection(page, 'Analytics');
    const stat = page.locator('.stat-value').first();
    const pomosBefore = Number((await stat.textContent())?.trim() || '0');
    await goToSection(page, 'Tasks');

    // Start the focus via the widget play button.
    await widget.locator('.sw-play').click();
    await expect(widget.locator('.sw-play')).toHaveAttribute('title', 'Pause');

    // Focus (1 min) completes → transitions to Short Break.
    await expect(widget).toContainText('Short Break', { timeout: 30000 });

    // The completed pomo is counted: staged display now reads 4/5.
    await expect(widget).toContainText('pomo 4 of 5');

    // The task card on the Tasks board reflects the increment.
    const card = page.locator('.board-task-card:has-text("Design new dashboard layout")');
    await expect(card.locator('.card-pomos')).toContainText('4/5');

    // Analytics today's pomo count bumped by exactly one.
    await goToSection(page, 'Analytics');
    await expect(stat).toHaveText(String(pomosBefore + 1));
  });

  test('focus started from the widget with a restored active task counts on completion', async ({ page }) => {
    // Simulate "start of day": timer state from a previous day restored the
    // active task; the user never touches the Session screen today.
    const savedState = {
      sessionType: 'focus',
      timeLeft: 60,
      isRunning: false,
      lastUpdated: new Date().toISOString(),
      activeTaskId: 'task-1', // Design new dashboard layout (est 5, done 3)
      completedPomos: 0,
      sessionStartedAt: null,
    };
    await page.addInitScript((state) => {
      localStorage.setItem('myokr_timer_state', JSON.stringify(state));
    }, savedState);

    await waitForApp(page);
    await goToSection(page, 'Tasks');

    const widget = page.locator('.session-widget');
    await expect(widget).toBeVisible();
    await expect(widget).toContainText('Design new dashboard layout');

    await speedUpTimers(page);
    await widget.locator('.sw-play').click();
    await expect(widget.locator('.sw-play')).toHaveAttribute('title', 'Pause');

    await expect(widget).toContainText('Short Break', { timeout: 30000 });
    await expect(widget).toContainText('pomo 4 of 5');

    const card = page.locator('.board-task-card:has-text("Design new dashboard layout")');
    await expect(card.locator('.card-pomos')).toContainText('4/5');
  });
});
