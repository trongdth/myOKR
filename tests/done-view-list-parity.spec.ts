import { test, expect } from '@playwright/test';

/**
 * Done tab row semantics (2026-08-30 feedback): the leading checkbox IS the
 * task's done state — checked by default, unchecking it asks for confirmation
 * and then reopens the task (replacing the old UNDO column / Reopen button and
 * the bulk-selection bar). Titles are not struck through. The table keeps the
 * Tasks list view's card chrome (.list-table) per the 2026-08-29 decision.
 */
test.describe('Done view list parity', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });

    // Two completed tasks, both finished today → one day group.
    await page.evaluate(async () => {
      const storage = await import('/src/lib/pomodoro-storage.ts');
      const now = new Date();
      const doneAt = (hoursAgo: number) =>
        new Date(now.getTime() - hoursAgo * 3600_000).toISOString();
      await storage.saveTasks([
        { id: 'd1', title: 'Ship redesign', estimatedPomodoros: 3, completedPomodoros: 3, isCompleted: true, completedAt: doneAt(2), createdAt: doneAt(30) },
        { id: 'd2', title: 'Write release notes', estimatedPomodoros: 2, completedPomodoros: 2, isCompleted: true, completedAt: doneAt(4), createdAt: doneAt(40) },
      ]);
    });

    await page.locator('[title="Plan"]').first().click();
    await page.waitForTimeout(300);
    await page.locator('[title="Done"]').first().click();
    await page.waitForTimeout(500);
  });

  test('done table keeps the list-table anatomy with done-state checkboxes', async ({ page }) => {
    const table = page.locator('.done-table');
    await expect(table).toBeVisible();
    // The consistency binding: same table chrome as the Tasks list view.
    await expect(table).toHaveClass(/list-table/);

    // One checkbox per row, checked by default (the task is done).
    const rowChecks = table.locator('.td-select input[type="checkbox"]');
    await expect(rowChecks).toHaveCount(2);
    await expect(rowChecks.first()).toBeChecked();

    // Columns: empty checkbox header + P5 columns; the UNDO column is gone.
    const headers = table.locator('thead th').allTextContents();
    expect(await headers).toEqual(['', 'TASK', 'KEY RESULT', 'POMODOROS', 'FINISHED']);
    await expect(table.locator('.done-reopen-btn')).toHaveCount(0);

    // Done titles read as normal text, not struck through.
    const lineThrough = await table.locator('.done-task-title').first()
      .evaluate(el => getComputedStyle(el).textDecorationLine);
    expect(lineThrough).toBe('none');
  });

  test('unchecking asks for confirmation; Cancel keeps the task done', async ({ page }) => {
    await page.locator('.done-table .td-select input[type="checkbox"]').first().click();

    const modal = page.locator('.confirm-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Ship redesign');

    await modal.locator('.confirm-cancel-btn').click();
    await expect(modal).toHaveCount(0);
    // Still done, still listed, checkbox still checked.
    await expect(page.locator('.done-table .done-table-row')).toHaveCount(2);
    await expect(page.locator('.done-table .td-select input[type="checkbox"]').first()).toBeChecked();
  });

  test('confirming the uncheck reopens the task and leaves it the Done list', async ({ page }) => {
    await page.locator('.done-table .td-select input[type="checkbox"]').first().click();

    const modal = page.locator('.confirm-modal');
    await expect(modal).toBeVisible();
    await modal.locator('.btn:not(.confirm-cancel-btn)').click();

    await expect(page.locator('.done-table .done-table-row')).toHaveCount(1);
    await expect(page.locator('.done-table .done-task-title', { hasText: 'Write release notes' })).toBeVisible();
  });

  test('checking the box again is a no-op while done; row click still opens detail', async ({ page }) => {
    // Checkbox cell must not trigger the row's open-detail click.
    await page.locator('.done-table .td-select input[type="checkbox"]').first().click();
    await expect(page.locator('.confirm-modal')).toBeVisible();
    await expect(page.locator('.task-detail-panel')).toHaveCount(0);
    await page.locator('.confirm-modal .confirm-cancel-btn').click();

    await page.locator('.done-table .done-table-row').first().locator('.done-td-task').click();
    await expect(page.locator('.task-detail-panel')).toBeVisible();
  });
});
