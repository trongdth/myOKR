import { test, expect } from '@playwright/test';

// Pin the clock inside the mock May-2026 cycle: May 24 → 7 days left.
const FIXED_TIME = new Date('2026-05-24T12:00:00.000Z');

async function waitForApp(page: import('@playwright/test').Page) {
  await page.clock.setFixedTime(FIXED_TIME);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
}

test.describe('Today Focus', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await expect(page.locator('text=Today\'s Focus')).toBeVisible({ timeout: 10000 });
  });

  test('ranks strictly by Eisenhower category, then urgency, then KR confidence', async ({ page }) => {
    // budget=10, maxShare=5, daysLeft=7
    // do: task-6 (rem 2, at_risk KR) > task-1 (rem 2, on_track KR) — confidence tie-break
    // decide: task-3 (rem 3) > task-5 (rem 2) — urgency (more remaining effort)
    // delegate: task-7 (rem 2) — slice doesn't fit after 9/10 used
    const cards = page.locator('.focus-card');
    await expect(cards).toHaveCount(4);

    await expect(cards.nth(0)).toContainText('Refactor auth module');
    await expect(cards.nth(1)).toContainText('Design new dashboard layout');
    await expect(cards.nth(2)).toContainText('Write API documentation');
    await expect(cards.nth(3)).toContainText('Plan sprint retrospective');
  });

  test('budget header shows correct slice totals', async ({ page }) => {
    // slices 2+2+3+2 = 9, budget = 10
    await expect(page.locator('text=Today\'s Plan: 9 / 10')).toBeVisible();
  });

  test('delete-category task never appears', async ({ page }) => {
    const cards = page.locator('.focus-card');
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      await expect(cards.nth(i)).not.toContainText('Clean up unused dependencies');
    }
  });

  test('plan is stable across reloads', async ({ page }) => {
    const cards = page.locator('.focus-card');
    await expect(cards).toHaveCount(4);
    const firstTitle = await cards.nth(0).textContent();

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(cards).toHaveCount(4);
    expect(await cards.nth(0).textContent()).toBe(firstTitle);
  });

  test('top card shows KR confidence dot and link', async ({ page }) => {
    // task-6 linked to kr-2 (at_risk) under obj-1 "Ship myOKR v2.0"
    const topCard = page.locator('.focus-card').first();
    await expect(topCard).toContainText('Refactor auth module');
    await expect(topCard).toContainText('Achieve 90% test coverage');
    await expect(topCard).toContainText('At Risk');
  });

  test('Start button on top card jumps to Timer with task selected', async ({ page }) => {
    await page.locator('.focus-card .btn:has-text("Start")').click();

    await expect(page.locator('.timer-section')).toBeVisible();
    await expect(page.locator('text=Working on:')).toBeVisible();
    await expect(page.locator('strong').filter({ hasText: 'Refactor auth module' })).toBeVisible();
  });

  test('Skip removes card, refills, and persists across reload', async ({ page }) => {
    const cards = page.locator('.focus-card');
    await expect(cards).toHaveCount(4);

    // Skip top card (task-6)
    await cards.nth(0).locator('button:has-text("Skip")').click();

    // After skip: task-1, task-3, task-5, task-7 fill the budget (2+3+2+2=9/10)
    await expect(cards).toHaveCount(4);
    await expect(cards.nth(0)).toContainText('Design new dashboard layout');
    await expect(cards.nth(3)).toContainText('Update README screenshots');

    // Skip survives a reload — the daily plan is persisted
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(cards).toHaveCount(4);
    await expect(cards.nth(0)).toContainText('Design new dashboard layout');
    for (let i = 0; i < 4; i++) {
      await expect(cards.nth(i)).not.toContainText('Refactor auth module');
    }
  });

  test('Replan clears skips and recomputes from scratch', async ({ page }) => {
    const cards = page.locator('.focus-card');
    await cards.nth(0).locator('button:has-text("Skip")').click();
    await expect(cards.nth(0)).toContainText('Design new dashboard layout');

    await page.locator('button:has-text("Replan")').click();

    // Skipped task-6 returns to the top
    await expect(cards.nth(0)).toContainText('Refactor auth module');
  });

  test('Why this? tooltip shows humanized reasons', async ({ page }) => {
    // task-6: do + momentum + at_risk KR tie-break; low urgency (2 pomos, 7 days)
    const topCard = page.locator('.focus-card').first();
    const whyBtn = topCard.locator('button:has-text("Why this?")');
    await whyBtn.hover();

    await expect(topCard.locator('text=Top-priority Do task')).toBeVisible();
    await expect(topCard.locator('text=Already in progress')).toBeVisible();
    await expect(topCard.locator('text=KR is at risk')).toBeVisible();
    // No urgency reason: 2 remaining pomos is far from the 7-day limit
    await expect(topCard.locator('text=Needs')).toHaveCount(0);
  });
});
