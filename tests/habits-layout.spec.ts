import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 800, height: 800 } });

test.describe('Habits Tab Layout and Title Styles', () => {
  test.beforeEach(async ({ page }) => {
    // Set localStorage to bypass walkthrough and open Habits directly
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_active_section', 'habits');
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Habits screen title is styled consistently with other screens and has no redundant heatmap', async ({ page }) => {
    // Verify Habits title style matches standard titles (color, font size, no gradient)
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

    // Create a habit if none exists
    const habitCount = await page.locator('.habit-name').count();
    if (habitCount === 0) {
      const input = page.locator('.add-habit-input');
      await input.fill('Test Layout Habit');
      await page.locator('button:has-text("Add Habit")').click();
      await expect(page.locator('.habit-name').first()).toBeVisible();
    }

    // Verify no horizontal overflow in the viewport
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasOverflow).toBe(false);

    // Verify heatmap grid and heatmap section are completely removed (redundant)
    await expect(page.locator('.habit-heatmap-grid')).toHaveCount(0);
    await expect(page.locator('.heatmap-section')).toHaveCount(0);
  });

  test('allows deleting a habit when multiple habits exist', async ({ page }) => {
    // Create Habit 1
    const input = page.locator('.add-habit-input');
    await input.fill('Habit One');
    await page.locator('button:has-text("Add Habit")').click();
    await expect(page.locator('.habit-name:has-text("Habit One")')).toBeVisible();

    // Create Habit 2
    await input.fill('Habit Two');
    await page.locator('button:has-text("Add Habit")').click();
    await expect(page.locator('.habit-name:has-text("Habit Two")')).toBeVisible();

    // Delete Habit One
    const cardOne = page.locator('.habit-card:has-text("Habit One")');
    await cardOne.locator('.habit-delete-btn').click();

    // Confirm modal
    await expect(page.locator('.prioritize-title')).toContainText('Delete Habit');
    await page.locator('.prioritize-actions >> button:has-text("Confirm")').click();

    // Verify Habit One is gone, but Habit Two remains!
    await expect(page.locator('.habit-card:has-text("Habit One")')).toHaveCount(0);
    await expect(page.locator('.habit-card:has-text("Habit Two")')).toBeVisible();
  });

  test('implements one-habit-per-line stack and hides formed habits by default', async ({ page }) => {
    // Create a new habit
    const input = page.locator('.add-habit-input');
    await input.fill('Habit per line test');
    await page.locator('button:has-text("Add Habit")').click();
    await expect(page.locator('.habit-name:has-text("Habit per line test")')).toBeVisible();

    // 1. Verify layout is a flex stack (one habit per line)
    const habitsGrid = page.locator('.habits-grid').first();
    const displayStyle = await habitsGrid.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        display: styles.display,
        flexDirection: styles.flexDirection
      };
    });
    expect(displayStyle.display).toBe('flex');
    expect(displayStyle.flexDirection).toBe('column');

    // 2. Verify marking habit as formed hides it from the active list
    const statusSelect = page.locator('.habit-card:has-text("Habit per line test") >> .habit-status-select');
    await statusSelect.selectOption('formed');

    // Check it is no longer visible in the active habits grid
    await expect(page.locator('.habits-grid').first().locator('.habit-name:has-text("Habit per line test")')).toHaveCount(0);

    // 3. Verify it is shown inside the formed habits section once expanded
    const toggleBtn = page.locator('.formed-habits-toggle');
    await expect(toggleBtn).toBeVisible();
    await toggleBtn.click();

    const formedGrid = page.locator('.formed-habits-grid');
    await expect(formedGrid.locator('.habit-name:has-text("Habit per line test")')).toBeVisible();
  });

  test('uses modern custom styled select element for status dropdown', async ({ page }) => {
    // Create a habit if none exists
    const habitCount = await page.locator('.habit-name').count();
    if (habitCount === 0) {
      const input = page.locator('.add-habit-input');
      await input.fill('Dropdown Styling Habit');
      await page.locator('button:has-text("Add Habit")').click();
      await expect(page.locator('.habit-name').first()).toBeVisible();
    }

    const selectEl = page.locator('.habit-status-select').first();
    await expect(selectEl).toBeVisible();

    const selectStyles = await selectEl.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        appearance: styles.appearance,
        webkitAppearance: styles.webkitAppearance,
        backgroundImage: styles.backgroundImage,
        paddingRight: styles.paddingRight,
        borderRadius: styles.borderRadius
      };
    });

    expect(selectStyles.appearance).toBe('none');
    expect(selectStyles.backgroundImage).toContain('data:image/svg+xml');
    expect(selectStyles.borderRadius).toBe('8px');
    
    // Check that paddingRight has enough spacing for custom chevron (at least 24px)
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
