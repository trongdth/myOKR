import { test, expect } from '@playwright/test';

test.describe('Sidebar Redesign Bugs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Bug 1: Focus group icon is Clock and Plan group icon is Target', async ({ page }) => {
    const focusGroupHeader = page.locator('button[title="Focus"]');
    const planGroupHeader = page.locator('button[title="Plan"]');

    await expect(focusGroupHeader.locator('.lucide-clock')).toBeVisible();
    await expect(planGroupHeader.locator('.lucide-target')).toBeVisible();
  });

  test('Bug 2: Sub-item label left padding aligns with group title text (42px)', async ({ page }) => {
    // Expand Focus group to make sub-items visible
    const focusGroupHeader = page.locator('button[title="Focus"]');
    if (!await page.locator('button[title="Day plan"]').isVisible()) {
      await focusGroupHeader.click();
    }

    const subItem = page.locator('button[title="Day plan"]').first();
    const paddingLeft = await subItem.evaluate(el => window.getComputedStyle(el).paddingLeft);
    expect(paddingLeft).toBe('42px');
  });

  test('Bug 3: Compact icon rail mode (1024px) hides chevrons, text-only sub-items, and version tag', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 720 });
    
    // In rail mode @1024px:
    // Chevrons should be hidden
    const chevron = page.locator('.group-chevron').first();
    await expect(chevron).toBeHidden();

    // Sub-items should be hidden in rail view
    const subItem = page.locator('.sidebar-nav-item.sub-item').first();
    await expect(subItem).toBeHidden();

    // Version tag should be hidden in rail view
    const versionTag = page.locator('.sidebar-version-tag');
    await expect(versionTag).toBeHidden();
  });
});
