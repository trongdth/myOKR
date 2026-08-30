import { test, expect } from '@playwright/test';

/**
 * DatePicker (2026-08-30 feedback): the DUE cell used the browser's native
 * date picker via a hidden input — in WKWebView that popover renders tiny
 * and outlives the panel (clicking outside the task detail never dismissed
 * it). The DUE cell now opens the shared in-app DatePicker: a real-size
 * calendar that commits on day click, clears via a footer row, and
 * dismisses on Esc, outside clicks, and together with the panel itself.
 */
test.describe('DatePicker (task-detail DUE cell)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(async () => {
      const storage = await import('/src/lib/pomodoro-storage.ts');
      await storage.saveTasks([{
        id: 't-due',
        title: 'DUE picker task',
        category: 'decide',
        bucket: 'this_week',
        dueDate: '2026-07-31',
        estimatedPomodoros: 4,
        completedPomodoros: 0,
        isCompleted: false,
        createdAt: '2026-07-01T10:00:00Z',
      }]);
    });
    await page.evaluate(() => window.localStorage.setItem('myokr_active_section', 'tasks'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('.board-task-card', { hasText: 'DUE picker task' }).locator('.card-title').click();
    await expect(page.locator('.task-detail-panel')).toBeVisible();
  });

  test('DUE opens a full-size in-app calendar seeded to the due month', async ({ page }) => {
    await page.locator('[aria-label="Due date"]').click();
    const panel = page.locator('.date-picker-panel');
    await expect(panel).toBeVisible();
    // A real calendar, not the tiny native popover.
    const box = await panel.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(260);
    expect(box!.height).toBeGreaterThanOrEqual(280);
    // The view is seeded to the due date's month.
    await expect(panel.locator('.dp-month-label')).toHaveText('July 2026');
    // The native hidden host is gone — nothing left for the OS to anchor to.
    await expect(page.locator('.prop-date-input')).toHaveCount(0);
  });

  test('clicking a day commits the formatted date and closes the picker', async ({ page }) => {
    const due = page.locator('[aria-label="Due date"]');
    await due.click();
    const panel = page.locator('.date-picker-panel');
    await expect(panel).toBeVisible();

    // 2026-07-04 is a Saturday — the label must read it day-first.
    await panel.locator('.dp-day', { hasText: /^4$/ }).click();
    await expect(due).toContainText('Sat 4 Jul');
    await expect(panel).toHaveCount(0);

    // The commit persists like any other property edit.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('.board-task-card', { hasText: 'DUE picker task' }).locator('.card-title').click();
    await expect(page.locator('[aria-label="Due date"]')).toContainText('Sat 4 Jul');
  });

  test('the clear row empties the due date', async ({ page }) => {
    const due = page.locator('[aria-label="Due date"]');
    await due.click();
    const panel = page.locator('.date-picker-panel');
    await expect(panel.locator('.dp-clear-label')).toHaveText('No due date');
    await panel.locator('.dp-clear').click();
    // Imperative placeholder replaces the date; picker closes.
    await expect(due).toContainText('Set a due date');
    await expect(panel).toHaveCount(0);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('.board-task-card', { hasText: 'DUE picker task' }).locator('.card-title').click();
    await expect(page.locator('[aria-label="Due date"]')).toContainText('Set a due date');
  });

  test('Esc dismisses the picker and spares the modal', async ({ page }) => {
    await page.locator('[aria-label="Due date"]').click();
    await expect(page.locator('.date-picker-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.date-picker-panel')).toHaveCount(0);
    await expect(page.locator('.task-detail-panel')).toBeVisible();
  });

  test('a click elsewhere inside the panel dismisses the picker, not the modal', async ({ page }) => {
    await page.locator('[aria-label="Due date"]').click();
    await expect(page.locator('.date-picker-panel')).toBeVisible();
    // The due date stays untouched — a stray click only closes the picker.
    await page.locator('.notes-header .section-title').click();
    await expect(page.locator('.date-picker-panel')).toHaveCount(0);
    await expect(page.locator('.task-detail-panel')).toBeVisible();
  });

  test('clicking outside the task detail dismisses the picker with the panel', async ({ page }) => {
    await page.locator('[aria-label="Due date"]').click();
    await expect(page.locator('.date-picker-panel')).toBeVisible();
    // The picker is React-rendered, so it cannot outlive the modal the way
    // the native popover did (2026-08-30 feedback).
    await page.locator('.app-modal-overlay').click({ position: { x: 20, y: 20 } });
    await expect(page.locator('.date-picker-panel')).toHaveCount(0);
    await expect(page.locator('.task-detail-panel')).toHaveCount(0);
  });
});
