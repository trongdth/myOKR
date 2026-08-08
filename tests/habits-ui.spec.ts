import { test, expect } from '@playwright/test';

const FIXED_TIME = new Date('2026-05-24T12:00:00.000Z'); // Sunday 2026-05-24

test.describe('Habits Tracker UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(FIXED_TIME);
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_active_section', 'habits');
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('creates, ticks, changes status, and deletes a habit via the tracker', async ({ page }) => {
    // Mid-week fixed time (Wednesday 2026-05-20) so both past and future cells exist
    await page.clock.setFixedTime(new Date('2026-05-20T12:00:00.000Z'));
    await expect(page.locator('.habits-title')).toHaveText('Habits');

    // The inline input is hidden behind the "+ New habit" CTA
    await expect(page.locator('.add-habit-input')).toHaveCount(0);
    await page.locator('.habits-new-btn').click();
    const input = page.locator('.add-habit-input');
    await input.fill('Write E2E Tests');
    await page.locator('button:has-text("Add Habit")').click();

    const row = page.locator('.habit-row:has-text("Write E2E Tests")');
    await expect(row.locator('.habit-name')).toHaveText('Write E2E Tests');

    // Toggle today's cell (Wednesday — the third column)
    const todayCell = row.locator('.habit-cell.today');
    await todayCell.click();
    await expect(todayCell).toHaveClass(/completed/);

    // Un-tick and re-tick — cells toggle both ways
    await todayCell.click();
    await expect(todayCell).not.toHaveClass(/completed/);
    await todayCell.click();
    await expect(todayCell).toHaveClass(/completed/);

    // Future cells are inert (Thu–Sun remain after today, Wednesday)
    const futureCell = row.locator('.habit-cell.future').first();
    await expect(futureCell).toBeDisabled();
    await expect(row.locator('.habit-cell.future')).toHaveCount(4);

    // Update status via the hover-revealed select
    await row.hover();
    const statusSelect = row.locator('.habit-status-select');
    await statusSelect.selectOption('formed');
    await expect(statusSelect).toHaveValue('formed');
    await expect(row.locator('.habit-name')).toBeVisible(); // no formed-section hiding anymore

    // Delete with confirmation
    await page.locator('.habit-delete-btn').click();
    await expect(page.locator('.prioritize-title')).toContainText('Delete Habit');
    await page.locator('.prioritize-actions >> button:has-text("Confirm")').click();

    await expect(page.locator('.habit-name')).toHaveCount(0);
    await expect(page.locator('.habit-matrix-empty')).toBeVisible();
  });

  test('suggestion chips add a habit in one click and dedupe by name', async ({ page }) => {
    await expect(page.locator('.suggested-title')).toHaveText('SUGGESTED — ONE CLICK TO ADD');
    await expect(page.locator('.suggested-chip')).toHaveCount(4);

    await page.locator('.suggested-chip:has-text("Inbox to zero")').click();

    const row = page.locator('.habit-row:has-text("Inbox to zero")');
    await expect(row.locator('.habit-name')).toHaveText('Inbox to zero');

    // The chip is gone (dedupe), the other three remain
    await expect(page.locator('.suggested-chip:has-text("Inbox to zero")')).toHaveCount(0);
    await expect(page.locator('.suggested-chip')).toHaveCount(3);
  });

  test('Week/Month toggle switches the matrix period label', async ({ page }) => {
    await page.locator('.habits-new-btn').click();
    await page.locator('.add-habit-input').fill('Toggle Test Habit');
    await page.locator('button:has-text("Add Habit")').click();

    // Week view: Monday 18 – Sunday 24 (the fixed test date is a Sunday)
    await expect(page.locator('.habit-matrix-period')).toHaveText('Mon 18 – Sun 24');
    await expect(page.locator('.habits-view-btn:has-text("Week")')).toHaveClass(/active/);

    await page.locator('.habits-view-btn:has-text("Month")').click();
    await expect(page.locator('.habit-matrix-period')).toHaveText('May 2026');
    await expect(page.locator('.habits-view-btn:has-text("Month")')).toHaveClass(/active/);

    // Month view stacks one week block per week of the month; each block carries
    // its own day numbers (7 per block), with today highlighted
    await expect(page.locator('.habit-matrix-week')).toHaveCount(5); // May 2026: 5 Mon–Sun blocks
    await expect(page.locator('.habit-matrix-daynum')).toHaveCount(35);
    await expect(page.locator('.habit-matrix-daynum.today')).toHaveText('24');
  });

  test('30-day analytics: metric, trend, bars, and the weak-day insight banner', async ({ page }) => {
    // Seed: one habit ticked every window day except the four Wednesdays → 26/30 (87%)
    await page.evaluate(async () => {
      const { saveHabits } = await import('/src/lib/habit-storage.ts');
      const ticks: string[] = [];
      for (let d = new Date(2026, 3, 25); d <= new Date(2026, 4, 24); d.setDate(d.getDate() + 1)) {
        if (d.getDay() !== 3) {
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          ticks.push(`2026-${mm}-${dd}`);
        }
      }
      await saveHabits([{
        id: 'h1', name: 'Read 20 pages', status: 'in_progress', ticks,
        createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z',
      }]);
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });

    await expect(page.locator('.analytics-metric')).toHaveText('87%');
    await expect(page.locator('.analytics-trend')).toHaveText('+87 pts vs last month');

    const barRow = page.locator('.analytics-bar-row:has-text("Read 20 pages")');
    await expect(barRow.locator('.analytics-bar-rate')).toHaveText('87%');
    await expect(barRow.locator('.analytics-bar-fill')).toHaveAttribute('style', /width: 87%/);

    await expect(page.locator('.analytics-insight')).toContainText(
      'Wednesdays are your weak day — 0% completion across all habits.'
    );
  });
});
