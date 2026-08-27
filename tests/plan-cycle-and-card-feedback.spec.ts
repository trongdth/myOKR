import { test, expect, type Page } from '@playwright/test';

const FIXED = '2026-05-24T12:00:00.000Z';

// Feedback batch (2026-08-27) on the Plan / Tasks screen:
//   1. the cycle·week dropdown was vertically misaligned — it outgrew the tab
//      band and hung over the tab bar's bottom edge;
//   2a/2b/2c. board-card rework — KR chip inline with the priority tag and
//      truncated; "Link a key result" opens the KR picker instead of the task
//      detail modal; the dashed "Add to <bucket>" button became a compact
//      bucket-dropdown icon in the title row (top-right), preserving the
//      ADR-0010 click-select move flow.

async function openTasksBoard(page: Page) {
  await page.clock.setFixedTime(new Date(FIXED));
  await page.addInitScript(() => {
    window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('button[title="Plan"]').click();
}

test.describe('Plan cycle-week picker alignment', () => {
  test.beforeEach(async ({ page }) => openTasksBoard(page));

  test('the week picker sits inside the tab band, resting on the tab underline', async ({ page }) => {
    const geo = await page.evaluate(() => {
      const rect = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, height: r.height };
      };
      return {
        trigger: rect('.plan-tab-strip .sel-trigger'),
        tab: rect('.plan-tab'),
      };
    });

    expect(geo.trigger).not.toBeNull();
    expect(geo.tab).not.toBeNull();

    // Bottoms meet (± rounding): the picker rests where the active-tab
    // underline sits instead of dipping below it into the border.
    expect(Math.abs(geo.trigger!.bottom - geo.tab!.bottom)).toBeLessThanOrEqual(2);
    // And the pill fits the tab band vertically — no more looming over the
    // label row.
    expect(geo.trigger!.height).toBeLessThanOrEqual(geo.tab!.height + 2);
  });
});

test.describe('Board card feedback rework', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(FIXED));
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(async () => {
      const okr = await import('/src/lib/okr-storage.ts');
      const pomo = await import('/src/lib/pomodoro-storage.ts');
      const cycle = { id: 'c1', name: 'May cycle', month: 4, year: 2026, isActive: true, createdAt: '2026-05-01T00:00:00Z' };
      const obj = { id: 'o1', cycleId: 'c1', title: 'Growth', category: 'work', createdAt: '2026-05-01T00:00:00Z' };
      const krLong = { id: 'kr-long', objectiveId: 'o1', title: 'Grow weekly active users of the flagship dashboard by shipping the redesign', targetValue: 100, currentValue: 0, unit: '%' };
      const krOne = { id: 'kr-one', objectiveId: 'o1', title: 'Migration KR One', targetValue: 10, currentValue: 0, unit: '%' };
      await okr.saveCycles([cycle]);
      await okr.saveObjectives([obj]);
      await okr.saveKeyResults([krLong, krOne]);
      await pomo.saveTasks([
        // Long linked KR — exercises the inline truncation on the Today card.
        { id: 't-long', title: 'Ship the redesign', bucket: 'today', category: 'do', keyResultId: 'kr-long', estimatedPomodoros: 2, completedPomodoros: 0, isCompleted: false, createdAt: '2026-05-24T10:00:00Z' },
        // Unlinked card in Backlog — the "Link a key result" prompt.
        { id: 't-unlinked', title: 'Unlinked task', bucket: 'backlog', category: 'decide', estimatedPomodoros: 1, completedPomodoros: 0, isCompleted: false, createdAt: '2026-05-24T10:00:00Z' },
        // Move target for the bucket-icon test.
        { id: 't-mover', title: 'Move me please', bucket: 'backlog', category: 'do', estimatedPomodoros: 1, completedPomodoros: 0, isCompleted: false, createdAt: '2026-05-24T10:00:00Z' },
      ]);
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('button[title="Plan"]').click();
  });

  test('KR chip is inline with the priority tag and truncates with an ellipsis', async ({ page }) => {
    const card = page.locator('.column-today .board-task-card').first();
    const cat = card.locator('.card-category');
    const krTrigger = card.locator('.card-kr .sel-trigger');
    const due = card.locator('.card-due');

    await expect(cat).toBeVisible();
    await expect(krTrigger).toContainText(/Grow weekly active users/);

    // The label never wraps — long KRs ellipsize.
    const textStyle = await card.locator('.card-kr .sel-text')
      .evaluate(el => getComputedStyle(el));
    expect(textStyle.whiteSpace).toBe('nowrap');
    expect(textStyle.textOverflow).toBe('ellipsis');

    // Priority tag + KR chip share one row; the row itself cannot wrap a
    // long KR onto its own line.
    const rowStyle = await card.locator('.card-meta-row').evaluate(el => getComputedStyle(el));
    expect(rowStyle.flexWrap).toBe('nowrap');

    const catBox = (await cat.boundingBox())!;
    const krBox = (await krTrigger.boundingBox())!;
    const dueBox = (await due.boundingBox())!;
    expect(Math.abs(catBox.y - krBox.y)).toBeLessThanOrEqual(4);
    // Shrink order under pressure: only the KR chip narrows, so it never
    // pushes against the due pill.
    expect(krBox.x + krBox.width).toBeLessThanOrEqual(dueBox.x + 1);
  });

  test('"Link a key result" opens the KR picker, not the task detail modal', async ({ page }) => {
    const card = page.locator('.column-backlog .board-task-card', { hasText: 'Unlinked task' });
    await expect(card.locator('.card-kr')).toContainText('Link a key result');

    await card.locator('.card-kr .sel-trigger').click();

    // The picker opens with the seeded KRs…
    const panel = page.locator('.sel-panel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('.sel-row', { hasText: 'Migration KR One' })).toBeVisible();
    // …and the card click did NOT fall through to the detail modal.
    await expect(page.locator('.task-detail-panel')).toHaveCount(0);

    // Committing links the KR on the card.
    await panel.locator('.sel-row', { hasText: 'Migration KR One' }).click();
    await expect(card.locator('.card-kr')).toContainText('Migration KR One');

    // …and the link survives a reload (same pipeline as storage saves).
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('button[title="Plan"]').click();
    await expect(
      page.locator('.board-task-card', { hasText: 'Unlinked task' }).locator('.card-kr'),
    ).toContainText('Migration KR One');
  });

  test('bucket moves live behind a compact icon in the title row, not a dashed button', async ({ page }) => {
    // The dashed "Add to …" button is gone everywhere.
    await expect(page.locator('.card-move-btn')).toHaveCount(0);

    const card = page.locator('.column-backlog .board-task-card', { hasText: 'Move me please' });
    const title = card.locator('.card-title');
    const btn = card.locator('.card-bucket-btn');

    await expect(btn).toBeVisible();
    await expect(btn.locator('svg')).toBeVisible();

    // Top-right corner, right after the title: same vertical band as the
    // title text and to the right of it.
    const titleBox = (await title.boundingBox())!;
    const btnBox = (await btn.boundingBox())!;
    expect(Math.abs(titleBox.y - btnBox.y)).toBeLessThanOrEqual(8);
    expect(btnBox.x).toBeGreaterThan(titleBox.x + titleBox.width - 8);

    // The ADR-0010 click-select move flow survives behind the icon.
    await btn.click();
    const menu = page.locator('.card-move-menu');
    await expect(menu).toBeVisible();
    await menu.locator('.move-option', { hasText: 'Today' }).click();
    await expect(page.locator('.column-today .board-task-card', { hasText: 'Move me please' })).toBeVisible();

    // Icon clicks must not fall through to the detail modal either.
    await expect(page.locator('.task-detail-panel')).toHaveCount(0);
  });
});
