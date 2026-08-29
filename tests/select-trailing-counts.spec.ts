import { test, expect } from '@playwright/test';

/**
 * Ticket 07 — .scratch/custom-select/issues/07-trailing-counts.md
 * Real data in the trailing slot: per-value task counts on Done's filters and
 * open-linked-task counts on the KR pickers. The tick wins on the chosen row —
 * counts render only on non-chosen rows.
 */
test.describe('Trailing counts', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(async () => {
      const okr = await import('/src/lib/okr-storage.ts');
      const storage = await import('/src/lib/pomodoro-storage.ts');
      await okr.saveCycles([{ id: 'c1', name: 'May cycle', month: 4, year: 2026, isActive: true, createdAt: '2026-05-01T00:00:00Z' }]);
      await okr.saveObjectives([{ id: 'o1', cycleId: 'c1', title: 'Counts Objective', createdAt: '2026-05-01T00:00:00Z' }]);
      await okr.saveKeyResults([
        { id: 'kr-1', objectiveId: 'o1', title: 'Counts KR One', targetValue: 10, currentValue: 0, unit: '%' },
        { id: 'kr-2', objectiveId: 'o1', title: 'Counts KR Two', targetValue: 10, currentValue: 0, unit: '%' },
      ]);
      await storage.saveTasks([
        { id: 'd1', title: 'Done Task One', category: 'do', bucket: 'today', keyResultId: 'kr-1', estimatedPomodoros: 1, completedPomodoros: 1, isCompleted: true, completedAt: '2026-05-06T10:00:00Z', createdAt: '2026-05-05T10:00:00Z' },
        { id: 'd2', title: 'Done Task Two', category: 'decide', bucket: 'today', keyResultId: 'kr-1', estimatedPomodoros: 1, completedPomodoros: 1, isCompleted: true, completedAt: '2026-05-06T11:00:00Z', createdAt: '2026-05-05T10:00:00Z' },
        { id: 'd3', title: 'Done Task Three', category: 'do', bucket: 'backlog', keyResultId: 'kr-2', estimatedPomodoros: 1, completedPomodoros: 1, isCompleted: true, completedAt: '2026-05-06T12:00:00Z', createdAt: '2026-05-05T10:00:00Z' },
        { id: 'o1t', title: 'Open Task One', category: 'do', bucket: 'today', keyResultId: 'kr-1', estimatedPomodoros: 1, completedPomodoros: 0, isCompleted: false, createdAt: '2026-05-05T10:00:00Z' },
      ]);
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('Done filters show per-value counts; the tick wins on the chosen row', async ({ page }) => {
    await page.evaluate(() => window.localStorage.setItem('myokr_active_section', 'done'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.done-view-container')).toBeVisible();

    const krFilter = page.locator('.done-filters-row [aria-label="Key result filter"]');
    await krFilter.click();
    const panel = page.locator('.sel-panel');
    // 'all' is the initially chosen row, so its own total hides behind the
    // tick — the per-KR rows carry their counts from the start
    await expect(panel.locator('.sel-row', { hasText: 'Counts KR One' }).locator('.sel-trailing')).toHaveText('2');
    await expect(panel.locator('.sel-row', { hasText: 'Counts KR Two' }).locator('.sel-trailing')).toHaveText('1');

    // Choosing a KR hides its count behind the tick — and reveals the
    // All row's base total (PR #83 review: the All rows carry totals too)
    await panel.locator('.sel-row', { hasText: 'Counts KR One' }).click();
    await krFilter.click();
    await expect(panel.locator('.sel-chosen').locator('.sel-trailing')).toHaveCount(0);
    await expect(panel.locator('.sel-chosen')).toHaveText(/Counts KR One/);
    await expect(panel.locator('.sel-row', { hasText: 'All key results' }).locator('.sel-trailing')).toHaveText('3');
    await page.keyboard.press('Escape');

    const priorityFilter = page.locator('.done-filters-row [aria-label="Priority filter"]');
    await priorityFilter.click();
    await expect(panel.locator('.sel-row', { hasText: 'Do' }).locator('.sel-trailing')).toHaveText('2');
    await expect(panel.locator('.sel-row', { hasText: 'Decide' }).locator('.sel-trailing')).toHaveText('1');
    // Same flip for the priority All row
    await panel.locator('.sel-row', { hasText: 'Do' }).click();
    await priorityFilter.click();
    await expect(panel.locator('.sel-row', { hasText: 'All priorities' }).locator('.sel-trailing')).toHaveText('3');
  });

  test('KR pickers show open-linked-task counts and update after completion', async ({ page }) => {
    await page.evaluate(() => window.localStorage.setItem('myokr_active_section', 'tasks'));
    await page.reload();
    await page.waitForLoadState('networkidle');

    const krPicker = page.locator('.quick-add-field [aria-label="Key result"]');
    await krPicker.click();
    const panel = page.locator('.sel-panel');
    await expect(panel.locator('.sel-row', { hasText: 'Counts KR One' }).locator('.sel-trailing')).toHaveText('1'); // the open task
    await expect(panel.locator('.sel-row', { hasText: 'Counts KR Two' }).locator('.sel-trailing')).toHaveText('0');
    await page.keyboard.press('Escape');

    // Completing the open task moves it out of the open-linked count…
    await page.locator('.board-task-card', { hasText: 'Open Task One' }).locator('.card-tick').click();
    await expect(page.locator('text=Open Task One')).toHaveCount(0, { timeout: 5000 }).catch(() => {}); // leaves the board
    await krPicker.click();
    await expect(panel.locator('.sel-row', { hasText: 'Counts KR One' }).locator('.sel-trailing')).toHaveText('0');
    await page.keyboard.press('Escape');

    // …and into the Done KR filter's count
    await page.evaluate(() => window.localStorage.setItem('myokr_active_section', 'done'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('.done-filters-row [aria-label="Key result filter"]').click();
    await expect(page.locator('.sel-panel .sel-row', { hasText: 'Counts KR One' }).locator('.sel-trailing')).toHaveText('3');
  });

  test('TaskDetail KR row shows the same open-linked counts', async ({ page }) => {
    await page.evaluate(() => window.localStorage.setItem('myokr_active_section', 'tasks'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('.board-task-card', { hasText: 'Open Task One' }).locator('.card-title').click();
    await expect(page.locator('.task-detail-panel')).toBeVisible();

    const kr = page.locator('.prop-group [aria-label="Key result"]');
    await kr.click();
    // This task is linked to KR One — its row is chosen, so the tick hides its
    // count; the other row carries its own count.
    await expect(page.locator('.sel-panel .sel-chosen')).toHaveText(/Counts KR One/);
    await expect(page.locator('.sel-panel .sel-chosen').locator('.sel-trailing')).toHaveCount(0);
    await expect(page.locator('.sel-panel .sel-row', { hasText: 'Counts KR Two' }).locator('.sel-trailing')).toHaveText('0');
    // Re-linking moves the open task: KR Two keeps the tick, KR One drops to 0
    await page.locator('.sel-panel .sel-row', { hasText: 'Counts KR Two' }).click();
    await kr.click();
    await expect(page.locator('.sel-panel .sel-chosen')).toHaveText(/Counts KR Two/);
    await expect(page.locator('.sel-panel .sel-row', { hasText: 'Counts KR One' }).locator('.sel-trailing')).toHaveText('0');
  });
});
