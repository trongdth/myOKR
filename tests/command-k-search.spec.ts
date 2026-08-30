import { test, expect } from '@playwright/test';

/**
 * ⌘K search rework (2026-08-30). The search popup is the app-wide task
 * launcher: correct per-task meta (bucket · priority · key result · subtask
 * count — never glued text or raw ISO dates), inline match highlighting,
 * OPEN / COMPLETED / INSIDE TASKS groups, and a keyboard selection model
 * (↑/↓ move, Enter starts focus, Esc clears then closes). Chips-only scope —
 * the cycle dropdown is gone (guarded in select-modal-filter-migration.spec).
 */
test.describe('⌘K search rework', () => {
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
      await okr.saveObjectives([{ id: 'o1', cycleId: 'c1', title: 'Search Objective', createdAt: '2026-05-01T00:00:00Z' }]);
      await okr.saveKeyResults([
        { id: 'kr-1', objectiveId: 'o1', title: '90% test coverage', targetValue: 100, currentValue: 0, unit: '%' },
      ]);
      await storage.saveTasks([
        {
          id: 't1', title: 'Refactor auth module', category: 'do', bucket: 'today',
          keyResultId: 'kr-1', estimatedPomodoros: 6, completedPomodoros: 2, isCompleted: false,
          createdAt: '2026-08-29T10:00:00Z',
          todos: [
            { id: 's1', text: 'migrate auth tests to vitest', completed: true, createdAt: '2026-08-29T10:00:00Z' },
            { id: 's2', text: 'extract login form', completed: true, createdAt: '2026-08-29T10:00:00Z' },
            { id: 's3', text: 'delete legacy session store', completed: false, createdAt: '2026-08-29T10:00:00Z' },
            { id: 's4', text: 'add auth smoke test', completed: false, createdAt: '2026-08-29T10:00:00Z' },
          ],
        },
        {
          id: 't2', title: 'Document auth error codes', category: 'decide', bucket: 'backlog',
          estimatedPomodoros: 2, completedPomodoros: 0, isCompleted: false,
          createdAt: '2026-08-20T10:00:00Z',
        },
        {
          id: 't3', title: 'Rotate auth tokens on release', category: 'do', bucket: 'this_week',
          estimatedPomodoros: 3, completedPomodoros: 3, isCompleted: true,
          completedAt: '2026-05-21T14:20:00Z', createdAt: '2026-05-20T10:00:00Z',
        },
        {
          id: 't4', title: 'Ship auth rate limiting', category: 'decide', bucket: 'backlog',
          estimatedPomodoros: 5, completedPomodoros: 5, isCompleted: true,
          completedAt: '2026-05-19T09:00:00Z', createdAt: '2026-05-18T10:00:00Z',
        },
        {
          id: 't5', title: 'Fix sync conflict dialog', category: 'delete', bucket: 'backlog',
          estimatedPomodoros: 1, completedPomodoros: 1, isCompleted: true,
          completedAt: '2026-05-24T16:00:00Z', createdAt: '2026-05-23T10:00:00Z',
          comments: [
            { id: 'cm1', text: 'OAuth callback needs the auth secret', createdAt: '2026-05-23T12:00:00Z' },
          ],
        },
      ]);
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => window.localStorage.setItem('myokr_active_section', 'done'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('.search-trigger-btn').click();
    await expect(page.locator('.command-k-modal')).toBeVisible();
    await expect(page.locator('.command-k-input')).toBeFocused();
  });

  test('meta line is per-task, ·-separated segments — bucket · priority · key result · subtasks', async ({ page }) => {
    await page.keyboard.type('Refactor');
    const row = page.locator('.command-k-item', { hasText: 'Refactor auth module' });
    const meta = row.locator('.command-k-item-meta');
    await expect(meta.locator('.meta-seg')).toHaveText(['Today', 'Do', '90% test coverage', '2/4']);
    await expect(meta.locator('.meta-sep')).toHaveCount(3);
    // The title is its own element — the bucket never glues onto it.
    await expect(row.locator('.command-k-item-title')).toHaveText('Refactor auth module');
  });

  test('meta without a key result or subtasks degrades gracefully', async ({ page }) => {
    await page.keyboard.type('Document');
    const meta = page.locator('.command-k-item', { hasText: 'Document auth error codes' }).locator('.command-k-item-meta');
    await expect(meta.locator('.meta-seg')).toHaveText(['Backlog', 'Decide', 'no key result']);
  });

  test('groups render OPEN → COMPLETED → INSIDE TASKS with plain count headers', async ({ page }) => {
    await page.keyboard.type('auth');
    const headers = page.locator('.command-k-group-header');
    await expect(headers).toHaveText(['OPEN·2', 'COMPLETED·2', 'INSIDE TASKS·3']);
    // No filled count-badge pill — the count is bare mono text.
    await expect(page.locator('.command-k-group-count')).toHaveCount(0);
    // Open before completed; completed sorted most-recent-first.
    const openTitles = page.locator('.command-k-group').first().locator('.command-k-item-title');
    await expect(openTitles).toHaveText(['Refactor auth module', 'Document auth error codes']);
    const completedTitles = page.locator('.command-k-group').nth(1).locator('.command-k-item-title');
    await expect(completedTitles).toHaveText(['Rotate auth tokens on release', 'Ship auth rate limiting']);
    // Header count line: 7 rows total (2 open + 2 completed + 3 inside).
    await expect(page.locator('.command-k-result-count')).toHaveText('7 results');
  });

  test('matched substring is highlighted inline in title and meta', async ({ page }) => {
    await page.keyboard.type('auth');
    const marks = page.locator('.command-k-item mark.command-k-hl');
    const count = await marks.count();
    expect(count).toBeGreaterThanOrEqual(6); // 5 titles + note + sub-task + OAuth double-match
    await expect(marks.first()).toHaveText('auth');
    // "auth" inside "OAuth" (the note row) is highlighted too — case preserved.
    const noteTitle = page.locator('.command-k-item-title', { hasText: 'OAuth callback' });
    await expect(noteTitle.locator('mark.command-k-hl').first()).toHaveText('Auth');
  });

  test('completed rows: green check, Finished date (never raw ISO), Reopen link', async ({ page }) => {
    await page.keyboard.type('Rotate');
    const row = page.locator('.command-k-item', { hasText: 'Rotate auth tokens on release' });
    await expect(row.locator('.command-k-check.done')).toBeVisible();
    const finished = row.locator('.meta-seg').first();
    await expect(finished).toHaveText(/Finished [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}/);
    await expect(finished).not.toContainText('2026');
    await expect(row.locator('.meta-seg').nth(1)).toHaveText('3 pomodoros');
    // Muted text link, not a Start button — completed tasks cannot start focus.
    await expect(row.locator('.command-k-reopen-link')).toHaveText('Reopen');
    await expect(row.locator('.command-k-start-btn')).toHaveCount(0);

    // Reopen returns the task to OPEN and it leaves COMPLETED.
    await row.locator('.command-k-reopen-link').click();
    await expect(page.locator('.command-k-group-header', { hasText: 'OPEN' })).toBeVisible();
    await expect(page.locator('.command-k-item-title', { hasText: 'Rotate auth tokens' })).toBeVisible();
  });

  test('inside rows: quoted matched text, kind icon, parent context line', async ({ page }) => {
    await page.keyboard.type('auth');
    const sub = page.locator('.command-k-item', { hasText: 'Sub-task — "migrate auth tests to vitest"' });
    await expect(sub.locator('.command-k-inside-icon')).toBeVisible();
    await expect(sub.locator('.command-k-item-meta .meta-seg').first()).toHaveText('in Refactor auth module');
    await expect(sub.locator('.command-k-item-meta .meta-seg').nth(1)).toHaveText('Today');

    const note = page.locator('.command-k-item', { hasText: 'OAuth callback' });
    await expect(note.locator('.command-k-item-title')).toContainText('Note — "');
    await expect(note.locator('.command-k-item-meta .meta-seg').first()).toHaveText('in Fix sync conflict dialog');
    await expect(note.locator('.command-k-item-meta .meta-seg').nth(1)).toHaveText(/completed [A-Z][a-z]+/);
  });

  test('selection: first row preselected with the only Start pill; ↑/↓ move; Enter starts focus', async ({ page }) => {
    await page.keyboard.type('auth');
    const rows = page.locator('.command-k-item');
    await expect(rows.first()).toHaveClass(/selected/);
    await expect(page.locator('.command-k-start-btn')).toHaveCount(1);
    await expect(rows.nth(1).locator('.command-k-start-btn')).toHaveCount(0);

    await page.keyboard.press('ArrowDown');
    await expect(rows.nth(1)).toHaveClass(/selected/);
    await expect(rows.first()).not.toHaveClass(/selected/);
    await expect(page.locator('.command-k-start-btn')).toHaveCount(1);

    // Enter starts a focus session on the highlighted task (not just navigate):
    // the modal closes, the app lands on the Session tab with t2 active.
    await page.keyboard.press('Enter');
    await expect(page.locator('.command-k-modal')).toHaveCount(0);
    await expect(page.locator('[aria-label="Active task: Document auth error codes"]')).toBeVisible();
  });

  test('Esc clears the query first, then closes the modal', async ({ page }) => {
    await page.keyboard.type('auth');
    await expect(page.locator('.command-k-result-count')).toHaveText('7 results');
    await page.keyboard.press('Escape');
    await expect(page.locator('.command-k-modal')).toBeVisible();
    await expect(page.locator('.command-k-input')).toHaveValue('');
    // Empty query = browse mode: everything, no inside rows.
    await expect(page.locator('.command-k-group-header', { hasText: 'OPEN' })).toBeVisible();
    await expect(page.locator('.command-k-group-header', { hasText: 'INSIDE TASKS' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('.command-k-modal')).toHaveCount(0);
  });

  test('panel is left-anchored, capped at 840px, with the header pinned above a scrolling region', async ({ page }) => {
    await page.keyboard.type('auth');
    const box = await page.locator('.command-k-modal').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeLessThan(60); // 2.5rem overlay padding, left edge
    expect(box!.width).toBeLessThanOrEqual(840.5);

    // Header stays pinned (outside the scroll region): results scroll, not the panel.
    const overflow = await page.locator('.command-k-modal').evaluate(el => getComputedStyle(el).overflowY);
    expect(overflow).toBe('hidden');
    const resultsOverflow = await page.locator('.command-k-results').evaluate(el => getComputedStyle(el).overflowY);
    expect(resultsOverflow).toBe('auto');
  });
});
