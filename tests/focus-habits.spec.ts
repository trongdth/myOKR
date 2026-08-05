import { test, expect, type Page } from '@playwright/test';

const FIXED_TIME = new Date('2026-05-24T12:00:00.000Z');

async function waitForApp(page: Page) {
  await page.clock.setFixedTime(FIXED_TIME);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
}

async function openHabits(page: Page) {
  await page.locator('button[title="Habits"]').first().click();
  await page.waitForTimeout(300);
}

test.describe('Focus shell — Habits tab (ticket 03)', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await openHabits(page);
  });

  test('habit tracker renders inside the Focus shell with Habits tab active', async ({ page }) => {
    await expect(page.locator('.focus-shell .habits-container')).toBeVisible();
    await expect(page.locator('.plan-tab-strip.focus-tabs .plan-tab.active')).toHaveText(/Habits/);
  });

  test('today-ratio badge is hidden when there are no habits', async ({ page }) => {
    // Default seed has no habits → no badge (never "0/0").
    await expect(page.locator('.focus-tab-habits')).toHaveCount(0);
  });

  test('today-ratio badge shows done/total when habits exist', async ({ page }) => {
    // Seed 3 habits, 2 ticked today → "2/3", then nudge the sync event so the
    // badge (which loads on mount + sync) refreshes.
    await page.evaluate(async () => {
      const { saveHabits } = await import('/src/lib/habit-storage.ts');
      const { getLocalDateString } = await import('/src/lib/pomodoro-storage.ts');
      const today = getLocalDateString();
      const ts = '2026-05-01T00:00:00Z';
      await saveHabits([
        { id: 'h1', name: 'Read', status: 'in_progress', ticks: [today], order: 0, createdAt: ts, updatedAt: ts },
        { id: 'h2', name: 'Workout', status: 'in_progress', ticks: [today], order: 1, createdAt: ts, updatedAt: ts },
        { id: 'h3', name: 'No screens', status: 'want_to_form', ticks: [], order: 2, createdAt: ts, updatedAt: ts },
      ]);
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });

    await expect(page.locator('.focus-tab-habits')).toHaveText('2/3');
  });
});
