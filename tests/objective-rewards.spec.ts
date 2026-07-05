import { test, expect } from '@playwright/test';

async function waitForApp(page: import('@playwright/test').Page) {
  // Bypass first-run walkthrough overlay so it doesn't intercept nav clicks
  await page.addInitScript(() => {
    window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
}

test.describe('Objective Rewards system', () => {
  test('allows creating, editing, and unlocking objective rewards', async ({ page }) => {
    await waitForApp(page);

    // Go to OKRs tab
    await page.locator('nav >> text=OKRs').click();
    await expect(page.locator('.okr-header-title')).toBeVisible();

    // Seed mock cycle, objective, and KR
    await page.evaluate(async () => {
      const updateDoc = (window as any).__updateAutomergeDoc;
      if (!updateDoc) throw new Error('Automerge test hooks not exposed');

      await updateDoc('Seed E2E rewards data', (d: any) => {
        const cycle = {
          id: 'cycle-rewards-test',
          name: 'June 2026',
          month: 5,
          year: 2026,
          isActive: true,
          createdAt: new Date().toISOString(),
        };
        d.cycles = [cycle];

        const objective = {
          id: 'obj-rewards-test',
          cycleId: 'cycle-rewards-test',
          title: 'Achieve Greatness',
          order: 0,
          createdAt: new Date().toISOString(),
        };
        d.objectives = [objective];

        const keyResult = {
          id: 'kr-rewards-test',
          objectiveId: 'obj-rewards-test',
          title: 'Finish 2 key metrics',
          targetValue: 2,
          currentValue: 0,
          unit: 'metrics',
          confidence: 'on_track',
          completionMode: 'manual',
          order: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        d.keyResults = [keyResult];
        d.tasks = [];
        d.reviews = [];
        d.history = [];
      });

      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });

    // Wait for the UI to show the newly seeded objective
    await expect(page.locator('text=Achieve Greatness')).toBeVisible({ timeout: 10000 });

    // Expand the objective card
    await page.locator('.objective-header').click();
    await expect(page.locator('.objective-body')).toBeVisible();

    // 1. Verify input is visible since no reward is initially set
    const rewardInput = page.locator('.objective-reward-input');
    await expect(rewardInput).toBeVisible();
    await expect(rewardInput).toHaveAttribute('placeholder', /Set a reward/);

    // 2. Set a reward
    await rewardInput.fill('Treat myself to ice cream');
    await page.locator('.objective-reward-save-btn').click();

    // 3. Verify it shows in Locked state
    const rewardCard = page.locator('.objective-reward-card');
    await expect(rewardCard).toHaveClass(/locked/);
    await expect(rewardCard.locator('.objective-reward-label')).toContainText('TARGET REWARD');
    await expect(rewardCard.locator('.objective-reward-text')).toContainText('Treat myself to ice cream');

    // 4. Edit the reward
    await rewardCard.locator('.objective-reward-edit-btn').click();
    await expect(rewardInput).toBeVisible();
    await rewardInput.fill('Go to the cinema');
    await page.locator('.objective-reward-save-btn').click();

    // Verify updated locked reward
    await expect(rewardCard).toHaveClass(/locked/);
    await expect(rewardCard.locator('.objective-reward-text')).toContainText('Go to the cinema');

    // 5. Complete Key Result to reach 100% objective progress
    await page.evaluate(async () => {
      const updateDoc = (window as any).__updateAutomergeDoc;
      await updateDoc('Update KR to 100%', (d: any) => {
        d.keyResults[0].currentValue = 2; // target is 2 -> progress 100%
      });
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });

    // 6. Verify transition to Unlocked state (golden banner)
    await expect(rewardCard).toHaveClass(/unlocked/);
    await expect(rewardCard.locator('.objective-reward-label')).toContainText('UNLOCKED REWARD');
    await expect(rewardCard.locator('.objective-reward-text')).toContainText('Go to the cinema');
    await expect(rewardCard.locator('.objective-reward-icon')).toContainText('🏆');
  });
});
