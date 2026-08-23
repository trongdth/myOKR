import { test, expect } from '@playwright/test';

/**
 * Ticket 03 — .scratch/custom-select/issues/03-pomodoro-modal-filter-surfaces.md
 * TaskDetailModal property rows, Done filters, ⌘K cycle filter, and the
 * PlanTabStrip cycle·week picker run on the shared Select. The portal-inside-
 * a-modal shakedown: panels stack above the modal layer and Esc closes the
 * panel without dismissing the modal.
 */
test.describe('Modal & filter Select migration', () => {
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
      await okr.saveObjectives([{ id: 'o1', cycleId: 'c1', title: 'Migration Objective', createdAt: '2026-05-01T00:00:00Z' }]);
      await okr.saveKeyResults([
        { id: 'kr-mig-1', objectiveId: 'o1', title: 'Migration KR One', targetValue: 100, currentValue: 0, unit: '%' },
        { id: 'kr-mig-2', objectiveId: 'o1', title: 'Migration KR Two', targetValue: 100, currentValue: 0, unit: '%' },
      ]);
      await storage.saveTasks([
        { id: 't-open', title: 'Mig Open Task', category: 'do', bucket: 'today', estimatedPomodoros: 2, completedPomodoros: 0, isCompleted: false, createdAt: '2026-05-05T10:00:00Z' },
        { id: 't-done-1', title: 'Mig Done Task One', category: 'do', bucket: 'today', keyResultId: 'kr-mig-1', estimatedPomodoros: 2, completedPomodoros: 2, isCompleted: true, completedAt: '2026-05-06T10:00:00Z', createdAt: '2026-05-05T10:00:00Z' },
        { id: 't-done-2', title: 'Mig Done Task Two', category: 'decide', bucket: 'backlog', estimatedPomodoros: 1, completedPomodoros: 1, isCompleted: true, completedAt: '2026-05-06T11:00:00Z', createdAt: '2026-05-05T10:00:00Z' },
      ]);
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('TaskDetail property rows run on Select; panel stacks above the modal; Esc spares the modal', async ({ page }) => {
    await page.evaluate(() => window.localStorage.setItem('myokr_active_section', 'tasks'));
    await page.reload();
    await page.waitForLoadState('networkidle');

    await page.locator('.board-task-card', { hasText: 'Mig Open Task' }).click();
    await expect(page.locator('.task-detail-panel')).toBeVisible();

    // KR row: imperative placeholder → choose → clear row
    const kr = page.locator('.prop-group [aria-label="Key result"]');
    await expect(kr.locator('.sel-text')).toHaveText('Link a key result');
    await kr.click();
    const panel = page.locator('.sel-panel');
    await expect(panel).toBeVisible();
    // Portaled above the modal overlay (z-1000)
    const hitsPanel = await panel.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && !!hit.closest('.sel-panel');
    });
    expect(hitsPanel).toBe(true);
    await panel.locator('.sel-row', { hasText: 'Migration KR Two' }).click();
    await expect(kr).toContainText('Migration KR Two');
    await kr.click();
    await page.locator('.sel-panel .sel-row.sel-clear', { hasText: 'No key result' }).click();
    await expect(kr.locator('.sel-text')).toHaveText('Link a key result');

    // Priority and bucket rows commit
    const priority = page.locator('.prop-group [aria-label="Priority"]');
    await expect(priority).toHaveCSS('height', '32px'); // property rows stay 32px tall while filling the column
    await priority.click();
    await page.locator('.sel-panel .sel-row', { hasText: 'Decide' }).click();
    await expect(priority).toContainText('Decide');
    const bucket = page.locator('.prop-group [aria-label="Bucket"]');
    await bucket.click();
    await page.locator('.sel-panel .sel-row', { hasText: 'This week' }).click();
    await expect(bucket).toContainText('This week');

    // Esc closes the panel, not the modal (document-level modal Escape must not fire)
    await priority.click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.sel-panel')).toHaveCount(0);
    await expect(page.locator('.task-detail-panel')).toBeVisible();
  });

  test('Done filters run on Select with All-sentinels as chosen-able rows', async ({ page }) => {
    await page.evaluate(() => window.localStorage.setItem('myokr_active_section', 'done'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.done-view-container')).toBeVisible();

    // Priority filter narrows the list
    await expect(page.locator('text=Mig Done Task Two')).toBeVisible();
    const priorityFilter = page.locator('.done-filters-row [aria-label="Priority filter"]');
    await priorityFilter.click();
    await page.locator('.sel-panel .sel-row', { hasText: 'Do' }).click();
    await expect(priorityFilter).toContainText('Do');
    await expect(page.locator('text=Mig Done Task Two')).toHaveCount(0); // decide filtered out
    // Sentinel goes back to a chosen-able row with the tick
    await priorityFilter.click();
    await expect(page.locator('.sel-panel .sel-chosen')).toHaveText(/Do/);
    await page.locator('.sel-panel .sel-row', { hasText: 'All priorities' }).click();
    await expect(priorityFilter).toContainText('All priorities');
    await expect(page.locator('text=Mig Done Task Two')).toBeVisible();

    // KR filter with its own sentinel
    const krFilter = page.locator('.done-filters-row [aria-label="Key result filter"]');
    await krFilter.click();
    await page.locator('.sel-panel .sel-row', { hasText: 'Migration KR One' }).click();
    await expect(krFilter).toContainText('Migration KR One');
    await krFilter.click();
    await page.locator('.sel-panel .sel-row', { hasText: 'All key results' }).click();
    await expect(krFilter).toContainText('All key results');
  });

  test('⌘K cycle filter runs on Select above the modal overlay', async ({ page }) => {
    await page.evaluate(() => window.localStorage.setItem('myokr_active_section', 'done'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('.search-trigger-btn').click();
    await expect(page.locator('.command-k-modal')).toBeVisible();

    const cycleFilter = page.locator('[aria-label="Cycle filter"]');
    await cycleFilter.click();
    const panel = page.locator('.sel-panel');
    await expect(panel).toBeVisible();
    const hitsPanel = await panel.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && !!hit.closest('.sel-panel');
    });
    expect(hitsPanel).toBe(true);

    await panel.locator('.sel-row', { hasText: 'May cycle (Active)' }).click();
    await expect(cycleFilter).toContainText('May cycle (Active)');
    await cycleFilter.click();
    await expect(page.locator('.sel-panel .sel-chosen')).toHaveText(/May cycle/);
    await page.locator('.sel-panel .sel-row', { hasText: 'All Cycles' }).click();
    await expect(cycleFilter).toContainText('All Cycles');

    // Esc closes the panel; the search modal stays open
    await cycleFilter.click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.sel-panel')).toHaveCount(0);
    await expect(page.locator('.command-k-modal')).toBeVisible();
  });

  test('PlanTabStrip cycle·week runs on Select; overlay-chevron wrapper is gone', async ({ page }) => {
    await page.evaluate(() => window.localStorage.setItem('myokr_active_section', 'tasks'));
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('.plan-cycle-week-dropdown-wrapper')).toHaveCount(0); // wrapper hack deleted
    const week = page.locator('[aria-label="Cycle week"]');
    await expect(week).toContainText(/May cycle · (All weeks|week \d+ of \d+)/);
    await week.click();
    await page.locator('.sel-panel .sel-row', { hasText: 'week 1 of' }).click();
    await expect(week).toContainText('May cycle · week 1 of');
    await week.click();
    await expect(page.locator('.sel-panel .sel-chosen')).toHaveText(/week 1 of/);
    await page.locator('.sel-panel .sel-row', { hasText: 'All weeks' }).click();
    await expect(week).toContainText('All weeks');
  });

  test('no native select remains on the tasks, done, ⌘K and detail surfaces', async ({ page }) => {
    await page.evaluate(() => window.localStorage.setItem('myokr_active_section', 'tasks'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.tasks-view-container select')).toHaveCount(0);

    await page.evaluate(() => window.localStorage.setItem('myokr_active_section', 'done'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.done-view-container select')).toHaveCount(0);

    await page.locator('.search-trigger-btn').click();
    await expect(page.locator('.command-k-modal select')).toHaveCount(0);

    await page.keyboard.press('Escape'); // close ⌘K
    await page.evaluate(() => window.localStorage.setItem('myokr_active_section', 'tasks'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('.board-task-card', { hasText: 'Mig Open Task' }).click();
    await expect(page.locator('.task-detail-panel select')).toHaveCount(0);
  });
});
