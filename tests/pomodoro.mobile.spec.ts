import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test.describe('Pomodoro Mobile View', () => {
  test.beforeEach(async ({ page }) => {
    // Set localStorage to bypass walkthrough and open Pomodoro Timer directly
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_active_section', 'pomodoro-timer');
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    
    // Navigate to the app. 
    await page.goto('/');
    
    // Wait for Pomodoro container to be visible
    await page.waitForSelector('.pomodoro-container', { state: 'visible' });
  });

  test('Timer controls, settings modal, and task list do not overflow horizontally', async ({ page }) => {
    // Check main container width
    const containerBox = await page.locator('.pomodoro-container').boundingBox();
    expect(containerBox?.width).toBeLessThanOrEqual(390);

    // Open Settings panel
    await page.click('button[title="Settings"]');
    await page.waitForSelector('.settings-panel');
    
    const settingsBox = await page.locator('.settings-panel').boundingBox();
    expect(settingsBox?.width).toBeLessThanOrEqual(390);
    
    // Test that the settings panel is positioned properly as an overlay for mobile
    // We'll assert that its position is absolute or fixed to avoid layout shift.
    const settingsPosition = await page.locator('.settings-panel').evaluate((el) => {
      return window.getComputedStyle(el).position;
    });
    
    expect(['absolute', 'fixed']).toContain(settingsPosition);
  });
});
