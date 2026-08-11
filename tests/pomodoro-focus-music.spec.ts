import { test, expect, type Page } from '@playwright/test';

// --- Helpers (mirrors pomodoro-confirmations.spec.ts; helpers aren't exported) ---

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
  // Navigate to Timer since Today is now the default landing tab
  await page.locator('button[title="Session"]').first().click();
}

async function openSettings(page: Page) {
  await page.locator('.timer-controls button[title="Settings"]').click();
  await expect(page.locator('.settings-panel')).toBeVisible();
}

// The Session tab's TaskList is gone (ticket 03); addTask uses the Tasks tab
// quick-add. Selection happens via the Session Active Task Card picker inline.
async function openTasks(page: Page) {
  const item = page.locator('button[title="Tasks"]').first();
  if (!(await item.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
  }
  await item.click();
  await page.waitForTimeout(300);
}

async function addTask(page: Page, name: string) {
  await openTasks(page);
  await page.locator('.quick-add-input').fill(name);
  await page.locator('form.quick-add-bar').press('Enter');
  await expect(page.locator(`.board-task-card:has-text("${name}")`)).toBeVisible();
}

// NOTE: cross-reload persistence of PomodoroSettings is not asserted here. The
// e2e fs mock (src/mocks/fs.ts) backs Automerge with an in-memory Map that
// resets on page.reload(), so settings cannot survive a reload in this env.
// Persistence via the real Tauri FS path is covered by migration.spec.ts /
// poisoned-state.spec.ts; the default-off normalization is covered there too.

test.describe('Pomodoro: Ambient sound preset picker (ADR-0015)', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
  });

  test('shows the Ambient sound preset picker with None active by default', async ({ page }) => {
    await openSettings(page);
    const group = page.locator('.ambient-picker');
    await expect(group).toBeVisible();
    await expect(group.locator('.ambient-chip')).toHaveText(['None', 'Rain', 'Forest', 'Café']);
    await expect(group.locator('.ambient-chip', { hasText: 'None' })).toHaveClass(/\bactive\b/);
    await expect(group.locator('.ambient-chip', { hasText: 'Rain' })).not.toHaveClass(/\bactive\b/);
  });

  test('selecting a preset highlights it and clears None', async ({ page }) => {
    await openSettings(page);
    const group = page.locator('.ambient-picker');

    await group.locator('.ambient-chip', { hasText: 'Rain' }).click();
    await expect(group.locator('.ambient-chip', { hasText: 'Rain' })).toHaveClass(/\bactive\b/);
    await expect(group.locator('.ambient-chip', { hasText: 'None' })).not.toHaveClass(/\bactive\b/);

    // Switch to another preset — only one is active at a time.
    await group.locator('.ambient-chip', { hasText: 'Café' }).click();
    await expect(group.locator('.ambient-chip', { hasText: 'Café' })).toHaveClass(/\bactive\b/);
    await expect(group.locator('.ambient-chip', { hasText: 'Rain' })).not.toHaveClass(/\bactive\b/);

    // Back to None.
    await group.locator('.ambient-chip', { hasText: 'None' }).click();
    await expect(group.locator('.ambient-chip', { hasText: 'None' })).toHaveClass(/\bactive\b/);
  });

  test('selecting a preset and starting focus does not throw and starts the timer', async ({ page }) => {
    // Capture uncaught errors thrown by the Web Audio path (real AudioContext in Chromium).
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await addTask(page, 'Focus Task');
    // Select the task via the Session Active Task Card picker (ticket 03).
    await page.locator('button[title="Session"]').first().click();
    await page.locator('.active-task-card').click();
    await page.locator('.task-picker-item:has-text("Focus Task")').click();

    await openSettings(page);
    await page.locator('.ambient-chip', { hasText: 'Forest' }).click();
    await page.locator('.timer-controls button[title="Settings"]').click();

    // Start the focus session — this triggers startAmbient('forest') with a live AudioContext.
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible({ timeout: 5000 });

    // Pause — this triggers stopAmbient().
    await page.locator('button:has-text("Pause")').click();
    await expect(page.locator('button:has-text("Start")')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('migrates legacy focusMusicEnabled to ambientPreset "none" (ADR-0015)', async ({ page }) => {
    // A persisted settings object carrying the legacy `focusMusicEnabled: true`
    // (and no ambientPreset) must normalize to ambientPreset 'none' on load.
    // The drone is gone; we never silently enable rain/forest/café on the
    // user's behalf. Exercised through the public import path, which runs the
    // settings through normalizeSettings.
    const legacyBundle = {
      settings: {
        focusDuration: 25, shortBreakDuration: 5, longBreakDuration: 15,
        pomosBeforeLongBreak: 4, autoStartBreaks: true, autoStartFocus: false,
        focusMusicEnabled: true, // legacy — no ambientPreset field
      },
      tasks: [],
      history: [],
      cycles: [],
    };

    // Import the legacy bundle via the Analytics import surface (Analytics
    // lives under the Progress nav group — expand it first, mirroring the
    // import-refreshes-active-cycle.spec.ts helper).
    const analyticsBtn = page.locator('button[title="Analytics"]').first();
    if (!(await analyticsBtn.isVisible())) {
      await page.locator('button[title="Progress"]').first().click();
    }
    await analyticsBtn.click();
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('button:has-text("Import JSON")').click(),
    ]);
    await fileChooser.setFiles({
      name: 'legacy.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(legacyBundle)),
    });

    // Confirm the import (the import flow shows a confirm modal).
    await expect(page.locator('.confirm-modal')).toBeVisible();
    await page.locator('.confirm-modal button:has-text("Import")').click();
    await expect(page.locator('.confirm-modal')).toHaveCount(0);

    // After import, the Session settings panel must show None active — the
    // legacy boolean migrated to 'none', not to any sound preset.
    await page.locator('button[title="Session"]').first().click();
    await openSettings(page);
    const group = page.locator('.ambient-picker');
    await expect(group).toBeVisible();
    await expect(group.locator('.ambient-chip', { hasText: 'None' })).toHaveClass(/\bactive\b/);
    await expect(group.locator('.ambient-chip', { hasText: 'Rain' })).not.toHaveClass(/\bactive\b/);
  });
});
