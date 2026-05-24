import { test, expect } from '@playwright/test';

async function waitForApp(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
}

test.describe('Today Focus', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await expect(page.locator('text=Today\'s Focus')).toBeVisible({ timeout: 10000 });
  });

  test('displays ranked tasks — completable first, correct order', async ({ page }) => {
    // budget=10, maxShare=5, daysLeft=7 (urgency=1.0)
    // Two-phase pick: task-6(0.898), task-1(0.799), task-3(0.547), task-5(0.447) → 4 cards, 9/10
    const cards = page.locator('.focus-card');
    await expect(cards).toHaveCount(4);

    // #1: "Refactor auth module" (do + at_risk KR + momentum)
    await expect(cards.nth(0)).toContainText('Refactor auth module');
    // #2: "Design new dashboard layout" (do + on_track KR + momentum)
    await expect(cards.nth(1)).toContainText('Design new dashboard layout');
    // #3: "Write API documentation" (decide + momentum)
    await expect(cards.nth(2)).toContainText('Write API documentation');
    // #4: "Plan sprint retrospective" (decide, no momentum)
    await expect(cards.nth(3)).toContainText('Plan sprint retrospective');
  });

  test('budget header shows correct slice totals', async ({ page }) => {
    // 4 tasks: slices 2+2+3+2 = 9, budget = 10
    await expect(page.locator('text=Today\'s Plan: 9 / 10')).toBeVisible();
  });

  test('delete-category task never appears', async ({ page }) => {
    const cards = page.locator('.focus-card');
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      await expect(cards.nth(i)).not.toContainText('Clean up unused dependencies');
    }
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

  test('Skip removes card and refills from remaining candidates', async ({ page }) => {
    const cards = page.locator('.focus-card');
    await expect(cards).toHaveCount(4);

    // Skip top card (task-6)
    await cards.nth(0).locator('button:has-text("Skip")').click();

    // After skip: task-1, task-3, task-5, task-7 fill the budget (2+3+2+2=9/10)
    await expect(cards).toHaveCount(4);
    await expect(cards.nth(0)).toContainText('Design new dashboard layout');
    // task-7 "Update README screenshots" should now appear (was previously out)
    await expect(cards.nth(3)).toContainText('Update README screenshots');
  });

  test('Reshuffle swaps at least the top card', async ({ page }) => {
    // 5 candidates, 4 displayed → Reshuffle button visible
    const reshuffleBtn = page.locator('button:has-text("Reshuffle")');
    await expect(reshuffleBtn).toBeVisible();

    const firstTitle = await page.locator('.focus-card').nth(0).textContent();

    // Reshuffle excludes top card → guaranteed different top card
    await reshuffleBtn.click();
    const newTitle = await page.locator('.focus-card').nth(0).textContent();
    expect(newTitle).not.toBe(firstTitle);
  });

  test('Why this? tooltip shows humanized reasons', async ({ page }) => {
    // task-6 triggers all 4 factors: do + at_risk + urgency + momentum
    const topCard = page.locator('.focus-card').first();
    const whyBtn = topCard.locator('button:has-text("Why this?")');
    await whyBtn.hover();

    // Should show humanized reasons, not raw numbers
    await expect(topCard.locator('text=Top-priority Do task')).toBeVisible();
    await expect(topCard.locator('text=KR is at risk')).toBeVisible();
    await expect(topCard.locator('text=Cycle ends in')).toBeVisible();
    await expect(topCard.locator('text=Already in progress')).toBeVisible();
  });
});
