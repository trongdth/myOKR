import { test, expect } from '@playwright/test';

// Pin the clock inside the mock May-2026 cycle (matches today-focus.spec.ts).
// 2026-05-24 is a Sunday → day-first date title reads "Sunday, 24 May".
const FIXED_TIME = new Date('2026-05-24T12:00:00.000Z');

async function waitForApp(page: import('@playwright/test').Page) {
  await page.clock.setFixedTime(FIXED_TIME);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
}

async function openDayPlan(page: import('@playwright/test').Page) {
  await page.locator('button:has-text("Day plan")').first().click();
  await page.waitForTimeout(300);
}

test.describe('Focus shell — Day plan tab (ticket 01)', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await openDayPlan(page);
  });

  test('header shows today\'s date, day-first', async ({ page }) => {
    await expect(page.locator('.focus-header-title')).toHaveText('Sunday, 24 May');
  });

  test('old "Today\'s Focus" header is gone', async ({ page }) => {
    await expect(page.locator('.today-title')).toHaveCount(0);
  });

  test('tab strip lists Day plan / Session / Habits with Day plan active, no badge', async ({ page }) => {
    const strip = page.locator('.plan-tab-strip.focus-tabs');
    await expect(strip).toBeVisible();
    await expect(strip.locator('.plan-tab', { hasText: 'Day plan' })).toBeVisible();
    await expect(strip.locator('.plan-tab', { hasText: 'Session' })).toBeVisible();
    await expect(strip.locator('.plan-tab', { hasText: 'Habits' })).toBeVisible();
    await expect(strip.locator('.plan-tab.active')).toHaveText(/Day plan/);
    // Day plan carries no count badge.
    await expect(strip.locator('.plan-tab.active .plan-tab-count')).toHaveCount(0);
  });

  test('"Plan day" button is present (renamed from "Replan day")', async ({ page }) => {
    await expect(page.locator('.focus-plan-day-btn')).toContainText('Plan day');
  });

  test('cycle slot is static text (no dropdown)', async ({ page }) => {
    const strip = page.locator('.plan-tab-strip.focus-tabs');
    await expect(strip.locator('select')).toHaveCount(0);
    await expect(strip.locator('.plan-cycle-week')).toContainText(/week \d+ of \d+/);
  });

  test('Day plan dashboard body still renders (NOW card)', async ({ page }) => {
    // The reused body keeps its classes — only the shell around it changed.
    await expect(page.locator('.today-body')).toBeVisible();
  });

  test('padding parity with the Plan-group shell across responsive tiers', async ({ page }) => {
    // Event-based nav works at every viewport (the sidebar collapses to a drawer <900px).
    const go = (section: string) =>
      page.evaluate((s) => {
        window.dispatchEvent(new CustomEvent('myokr-navigate-to-section', { detail: s }));
      }, section).then(() => page.waitForTimeout(200));

    const outerPad = (sel: string) =>
      page.locator(sel).first().evaluate((el) => {
        const s = getComputedStyle(el);
        return `${s.paddingTop}|${s.paddingRight}|${s.paddingBottom}|${s.paddingLeft}|${s.maxWidth}`;
      });
    const innerPad = (sel: string) =>
      page.locator(sel).first().evaluate((el) => getComputedStyle(el).padding);

    // 1280 (>932, base), 1000 (≤932), 700 (≤768) — the three .pomodoro-container
    // padding regions. The Focus outer reuses .pomodoro-container, so it must
    // match the Plan shell at every tier.
    for (const vw of [1280, 1000, 700]) {
      await page.setViewportSize({ width: vw, height: 800 });

      await go('day-plan');
      const focusOuter = await outerPad('.focus-shell');
      const focusInner = await innerPad('.focus-shell-inner');

      await go('tasks');
      const planOuter = await outerPad('.pomodoro-container.plan-group-shell');
      const planInner = await innerPad('.tasks-view-container');

      expect(focusOuter, `outer padding/maxWidth @${vw}px`).toBe(planOuter);
      expect(focusInner, `inner padding @${vw}px`).toBe(planInner);
    }
  });
});
