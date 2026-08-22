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

    // Go to Objectives tab
    await page.locator('button[title="Plan"]').click();
    await page.locator('button[title="Objectives"]').click();
    await expect(page.locator('.okr-container h2.tasks-title', { hasText: 'PLAN' })).toBeVisible();

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

    // Objectives are expanded by default
    await expect(page.locator('.objective-body')).toBeVisible();

    // 1. No reward set → the header shows the ghost pill (P7 revamp)
    const header = page.locator('.objective-header:has-text("Achieve Greatness")');
    const ghostPill = header.locator('.objective-reward-pill.ghost');
    await expect(ghostPill).toBeVisible();
    await expect(ghostPill).toContainText('Add reward');

    // 2. Set a reward — the pill swaps to an inline input; Enter saves
    await ghostPill.click();
    const rewardInput = header.locator('.objective-reward-edit-input');
    await expect(rewardInput).toBeVisible();
    await rewardInput.fill('Treat myself to ice cream');
    await rewardInput.press('Enter');

    // 3. Saved state: locked pill with the text + Lock icon
    const pill = header.locator('.objective-reward-pill:not(.ghost)');
    await expect(pill).toBeVisible();
    await expect(pill).toContainText('Treat myself to ice cream');
    await expect(pill.locator('.lucide-lock')).toBeVisible();
    await expect(pill.locator('.lucide-trophy')).toHaveCount(0);

    // 4. Edit the reward — click the pill, retype, Enter
    await pill.click();
    await expect(rewardInput).toBeVisible();
    await rewardInput.fill('Go to the cinema');
    await rewardInput.press('Enter');
    await expect(pill).toContainText('Go to the cinema');

    // 5. Escape cancels an edit without saving
    await pill.click();
    await rewardInput.fill('Should not persist');
    await rewardInput.press('Escape');
    await expect(pill).toContainText('Go to the cinema');

    // 6. Complete Key Result to reach 100% objective progress
    await page.evaluate(async () => {
      const updateDoc = (window as any).__updateAutomergeDoc;
      await updateDoc('Update KR to 100%', (d: any) => {
        d.keyResults[0].currentValue = 2; // target is 2 -> progress 100%
      });
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });

    // 7. Unlocked state: the pill swaps Lock for Trophy (no amber — tokens only)
    await expect(pill).toHaveClass(/unlocked/);
    await expect(pill).toContainText('Go to the cinema');
    await expect(pill.locator('.lucide-trophy')).toBeVisible();
    await expect(pill.locator('.lucide-lock')).toHaveCount(0);
    // Move the mouse off the pill (hover restyles it), then wait out the color transition
    await page.mouse.move(0, 0);
    await expect.poll(() => pill.evaluate(el => getComputedStyle(el).color))
      .toBe('rgb(168, 85, 247)'); // --color-objective, never amber
  });

  test('Enter on the reward input enqueues exactly one doc write (no blur double-save)', async ({ page }) => {
    await waitForApp(page);
    await page.locator('button[title="Plan"]').click();
    await page.locator('button[title="Objectives"]').click();
    await expect(page.locator('.okr-container h2.tasks-title', { hasText: 'PLAN' })).toBeVisible();

    // Seed one objective with a KR (fresh page = fresh store per test)
    await page.evaluate(async () => {
      const updateDoc = (window as any).__updateAutomergeDoc;
      await updateDoc('Seed double-save probe', (d: any) => {
        d.cycles = [{
          id: 'cycle-rewards-test', name: 'June 2026', month: 5, year: 2026,
          isActive: true, createdAt: new Date().toISOString(),
        }];
        d.objectives = [{
          id: 'obj-rewards-test', cycleId: 'cycle-rewards-test',
          title: 'Achieve Greatness', order: 0, createdAt: new Date().toISOString(),
        }];
        d.keyResults = [{
          id: 'kr-rewards-test', objectiveId: 'obj-rewards-test',
          title: 'Finish 2 key metrics', targetValue: 2, currentValue: 0,
          unit: 'metrics', confidence: 'on_track', completionMode: 'manual',
          order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        }];
        d.tasks = [];
        d.reviews = [];
        d.history = [];
      });
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });

    const header = page.locator('.objective-header:has-text("Achieve Greatness")');
    await expect(header).toBeVisible({ timeout: 10000 });

    // Stall the Automerge queue so each enqueued update is countable
    const before = await page.evaluate(() => {
      (window as any).__getQueueInfoForTesting().setIsUpdating(true);
      return (window as any).__getQueueInfoForTesting().getQueueLength();
    });

    await header.locator('.objective-reward-pill.ghost').click();
    const rewardInput = header.locator('.objective-reward-edit-input');
    await rewardInput.fill('Single write please');
    await rewardInput.press('Enter');

    const after = await page.evaluate(() => {
      const info = (window as any).__getQueueInfoForTesting();
      const len = info.getQueueLength();
      info.setIsUpdating(false); // unstall — let the queue drain
      return len;
    });

    // Enter saves once; the unmount-blur that follows must NOT save again
    expect(after - before).toBe(1);
    await expect(header.locator('.objective-reward-pill:not(.ghost)')).toContainText('Single write please');
  });
});
