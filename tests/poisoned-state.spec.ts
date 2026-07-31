import { test, expect, type Page } from '@playwright/test';

// Regression test for the audit's MEDIUM finding: external (synced/imported) CRDT
// state is schema-less and used to reach render code with no validation, which
// crashed the default view via unguarded metadata-map lookups / .filter on
// non-arrays / runaway Array.from length. The loaders now normalize at the
// trust boundary, so none of these should brick the app.

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
  // Land on Timer (also confirms the sidebar nav is usable).
  await page.locator('button[title="Session"]').first().click();
}

// Inject a poisoned Automerge doc via the test hook, then trigger the same
// refresh path the Dropbox auto-sync uses (myokr-data-synced event).
async function injectPoisonedState(page: Page) {
  await page.evaluate(async () => {
    const w = window as any;
    await w.__updateAutomergeDoc('poison', (d: any) => {
      d.cycles = [{ id: 'c1', name: 'Poison', month: 0, year: 2026, isActive: true, createdAt: '2026-01-01T00:00:00.000Z' }];
      d.objectives = [{ id: 'o1', cycleId: 'c1', title: 'Poison Objective', order: 0, createdAt: '2026-01-01T00:00:00.000Z' }];
      // Non-enum confidence/completionMode -> would index metadata maps with no fallback.
      d.keyResults = [{
        id: 'kr1', objectiveId: 'o1', title: 'Poison KR', targetValue: 1, currentValue: 0, unit: 'x',
        confidence: 'MALICIOUS', completionMode: 'EVIL', order: 0,
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      }];
      // Task with a non-enum category, linked to the poisoned KR.
      d.tasks = [{
        id: 't1', title: 'Poison Task', estimatedPomodoros: 1, completedPomodoros: 0,
        isCompleted: false, createdAt: '2026-01-01T00:00:00.000Z', category: 'MALICIOUS', keyResultId: 'kr1',
      }];
      // Runaway numeric + wrong-typed duration.
      d.settings = {
        focusDuration: 'evil', shortBreakDuration: 5, longBreakDuration: 15,
        pomosBeforeLongBreak: 1000000, autoStartBreaks: false, autoStartFocus: false,
      };
    });
    window.dispatchEvent(new Event('myokr-data-synced'));
  });
}

test.describe('Resilience to poisoned synced/imported state', () => {
  test('bad enums, wrong-typed collections, and runaway numerics do not brick the app', async ({ page }) => {
    await waitForApp(page);
    await injectPoisonedState(page);

    // Timer tab (currently mounted): PomodoroApp.refreshData reloaded poisoned
    // settings/tasks. Without normalization this crashes (EISENHOWER_META['MALICIOUS']
    // or Array.from({length: 1_000_000}) OOM). Let the refresh settle, then assert.
    await page.waitForTimeout(500);
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
    await expect(page.locator('.pomodoro-container')).toBeVisible();

    // Objectives tab: KeyResultRow reads the poisoned KR. Without normalization,
    // CONFIDENCE_META['MALICIOUS'].label throws.
    await page.locator('button[title="Plan"]').first().click();
    await page.locator('button[title="Objectives"]').first().click();
    await expect(page.getByText('Something went wrong')).toHaveCount(0);

    // Tasks tab: TaskList renders the task-kr-select <select> with keyResults.
    await page.locator('button[title="Tasks"]').first().click();
    await expect(page.locator('option[value="kr1"]')).toBeAttached();

    // Day plan tab: FocusCard renders the KR for the linked task.
    const dayPlanBtn = page.locator('button[title="Day plan"]').first();
    if (!await dayPlanBtn.isVisible()) {
      await page.locator('button[title="Focus"]').first().click();
    }
    await dayPlanBtn.click();
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
    // Sidebar nav must remain usable in every view.
    await expect(page.locator('button.sidebar-nav-item').first()).toBeVisible();
  });
});
