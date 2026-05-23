import { test, expect } from '@playwright/test';

async function waitForApp(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
}

test.describe('Today Focus', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    // App now defaults to Today view
    await expect(page.locator('text=Today\'s Focus')).toBeVisible({ timeout: 10000 });
  });

  test('displays top 3 ranked tasks with correct order', async ({ page }) => {
    // Seed data ranking: task-6 (at_risk KR, do, score 7) > task-1 (on_track KR, do, score 6) > task-3 (no KR, decide, momentum, score 4)
    const cards = page.locator('.focus-card');
    await expect(cards).toHaveCount(3);

    // #1 should be "Refactor auth module" (at_risk KR overrides on_track)
    await expect(cards.nth(0)).toContainText('Refactor auth module');
    // #2 should be "Design new dashboard layout"
    await expect(cards.nth(1)).toContainText('Design new dashboard layout');
    // #3 should be "Write API documentation" (has momentum over task-5)
    await expect(cards.nth(2)).toContainText('Write API documentation');
  });

  test('delete-category task never appears', async ({ page }) => {
    // task-8 "Clean up unused dependencies" is category=delete — must not show
    const cards = page.locator('.focus-card');
    await expect(cards).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await expect(cards.nth(i)).not.toContainText('Clean up unused dependencies');
    }
  });

  test('top card shows KR confidence dot and link', async ({ page }) => {
    // task-6 is linked to kr-2 (at_risk) under obj-1 "Ship myOKR v2.0"
    const topCard = page.locator('.focus-card').first();
    await expect(topCard).toContainText('Refactor auth module');
    await expect(topCard).toContainText('Achieve 90% test coverage');
    await expect(topCard).toContainText('At Risk');
  });

  test('Start button on top card jumps to Timer with task selected', async ({ page }) => {
    await page.locator('.focus-card .btn:has-text("Start")').click();

    // Should navigate to Timer tab
    await expect(page.locator('.timer-section')).toBeVisible();
    // Task should be selected
    await expect(page.locator('text=Working on:')).toBeVisible();
    await expect(page.locator('strong').filter({ hasText: 'Refactor auth module' })).toBeVisible();
  });

  test('Skip removes card and slides next up', async ({ page }) => {
    const cards = page.locator('.focus-card');
    await expect(cards).toHaveCount(3);

    // Skip top card
    await cards.nth(0).locator('button:has-text("Skip")').click();

    // Should still have cards, but "Plan sprint retrospective" should now appear
    await expect(cards).toHaveCount(3);
    // After skipping task-6, the order is: task-1, task-3, task-5
    await expect(cards.nth(0)).toContainText('Design new dashboard layout');
    await expect(cards.nth(2)).toContainText('Plan sprint retrospective');
  });

  test('Reshuffle swaps at least one card', async ({ page }) => {
    // 5 candidate tasks in seed data → Reshuffle button visible
    const reshuffleBtn = page.locator('button:has-text("Reshuffle")');
    await expect(reshuffleBtn).toBeVisible();

    const firstTitle = await page.locator('.focus-card').nth(0).textContent();

    // Click reshuffle — may need a few tries due to randomness
    let changed = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      await reshuffleBtn.click();
      const newTitle = await page.locator('.focus-card').nth(0).textContent();
      if (newTitle !== firstTitle) {
        changed = true;
        break;
      }
    }
    // With 5 candidates and forced lower-pool inclusion, this should swap quickly
    expect(changed).toBeTruthy();
  });

  test('Why this? tooltip shows score breakdown', async ({ page }) => {
    const topCard = page.locator('.focus-card').first();
    const whyBtn = topCard.locator('button:has-text("Why this?")');
    await whyBtn.hover();

    // Tooltip should appear with breakdown
    const tooltip = topCard.locator('text=Total:');
    await expect(tooltip).toBeVisible();
    await expect(topCard.locator('text=Confidence:')).toBeVisible();
    await expect(topCard.locator('text=Category:')).toBeVisible();
    await expect(topCard.locator('text=Urgency:')).toBeVisible();
    await expect(topCard.locator('text=Momentum:')).toBeVisible();
  });
});
