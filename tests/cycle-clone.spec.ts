import { test, expect } from '@playwright/test';

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
    await expect(page.locator('.cycle-selector-btn')).toContainText('May 2026');
    await expect(page.locator('.okr-overall-text')).toHaveText('38%');

    // Open dropdown and clone
    await page.locator('.cycle-selector-btn').click();
    await page.locator('button:has-text("Clone this cycle")').click();

    // New cycle is auto-selected (June 2026 — month after May)
    await expect(page.locator('.cycle-selector-btn')).toContainText('June 2026');

    // Objective titles cloned (visible at the collapsed header level)
    await expect(page.getByText('Ship myOKR v2.0')).toBeVisible();
    await expect(page.getByText('Improve Productivity')).toBeVisible();
    await expect(page.getByText('Build Engineering Culture')).toBeVisible();

    // All KR progress reset → overall computes to 0%
    await expect(page.locator('.okr-overall-text')).toHaveText('0%');

    // Switch back to source — progress is still intact (history not mutated)
    await page.locator('.cycle-selector-btn').click();
    await page.locator('.cycle-dropdown-item:has-text("May 2026")').click();
    await expect(page.locator('.okr-overall-text')).toHaveText('38%');
  });

  test('future + empty cycle can be deleted; current cycle cannot', async ({ page }) => {
    await page.locator('button[title="Plan"]').click();
    await page.locator('button[title="Objectives"]').click();
    await expect(page.locator('.cycle-selector-btn')).toContainText('May 2026');

    // Current month (May 2026) is not deletable — no × button on its row
    await page.locator('.cycle-selector-btn').click();
    const mayRow = page.locator('.cycle-dropdown-row', { hasText: 'May 2026' });
    await expect(mayRow.locator('.cycle-dropdown-delete')).toHaveCount(0);

    // Create a future blank cycle (June 2026)
    await page.locator('button:has-text("New blank cycle")').click();
    await expect(page.locator('.cycle-selector-btn')).toContainText('June 2026');

    // June is future + empty — × button is present
    await page.locator('.cycle-selector-btn').click();
    const juneRow = page.locator('.cycle-dropdown-row', { hasText: 'June 2026' });
    await expect(juneRow.locator('.cycle-dropdown-delete')).toBeVisible();

    // Delete June via confirm
    await juneRow.locator('.cycle-dropdown-delete').click();
    await page.locator('button:has-text("Delete")').click();

    // Active falls back to May 2026; June no longer in dropdown
    await expect(page.locator('.cycle-selector-btn')).toContainText('May 2026');
    await page.locator('.cycle-selector-btn').click();
    await expect(page.locator('.cycle-dropdown-row', { hasText: 'June 2026' })).toHaveCount(0);
  });
});
