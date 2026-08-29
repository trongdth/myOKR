import { test, expect } from '@playwright/test';

/**
 * Done tab row-layout parity with the Tasks list view (2026-08-29 decision):
 * the Done table reuses the list table's anatomy — leading selection-checkbox
 * column (select-all per day group), the same card chrome, and a bulk bar —
 * while keeping the P5 columns (TASK | KEY RESULT | POMODOROS | FINISHED |
 * UNDO). The bulk action for completed tasks is Reopen.
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

  test('done table adopts the list-table anatomy with a checkbox column', async ({ page }) => {
    const table = page.locator('.done-table');
    await expect(table).toBeVisible();
    // The consistency binding: same table chrome as the Tasks list view.
    await expect(table).toHaveClass(/list-table/);

    // Select-all checkbox in the group header + one checkbox per row.
    await expect(table.locator('.th-select input[type="checkbox"]')).toHaveCount(1);
    await expect(table.locator('.td-select input[type="checkbox"]')).toHaveCount(2);

    // P5 columns survive the re-layout.
    const headers = table.locator('thead th').allTextContents();
    expect(await headers).toEqual(['', 'TASK', 'KEY RESULT', 'POMODOROS', 'FINISHED', 'UNDO']);
  });

  test('row checkbox selects without opening task detail; selected rows are highlighted', async ({ page }) => {
    await page.locator('.done-table .td-select input[type="checkbox"]').first().check();
    await expect(page.locator('.bulk-action-bar')).toBeVisible();
    await expect(page.locator('.bulk-count')).toHaveText('1 selected');
    await expect(page.locator('.done-table .list-row.selected')).toHaveCount(1);
    // The checkbox cell must not trigger the row's open-detail click.
    await expect(page.locator('.task-detail-panel')).toHaveCount(0);
  });

  test('select-all checks the group; bulk Reopen returns every selected task to open', async ({ page }) => {
    await page.locator('.done-table .th-select input[type="checkbox"]').check();

    await expect(page.locator('.bulk-count')).toHaveText('2 selected');
    await expect(page.locator('.done-table .list-row.selected')).toHaveCount(2);

    await page.locator('.bulk-action-bar .bulk-btn', { hasText: 'Reopen' }).click();

    // Everything reopened → the Done list empties and the bulk bar clears.
    await expect(page.locator('.done-table')).toHaveCount(0);
    await expect(page.locator('.done-view-empty')).toBeVisible();
    await expect(page.locator('.bulk-action-bar')).toHaveCount(0);
  });

  test('per-row Reopen still reopens a single task', async ({ page }) => {
    await page.locator('.done-table .done-table-row').first().locator('.done-reopen-btn').click();
    await expect(page.locator('.done-table .done-table-row')).toHaveCount(1);
    await expect(page.locator('.done-table .done-task-title', { hasText: 'Write release notes' })).toBeVisible();
  });
});
