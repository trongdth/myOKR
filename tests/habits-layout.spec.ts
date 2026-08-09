import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 800, height: 800 } });

test.describe('Habits Tracker Layout and Styles', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_active_section', 'habits');
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  const addHabit = async (page: import('@playwright/test').Page, name: string) => {
    await page.locator('.habits-new-btn').click();
    await page.locator('.add-habit-input').fill(name);
    await page.locator('button:has-text("Add Habit")').click();
  };

  test('Habits screen title is styled consistently with other screens and has no redundant heatmap', async ({ page }) => {
    const title = page.locator('.habits-title');
    await expect(title).toBeVisible();
    await expect(title).toHaveText('Habits');

    const titleStyles = await title.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        fontSize: styles.fontSize,
        backgroundImage: styles.backgroundImage,
      };
    });

    expect(titleStyles.fontSize).toBe('24px'); // 1.5rem (1.5 * 16px)
    expect(titleStyles.backgroundImage).toBe('none'); // Gradient background image is removed

    // Verify no horizontal overflow in the viewport
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasOverflow).toBe(false);

    // The old per-habit heatmap grids are gone (the week matrix replaced them)
    await expect(page.locator('.habit-heatmap-grid')).toHaveCount(0);
    await expect(page.locator('.heatmap-section')).toHaveCount(0);
  });

  test('allows deleting a habit when multiple habits exist', async ({ page }) => {
    await addHabit(page, 'Habit One');
    await addHabit(page, 'Habit Two');
    await expect(page.locator('.habit-row')).toHaveCount(2);

    // Delete Habit One
    const rowOne = page.locator('.habit-row:has-text("Habit One")');
    await rowOne.hover();
    await rowOne.locator('.habit-delete-btn').click();

    await expect(page.locator('.prioritize-title')).toContainText('Delete Habit');
    await page.locator('.prioritize-actions >> button:has-text("Confirm")').click();

    await expect(page.locator('.habit-row:has-text("Habit One")')).toHaveCount(0);
    await expect(page.locator('.habit-row:has-text("Habit Two")')).toBeVisible();
  });

  test('matrix renders one row per habit with 7 day columns and a streak column', async ({ page }) => {
    await addHabit(page, 'Read 20 pages');
    await addHabit(page, 'Walk 8,000 steps');

    // Head: HABIT + Mon..Sun (7) + STREAK
    await expect(page.locator('.habit-head-habit')).toHaveText('HABIT');
    await expect(page.locator('.habit-head-day')).toHaveCount(7);
    await expect(page.locator('.habit-head-day-label').allTextContents()).resolves.toEqual([
      'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun',
    ]);
    await expect(page.locator('.habit-head-streak')).toHaveText('STREAK');

    // One row per habit, creation order
    const rows = page.locator('.habit-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).locator('.habit-name')).toHaveText('Read 20 pages');
    await expect(rows.nth(1).locator('.habit-name')).toHaveText('Walk 8,000 steps');

    // Each row: dot + title + "Every day" subtitle + 7 cells + streak readout
    const firstRow = rows.nth(0);
    await expect(firstRow.locator('.habit-dot')).toBeVisible();
    await expect(firstRow.locator('.habit-sub')).toHaveText('Every day');
    await expect(firstRow.locator('.habit-cell')).toHaveCount(7);
    await expect(firstRow.locator('.habit-streak-cell')).toHaveText('0 days');
  });

  test('row actions are always visible below 900px (touch-safe)', async ({ page }) => {
    await addHabit(page, 'Touch Actions Habit');

    const row = page.locator('.habit-row:has-text("Touch Actions Habit")');
    const actions = row.locator('.habit-row-actions');

    // No hover exists on touch — the actions must be visible from the start
    await expect(actions).toHaveCSS('opacity', '1');
    await expect(row.locator('.habit-status-select')).toBeVisible();
    await expect(row.locator('.habit-delete-btn')).toBeVisible();
  });

  test('row actions are hover-revealed above 900px; status select keeps the custom styling', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await addHabit(page, 'Dropdown Styling Habit');

    const row = page.locator('.habit-row:has-text("Dropdown Styling Habit")');
    const actions = row.locator('.habit-row-actions');
    const selectEl = row.locator('.habit-status-select');

    // Hidden until the row is hovered (or focused)
    const initialOpacity = await actions.evaluate((el) => window.getComputedStyle(el).opacity);
    expect(initialOpacity).toBe('0');
    await row.hover();
    await expect(actions).toHaveCSS('opacity', '1');

    const selectStyles = await selectEl.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        appearance: styles.appearance,
        webkitAppearance: styles.webkitAppearance,
        backgroundImage: styles.backgroundImage,
        paddingRight: styles.paddingRight,
        borderRadius: styles.borderRadius,
      };
    });

    expect(selectStyles.appearance).toBe('none');
    expect(selectStyles.backgroundImage).toContain('data:image/svg+xml');
    expect(selectStyles.borderRadius).toBe('6px');

    const paddingRightVal = parseInt(selectStyles.paddingRight, 10);
    expect(paddingRightVal).toBeGreaterThanOrEqual(24);
  });

  test('verifies horizontal container padding is applied on all screens below 932px viewport width', async ({ page }) => {
    // At 800px the sidebar is a slide-in drawer, so open it before each nav click.
    const clickNav = async (label: string) => {
      const target = label === 'OKRs' ? 'Objectives' : label === 'Review' ? 'Weekly review' : label === 'Timer' ? 'Session' : label === 'Cloud Sync' ? 'Settings' : label === 'Today' ? 'Day plan' : label;
      const hamburger = page.locator('.hamburger-btn');
      if (await hamburger.isVisible()) await hamburger.click();
      const itemBtn = page.locator(`button[title="${target}"], button.sidebar-nav-item:has-text("${target}")`).first();
      if (!await itemBtn.isVisible()) {
        if (['Tasks', 'Objectives', 'Done'].includes(target)) {
          await page.locator('button[title="Plan"]').first().click();
        } else if (['Analytics', 'Weekly review'].includes(target)) {
          await page.locator('button[title="Progress"]').first().click();
        } else if (['Day plan', 'Session', 'Habits'].includes(target)) {
          await page.locator('button[title="Focus"]').first().click();
        }
      }
      await itemBtn.dispatchEvent('click');
    };

    // 1. Check OKRs tab
    await clickNav('OKRs');
    const okrContainer = page.locator('.okr-container');
    await expect(okrContainer).toBeVisible();
    const okrPaddingLeft = await okrContainer.evaluate((el) => window.getComputedStyle(el).paddingLeft);
    expect(parseInt(okrPaddingLeft, 10)).toBeGreaterThan(0);

    // 2. Check Review tab
    await clickNav('Review');
    const reviewContainer = page.locator('.review-container');
    await expect(reviewContainer).toBeVisible();
    const reviewPaddingLeft = await reviewContainer.evaluate((el) => window.getComputedStyle(el).paddingLeft);
    expect(parseInt(reviewPaddingLeft, 10)).toBeGreaterThan(0);

    // 3. Check Cloud Sync tab
    await clickNav('Cloud Sync');
    const syncContainer = page.locator('.okr-container'); // Cloud sync uses okr-container
    await expect(syncContainer).toBeVisible();
    const syncPaddingLeft = await syncContainer.evaluate((el) => window.getComputedStyle(el).paddingLeft);
    expect(parseInt(syncPaddingLeft, 10)).toBeGreaterThan(0);

    // 4. Check Habits tab — embedded in the Focus shell, so its horizontal padding
    //    comes from .focus-shell-inner (.habits-container's own is neutralised).
    await clickNav('Habits');
    const habitsContainer = page.locator('.habits-container');
    await expect(habitsContainer).toBeVisible();
    const habitsPaddingLeft = await page.locator('.focus-shell-inner').first().evaluate((el) => window.getComputedStyle(el).paddingLeft);
    expect(parseInt(habitsPaddingLeft, 10)).toBeGreaterThan(0);
  });
});
