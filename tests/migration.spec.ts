import { test, expect } from '@playwright/test';

test.describe('Automerge Migration', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to load the bundled React app
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('reads JSON data and successfully migrates to an Automerge document', async ({ page }) => {
    // Call the globally exposed migration function
    const migratedData = await page.evaluate(async () => {
      const doc = await (window as any).__runMigration();
      // We need to stringify it to pass it back from the browser context to Node.js
      return JSON.parse(JSON.stringify(doc));
    });

    // Assert that the SEED_DATA from the mock JSON store was migrated!
    expect(migratedData).toBeDefined();
    
    // Check that cycles were populated from the mock seed store. The seed
    // cycle is the current month (mocks/store.ts) so cycle-scoped UI holds
    // the relative-date seed history.
    expect(migratedData.cycles).toBeDefined();
    expect(migratedData.cycles.length).toBeGreaterThan(0);
    const now = new Date();
    const expectedCycleName = `${now.toLocaleString('en-US', { month: 'long' })} ${now.getFullYear()}`;
    expect(migratedData.cycles[0].name).toBe(expectedCycleName);
    expect(migratedData.cycles[0].month).toBe(now.getMonth());

    // Check that tasks were populated from pomodoro-data.json
    expect(migratedData.tasks).toBeDefined();
    expect(migratedData.tasks.length).toBeGreaterThan(0);
    expect(migratedData.tasks[0].title).toBe('Design new dashboard layout');
    
    // Check that settings were preserved
    expect(migratedData.settings).toBeDefined();
    expect(migratedData.settings.focusDuration).toBe(25);
  });
});
