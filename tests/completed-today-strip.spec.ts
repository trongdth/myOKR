import { test, expect, type Page } from '@playwright/test';

const FIXED = '2026-05-24T12:00:00.000Z';
const NEXT_DAY = '2026-05-25T12:00:00.000Z';

// Completed-today strip rework (2026-08-30 spec, 10 points):
//   1. Show→Hide + 180° chevron; label + chevron turn #6EE7B7 while open; the
//      strip itself never moves — cards expand below it.
//   2. Completed cards dimmed, not greyed: title #727C8C line-through, meta
//      #5A6474, card bg #0E1218, left accent green at 45% (never priority).
//   3. Completion time, mono 10.5px, right — the only extra element vs an open card.
//   4. Completion-time ascending — newest at the bottom.
//   5. Expanding grows the column; the quick-add row stays pinned.
//   6. Unchecking asks first (the shared reopen confirm, like Done/⌘K), then
//      returns the card to the open list, decrements, strip stays open; at
//      zero the strip disappears entirely.
//   7. State per column + per session; resets collapsed at the day boundary.
//   8. Clicking a completed card opens P4 — fields still editable.
//   9. Height 160ms ease-out, cards fade 120ms, no stagger.
//  10. 3 columns → strip in Backlog; 2 columns → strip in This week.

async function openBoardWith(page: Page, extraTasks: object[] = []) {
  await page.clock.setFixedTime(new Date(FIXED));
  await page.addInitScript(() => {
    window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(async (extra) => {
    const okr = await import('/src/lib/okr-storage.ts');
    const pomo = await import('/src/lib/pomodoro-storage.ts');
    const cycle = { id: 'c1', name: 'May cycle', month: 4, year: 2026, isActive: true, createdAt: '2026-05-01T00:00:00Z' };
    const obj = { id: 'o1', cycleId: 'c1', title: 'Growth', category: 'work', createdAt: '2026-05-01T00:00:00Z' };
    const krOne = { id: 'kr-one', objectiveId: 'o1', title: 'Improve activation', targetValue: 10, currentValue: 0, unit: '%' };
    await okr.saveCycles([cycle]);
    await okr.saveObjectives([obj]);
    await okr.saveKeyResults([krOne]);
    const open = [
      { id: 't-live', title: 'Live complete me', bucket: 'today', category: 'do', estimatedPomodoros: 2, completedPomodoros: 0, isCompleted: false, createdAt: '2026-05-24T09:00:00Z' },
      { id: 't-filler', title: 'Stay open filler', bucket: 'backlog', category: 'do', estimatedPomodoros: 1, completedPomodoros: 0, isCompleted: false, createdAt: '2026-05-24T09:30:00Z' },
    ];
    await pomo.saveTasks([...open, ...extra]);
  }, extraTasks);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('button[title="Plan"]').click();
}

const COMPLETED_SEED = [
  // Earlier completion — must render FIRST (ascending order).
  { id: 'c-early', title: 'Clear the support inbox', bucket: 'backlog', category: 'decide', estimatedPomodoros: 3, completedPomodoros: 3, isCompleted: true, completedAt: '2026-05-24T01:40:00Z', createdAt: '2026-05-23T10:00:00Z' },
  // Later completion, KR linked — meta reads "Do · Improve activation · 1 pomo".
  { id: 'c-late', title: 'Ship the changelog entry', bucket: 'backlog', category: 'do', keyResultId: 'kr-one', estimatedPomodoros: 1, completedPomodoros: 1, isCompleted: true, completedAt: '2026-05-24T04:15:00Z', createdAt: '2026-05-23T11:00:00Z' },
];

function expectedLocalTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

test.describe('Completed-today strip rework', () => {
  test.beforeEach(async ({ page }) => {
    await openBoardWith(page, COMPLETED_SEED);
  });

  test('toggle anatomy: check glyph, count, Show/Hide label, rotating chevron', async ({ page }) => {
    const toggle = page.locator('.completed-today-toggle');
    await expect(toggle).toContainText('2 completed today');
    await expect(toggle.locator('.toggle-check')).toBeVisible();

    // Collapsed: "Show" + downward chevron in muted foreground.
    const label = toggle.locator('.toggle-label');
    await expect(label).toHaveText(/Show/);
    const muted = await label.evaluate(el => getComputedStyle(el).color);
    expect(muted).not.toBe('rgb(110, 231, 183)');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // Open: "Hide", chevron rotated 180°, label + chevron in the strip green.
    await toggle.click();
    await expect(label).toHaveText(/Hide/);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(label).toHaveCSS('color', 'rgb(110, 231, 183)');
    const chevronTransform = await toggle.locator('.toggle-chevron').evaluate(el => getComputedStyle(el).transform);
    expect(chevronTransform).toContain('-1');
  });

  test('the strip never moves — cards expand below it', async ({ page }) => {
    const toggle = page.locator('.completed-today-toggle');
    const before = (await toggle.boundingBox())!;
    await toggle.click();
    await expect(page.locator('.completed-card')).toHaveCount(2);
    const after = (await toggle.boundingBox())!;
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(2);
  });

  test('completed cards are dimmed, not greyed, with the green accent at 45%', async ({ page }) => {
    await page.locator('.completed-today-toggle').click();
    const card = page.locator('.completed-card', { hasText: 'Clear the support inbox' });
    await expect(card).toBeVisible();

    const styles = await card.evaluate(el => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, shadow: s.boxShadow };
    });
    expect(styles.bg).toBe('rgb(14, 18, 24)'); // #0E1218
    // Left accent = the strip green at 45%, regardless of the task's priority.
    expect(styles.shadow).toContain('0.45');

    const title = card.locator('.completed-card-title');
    await expect(title).toHaveCSS('color', 'rgb(114, 124, 140)'); // #727C8C
    await expect(title).toHaveCSS('text-decoration-line', 'line-through');
    await expect(card.locator('.completed-card-meta')).toHaveCSS('color', 'rgb(90, 100, 116)'); // #5A6474
  });

  test('each card shows its completion time in mono on the right', async ({ page }) => {
    await page.locator('.completed-today-toggle').click();
    const early = page.locator('.completed-card', { hasText: 'Clear the support inbox' });
    const late = page.locator('.completed-card', { hasText: 'Ship the changelog entry' });

    await expect(early.locator('.completed-card-time')).toHaveText(expectedLocalTime('2026-05-24T01:40:00Z'));
    await expect(late.locator('.completed-card-time')).toHaveText(expectedLocalTime('2026-05-24T04:15:00Z'));

    const timeStyles = await early.locator('.completed-card-time').evaluate(el => {
      const s = getComputedStyle(el);
      return { family: s.fontFamily, size: s.fontSize };
    });
    expect(timeStyles.family).toContain('JetBrains Mono');
    expect(parseFloat(timeStyles.size)).toBeCloseTo(10.5, 1);
  });

  test('order is completion-time ascending; a fresh check-off slides in last', async ({ page }) => {
    await page.locator('.completed-today-toggle').click();
    const titles = page.locator('.completed-card .completed-card-title');
    await expect(titles).toHaveText(['Clear the support inbox', 'Ship the changelog entry']);

    // Meta: priority label · KR title (when linked) · logged pomos.
    await expect(page.locator('.completed-card', { hasText: 'Clear the support inbox' }).locator('.completed-card-meta'))
      .toHaveText('Decide · 3 pomos');
    await expect(page.locator('.completed-card', { hasText: 'Ship the changelog entry' }).locator('.completed-card-meta'))
      .toHaveText('Do · Improve activation · 1 pomo');

    // Complete an open task at the frozen "now" (latest time) — it lands at the bottom.
    await page.locator('.column-today .board-task-card', { hasText: 'Live complete me' }).locator('.card-tick').click();
    await expect(titles).toHaveText(['Clear the support inbox', 'Ship the changelog entry', 'Live complete me']);
    await expect(page.locator('.completed-today-toggle')).toContainText('3 completed today');
    await expect(page.locator('.completed-card', { hasText: 'Live complete me' }).locator('.completed-card-time'))
      .toHaveText(expectedLocalTime(FIXED));
  });

  test('unchecking asks for confirmation, then returns the card to the open list', async ({ page }) => {
    await page.locator('.completed-today-toggle').click();
    const early = page.locator('.completed-card', { hasText: 'Clear the support inbox' });
    await early.locator('.completed-check').click();

    // Same dialog as the Done screen and ⌘K: cancelling keeps the task done.
    const confirm = page.locator('.confirm-modal');
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText('Reopen task');
    await expect(confirm).toContainText('Clear the support inbox');
    await page.locator('.confirm-cancel-btn').click();
    await expect(confirm).toHaveCount(0);
    await expect(page.locator('.completed-today-toggle')).toContainText('2 completed today');

    // Confirming reopens: count decremented, strip still open (list still
    // visible), and the task is back on the board as an open card.
    await early.locator('.completed-check').click();
    await confirm.locator('.btn:not(.confirm-cancel-btn)').click();
    await expect(page.locator('.completed-today-toggle')).toContainText('1 completed today');
    await expect(page.locator('.completed-today-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.column-backlog .board-task-card', { hasText: 'Clear the support inbox' })).toBeVisible();

    // At zero the strip disappears entirely.
    await page.locator('.completed-card', { hasText: 'Ship the changelog entry' }).locator('.completed-check').click();
    await confirm.locator('.btn:not(.confirm-cancel-btn)').click();
    await expect(page.locator('.completed-today-strip')).toHaveCount(0);
  });

  test('clicking a completed card opens P4 with editable fields', async ({ page }) => {
    await page.locator('.completed-today-toggle').click();
    await page.locator('.completed-card', { hasText: 'Ship the changelog entry' }).click();

    await expect(page.locator('.task-detail-panel')).toBeVisible();
    await expect(page.locator('.task-detail-panel .detail-title')).toHaveText('Ship the changelog entry');

    // Not a locked state: the title swaps to a real input on click.
    await page.locator('.task-detail-panel .detail-title').click();
    const titleInput = page.locator('.task-detail-panel .detail-title-input');
    await expect(titleInput).toBeVisible();
    await expect(titleInput).not.toBeDisabled();
    await expect(titleInput).toHaveValue('Ship the changelog entry');
  });

  test('expansion animates: height 160ms ease-out, cards fade 120ms', async ({ page }) => {
    const reveal = page.locator('.completed-today-reveal');
    const list = page.locator('.completed-today-list');

    const closed = await list.evaluate(el => getComputedStyle(el).opacity);
    expect(closed).toBe('0');

    await page.locator('.completed-today-toggle').click();
    const styles = await reveal.evaluate(el => {
      const s = getComputedStyle(el);
      return { property: s.transitionProperty, duration: s.transitionDuration, timing: s.transitionTimingFunction };
    });
    expect(styles.property).toContain('grid-template-rows');
    expect(styles.duration).toContain('0.16s');
    expect(styles.timing).toContain('ease-out');
    await expect(list).toHaveCSS('opacity', '1');
  });

  test('per-column, per-session state — and it resets collapsed at the day boundary', async ({ page }) => {
    // Expand in the Backlog column (3-col width).
    await page.locator('.column-backlog .completed-today-toggle').click();
    await expect(page.locator('.column-backlog .completed-today-toggle')).toHaveAttribute('aria-expanded', 'true');

    // At the 2-column tier the strip lives in This week — and starts collapsed.
    await page.setViewportSize({ width: 1000, height: 800 });
    await expect(page.locator('.column-backlog .completed-today-strip')).toHaveCount(0);
    const weekToggle = page.locator('.column-this-week .completed-today-toggle');
    await expect(weekToggle).toBeVisible();
    await expect(weekToggle).toHaveAttribute('aria-expanded', 'false');

    // Per-column: expanding This week doesn't touch Backlog's state.
    await weekToggle.click();
    await expect(weekToggle).toHaveAttribute('aria-expanded', 'true');
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator('.column-backlog .completed-today-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.column-this-week .completed-today-strip')).toHaveCount(0);

    // Reload the same day: the strip reappears (count is day-scoped, state is
    // session-only) collapsed.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('button[title="Plan"]').click();
    await expect(page.locator('.completed-today-toggle')).toContainText('2 completed today');
    await expect(page.locator('.completed-today-toggle')).toHaveAttribute('aria-expanded', 'false');

    // Past the day boundary the count rolls over and the strip disappears.
    await page.clock.setFixedTime(new Date(NEXT_DAY));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('button[title="Plan"]').click();
    await expect(page.locator('.completed-today-strip')).toHaveCount(0);
  });

  test('2-column tier: the strip renders in This week, not the Backlog bar', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await expect(page.locator('.column-backlog .completed-today-strip')).toHaveCount(0);
    const weekToggle = page.locator('.column-this-week .completed-today-toggle');
    await expect(weekToggle).toBeVisible();
    await weekToggle.click();
    await expect(page.locator('.column-this-week .completed-card')).toHaveCount(2);

    // The quick-add row stays pinned and in view with the strip expanded.
    const addBar = page.locator('.quick-add-bar');
    await expect(addBar).toBeVisible();
    const inView = await addBar.evaluate(el => {
      const box = el.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= window.innerHeight;
    });
    expect(inView).toBe(true);
  });
});
