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

  test('Plan day button appears only on the Day plan tab', async ({ page }) => {
    // Day plan keeps the header action
    await page.locator('.plan-tab:has-text("Day plan")').click();
    await expect(page.locator('.focus-plan-day-btn')).toBeVisible();

    // Habits tab: header title stays, the Plan day action is gone
    await openHabits(page);
    await expect(page.locator('.focus-header-title')).toBeVisible();
    await expect(page.locator('.focus-plan-day-btn')).toHaveCount(0);
  });

  test('weekly badge is hidden when there are no habits', async ({ page }) => {
    // Default seed has no habits → no badge (never "0/0").
    await expect(page.locator('.focus-tab-habits')).toHaveCount(0);
  });

  test('weekly badge shows completed/scheduled cells of the current week', async ({ page }) => {
    // Seed 3 habits: h1 ticked Mon+Tue+Sun (3 cells), h2 ticked Sun (1), h3 none.
    // Current week is Mon 2026-05-18 – Sun 2026-05-24 → completed 4, scheduled 3×7=21.
    await page.evaluate(async () => {
      const { saveHabits } = await import('/src/lib/habit-storage.ts');
      const ts = '2026-05-01T00:00:00Z';
      await saveHabits([
        { id: 'h1', name: 'Read', status: 'in_progress', ticks: ['2026-05-18', '2026-05-19', '2026-05-24'], createdAt: ts, updatedAt: ts },
        { id: 'h2', name: 'Workout', status: 'in_progress', ticks: ['2026-05-24'], createdAt: ts, updatedAt: ts },
        { id: 'h3', name: 'No screens', status: 'want_to_form', ticks: [], createdAt: ts, updatedAt: ts },
      ]);
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });

    await expect(page.locator('.focus-tab-habits')).toHaveText('4/21');
  });
});
