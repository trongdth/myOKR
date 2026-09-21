import { test, expect } from '@playwright/test';

/**
 * Board search toggle (2026-09-21). The Tasks tab strip gains a compact
 * icon-only Search button left of the cycle·week Select. It opens the same
 * ⌘K search modal as the List/Done triggers — no new filtering behaviour.
 * The button is Tasks-only (the Objectives/Done strips keep their static
 * cycle·week slot), the Meta+K shortcut stays, and the labeled "Search ⌘K"
 * buttons on List and Done are untouched.
 */
const FIXED = '2026-05-24T12:00:00.000Z'; // May 2026 → "week 4 of 5"

test.describe('Plan board search button', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(FIXED));
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(async () => {
      const okr = await import('/src/lib/okr-storage.ts');
      const storage = await import('/src/lib/pomodoro-storage.ts');
      await okr.saveCycles([{ id: 'c1', name: 'May cycle', month: 4, year: 2026, isActive: true, createdAt: '2026-05-01T00:00:00Z' }]);
      await storage.saveTasks([
        {
          id: 't1', title: 'Refactor auth module', category: 'do', bucket: 'today',
          estimatedPomodoros: 6, completedPomodoros: 2, isCompleted: false,
          createdAt: '2026-05-20T10:00:00Z',
        },
        {
          id: 't2', title: 'Document auth error codes', category: 'decide', bucket: 'backlog',
          estimatedPomodoros: 2, completedPomodoros: 0, isCompleted: false,
          createdAt: '2026-05-20T10:00:00Z',
        },
      ]);
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('button[title="Plan"]').click();
  });

  test('icon-only search button sits left of the cycle·week Select in the strip', async ({ page }) => {
    const btn = page.locator('.plan-tab-strip .plan-search-btn');
    await expect(btn).toBeVisible();
    // Icon-only: an svg, no label text, no ⌘K badge.
    await expect(btn.locator('svg')).toHaveCount(1);
    await expect(btn).toHaveText('');
    await expect(btn.locator('kbd')).toHaveCount(0);
    await expect(page.locator('.plan-tab-strip .cmd-k-badge')).toHaveCount(0);

    // Left of the picker, sized to its band (28px tall, same bottom clearance).
    const btnBox = (await btn.boundingBox())!;
    const selBox = (await page.locator('.plan-tab-strip [aria-label="Cycle week"]').boundingBox())!;
    expect(btnBox.x + btnBox.width).toBeLessThanOrEqual(selBox.x);
    expect(Math.abs(btnBox.height - selBox.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(btnBox.y + btnBox.height - (selBox.y + selBox.height))).toBeLessThanOrEqual(2);
  });

  test('clicking it opens the same ⌘K search modal; Esc clears then closes', async ({ page }) => {
    await page.locator('.plan-tab-strip .plan-search-btn').click();
    await expect(page.locator('.command-k-modal')).toBeVisible();
    await expect(page.locator('.command-k-input')).toBeFocused();

    await page.keyboard.type('Refactor');
    await expect(page.locator('.command-k-item', { hasText: 'Refactor auth module' })).toBeVisible();

    // Palette-intrinsic Esc model: clear first, close second.
    await page.keyboard.press('Escape');
    await expect(page.locator('.command-k-modal')).toBeVisible();
    await expect(page.locator('.command-k-input')).toHaveValue('');
    await page.keyboard.press('Escape');
    await expect(page.locator('.command-k-modal')).toHaveCount(0);
  });

  test('Ctrl/Meta+K still opens search from the board', async ({ page }) => {
    await page.keyboard.press('Control+K');
    await expect(page.locator('.command-k-modal')).toBeVisible();
    await expect(page.locator('.command-k-input')).toBeFocused();
  });

  test('Objectives and Done strips have no search button', async ({ page }) => {
    // Plain section strings (no JSON quoting — migrateSection allowlists bare
    // values) plus each screen's own container, so the assertion can't pass
    // vacuously from a fallback to another section.
    const cases: Array<[string, string]> = [
      ['objectives', '.okr-container'],
      ['done', '.done-view-container'],
    ];
    for (const [section, container] of cases) {
      await page.evaluate((s) => window.localStorage.setItem('myokr_active_section', s), section);
      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(page.locator(container)).toBeVisible();
      await expect(page.locator('.plan-tab-strip')).toBeVisible();
      await expect(page.locator('.plan-tab-strip .plan-search-btn')).toHaveCount(0);
    }
  });
});
