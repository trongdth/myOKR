import { test, expect, type Page } from '@playwright/test';

/** Open the header cycle Select (custom-select ticket 04). */
async function openCycleMenu(page: Page) {
  const trigger = page.locator('[aria-label="Cycle"]');
  await trigger.click();
  const panel = page.locator('.sel-panel');
  await expect(panel).toBeVisible();
  return { trigger, panel };
}

test.describe('Clone cycle', () => {
  test.beforeEach(async ({ page }) => {
    // Set fixed time to May 2026 to align with the test's hardcoded assertions
    await page.clock.setFixedTime(new Date('2026-05-15T12:00:00.000Z'));
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
  });

  test('clones structure into new cycle with reset progress and preserves source', async ({ page }) => {
    await page.locator('button[title="Plan"]').click();
    await page.locator('button[title="Objectives"]').click();

    // Source cycle is the seeded May 2026 with overall progress 38%
    const { trigger, panel } = await openCycleMenu(page);
    await expect(trigger).toContainText('May 2026');
    await expect(page.locator('.okr-overall-text')).toHaveText('38%');

    // Clone via the footer action
    await panel.locator('.sel-row.sel-action', { hasText: 'Clone this cycle' }).click();

    // New cycle is auto-selected (June 2026 — month after May)
    await expect(trigger).toContainText('June 2026');

    // Objective titles cloned (visible at the collapsed header level)
    await expect(page.getByText('Ship myOKR v2.0')).toBeVisible();
    await expect(page.getByText('Improve Productivity')).toBeVisible();
    await expect(page.getByText('Build Engineering Culture')).toBeVisible();

    // All KR progress reset → overall computes to 0%
    await expect(page.locator('.okr-overall-text')).toHaveText('0%');

    // Switch back to source — progress is still intact (history not mutated)
    await openCycleMenu(page);
    await page.locator('.sel-panel .sel-row', { hasText: 'May 2026' }).click();
    await expect(page.locator('.okr-overall-text')).toHaveText('38%');
  });

  test('future + empty cycle can be deleted; current cycle cannot', async ({ page }) => {
    await page.locator('button[title="Plan"]').click();
    await page.locator('button[title="Objectives"]').click();
    const { trigger } = await openCycleMenu(page);
    await expect(trigger).toContainText('May 2026');

    // Current month (May 2026) is not deletable — no × button on its row
    const mayRow = page.locator('.sel-panel .sel-row', { hasText: 'May 2026' });
    await mayRow.hover();
    await expect(mayRow.locator('.sel-remove')).toHaveCount(0);

    // Create a future blank cycle (June 2026)
    await page.locator('.sel-panel .sel-row.sel-action', { hasText: 'New blank cycle' }).click();
    await expect(trigger).toContainText('June 2026');

    // June is future + empty — × button is present
    await openCycleMenu(page);
    const juneRow = page.locator('.sel-panel .sel-row', { hasText: 'June 2026' });
    await juneRow.hover();
    await expect(juneRow.locator('.sel-remove')).toBeVisible();

    // Delete June via confirm
    await juneRow.locator('.sel-remove').click();
    await page.locator('button:has-text("Delete")').click();

    // Active falls back to May 2026; June no longer in the menu
    await expect(trigger).toContainText('May 2026');
    await openCycleMenu(page);
    await expect(page.locator('.sel-panel .sel-row', { hasText: 'June 2026' })).toHaveCount(0);
  });
});
