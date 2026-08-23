import { test, expect, type Page } from '@playwright/test';

/** '#rrggbb' → 'rgb(r, g, b)' as returned by getComputedStyle().backgroundColor */
function hexToRgb(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

async function openPanel(page: Page, section: string) {
  const trigger = page.locator(`[data-fx="${section}"] .sel-trigger`);
  await trigger.click();
  const panel = page.locator('.sel-panel');
  await expect(panel).toBeVisible();
  return { trigger, panel };
}

test.describe('Select component (fixture page)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?fixture=select');
    await page.waitForLoadState('networkidle');
  });

  test('boxed trigger at rest: metrics, fill, placeholder colour', async ({ page }) => {
    const trigger = page.locator('[data-fx="habit"] .sel-trigger');
    await expect(trigger).toHaveCSS('height', '32px');
    await expect(trigger).toHaveCSS('border-radius', '8px');
    await expect(trigger).toHaveCSS('background-color', hexToRgb('#12161d'));
    // Empty value → imperative placeholder in --menu-placeholder (#8a93a3)
    await expect(trigger.locator('.sel-text')).toHaveText('Link a habit');
    await expect(trigger.locator('.sel-text')).toHaveCSS('color', hexToRgb('#8a93a3'));
    await expect(trigger.locator('.sel-chevron')).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  test('hover lifts fill and chevron colour', async ({ page }) => {
    const trigger = page.locator('[data-fx="buckets"] .sel-trigger');
    await trigger.hover();
    await expect(trigger).toHaveCSS('background-color', hexToRgb('#171d26'));
    await expect(trigger.locator('.sel-chevron')).toHaveCSS('color', hexToRgb('#b7bfcc'));
  });

  test('open state: sunk fill, cyan border, flipped chevron, held while open', async ({ page }) => {
    const { trigger, panel } = await openPanel(page, 'buckets');
    await expect(trigger).toHaveCSS('background-color', hexToRgb('#0a0d12'));
    await expect(trigger).toHaveCSS('border-color', hexToRgb('#22d3ee'));
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger.locator('.sel-chevron')).toHaveCSS('transform', 'matrix(-1, 0, 0, -1, 0, 0)');
    await expect(panel).toBeVisible(); // press and open are one state — stays open
  });

  test('panel is portaled to body, 6px below the trigger, with spec row metrics', async ({ page }) => {
    const { trigger, panel } = await openPanel(page, 'buckets');
    // Portaled out of the section, straight to <body>
    const parentTag = await page.evaluate(() => document.querySelector('.sel-panel')?.parentElement?.tagName);
    expect(parentTag).toBe('BODY');
    // Let the slide-down entrance finish before measuring geometry
    await panel.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    const triggerBox = await trigger.boundingBox();
    const panelBox = await panel.boundingBox();
    expect(triggerBox).not.toBeNull();
    expect(panelBox).not.toBeNull();
    expect(Math.abs(panelBox!.y - (triggerBox!.y + triggerBox!.height + 6))).toBeLessThanOrEqual(1.5);
    expect(panelBox!.width).toBeGreaterThanOrEqual(triggerBox!.width); // min-width = trigger
    await expect(panel).toHaveCSS('max-width', '280px'); // panel width cap
    await expect(panel.locator('.sel-row').first()).toHaveCSS('min-height', '34px');
    await expect(panel.locator('.sel-row').first()).toHaveCSS('border-radius', '7px');
    await expect(panel).toHaveCSS('padding', '5px');
  });

  test('exactly one chosen row: cyan tick + tint; hover row highlights', async ({ page }) => {
    const { panel } = await openPanel(page, 'buckets');
    await expect(panel.locator('.sel-tick')).toHaveCount(1);
    const chosen = panel.locator('.sel-chosen');
    await expect(chosen).toHaveCount(1);
    await expect(chosen.locator('.sel-tick')).toHaveCount(1);
    // 10% cyan tint resolves to a non-transparent computed background
    expect(await chosen.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    const other = panel.locator('.sel-row:not(.sel-chosen)').first();
    await other.hover();
    await expect(other).toHaveClass(/sel-active/);
    expect(await other.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('click commits and closes; trigger shows the new value', async ({ page }) => {
    const { trigger, panel } = await openPanel(page, 'buckets');
    await panel.locator('.sel-row', { hasText: 'Backlog' }).click();
    await expect(page.locator('.sel-panel')).toHaveCount(0);
    await expect(trigger).toContainText('Backlog');
    // Reopen: Backlog is now the single chosen row
    await trigger.click();
    await expect(page.locator('.sel-panel .sel-chosen')).toHaveText(/Backlog/);
  });

  test('clear row empties the value; action row fires without changing it', async ({ page }) => {
    const habitTrigger = page.locator('[data-fx="habit"] .sel-trigger');
    await habitTrigger.click();
    const panel = page.locator('.sel-panel');
    await panel.locator('.sel-row', { hasText: 'Read 20 minutes' }).click();
    await expect(habitTrigger).toContainText('Read 20 minutes');

    await habitTrigger.click();
    const footer = page.locator('.sel-panel .sel-footer');
    await expect(footer).toBeVisible();
    await expect(footer.locator('.sel-row.sel-clear')).toHaveText(/No habit/);
    await expect(footer.locator('.sel-row.sel-clear .sel-dash')).toBeVisible();
    // Action row: fires its callback, value untouched
    await footer.locator('.sel-row.sel-action', { hasText: 'Create new habit' }).click();
    await expect(page.locator('[data-fx="log"]')).toHaveText(/create-habit/);
    await expect(habitTrigger).toContainText('Read 20 minutes');
    // Clear row: empties the value → placeholder returns
    await habitTrigger.click();
    await page.locator('.sel-panel .sel-row.sel-clear').click();
    await expect(habitTrigger.locator('.sel-text')).toHaveText('Link a habit');
  });

  test('keyboard: arrows/Home/End navigate, Enter commits, Esc returns focus to trigger', async ({ page }) => {
    const trigger = page.locator('[data-fx="plain"] .sel-trigger');
    await trigger.focus();
    await trigger.press('ArrowDown'); // opens on the chosen row (Alpha → r0)
    const panel = page.locator('.sel-panel');
    await expect(panel).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-activedescendant', /-r0$/);
    await trigger.press('ArrowDown'); // Beta
    await expect(trigger).toHaveAttribute('aria-activedescendant', /-r1$/);
    await trigger.press('ArrowUp'); // back to Alpha
    await expect(trigger).toHaveAttribute('aria-activedescendant', /-r0$/);
    await trigger.press('End'); // Gamma
    await expect(trigger).toHaveAttribute('aria-activedescendant', /-r2$/);
    await trigger.press('Home');
    await expect(trigger).toHaveAttribute('aria-activedescendant', /-r0$/);
    await trigger.press('ArrowDown');
    await trigger.press('Enter'); // commits Beta
    await expect(page.locator('.sel-panel')).toHaveCount(0);
    await expect(trigger).toContainText('Beta');

    await trigger.press('Enter'); // Enter reopens with chosen preselected
    await expect(page.locator('.sel-panel')).toBeVisible();
    await trigger.press('Escape');
    await expect(page.locator('.sel-panel')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('panel stacks above the modal layer when opened inside a modal', async ({ page }) => {
    await page.locator('.fx-open-modal').click();
    const overlay = page.locator('.fx-modal-overlay');
    await expect(overlay).toBeVisible();
    const trigger = page.locator('[data-fx="modal"] .sel-trigger');
    await trigger.click();
    const panel = page.locator('.sel-panel');
    await expect(panel).toBeVisible();
    // Portaled out of the overlay (which is z-1000)…
    const parentTag = await page.evaluate(() => document.querySelector('.sel-panel')?.parentElement?.tagName);
    expect(parentTag).toBe('BODY');
    // …and actually painted on top at its own coordinates
    const hitsPanel = await panel.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && !!hit.closest('.sel-panel');
    });
    expect(hitsPanel).toBe(true);
  });

  test('long list caps at ~5 rows and keyboard keeps the active row scrolled into view', async ({ page }) => {
    const { panel } = await openPanel(page, 'long');
    const rows = panel.locator('.sel-rows');
    const scrollState = await rows.evaluate((el) => ({ scrollable: el.scrollHeight > el.clientHeight, client: el.clientHeight }));
    expect(scrollState.scrollable).toBe(true);
    expect(scrollState.client).toBeLessThanOrEqual(190); // 5×34px rows + gaps + padding
    // Jump to the last row — it must be scrolled into view
    await page.locator('[data-fx="long"] .sel-trigger').press('End');
    const scrolled = await rows.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 1);
    expect(scrolled).toBe(true);
    const active = page.locator('.sel-panel .sel-row.sel-active');
    await expect(active).toHaveText(/Option 25/);
  });

  test('flips above when the trigger sits near the bottom edge', async ({ page }) => {
    await page.locator('[data-fx="flip"]').scrollIntoViewIfNeeded();
    const trigger = page.locator('[data-fx="flip"] .sel-trigger');
    await trigger.click();
    const panel = page.locator('.sel-panel');
    await expect(panel).toBeVisible();
    const triggerBox = await trigger.boundingBox();
    const panelBox = await panel.boundingBox();
    expect(triggerBox).not.toBeNull();
    expect(panelBox).not.toBeNull();
    expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(triggerBox!.y + 1.5); // panel ends above the trigger
  });

  test('disabled trigger: 40% opacity, no hover lift, will not open', async ({ page }) => {
    const trigger = page.locator('[data-fx="disabled"] .sel-trigger');
    await expect(trigger).toBeDisabled();
    await expect(trigger).toHaveCSS('opacity', '0.4');
    await trigger.click({ force: true });
    await expect(page.locator('.sel-panel')).toHaveCount(0);
  });

  test('empty option list renders a quiet "No options yet" row; trigger stays enabled', async ({ page }) => {
    const { panel } = await openPanel(page, 'empty');
    await expect(panel.locator('.sel-row.sel-empty')).toHaveText('No options yet');
  });

  test('bare variant: badge/dot trigger without chevron, opens the same panel with ring', async ({ page }) => {
    const bare = page.locator('[data-fx="bare"] .sel-trigger.bare').first();
    await expect(bare.locator('.sel-chevron')).toHaveCount(0);
    await bare.click();
    await expect(bare).toHaveClass(/sel-open/);
    await expect(page.locator('.sel-panel')).toBeVisible();
    // dot-only bare trigger carries no label text
    const dotOnly = page.locator('[data-fx="bare"] .sel-trigger.bare').nth(1);
    await expect(dotOnly).not.toContainText('Do');
  });

  test('remove × appears on row hover and removes only that row', async ({ page }) => {
    const { panel } = await openPanel(page, 'cycles');
    const june = panel.locator('.sel-row', { hasText: 'June cycle' });
    await expect(june.locator('.sel-remove')).toHaveCSS('opacity', '0'); // hidden until hover
    await june.hover();
    await june.locator('.sel-remove').click();
    // The panel stays open (removes are repeatable); only the row is gone
    await expect(page.locator('.sel-panel .sel-row', { hasText: 'June cycle' })).toHaveCount(0);
    const trigger = page.locator('[data-fx="cycles"] .sel-trigger');
    await expect(trigger).toContainText('July cycle'); // chosen untouched
    await expect(page.locator('.sel-panel .sel-rows .sel-row')).toHaveCount(2); // June is gone; footer action row is outside .sel-rows
  });

  test('trailing labels show on non-chosen rows only; tick wins on the chosen row', async ({ page }) => {
    const trigger = page.locator('[data-fx="kr"] .sel-trigger');
    await trigger.click();
    await page.locator('.sel-panel .sel-row', { hasText: 'Ship v2 API' }).click();
    await trigger.click();
    const panel = page.locator('.sel-panel');
    await expect(panel.locator('.sel-tick')).toHaveCount(1);
    await expect(panel.locator('.sel-trailing')).toHaveCount(2); // 3 options, chosen shows the tick instead
    await expect(panel.locator('.sel-chosen .sel-trailing')).toHaveCount(0);
  });

  test('trigger grows to a 40px touch target at ≤900px', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    const trigger = page.locator('[data-fx="buckets"] .sel-trigger');
    await expect(trigger).toHaveCSS('height', '40px');
  });
});
