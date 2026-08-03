import { test, expect } from '@playwright/test';

const FIXED = '2026-05-24T12:00:00.000Z';

// Board-level UI bugs found while shooting the Tasks (P1) screen against the
// redesign mockup. Each test is a tracer bullet for one bug; see the matching
// slice in src/components/pomodoro/TasksView.tsx + src/styles/pomodoro.css.
test.describe('Plan Group Board — bug fixes', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(FIXED));
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.locator('button[title="Plan"]').click();
  });

  // Bug 1: the quick-add row was cramped by FOUR dropdowns (Bucket, Priority,
  // Key Result, Due), squeezing the title input. The P1 spec keeps only
  // Priority + Key Result in the row ("no bucket select, no due date"), and new
  // tasks land in Backlog (the storage default).
  test('quick-add row has only Priority + Key Result, and new tasks land in Backlog', async ({ page }) => {
    const bar = page.locator('.quick-add-bar');
    await expect(bar).toBeVisible();

    // Priority + Key Result selectors stay in the row.
    await expect(bar.locator('.quick-add-field-label', { hasText: 'PRIORITY' })).toBeVisible();
    await expect(bar.locator('.quick-add-field-label', { hasText: 'KEY RESULT' })).toBeVisible();

    // Bucket + Due selectors are removed from the row.
    await expect(bar.locator('.quick-add-field-label', { hasText: 'BUCKET' })).toHaveCount(0);
    await expect(bar.locator('.quick-add-field-label', { hasText: 'DUE' })).toHaveCount(0);

    // Submitting the trimmed form creates a task that lands in Backlog, not Today.
    const input = page.locator('input[placeholder*="What are you working on?"]');
    await input.fill('Backlog landing task');
    await page.locator('button.quick-add-btn').click();

    await expect(page.locator('.column-backlog').locator('text=Backlog landing task')).toBeVisible();
    await expect(page.locator('.column-today').locator('text=Backlog landing task')).toHaveCount(0);
  });

  // Bug 2: a long, non-wrapping KR line inflated the Today column because the
  // board grid used bare `1fr` tracks (= minmax(auto,1fr)) and the card had no
  // min-width:0. With a bounded track the KR ellipsizes and all three columns
  // share the width equally. (See docs/design-system.md minmax(0,…) callout.)
  test('a long KR does not make its bucket column wider than the others', async ({ page }) => {
    await page.evaluate(async () => {
      const okr = await import('/src/lib/okr-storage.ts');
      const pomo = await import('/src/lib/pomodoro-storage.ts');
      const cycle = { id: 'c1', name: 'May cycle', month: 4, year: 2026, isActive: true, createdAt: '2026-05-01T00:00:00Z' };
      const obj = { id: 'o1', cycleId: 'c1', title: 'Growth', category: 'work', createdAt: '2026-05-01T00:00:00Z' };
      const kr = { id: 'kr-long', objectiveId: 'o1', title: 'Grow weekly active users of the flagship dashboard by shipping the redesign', targetValue: 100, currentValue: 0, unit: '%' };
      await okr.saveCycles([cycle]);
      await okr.saveObjectives([obj]);
      await okr.saveKeyResults([kr]);
      await pomo.saveTasks([
        { id: 't-today', title: 'Ship the redesign', bucket: 'today', keyResultId: 'kr-long', estimatedPomodoros: 2, completedPomodoros: 0, isCompleted: false, createdAt: '2026-05-24T10:00:00Z' },
        { id: 't-week', title: 'Plan retro', bucket: 'this_week', estimatedPomodoros: 1, completedPomodoros: 0, isCompleted: false, createdAt: '2026-05-24T10:00:00Z' },
        { id: 't-back', title: 'Sketch ideas', bucket: 'backlog', estimatedPomodoros: 1, completedPomodoros: 0, isCompleted: false, createdAt: '2026-05-24T10:00:00Z' },
      ]);
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('button[title="Plan"]').click();

    // Precondition: the long KR line is actually rendering on the Today card.
    await expect(page.locator('.column-today .card-kr')).toBeVisible();

    const today = await page.locator('.column-today').boundingBox();
    const week = await page.locator('.column-this-week').boundingBox();
    const back = await page.locator('.column-backlog').boundingBox();

    const widths = [today!.width, week!.width, back!.width];
    const spread = Math.max(...widths) - Math.min(...widths);
    // Bounded tracks are equal modulo a pixel of sub-pixel rounding.
    expect(spread).toBeLessThanOrEqual(2);
  });

  // Bug 3: the board card didn't match the mockup. The mockup renders the meta
  // row as pills — a filled category pill with a colored dot, a "Link a key
  // result" pill when no KR is linked, and a calendar-icon "No due date" pill
  // when no due is set — instead of hiding KR/due when absent.
  test('a bare card shows category dot-pill, Link-a-key-result, and No-due-date pills', async ({ page }) => {
    await page.evaluate(async () => {
      const okr = await import('/src/lib/okr-storage.ts');
      const pomo = await import('/src/lib/pomodoro-storage.ts');
      const cycle = { id: 'c1', name: 'May cycle', month: 4, year: 2026, isActive: true, createdAt: '2026-05-01T00:00:00Z' };
      const obj = { id: 'o1', cycleId: 'c1', title: 'Growth', category: 'work', createdAt: '2026-05-01T00:00:00Z' };
      await okr.saveCycles([cycle]);
      await okr.saveObjectives([obj]);
      await pomo.saveTasks([
        // No keyResultId, no dueDate, category 'do' — the "empty" card state.
        { id: 't-bare', title: 'Bare card task', bucket: 'today', category: 'do', estimatedPomodoros: 1, completedPomodoros: 0, isCompleted: false, createdAt: '2026-05-24T10:00:00Z' },
      ]);
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('button[title="Plan"]').click();

    const card = page.locator('.board-task-card').first();

    // Category renders as a filled pill with a colored dot (was plain mono text).
    const catPill = card.locator('.card-category');
    await expect(catPill).toBeVisible();
    await expect(catPill.locator('text=Do')).toBeVisible();
    await expect(catPill.locator('.card-category-dot')).toBeVisible();

    // No KR → "Link a key result" pill (was previously hidden entirely).
    await expect(card.locator('.card-kr')).toBeVisible();
    await expect(card.locator('text=Link a key result')).toBeVisible();

    // No due → "No due date" pill with a calendar icon (was previously hidden).
    const duePill = card.locator('.card-due');
    await expect(duePill).toBeVisible();
    await expect(duePill.locator('text=No due date')).toBeVisible();
    await expect(duePill.locator('svg')).toBeVisible();
  });
});
