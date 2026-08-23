import { test, expect } from '@playwright/test';

/**
 * Ticket 02 — .scratch/custom-select/issues/02-pomodoro-task-surfaces.md
 * The Tasks screen's pickers run on the shared Select component: quick-add
 * priority + KR, toolbar Group-by/Sort, and the list-view row cells. The
 * legacy TaskList (CategorySelector, dot badges) was dead code and is
 * deleted rather than migrated.
 */
test.describe('Tasks screen Select migration', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_active_section', 'tasks');
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(async () => {
      const okrStorage = await import('/src/lib/okr-storage.ts');
      const cycle = { id: 'c1', name: 'May cycle', month: 4, year: 2026, isActive: true, createdAt: '2026-05-01T00:00:00Z' };
      const obj = { id: 'o1', cycleId: 'c1', title: 'Migration Objective', createdAt: '2026-05-01T00:00:00Z' };
      await okrStorage.saveCycles([cycle]);
      await okrStorage.saveObjectives([obj]);
      await okrStorage.saveKeyResults([
        { id: 'kr-mig-1', objectiveId: 'o1', title: 'Migration KR One', targetValue: 100, currentValue: 0, unit: '%' },
        { id: 'kr-mig-2', objectiveId: 'o1', title: 'Migration KR Two', targetValue: 100, currentValue: 0, unit: '%' },
      ]);
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.tasks-view-container')).toBeVisible();
  });

  test('quick-add priority is a Select with the priority dot and commits to the task', async ({ page }) => {
    const trigger = page.locator('.quick-add-field [aria-label="Priority"]');
    await expect(trigger).toBeVisible();
    await expect(trigger.locator('.sel-priority-dot')).toBeVisible();
    await trigger.click();
    await page.locator('.sel-panel .sel-row', { hasText: 'Decide' }).click();
    await expect(trigger).toContainText('Decide');

    await page.locator('.quick-add-input').fill('Mig task A');
    await page.locator('.quick-add-btn').click();
    const card = page.locator('.board-task-card', { hasText: 'Mig task A' });
    await expect(card).toBeVisible();
    await expect(card.locator('.card-category')).toHaveText(/Decide/);
  });

  test('quick-add KR link: imperative placeholder, tick on chosen, clear row', async ({ page }) => {
    const trigger = page.locator('.quick-add-field [aria-label="Key result"]');
    await expect(trigger.locator('.sel-text')).toHaveText('Link a key result');

    await trigger.click();
    await page.locator('.sel-panel .sel-row', { hasText: 'Migration KR One' }).click();
    await expect(trigger).toContainText('Migration KR One');
    await expect(trigger.locator('.sel-kr-swatch')).toBeVisible(); // swatch appears once a value is chosen

    await trigger.click();
    await expect(page.locator('.sel-panel .sel-chosen')).toHaveText(/Migration KR One/);
    await expect(page.locator('.sel-panel .sel-tick')).toHaveCount(1);

    await page.locator('.sel-panel .sel-row.sel-clear', { hasText: 'No key result' }).click();
    await expect(trigger.locator('.sel-text')).toHaveText('Link a key result');
  });

  test('list toolbar Group-by and Sort run on Select', async ({ page }) => {
    await page.locator('.quick-add-input').fill('Mig task A');
    await page.locator('.quick-add-btn').click();
    await page.locator('.view-switch-btn', { hasText: 'List' }).click();
    await expect(page.locator('.list-view-container')).toBeVisible();

    const groupBy = page.locator('.list-toolbar-item [aria-label="Group by"]');
    await groupBy.click();
    await page.locator('.sel-panel .sel-row', { hasText: 'Key result' }).click();
    await expect(page.locator('.list-group-header').first()).toHaveText(/NO KEY RESULT/);

    const sortBy = page.locator('.list-toolbar-item [aria-label="Sort"]');
    await sortBy.click();
    await expect(page.locator('.sel-panel')).toBeVisible();
    await page.locator('.sel-panel .sel-row', { hasText: 'Due date' }).click();
    await expect(sortBy).toContainText('Due date');
  });

  test('row cells run on Select; KR cell has clear + placeholder; bucket cell moves the task', async ({ page }) => {
    await page.locator('.quick-add-input').fill('Mig task A');
    await page.locator('.quick-add-btn').click();
    await page.locator('.view-switch-btn', { hasText: 'List' }).click();

    const row = page.locator('.list-row', { hasText: 'Mig task A' });
    const bucketCell = row.locator('[aria-label^="Bucket for"]');
    await expect(bucketCell).toContainText('Backlog');
    await bucketCell.click();
    await page.locator('.sel-panel .sel-row', { hasText: 'Today' }).click();
    await expect(bucketCell).toContainText('Today');

    const krCell = row.locator('[aria-label^="Key result for"]');
    await expect(krCell.locator('.sel-text')).toHaveText('Link a key result');
    await krCell.click();
    await page.locator('.sel-panel .sel-row', { hasText: 'Migration KR Two' }).click();
    await expect(krCell).toContainText('Migration KR Two');

    const priorityCell = row.locator('[aria-label^="Priority for"]');
    await expect(priorityCell.locator('.sel-priority-dot')).toBeVisible();
  });

  test('no native select remains in the task pickers (board and list)', async ({ page }) => {
    // Scoped to ticket 02's surfaces — the cycle·week select in the tab strip
    // is ticket 03's scope.
    const pickers = page.locator('.quick-add-bar select, .list-toolbar select, .list-table select');
    await expect(pickers).toHaveCount(0);
    await page.locator('.view-switch-btn', { hasText: 'List' }).click();
    await expect(pickers).toHaveCount(0);
  });

  test('cell Select panels are not clipped by the scrollable list', async ({ page }) => {
    for (const name of ['Mig task 1', 'Mig task 2', 'Mig task 3', 'Mig task 4', 'Mig task 5', 'Mig task 6']) {
      await page.locator('.quick-add-input').fill(name);
      await page.locator('.quick-add-btn').click();
    }
    await page.locator('.view-switch-btn', { hasText: 'List' }).click();
    const lastRow = page.locator('.list-row').last();
    await lastRow.scrollIntoViewIfNeeded();
    await lastRow.locator('[aria-label^="Bucket for"]').click();
    const panel = page.locator('.sel-panel');
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(800); // inside the 1280×800 viewport
    expect(box!.x).toBeGreaterThanOrEqual(0);
  });

  test('triggers grow to 40px touch targets at ≤900px', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await expect(page.locator('.quick-add-field [aria-label="Priority"]')).toHaveCSS('height', '40px');
  });
});
