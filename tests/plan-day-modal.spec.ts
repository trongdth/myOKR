import { test, expect, type Page } from '@playwright/test';

// Plan-day modal — the preview-and-commit surface behind the Focus shell's
// "Plan day" button (2026-08-16 grilling session). Seed math with the fixed
// clock (May 24 → 7 days left, focusDuration 25): budget = round(320/25) = 13,
// maxShare = 6, every seed task's remaining slice = 2, so all 5 open non-delete
// tasks fit (10 ≤ 13) and completed-today = 3 → committed = 13/13 exactly.
const FIXED_TIME = new Date('2026-05-24T12:00:00.000Z');

async function waitForApp(page: Page) {
  await page.clock.setFixedTime(FIXED_TIME);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
  await expect(page.locator('.focus-header-title')).toBeVisible({ timeout: 10000 });
}

/** Open the Plan-day modal; resolves once its cards are rendered. */
async function openModal(page: Page) {
  await page.locator('.focus-plan-day-btn').click();
  const modal = page.locator('.planday-modal');
  await expect(modal).toBeVisible();
  await expect(modal.locator('.planday-card').first()).toBeVisible();
  return modal;
}

test.describe('Plan day modal', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
  });

  test('opens with a fresh deterministic capacity split and no overflow', async ({ page }) => {
    const modal = await openModal(page);

    // Deterministic ranking: task-6 (do, at-risk KR) leads; all 5 fit the budget
    const cards = modal.locator('.planday-card');
    await expect(cards).toHaveCount(5);
    await expect(cards.nth(0)).toContainText('Refactor auth module');
    await expect(cards.nth(1)).toContainText('Design new dashboard layout');

    // Everything fits → no capacity-reached divider, no overflow cards
    await expect(modal.locator('.planday-divider')).toHaveCount(0);
    await expect(modal.locator('.planday-overflow-card')).toHaveCount(0);
  });

  test('capacity bar shows committed pomos: done today + planned slices', async ({ page }) => {
    const modal = await openModal(page);
    // 3 completed today + 5 slices × 2 pomos = 13 of budget 13 — full, not over
    await expect(modal.locator('.planday-capacity-count')).toHaveText('13/13');
    await expect(modal.locator('.planday-capacity-fill')).not.toHaveClass(/is-over/);
  });

  test('badges: PINNED marks row 1; source bucket is labeled per card', async ({ page }) => {
    const modal = await openModal(page);
    const cards = modal.locator('.planday-card');

    // Row 1 (task-6, bucketless → backlog) carries both PINNED and FROM BACKLOG
    await expect(cards.nth(0).locator('.planday-badge.is-pinned')).toHaveText('PINNED');
    await expect(cards.nth(0).locator('.planday-badge.is-backlog')).toHaveText('FROM BACKLOG');
    // Only row 1 is pinned
    await expect(modal.locator('.planday-badge.is-pinned')).toHaveCount(1);
    // task-1 lives in the Today bucket
    await expect(cards.nth(1).locator('.planday-badge.is-today')).toHaveText('TODAY');
    await expect(cards.nth(1).locator('.planday-badge.is-pinned')).toHaveCount(0);
  });

  test('card ratios use the canonical completed/estimated display', async ({ page }) => {
    const modal = await openModal(page);
    // task-6: 4 of 6 done; task-1: 3 of 5 (no focus running → raw completed)
    await expect(modal.locator('.planday-card').nth(0).locator('.planday-ratio')).toHaveText('4/6');
    await expect(modal.locator('.planday-card').nth(1).locator('.planday-ratio')).toHaveText('3/5');
  });

  test('click-select reorder: grip picks up, row click places above, Accept persists', async ({ page }) => {
    const modal = await openModal(page);
    const cards = modal.locator('.planday-card');

    // Pick up task-1 (row 2), place it above task-5 (row 4)
    await cards.nth(1).locator('.planday-grip').click();
    await expect(cards.nth(1)).toHaveClass(/is-picked/);
    await cards.nth(3).click();

    // New order: task-6, task-3, task-1, task-5, task-7
    await expect(cards.nth(1)).toContainText('Write API documentation');
    await expect(cards.nth(2)).toContainText('Design new dashboard layout');

    await modal.locator('.planday-accept-btn').click();
    await expect(modal).toHaveCount(0);

    // Dashboard honors the accepted order — NOW then UP NEXT
    const dashboard = page.locator('.focus-card');
    await expect(dashboard.nth(0)).toContainText('Refactor auth module');
    await expect(dashboard.nth(1)).toContainText('Write API documentation');
    await expect(dashboard.nth(2)).toContainText('Design new dashboard layout');

    // …and it survives a reload (the plan is persisted)
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.focus-card').nth(2)).toContainText('Design new dashboard layout');
  });

  test('Esc cancels: the saved plan is untouched by un-accepted edits', async ({ page }) => {
    const modal = await openModal(page);
    const cards = modal.locator('.planday-card');

    // Reorder inside the modal (task-3 above task-6), then Esc out
    await cards.nth(2).locator('.planday-grip').click();
    await cards.nth(0).click();
    await expect(cards.nth(0)).toContainText('Write API documentation');
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);

    // Dashboard keeps the pre-existing plan
    await expect(page.locator('.focus-card').nth(0)).toContainText('Refactor auth module');
    await expect(page.locator('.focus-card').nth(1)).toContainText('Design new dashboard layout');

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.focus-card').nth(0)).toContainText('Refactor auth module');
  });

  test('Esc first cancels the pick, not the modal', async ({ page }) => {
    const modal = await openModal(page);
    const cards = modal.locator('.planday-card');

    await cards.nth(1).locator('.planday-grip').click();
    await expect(cards.nth(1)).toHaveClass(/is-picked/);

    await page.keyboard.press('Escape');
    // Pick cancelled, modal still open
    await expect(cards.nth(1)).not.toHaveClass(/is-picked/);
    await expect(modal).toBeVisible();

    // Second Esc closes the modal
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
  });

  test('✕ close button also cancels without touching the saved plan', async ({ page }) => {
    const modal = await openModal(page);
    const cards = modal.locator('.planday-card');

    await cards.nth(1).locator('.planday-grip').click();
    await cards.nth(3).click();
    await expect(cards.nth(2)).toContainText('Design new dashboard layout');

    await modal.locator('.planday-close-btn').click();
    await expect(modal).toHaveCount(0);

    await expect(page.locator('.focus-card').nth(0)).toContainText('Refactor auth module');
    await expect(page.locator('.focus-card').nth(1)).toContainText('Design new dashboard layout');
  });

  test('row menu: Pin to top and Move to overflow', async ({ page }) => {
    const modal = await openModal(page);
    const cards = modal.locator('.planday-card');

    // Pin task-1 (row 2) to the top — it takes over the PINNED badge
    await cards.nth(1).locator('.planday-menu-btn').click();
    await expect(modal.locator('.planday-menu')).toBeVisible();
    await modal.locator('.planday-menu-item:has-text("Pin to top")').click();

    await expect(cards.nth(0)).toContainText('Design new dashboard layout');
    await expect(cards.nth(0).locator('.planday-badge.is-pinned')).toHaveCount(1);
    await expect(cards.nth(1).locator('.planday-badge.is-pinned')).toHaveCount(0);

    // Move it back out — one card fewer, one overflow card, capacity drops
    await cards.nth(0).locator('.planday-menu-btn').click();
    await modal.locator('.planday-menu-item:has-text("Move to overflow")').click();

    await expect(modal.locator('.planday-card')).toHaveCount(4);
    await expect(modal.locator('.planday-overflow-card')).toHaveCount(1);
    await expect(modal.locator('.planday-overflow-card')).toContainText('Design new dashboard layout');
    // 3 done today + 4 slices × 2 = 11 of 13
    await expect(modal.locator('.planday-capacity-count')).toHaveText('11/13');
  });

  test('Re-rank discards in-modal edits and restores the deterministic ranking', async ({ page }) => {
    const modal = await openModal(page);
    const cards = modal.locator('.planday-card');

    await cards.nth(1).locator('.planday-grip').click();
    await cards.nth(3).click();
    await expect(cards.nth(2)).toContainText('Design new dashboard layout');

    await modal.locator('.planday-rerank-btn').click();

    // Untied prefix is deterministic: task-6 (do, at-risk) then task-1 (do,
    // on-track). task-3/task-5 are genuinely tied, so their relative order is
    // reshuffle-random — only assert task-1 left the manually-forced index 2.
    await expect(cards.nth(0)).toContainText('Refactor auth module');
    await expect(cards.nth(1)).toContainText('Design new dashboard layout');
    await expect(cards.nth(2)).not.toContainText('Design new dashboard layout');
    await expect(modal.locator('.planday-card.is-picked')).toHaveCount(0);
  });

  test('Re-rank flashes "No changes" when the recomputed ranking is identical', async ({ page }) => {
    // Untied fixture (distinct categories → deterministic ranking, no ties to
    // reshuffle): Re-rank on unedited data recomputes the same list — the
    // button must say so instead of looking dead.
    await page.evaluate(async () => {
      const anyWin = window as unknown as { __updateAutomergeDoc: (msg: string, fn: (d: unknown) => void) => Promise<void> };
      await anyWin.__updateAutomergeDoc('untied tasks', (doc) => {
        const d = doc as Record<string, unknown>;
        d.tasks = [
          ['do', 'Untied do task', 4],
          ['decide', 'Untied decide task', 2],
          ['delegate', 'Untied delegate task', 3],
        ].map(([category, title, est], i) => ({
          id: `u-${category}`, title: title as string, estimatedPomodoros: est as number,
          completedPomodoros: 0, isCompleted: false, category: category as string,
          createdAt: `2026-05-20T0${i + 1}:00:00.000Z`, todos: [], comments: [],
        }));
        d.keyResults = [];
        d.objectives = [];
        d.history = [];
      });
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });

    const modal = await openModal(page);
    const rerank = modal.locator('.planday-rerank-btn');
    await expect(rerank).toContainText('Re-rank');

    await rerank.click();
    await expect(rerank).toContainText('No changes');
    await expect(modal.locator('.planday-card').nth(0)).toContainText('Untied do task');

    // The flash is transient — the label reverts
    await expect(rerank).toContainText('Re-rank', { timeout: 5000 });
  });

  test('Add anyway moves an overflow task in and flags over-capacity', async ({ page }) => {
    // 3 big do-tasks (6 pomos each) + cleared history: two fill the budget
    // (6+6=12 of 13), the third tops the overflow list with everything else.
    await page.evaluate(async () => {
      const anyWin = window as unknown as { __updateAutomergeDoc: (msg: string, fn: (d: unknown) => void) => Promise<void> };
      await anyWin.__updateAutomergeDoc('overflow fixture', (doc) => {
        const d = doc as Record<string, unknown>;
        // Push plain objects — spreading the existing doc's task proxies into a
        // new array is rejected by Automerge ("reference to an existing object").
        (d.tasks as Array<Record<string, unknown>>).push(
          ...(['A', 'B', 'C'] as const).map((s, i) => ({
            id: `big-${s}`, title: `Big do task ${s}`, estimatedPomodoros: 6,
            completedPomodoros: 0, isCompleted: false, category: 'do',
            createdAt: `2026-05-1${i + 1}T09:00:00.000Z`, todos: [], comments: [],
          })),
        );
        d.history = [];
      });
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });

    const modal = await openModal(page);
    await expect(modal.locator('.planday-card')).toHaveCount(2);
    await expect(modal.locator('.planday-card').first()).toContainText('Big do task');

    // Divider names the budget; overflow holds the third big task + the seeds
    // (label is CSS-uppercased, so match case-insensitively)
    await expect(modal.locator('.planday-divider-label')).toContainText(
      /capacity reached — 13 pomodoros/i,
    );
    const overflowCards = modal.locator('.planday-overflow-card');
    await expect(overflowCards).toHaveCount(6);
    await expect(overflowCards.nth(0)).toContainText('Big do task');

    // Add anyway → over-committed: rose fill, true counter, third card in
    await overflowCards.nth(0).locator('button:has-text("Add anyway")').click();
    await expect(modal.locator('.planday-card')).toHaveCount(3);
    await expect(modal.locator('.planday-capacity-count')).toHaveText('18/13');
    await expect(modal.locator('.planday-capacity-fill')).toHaveClass(/is-over/);

    // Accept commits the over-capacity plan — 3 tasks on the dashboard
    await modal.locator('.planday-accept-btn').click();
    await expect(modal).toHaveCount(0);
    await expect(page.locator('.focus-card')).toHaveCount(3);
  });

  test('Accept CTA counts accepted tasks and planned pomodoros', async ({ page }) => {
    const modal = await openModal(page);
    await expect(modal.locator('.planday-accept-btn')).toHaveText(
      'Accept · 5 tasks, 10 pomodoros',
    );
  });

  test('footer note names the real ranking algorithm', async ({ page }) => {
    const modal = await openModal(page);
    await expect(modal.locator('.planday-note')).toContainText(
      'Ranked by priority, then remaining effort vs cycle time, then key-result confidence.',
    );
  });

  test('empty candidates: in-modal empty state with a Go to Tasks action', async ({ page }) => {
    await page.evaluate(async () => {
      const anyWin = window as unknown as { __updateAutomergeDoc: (msg: string, fn: (d: unknown) => void) => Promise<void> };
      await anyWin.__updateAutomergeDoc('empty tasks', (doc) => {
        (doc as Record<string, unknown>).tasks = [];
      });
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });

    await page.locator('.focus-plan-day-btn').click();
    const modal = page.locator('.planday-modal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.empty-state-title')).toHaveText('Nothing to plan');

    await modal.locator('button:has-text("Go to Tasks")').click();
    await expect(modal).toHaveCount(0);
    // Navigated to the Tasks screen (Plan group tab strip) — no dead end
    await expect(page.locator('.plan-tab', { hasText: 'Tasks' })).toBeVisible();
  });
});
