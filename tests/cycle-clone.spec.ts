import { test, expect } from '@playwright/test';

test.describe('Clone cycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
  });

  test('clones structure into new cycle with reset progress and preserves source', async ({ page }) => {
    await page.locator('button:has-text("OKRs")').click();

    // Source cycle is the seeded May 2026 with overall progress 38%
    await expect(page.locator('.cycle-selector-btn')).toContainText('May 2026');
    await expect(page.locator('.okr-overall-text')).toHaveText('38%');

    // Open dropdown and clone
    await page.locator('.cycle-selector-btn').click();
    await page.locator('button:has-text("Clone last cycle")').click();

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
});
