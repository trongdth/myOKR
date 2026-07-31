import { test, expect } from '@playwright/test';

/**
 * Visual regression for the 1a UI redesign. Snapshots are deterministic:
 * `Date` is frozen so seed data + displayed dates don't drift, and the live
 * Pomodoro timer digits are masked. Baselines live in
 * `tests/visual-regression.spec.ts-snapshots/`; regenerate with --update-snapshots.
 *
 * This is deliberately a separate file from screenshots.spec.ts (which captures
 * the README assets) so the two concerns don't collide.
 */
const FROZEN_MS = Date.UTC(2026, 0, 15, 9, 0, 0); // 2026-01-15 09:00 UTC

test.describe('Visual regression (1a redesign)', () => {
  test.beforeEach(async ({ page }) => {
    // Freeze the clock so `new Date()` / `Date.now()` are stable across runs.
    await page.addInitScript((ms) => {
      const RealDate = Date;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Date = class extends RealDate {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        constructor(...args: any[]) { super(...(args.length ? args : [ms])); }
        static now() { return ms; }
      } as unknown as DateConstructor;
    }, FROZEN_MS);
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
  });

  // [snapshot id, nav title]
  const screens: [string, string][] = [
    ['today', 'Day plan'],
    ['timer', 'Session'],
    ['tasks', 'Tasks'],
    ['analytics', 'Analytics'],
    ['okrs', 'Objectives'],
    ['habits', 'Habits'],
    ['review', 'Weekly review'],
    ['sync', 'Settings'],
  ];

  for (const [id, label] of screens) {
    test(`${id} @1280`, async ({ page }) => {
      const btn = page.locator(`[title="${label}"]`).first();
      if (!await btn.isVisible()) {
        if (['Tasks', 'Objectives', 'Done'].includes(label)) {
          await page.locator('[title="Plan"]').first().click();
        } else if (['Analytics', 'Weekly review'].includes(label)) {
          await page.locator('[title="Progress"]').first().click();
        } else if (['Day plan', 'Session', 'Habits'].includes(label)) {
          await page.locator('[title="Focus"]').first().click();
        }
      }
      await btn.click();
      await page.waitForTimeout(500);
      await expect(page).toHaveScreenshot(`${id}.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.05,
        mask: [page.locator('.timer-digits')],
      });
    });
  }

  test('collapsed icon-rail @1024', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 720 });
    await page.locator('[title="Focus"]').first().click();
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('rail-1024.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.03,
      mask: [page.locator('.timer-digits')],
    });
  });
});
