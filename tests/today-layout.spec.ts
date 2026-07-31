import { test, expect } from '@playwright/test';

/**
 * Layout fit for the Today screen across the 2a "wide" tiers (≥1100px):
 * full sidebar (≥1280) and collapsed icon-rail (1100–1279). In both, content
 * stays three columns and must not overflow the main pane horizontally — i.e.
 * no clipped CYCLE column, no inner horizontal scrollbar.
 *
 * Regression guard for the grid `minmax(auto, fr)` blow-out (NOW column forced
 * to its content min-width). See docs/design-system.md "Today screen (1b)".
 */
const FROZEN_MS = Date.UTC(2026, 0, 15, 9, 0, 0); // 2026-01-15 09:00 UTC

test.describe('Today layout fit (≥1100px)', () => {
  test.beforeEach(async ({ page }) => {
    // Freeze the clock so seed data + displayed dates don't drift.
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
    await page.locator('[title="Day plan"], [title="Today"]').first().click();
    await page.waitForTimeout(500);
  });

  // 1101 = the wide tier's lower edge (2b kicks in at ≤1100); 1280 = full sidebar.
  // 800 / 600 = the <900 single-column + drawer tier.
  for (const width of [1280, 1200, 1150, 1101, 800, 600]) {
    test(`no horizontal overflow @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(300);

      const overflow = await page.evaluate(() => {
        const main = document.querySelector('.app-main') as HTMLElement | null;
        if (!main) return null;
        return { scrollW: main.scrollWidth, clientW: main.clientWidth };
      });

      expect(overflow, '.app-main should be present').not.toBeNull();
      // Content fits: the pane's content is no wider than the pane itself
      // (1px tolerance for sub-pixel rounding).
      expect(overflow!.scrollW).toBeLessThanOrEqual(overflow!.clientW + 1);
    });
  }
});

/**
 * Bug 4: at <900px the dashboard collapses to a single grid column. A plain
 * `1fr` track is `minmax(auto, 1fr)` — the `auto` minimum lets a long task
 * title or KR/objective breadcrumb set the column's min-width, blowing the
 * grid (and thus the whole pane) far past the viewport. The track must be
 * `minmax(0, 1fr)` so long content wraps/truncates instead of forcing width.
 *
 * Reproduces only with realistic (long) content — the short seed titles hide it.
 */
test.describe('Today layout fit (<900px, long content)', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-05-24T12:00:00.000Z'));
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(async () => {
      const anyWin = window as unknown as { __updateAutomergeDoc: (msg: string, fn: (d: unknown) => void) => Promise<void> };
      await anyWin.__updateAutomergeDoc('long content', (doc) => {
        const d = doc as Record<string, unknown>;
        d.objectives = [{
          id: 'obj-1', cycleId: 'cycle-1',
          title: 'Maximize Quarterly Revenue Growth Through Enterprise Sales Pipeline Expansion Across All Regions',
          description: '', keyResultIds: ['kr-1'], status: 'active', createdAt: '2026-05-01T00:00:00.000Z',
        }];
        d.keyResults = [{
          id: 'kr-1', objectiveId: 'obj-1',
          title: 'Close 12 new enterprise deals worth at least 50k each by end of Q3 with full contract execution',
          currentValue: 3, targetValue: 12, unit: 'deals', confidence: 'at_risk', updatedAt: '2026-05-20T00:00:00.000Z',
        }];
        const longTitle = (i: number) =>
          `Prepare the comprehensive technical due diligence document for the Acme Corp enterprise deal ${i} evaluation meeting next Tuesday afternoon with the full engineering panel present`;
        d.tasks = Array.from({ length: 6 }, (_, i) => ({
          id: `t-${i}`, title: longTitle(i), estimatedPomodoros: 2, completedPomodoros: 0,
          isCompleted: false, category: i < 3 ? 'do' : 'decide', keyResultId: 'kr-1',
          createdAt: `2026-05-${10 + i}T00:00:00.000Z`, todos: [], comments: [],
        }));
      });
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
  });

  for (const width of [800, 600]) {
    test(`long titles do not blow the pane out @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(300);

      const m = await page.evaluate(() => {
        const main = document.querySelector('.app-main') as HTMLElement | null;
        const body = document.querySelector('.today-body') as HTMLElement | null;
        return {
          mainSW: main?.scrollWidth ?? 0, mainCW: main?.clientWidth ?? 0,
          bodySW: body?.scrollWidth ?? 0, bodyCW: body?.clientWidth ?? 0,
        };
      });
      // The grid track must respect the pane width — long content wraps/truncates.
      expect(m.mainSW, '.app-main must not overflow').toBeLessThanOrEqual(m.mainCW + 1);
      expect(m.bodySW, '.today-body grid must not blow out').toBeLessThanOrEqual(m.bodyCW + 1);
    });
  }
});
