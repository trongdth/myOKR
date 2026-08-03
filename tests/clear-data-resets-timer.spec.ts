import { test, expect, type Page } from '@playwright/test';

// Analytics "Clear Data" clears history and resets the timer. The reset must
// honor the CURRENT focus duration — clearSessionData used to be memoized with
// an empty dependency array, so it captured the first render's resetTimer and
// snapped the timer back to the 25-min default even after the user had
// customized the focus length.

async function openSettings(page: Page) {
  await page.locator('.timer-controls button[title="Settings"]').click();
  await expect(page.locator('.settings-panel')).toBeVisible();
}

async function gotoSession(page: Page) {
  const btn = page.locator('button[title="Session"]').first();
  if (!(await btn.isVisible())) await page.locator('button[title="Focus"]').first().click();
  await btn.click();
}

async function gotoAnalytics(page: Page) {
  const btn = page.locator('button[title="Analytics"]').first();
  if (!(await btn.isVisible())) await page.locator('button[title="Progress"]').first().click();
  await btn.click();
}

test.describe('Clear Data resets the timer to the current focus duration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
    await gotoSession(page);
  });

  test('Clear Data honors a customized focus duration, not the 25-min default', async ({ page }) => {
    // Customize focus to 40 min.
    await openSettings(page);
    await page.locator('.settings-grid input[type="number"]').first().fill('40');
    await page.locator('.timer-controls button[title="Settings"]').click(); // close settings
    await expect(page.locator('.timer-digits')).toHaveText('40:00');

    // Analytics → Clear Data → confirm.
    await gotoAnalytics(page);
    await page.locator('button.btn-sm.danger', { hasText: 'Clear Data' }).click();
    await expect(page.locator('.confirm-modal')).toBeVisible();
    await page.locator('.confirm-modal button:has-text("Clear")').click();
    await expect(page.locator('.confirm-modal')).toHaveCount(0);

    // Back on Session, the timer must still read the customized 40 min — not
    // snap back to the 25-min default captured by the stale closure.
    await gotoSession(page);
    await expect(page.locator('.timer-digits')).toHaveText('40:00');
  });
});
