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

  test('the week picker floats clear of the tab strip rule', async ({ page }) => {
    // 2026-08-27 follow-up: resting flush on the border made the rule graze
    // the pill's bottom edge (its background is translucent, so the line
    // shows through). The picker must hang fully ABOVE the strip's
    // border-bottom with visible clearance.
    const geo = await page.evaluate(() => {
      const strip = document.querySelector('.plan-tab-strip')!;
      const trigger = document.querySelector('.plan-tab-strip .sel-trigger')!;
      const s = strip.getBoundingClientRect();
      const t = trigger.getBoundingClientRect();
      return {
        borderTopEdgeY: s.bottom - parseFloat(getComputedStyle(strip).borderBottomWidth),
        triggerTop: t.top,
        triggerBottom: t.bottom,
        triggerHeight: t.height,
        stripTop: s.top,
      };
    });

    // Visible air between the pill and the rule — never touching it, so no
    // DPR/rounding can make the line cut through the control.
    const clearanceY = geo.borderTopEdgeY - geo.triggerBottom;
    expect(clearanceY).toBeGreaterThanOrEqual(4);

    // Still compact — the height override holds (40px touch rule is ≤900px).
    expect(geo.triggerHeight).toBeLessThanOrEqual(29);

    // And the pill stays inside the strip's own box.
    expect(geo.triggerTop).toBeGreaterThanOrEqual(geo.stripTop - 0.5);
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

  test('chip rows wrap, share one size token, and long KRs ellipsize', async ({ page }) => {
    const card = page.locator('.column-today .board-task-card').first();
    const cat = card.locator('.card-category');
    const krTrigger = card.locator('.card-kr .sel-trigger');
    const due = card.locator('.card-due');

    await expect(cat).toBeVisible();
    await expect(krTrigger).toContainText(/Grow weekly active users/);

    // Round 4: rows are flex rows with gap-2 that may wrap; the two rows
    // themselves sit gap-2 apart.
    const rowStyle = await card.locator('.card-meta-row').first().evaluate(el => getComputedStyle(el));
    expect(rowStyle.flexWrap).toBe('wrap');
    const blockStyle = await card.locator('.card-meta-block').evaluate(el => getComputedStyle(el));
    expect(parseFloat(blockStyle.rowGap)).toBeCloseTo(8, 0);
    expect(parseFloat(rowStyle.columnGap)).toBeCloseTo(8, 0);

    // All three chips share ONE size token — identical height, horizontal
    // padding, radius, and font-size (mockup parity).
    const chipStyle = async (loc: ReturnType<typeof card.locator>) =>
      await loc.evaluate(el => {
        const s = getComputedStyle(el);
        return { h: s.height, px: s.paddingLeft, radius: s.borderRadius, font: s.fontSize };
      });
    const catStyle = await chipStyle(cat);
    const krStyle = await chipStyle(krTrigger);
    const dueStyle = await chipStyle(due);
    expect(krStyle).toEqual(catStyle);
    expect(dueStyle).toEqual(catStyle);
    // The shared token: ~28px pill height per the expect shot.
    expect(parseFloat(catStyle.h)).toBeGreaterThanOrEqual(26);
    expect(parseFloat(catStyle.h)).toBeLessThanOrEqual(30);

    // The KR label itself never wraps — a long KR ellipsizes inside its chip.
    const textStyle = await card.locator('.card-kr .sel-text')
      .evaluate(el => getComputedStyle(el));
    expect(textStyle.whiteSpace).toBe('nowrap');
    expect(textStyle.textOverflow).toBe('ellipsis');

    // Linked chips read as violet — the KR swatch dot renders in the trigger
    // and the pill takes the objective tint instead of neutral gray
    // (mockup parity, round 3).
    await expect(card.locator('.card-kr .sel-icon .sel-kr-swatch')).toBeVisible();

    // Round 5: the KR dot is a CIRCLE — same glyph shape as the priority
    // dot (radius 50%), not a rounded square.
    const swatch = await card.locator('.card-kr .sel-icon .sel-kr-swatch')
      .evaluate(el => {
        const s = getComputedStyle(el);
        return { width: parseFloat(s.width), radius: s.borderRadius };
      });
    expect(swatch.radius).toBe('50%');

    // Round 7: the two on-card dots are the SAME SIZE — the KR circle must
    // not dwarf the priority circle beside it.
    const dotPair = await card.evaluate(el => {
      const width = (sel: string) => {
        const dot = el.querySelector(sel);
        return dot ? parseFloat(getComputedStyle(dot).width) : null;
      };
      return { cat: width('.card-category-dot'), kr: width('.card-kr .sel-kr-swatch') };
    });
    expect(dotPair.cat).not.toBeNull();
    expect(dotPair.cat).toBe(dotPair.kr);
    expect(dotPair.cat).toBeGreaterThanOrEqual(5);
    expect(dotPair.cat).toBeLessThanOrEqual(7);

    const linkedBg = await krTrigger.evaluate(el => getComputedStyle(el).backgroundColor);
    const neutralProbe = await card.evaluate(el => {
      const probe = document.createElement('span');
      probe.style.background = 'var(--bg-tertiary)';
      el.appendChild(probe);
      const bg = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return bg;
    });
    expect(linkedBg).not.toBe(neutralProbe);

    // …and the due badge lives on its OWN row directly below the priority
    // tag (feedback round 2), left-aligned with it.
    const catBox = (await cat.boundingBox())!;
    const dueBox = (await due.boundingBox())!;
    expect(dueBox.y).toBeGreaterThan(catBox.y + 10);
    expect(dueBox.x).toBeLessThanOrEqual(catBox.x + 4);
  });

  test('"Link a key result" opens the KR picker, not the task detail modal', async ({ page }) => {
    const card = page.locator('.column-backlog .board-task-card', { hasText: 'Unlinked task' });
    await expect(card.locator('.card-kr')).toContainText('Link a key result');

    // Feedback round 2: the empty chip shows the FULL label — it never
    // shrinks under row pressure.
    const emptyLabel = await card.locator('.card-kr .sel-text')
      .evaluate(el => ({ text: el.textContent ?? '', scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(emptyLabel.text).toBe('Link a key result');
    expect(emptyLabel.scrollWidth).toBeLessThanOrEqual(emptyLabel.clientWidth + 1);

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
    const pomos = card.locator('.card-pomos');

    await expect(btn).toBeVisible();

    // Feedback round 4: a rounded-rect pill holding the BOARD/CARD glyph +
    // chevron — a dropdown affordance in muted foreground, never a garbled
    // or full-white glyph.
    await expect(btn.locator('svg.lucide-paint-bucket')).toHaveCount(0);
    await expect(btn.locator('svg.lucide-square-kanban')).toHaveCount(1);
    await expect(btn.locator('svg.lucide-chevron-down')).toHaveCount(1);
    const chrome = await btn.evaluate(el => {
      const s = getComputedStyle(el);
      const probe = document.createElement('span');
      probe.style.color = 'var(--text-muted)';
      el.appendChild(probe);
      const muted = getComputedStyle(probe).color;
      probe.remove();
      return {
        border: s.borderTopWidth,
        radius: s.borderRadius,
        bg: s.backgroundColor,
        color: s.color,
        muted,
        width: el.getBoundingClientRect().width,
        height: el.getBoundingClientRect().height,
      };
    });
    expect(parseFloat(chrome.border)).toBeGreaterThan(0);
    expect(chrome.radius).not.toBe('0px');
    expect(chrome.bg).not.toBe('rgba(0, 0, 0, 0)');
    expect(chrome.color).toBe(chrome.muted);
    // Round 6: sized to the counter it sits beside, not above it — a
    // compact icon+chevron pill (~24px tall, ~40px wide).
    expect(chrome.width).toBeGreaterThanOrEqual(34);
    expect(chrome.width).toBeLessThanOrEqual(44);
    expect(chrome.height).toBeGreaterThanOrEqual(20);
    expect(chrome.height).toBeLessThanOrEqual(26);

    // Top-right corner, right after the title and directly beside the pomo
    // counter: same vertical band as the title text, then counter to its
    // right. Round 6: the pill is vertically CENTERED on the counter line
    // ("align padding") — shared mid-line with `0/2`, ±3px.
    const titleBox = (await title.boundingBox())!;
    const btnBox = (await btn.boundingBox())!;
    const pomosBox = (await pomos.boundingBox())!;
    expect(Math.abs(titleBox.y - btnBox.y)).toBeLessThanOrEqual(8);
    expect(btnBox.x).toBeGreaterThan(titleBox.x + titleBox.width - 8);
    expect(pomosBox.x - btnBox.x - btnBox.width).toBeGreaterThanOrEqual(-1);
    expect(pomosBox.x - btnBox.x - btnBox.width).toBeLessThanOrEqual(24);
    const btnCenterY = btnBox.y + btnBox.height / 2;
    const pomosCenterY = pomosBox.y + pomosBox.height / 2;
    expect(Math.abs(btnCenterY - pomosCenterY)).toBeLessThanOrEqual(3);

    // The ADR-0010 click-select move flow survives behind the icon.
    await btn.click();
    const menu = page.locator('.card-move-menu');
    await expect(menu).toBeVisible();
    await menu.locator('.move-option', { hasText: 'Today' }).click();
    await expect(page.locator('.column-today .board-task-card', { hasText: 'Move me please' })).toBeVisible();

    // Icon clicks must not fall through to the detail modal either.
    await expect(page.locator('.task-detail-panel')).toHaveCount(0);
  });

  test('card tick matches the mockup proportions', async ({ page }) => {
    const tick = page.locator('.column-today .board-task-card').first().locator('.card-tick');
    await expect(tick).toBeVisible();

    const style = await tick.evaluate(el => {
      const s = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return { width: box.width, height: box.height, radius: s.borderRadius };
    });
    // Round-3 mockup parity: the checkbox is a substantial rounded square,
    // not a small corner dot.
    expect(style.width).toBeGreaterThanOrEqual(22);
    expect(style.height).toBeGreaterThanOrEqual(22);
    expect(style.radius).not.toBe('5px');
  });
});
