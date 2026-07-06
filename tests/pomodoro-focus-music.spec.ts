import { test, expect, type Page } from '@playwright/test';

// --- Helpers (mirrors pomodoro-confirmations.spec.ts; helpers aren't exported) ---

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
  // Navigate to Timer since Today is now the default landing tab
  await page.locator('button.sidebar-nav-item:has-text("Timer")').first().click();
}

async function openSettings(page: Page) {
  await page.locator('button[title="Settings"]').click();
  await expect(page.locator('.settings-panel')).toBeVisible();
}

async function addTask(page: Page, name: string) {
  const input = page.locator('input[placeholder*="What are you working on?"]');
  await input.fill(name);
  await page.locator('button.add-task-btn').click();
  await expect(page.locator(`.task-item:has-text("${name}")`)).toBeVisible();
}

// NOTE: cross-reload persistence of PomodoroSettings is not asserted here. The
// e2e fs mock (src/mocks/fs.ts) backs Automerge with an in-memory Map that
// resets on page.reload(), so settings cannot survive a reload in this env.
// Persistence via the real Tauri FS path is covered by migration.spec.ts /
// poisoned-state.spec.ts; the default-off normalization is covered there too.

test.describe('Pomodoro: Focus music setting', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
  });

  test('shows the Focus music toggle, off by default', async ({ page }) => {
    await openSettings(page);
    const toggle = page.locator('.toggle-row:has-text("Focus music") .toggle-switch');
    await expect(toggle).toBeVisible();
    await expect(toggle).not.toHaveClass(/\bon\b/);
  });

  test('toggles on and back off within a session', async ({ page }) => {
    await openSettings(page);
    const toggle = page.locator('.toggle-row:has-text("Focus music") .toggle-switch');

    await toggle.click();
    await expect(toggle).toHaveClass(/\bon\b/);

    await toggle.click();
    await expect(toggle).not.toHaveClass(/\bon\b/);
  });

  test('enabling music and starting focus does not throw and starts the timer', async ({ page }) => {
    // Capture uncaught errors thrown by the Web Audio path (real AudioContext in Chromium).
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await addTask(page, 'Focus Task');
    await page.locator('.task-item:has-text("Focus Task")').click();

    await openSettings(page);
    await page.locator('.toggle-row:has-text("Focus music") .toggle-switch').click();
    await page.locator('button[title="Settings"]').click();

    // Start the focus session — this triggers startFocusMusic() with a live AudioContext.
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible({ timeout: 5000 });

    // Pause — this triggers stopFocusMusic().
    await page.locator('button:has-text("Pause")').click();
    await expect(page.locator('button:has-text("Start")')).toBeVisible();

    expect(errors).toEqual([]);
  });
});
