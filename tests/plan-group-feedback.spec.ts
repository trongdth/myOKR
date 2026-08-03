import { test, expect } from '@playwright/test';

const FIXED = '2026-05-24T12:00:00.000Z';

test.describe('Plan Group Feedback — TDD Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(FIXED));
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Feedback 1: PLAN eyebrow font size is smaller than cycle title font size', async ({ page }) => {
    await page.locator('button[title="Plan"]').click();
    const eyebrow = page.locator('.plan-header-eyebrow');
    const title = page.locator('.plan-header-title');

    await expect(eyebrow).toBeVisible();
    await expect(title).toBeVisible();

    const eyebrowPx = parseFloat(await eyebrow.evaluate(el => getComputedStyle(el).fontSize));
    const titlePx = parseFloat(await title.evaluate(el => getComputedStyle(el).fontSize));

    // Eyebrow PLAN font size MUST be strictly smaller than cycle title font size
    expect(eyebrowPx).toBeLessThan(titlePx);
    expect(eyebrowPx).toBeLessThanOrEqual(13); // <= 13px
  });

  test('Feedback 2: Quick add row Add button is visible, and dropdown labels/widths are compact', async ({ page }) => {
    await page.locator('button[title="Plan"]').click();
    const addBtn = page.locator('.quick-add-bar .quick-add-btn');
    await expect(addBtn).toBeVisible();

    const fieldLabel = page.locator('.quick-add-field-label').first();
    const labelPx = parseFloat(await fieldLabel.evaluate(el => getComputedStyle(el).fontSize));
    expect(labelPx).toBeLessThanOrEqual(11); // <= 11px label

    const select = page.locator('.quick-add-select').first();
    const selectPx = parseFloat(await select.evaluate(el => getComputedStyle(el).fontSize));
    expect(selectPx).toBeLessThanOrEqual(13); // <= 13px select text
  });

  test('Feedback 3: No warning icon inside unserved warning (bare text no tasks)', async ({ page }) => {
    await page.evaluate(async () => {
      const okrStorage = await import('/src/lib/okr-storage.ts');
      const cycle = { id: 'c1', name: 'May cycle', month: 4, year: 2026, isActive: true, createdAt: '2026-05-01T00:00:00Z' };
      const objLow = { id: 'o1', cycleId: 'c1', title: 'Low Progress Obj', category: 'work', createdAt: '2026-05-01T00:00:00Z' };
      const kr1 = { id: 'kr1', objectiveId: 'o1', title: 'KR 1', targetValue: 100, currentValue: 0, unit: '%' };

      await okrStorage.saveCycles([cycle]);
      await okrStorage.saveObjectives([objLow]);
      await okrStorage.saveKeyResults([kr1]);
    });

    await page.reload();
    await page.locator('button[title="Plan"]').click();

    const unserved = page.locator('.unserved-warning');
    await expect(unserved).toBeVisible();

    // Icon should NOT be present beside 'no tasks'
    const svgCount = await unserved.locator('svg').count();
    expect(svgCount).toBe(0);
  });
});
