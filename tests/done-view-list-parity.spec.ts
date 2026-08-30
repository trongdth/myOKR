import { test, expect } from '@playwright/test';

/**
 * Done tab row semantics (2026-08-30 feedback + style round): the leading
 * tick is the task's done state — a styled rounded-square green tick (mockup
 * style, not a native checkbox), checked by default; unchecking it asks for
 * confirmation and then reopens the task (replacing the old UNDO column /
 * Reopen button and the bulk-selection bar). Titles are not struck through.
 * Tables use a fixed layout so every day group's columns align.
 */
test.describe('Done view list parity', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });

    // One task finished today and one yesterday → two day groups, so column
    // alignment across groups is actually exercised.
    await page.evaluate(async () => {
      const storage = await import('/src/lib/pomodoro-storage.ts');
      const now = new Date();
      const doneAt = (hoursAgo: number) =>
        new Date(now.getTime() - hoursAgo * 3600_000).toISOString();
      await storage.saveTasks([
        { id: 'd1', title: 'Ship redesign', estimatedPomodoros: 3, completedPomodoros: 3, isCompleted: true, completedAt: doneAt(2), createdAt: doneAt(30) },
        { id: 'd2', title: 'Write release notes', estimatedPomodoros: 2, completedPomodoros: 2, isCompleted: true, completedAt: doneAt(26), createdAt: doneAt(50) },
      ]);
    });

    await page.locator('[title="Plan"]').first().click();
    await page.waitForTimeout(300);
    await page.locator('[title="Done"]').first().click();
    await page.waitForTimeout(500);
  });

  test('done table keeps the list-table anatomy with styled done-state ticks', async ({ page }) => {
    const table = page.locator('.done-table').first();
    await expect(table).toBeVisible();
    // The consistency binding: same table chrome as the Tasks list view.
    await expect(table).toHaveClass(/list-table/);

    // One styled tick per row (the mockup's rounded-square tick, not a native
    // checkbox), in the done (checked) state by default.
    const ticks = table.locator('.td-select .done-check');
    await expect(ticks).toHaveCount(1);
    await expect(ticks.first()).toHaveClass(/checked/);
    await expect(page.locator('.done-table .done-check')).toHaveCount(2);
    await expect(page.locator('.done-table input[type="checkbox"]')).toHaveCount(0);

    // Columns: empty tick header + P5 columns; the UNDO column is gone.
    const headers = table.locator('thead th').allTextContents();
    expect(await headers).toEqual(['', 'TASK', 'KEY RESULT', 'POMODOROS', 'FINISHED']);
    await expect(table.locator('.done-reopen-btn')).toHaveCount(0);

    // Done titles read as normal text, not struck through.
    const lineThrough = await table.locator('.done-task-title').first()
      .evaluate(el => getComputedStyle(el).textDecorationLine);
    expect(lineThrough).toBe('none');
  });

  test('columns align across day groups via the fixed table layout', async ({ page }) => {
    const tables = page.locator('.done-table');
    await expect(tables).toHaveCount(2);

    // Fixed layout: identical column boundaries in every group's table.
    for (const table of await tables.all()) {
      await expect(table).toHaveCSS('table-layout', 'fixed');
    }

    // Same header cell x-position (and width) in both groups.
    for (const thClass of ['.done-th-task', '.done-th-kr', '.done-th-pomos', '.done-th-finished']) {
      const a = await tables.nth(0).locator(`thead th${thClass}`).boundingBox();
      const b = await tables.nth(1).locator(`thead th${thClass}`).boundingBox();
      expect(Math.abs(a!.x - b!.x)).toBeLessThan(1);
      expect(Math.abs(a!.width - b!.width)).toBeLessThan(1);
    }
  });

  test('unchecking asks for confirmation; Cancel keeps the task done', async ({ page }) => {
    await page.locator('.done-table .td-select .done-check').first().click();

    const modal = page.locator('.confirm-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Ship redesign');

    await modal.locator('.confirm-cancel-btn').click();
    await expect(modal).toHaveCount(0);
    // Still done, still listed, tick still checked.
    await expect(page.locator('.done-table .done-table-row')).toHaveCount(2);
    await expect(page.locator('.done-table .done-check').first()).toHaveClass(/checked/);
  });

  test('confirming the uncheck reopens the task and leaves it the Done list', async ({ page }) => {
    await page.locator('.done-table .td-select .done-check').first().click();

    const modal = page.locator('.confirm-modal');
    await expect(modal).toBeVisible();
    await modal.locator('.btn:not(.confirm-cancel-btn)').click();

    await expect(page.locator('.done-table .done-table-row')).toHaveCount(1);
    await expect(page.locator('.done-table .done-task-title', { hasText: 'Write release notes' })).toBeVisible();
  });

  test('ticking is a no-op while done; row click still opens detail', async ({ page }) => {
    // The tick cell must not trigger the row's open-detail click.
    await page.locator('.done-table .td-select .done-check').first().click();
    await expect(page.locator('.confirm-modal')).toBeVisible();
    await expect(page.locator('.task-detail-panel')).toHaveCount(0);
    await page.locator('.confirm-modal .confirm-cancel-btn').click();

    await page.locator('.done-table .done-table-row').first().locator('.done-td-task').click();
    await expect(page.locator('.task-detail-panel')).toBeVisible();
  });
});
