import { test, expect } from '@playwright/test';

const FIXED_TIME = new Date('2026-05-24T12:00:00.000Z'); // Sunday 2026-05-24

/** '#rrggbb' → 'rgb(r, g, b)' as returned by getComputedStyle().backgroundColor */
function hexToRgb(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

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

  test('Week/Month toggle switches the matrix between one week and stacked month blocks', async ({ page }) => {
    await page.locator('.habits-new-btn').click();
    await page.locator('.add-habit-input').fill('Toggle Test Habit');
    await page.locator('button:has-text("Add Habit")').click();

    // Week view: one block whose header shows the weekday AND the day number on
    // the same row (Mon 18 .. Sun 24), no pagination bar
    await expect(page.locator('.habit-matrix-week')).toHaveCount(1);
    await expect(page.locator('.habit-matrix-head')).toHaveCount(1);
    await expect(page.locator('.habit-head-day-label').allTextContents()).resolves.toEqual([
      'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun',
    ]);
    await expect(page.locator('.habit-head-day-num').allTextContents()).resolves.toEqual([
      '18', '19', '20', '21', '22', '23', '24',
    ]);
    await expect(page.locator('.habits-view-btn:has-text("Week")')).toHaveClass(/active/);

    await page.locator('.habits-view-btn:has-text("Month")').click();
    await expect(page.locator('.habits-view-btn:has-text("Month")')).toHaveClass(/active/);

    // Month view stacks one week block per week of the month, each with its own
    // full header (day numbers on the same row as the weekdays), today in cyan
    await expect(page.locator('.habit-matrix-week')).toHaveCount(5); // May 2026: 5 Mon–Sun blocks
    await expect(page.locator('.habit-matrix-head')).toHaveCount(5);
    await expect(page.locator('.habit-head-day-num')).toHaveCount(35);
    await expect(page.locator('.habit-head-day.today .habit-head-day-num')).toHaveText('24');
  });

  test('matrix has no in-card pagination bar and header rows share one column grid with habit rows', async ({ page }) => {
    await page.locator('.habits-new-btn').click();
    await page.locator('.add-habit-input').fill('Grid Test Habit');
    await page.locator('button:has-text("Add Habit")').click();

    // No `< Mon 3 – Sun 9 >` navigation bar inside the card
    await expect(page.locator('.habit-matrix-header')).toHaveCount(0);
    await expect(page.locator('.habit-nav-btn')).toHaveCount(0);

    // Day headers sit directly over their checkbox columns: every header and
    // every habit row share the exact same grid template.
    const templates = await page.evaluate(() => {
      const read = (sel: string) => {
        const el = document.querySelector(sel);
        return el ? window.getComputedStyle(el).gridTemplateColumns : null;
      };
      return {
        head: read('.habit-matrix-head'),
        row: read('.habit-row'),
      };
    });
    expect(templates.head).toBeTruthy();
    expect(templates.row).toBe(templates.head);
  });

  test('streak counts consecutive ticks in week and month view alike (3 ticks → 3 days)', async ({ page }) => {
    // Three consecutive ticks ending 3 days ago — the streak must survive the
    // month view, not collapse to 0 because the last tick isn't today/yesterday.
    await page.evaluate(async () => {
      const { saveHabits } = await import('/src/lib/habit-storage.ts');
      await saveHabits([{
        id: 'h1', name: 'Read 20 pages', status: 'in_progress',
        ticks: ['2026-05-18', '2026-05-19', '2026-05-20'], // Mon–Wed; today is Sun 24
        createdAt: '2026-05-01T00:00:00Z', updatedAt: '2026-05-01T00:00:00Z',
      }]);
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });

    // Week view
    const weekRow = page.locator('.habit-row:has-text("Read 20 pages")');
    await expect(weekRow.locator('.habit-streak-cell')).toHaveText('3 days');

    // Month view — every block shows the same streak
    await page.locator('.habits-view-btn:has-text("Month")').click();
    const monthRows = page.locator('.habit-row:has-text("Read 20 pages")');
    await expect(monthRows).toHaveCount(5);
    await expect(monthRows.nth(0).locator('.habit-streak-cell')).toHaveText('3 days');
    await expect(monthRows.nth(2).locator('.habit-streak-cell')).toHaveText('3 days');
  });

  test('checkbox cells are ~40px squares with dark pending fill and accent-matched completed fill', async ({ page }) => {
    await page.locator('.habits-new-btn').click();
    await page.locator('.add-habit-input').fill('Style Test Habit');
    await page.locator('button:has-text("Add Habit")').click();

    const row = page.locator('.habit-row:has-text("Style Test Habit")');
    const pendingCell = row.locator('.habit-cell.pending').first();
    const todayCell = row.locator('.habit-cell.today');

    // ~40px rounded squares (unscaled CSS pixels at the default viewport)
    const size = await pendingCell.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return { width: s.width, height: s.height, radius: s.borderRadius };
    });
    expect(parseFloat(size.width)).toBeGreaterThanOrEqual(38);
    expect(parseFloat(size.height)).toBeGreaterThanOrEqual(38);
    expect(parseFloat(size.radius)).toBeGreaterThanOrEqual(8);

    // Unchecked = dark filled container with a subtle border
    const pendingStyle = await pendingCell.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return { bg: s.backgroundColor, border: s.borderTopColor };
    });
    const bgTertiary = await page.evaluate(() => window.getComputedStyle(document.documentElement).getPropertyValue('--bg-tertiary').trim());
    expect(pendingStyle.bg).toBe(hexToRgb(bgTertiary));

    // Completed fill matches the habit's accent; check glyph is light and bold
    await todayCell.click();
    const completedStyle = await todayCell.evaluate((el) => {
      const s = window.getComputedStyle(el);
      const rowEl = el.closest('.habit-row') as HTMLElement;
      return {
        bg: s.backgroundColor,
        color: s.color,
        accent: window.getComputedStyle(rowEl).getPropertyValue('--habit-accent').trim(),
      };
    });
    expect(completedStyle.bg).toBe(hexToRgb(completedStyle.accent));
    const textPrimary = await page.evaluate(() => window.getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim());
    expect(completedStyle.color).toBe(hexToRgb(textPrimary));
  });

  test('analytics bar label, track, and rate align on one row across the card width', async ({ page }) => {
    await page.evaluate(async () => {
      const { saveHabits } = await import('/src/lib/habit-storage.ts');
      await saveHabits([{
        id: 'h1', name: 'Read 20 pages', status: 'in_progress', ticks: ['2026-05-24'],
        createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z',
      }]);
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });

    const panel = page.locator('.habit-analytics');
    const barRow = page.locator('.analytics-bar-row').first();
    await expect(barRow).toBeVisible();

    const geometry = await page.evaluate(() => {
      const panelEl = document.querySelector('.habit-analytics') as HTMLElement;
      const rowEl = document.querySelector('.analytics-bar-row') as HTMLElement;
      const nameEl = rowEl.querySelector('.analytics-bar-name') as HTMLElement;
      const trackEl = rowEl.querySelector('.analytics-bar-track') as HTMLElement;
      const rateEl = rowEl.querySelector('.analytics-bar-rate') as HTMLElement;
      const panelRect = panelEl.getBoundingClientRect();
      const rowRect = rowEl.getBoundingClientRect();
      const trackRect = trackEl.getBoundingClientRect();
      const rateRect = rateEl.getBoundingClientRect();
      const nameRect = nameEl.getBoundingClientRect();
      const panelStyles = window.getComputedStyle(panelEl);
      const panelBorderX = parseFloat(panelStyles.borderLeftWidth) + parseFloat(panelStyles.borderRightWidth);
      const centerY = (r: DOMRect) => r.top + r.height / 2;
      return {
        // Row fills the panel's content width (20px padding each side, borders excluded)
        rowSpansCard: Math.abs(rowRect.width - (panelRect.width - panelBorderX - 40)) < 2,
        // Label, track and rate share one horizontal row (vertically centered)
        sameRow: Math.abs(centerY(nameRect) - centerY(rateRect)) < 2 && Math.abs(centerY(trackRect) - centerY(rateRect)) < 2,
        rateAtRowEnd: Math.abs(rateRect.right - rowRect.right) < 2,
        trackWidth: trackRect.width,
      };
    });
    expect(geometry.rowSpansCard).toBe(true);
    expect(geometry.sameRow).toBe(true);
    expect(geometry.rateAtRowEnd).toBe(true);
    expect(geometry.trackWidth).toBeGreaterThan(80);
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
