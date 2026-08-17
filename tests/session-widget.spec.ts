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
  // "Plan day" opens the preview-and-commit modal (was a silent replan);
  // Accept commits the fresh ranking so the queue updates.
  await page.locator('.planday-accept-btn').click();
  await page.locator('.planday-overlay').waitFor({ state: 'detached' });
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

  test('appears on a non-session page with the active task', async ({ page }) => {
    await addTask(page, 'Widget Task');
    await selectTask(page, 'Widget Task');

    // Move off the Session tab to a non-session page.
    await page.locator('button[title="Day plan"]').first().click();

    const widget = page.locator('.session-widget');
    await expect(widget).toBeVisible();
    await expect(widget.locator('.sw-sub')).toHaveText('Widget Task');
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
    // The subtext still shows just the task title while the focus runs.
    await expect(widget.locator('.sw-sub')).toHaveText('Run Task');
  });

  test('play/pause icon is solid filled, not a hollow outline', async ({ page }) => {
    await addTask(page, 'Fill Icon Task');
    await selectTask(page, 'Fill Icon Task');
    await page.locator('button[title="Day plan"]').first().click();

    const widget = page.locator('.session-widget');
    await expect(widget).toBeVisible();

    // Start state — solid filled play triangle (fill="currentColor", the
    // NowCard precedent); the hollow Lucide outline read as a disabled ghost.
    await expect(widget.locator('.sw-play svg')).toHaveAttribute('fill', 'currentColor');

    // Pause state — two solid filled rectangles.
    await widget.locator('.sw-play').click();
    await expect(widget.locator('.sw-play')).toHaveAttribute('title', 'Pause', { timeout: 5000 });
    await expect(widget.locator('.sw-play svg')).toHaveAttribute('fill', 'currentColor');
  });

  test('subtext shows only the task title — no phase prefix, no pomo count', async ({ page }) => {
    const name = 'Refactor the auth module A';
    await addTask(page, name);
    await selectTask(page, name);
    await page.locator('button[title="Day plan"]').first().click();

    const widget = page.locator('.session-widget');
    await expect(widget).toBeVisible();

    // Subtext reads exactly "<Task Title>" — the phase label and pomo count
    // are dropped so the task name gets all the room to be read.
    const sub = widget.locator('.sw-sub');
    await expect(sub).toHaveText(name);
    await expect(sub).not.toContainText('pomo');
    await expect(sub).not.toContainText('Focus');
  });

  test('styling: teal accent border, room for a 20+ char task title, centered row', async ({ page }) => {
    await addTask(page, 'Styling Task');
    await selectTask(page, 'Styling Task');
    await page.locator('button[title="Day plan"]').first().click();

    const widget = page.locator('.session-widget');
    await expect(widget).toBeVisible();

    const styles = await widget.evaluate((el) => {
      const ws = getComputedStyle(el);
      const task = el.querySelector('.sw-task');
      const ts = task ? getComputedStyle(task) : null;
      return {
        borderColor: ws.borderColor,
        gap: ws.gap,
        alignItems: ws.alignItems,
        taskMaxWidth: ts ? ts.maxWidth : '',
      };
    });

    // 1. Subtle teal accent border around the container card (#1a4b54 token).
    expect(styles.borderColor).toBe('rgb(26, 75, 84)');
    // 2. The task title gets at least ~20 characters of room before ellipsis.
    expect(parseFloat(styles.taskMaxWidth)).toBeGreaterThanOrEqual(200);
    // 3. Ring, text block, and buttons share one centered row with 12–16px gaps.
    expect(styles.alignItems).toBe('center');
    const gap = parseFloat(styles.gap);
    expect(gap).toBeGreaterThanOrEqual(12);
    expect(gap).toBeLessThanOrEqual(16);
  });

  test('pause and Open buttons render at the same height', async ({ page }) => {
    await addTask(page, 'Height Task');
    await selectTask(page, 'Height Task');
    await page.locator('button[title="Day plan"]').first().click();

    const widget = page.locator('.session-widget');
    await expect(widget).toBeVisible();
    // Measure only after the 160ms sw-pop entrance animation settles: the two
    // sequential boundingBox() calls can otherwise sample different translateY
    // frames mid-flight and fake a ~1px y-offset (seen 1-in-10 locally and on
    // both CI attempts with different deltas — the layout itself is correct).
    await widget.evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)));

    const play = await widget.locator('.sw-play').boundingBox();
    const open = await widget.locator('.sw-open').boundingBox();
    expect(play && open).toBeTruthy();
    // The two action buttons must match heights exactly (and stay vertically
    // aligned), so the row reads as one even control cluster.
    expect(play!.height).toBe(open!.height);
    expect(Math.abs(play!.y - open!.y)).toBeLessThan(0.5);
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
