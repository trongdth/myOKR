import { test, expect } from '@playwright/test';

// Pin the clock inside the mock May-2026 cycle (matches today-focus.spec.ts).
// 2026-05-24 is a Sunday → day-first date title reads "Sunday, 24 May".
const FIXED_TIME = new Date('2026-05-24T12:00:00.000Z');

async function waitForApp(page: import('@playwright/test').Page) {
  await page.clock.setFixedTime(FIXED_TIME);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
}

async function openDayPlan(page: import('@playwright/test').Page) {
  await page.locator('button:has-text("Day plan")').first().click();
  await page.waitForTimeout(300);
}

// Rewrite the day-plan lock so the given taskIds are the day's picked order,
// then trigger DayPlanBody's recompute via the sync event. Goes through the
// app's own saveTodayPlan/getLocalDateString so a key/shape change upstream
// fails here loudly instead of silently turning the lock into a no-op.
async function lockDayPlanTo(page: import('@playwright/test').Page, taskIds: string[]) {
  await page.evaluate(async (ids) => {
    const { getLocalDateString } = await import('/src/lib/pomodoro-storage.ts');
    const { saveTodayPlan } = await import('/src/lib/today-focus.ts');
    saveTodayPlan({ date: getLocalDateString(), taskIds: ids, skippedIds: [] });
    window.dispatchEvent(new CustomEvent('myokr-data-synced'));
  }, taskIds);
  await page.waitForTimeout(300);
}

// Assert the NOW pill's text, class, and computed color in one shot.
async function expectNowPill(
  page: import('@playwright/test').Page,
  expected: { text: string; cls: string; rgb: string },
) {
  const pill = page.locator('.today-now-status-pill');
  await expect(pill).toHaveText(expected.text);
  await expect(pill).toHaveClass(new RegExp(expected.cls));
  expect(await pill.evaluate(el => getComputedStyle(el).color)).toBe(expected.rgb);
}

test.describe('Focus shell — Day plan tab (ticket 01)', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await openDayPlan(page);
  });

  test('header shows today\'s date, day-first', async ({ page }) => {
    await expect(page.locator('.focus-header-title')).toHaveText('Sunday, 24 May');
  });

  test('header shows a FOCUS eyebrow above the date title (ticket 01)', async ({ page }) => {
    // Mirrors the Plan group's PLAN eyebrow (.plan-header-eyebrow). The eyebrow
    // is a group marker on the shared FocusHeader, so it shows on all three
    // Focus-group tabs; this test covers the Day plan tab, and the Session /
    // Habits variants are covered below.
    const eyebrow = page.locator('.focus-header .plan-header-eyebrow');
    await expect(eyebrow).toBeVisible();
    await expect(eyebrow).toHaveText('FOCUS');
  });

  test('FOCUS eyebrow also shows on the Session tab', async ({ page }) => {
    await page.locator('button:has-text("Session")').first().click();
    await page.waitForTimeout(200);
    await expect(page.locator('.focus-header .plan-header-eyebrow')).toHaveText('FOCUS');
  });

  test('FOCUS eyebrow also shows on the Habits tab', async ({ page }) => {
    await page.locator('button:has-text("Habits")').first().click();
    await page.waitForTimeout(200);
    await expect(page.locator('.focus-header .plan-header-eyebrow')).toHaveText('FOCUS');
  });

  test('old "Today\'s Focus" header is gone', async ({ page }) => {
    await expect(page.locator('.today-title')).toHaveCount(0);
  });

  test('tab strip lists Day plan / Session / Habits with Day plan active, no badge', async ({ page }) => {
    const strip = page.locator('.plan-tab-strip.focus-tabs');
    await expect(strip).toBeVisible();
    await expect(strip.locator('.plan-tab', { hasText: 'Day plan' })).toBeVisible();
    await expect(strip.locator('.plan-tab', { hasText: 'Session' })).toBeVisible();
    await expect(strip.locator('.plan-tab', { hasText: 'Habits' })).toBeVisible();
    await expect(strip.locator('.plan-tab.active')).toHaveText(/Day plan/);
    // Day plan carries no count badge.
    await expect(strip.locator('.plan-tab.active .plan-tab-count')).toHaveCount(0);
  });

  test('"Plan day" button is present (renamed from "Replan day")', async ({ page }) => {
    await expect(page.locator('.focus-plan-day-btn')).toContainText('Plan day');
  });

  test('"Plan day" button uses the cyan-outlined revamp (2026-08-16)', async ({ page }) => {
    const btn = page.locator('.focus-plan-day-btn');
    // Asterisk icon (six-spoke starburst, 2026-08-17) — not the old
    // loader/recycle glyphs
    await expect(btn.locator('svg.lucide-asterisk')).toHaveCount(1);
    await expect(btn.locator('svg.lucide-loader-circle')).toHaveCount(0);
    await expect(btn.locator('svg.lucide-refresh-cw')).toHaveCount(0);

    // Bright cyan text (--color-primary #22D3EE), semibold, tight icon-text gap
    const styles = await btn.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, fontWeight: s.fontWeight, gap: s.columnGap };
    });
    expect(styles.color).toBe('rgb(34, 211, 238)');
    expect(Number(styles.fontWeight)).toBeGreaterThanOrEqual(600);
    expect(styles.gap).toBe('8px');

    // Cyan border, not the old muted border token (#27272a)
    const borderColor = await btn.evaluate((el) => getComputedStyle(el).borderColor);
    expect(borderColor).not.toBe('rgb(39, 39, 42)');
  });

  test('cycle slot is static text (no dropdown)', async ({ page }) => {
    const strip = page.locator('.plan-tab-strip.focus-tabs');
    await expect(strip.locator('select')).toHaveCount(0);
    await expect(strip.locator('.plan-cycle-week')).toContainText(/week \d+ of \d+/);
  });

  test('Day plan dashboard body still renders (NOW card)', async ({ page }) => {
    // The reused body keeps its classes — only the shell around it changed.
    await expect(page.locator('.today-body')).toBeVisible();
  });

  test('NOW status pill mirrors the linked KR confidence — at_risk shows red "At Risk"', async ({ page }) => {
    // Seed default: NOW is task-6 "Refactor auth module" → kr-2 (at_risk).
    await expect(page.locator('.today-now-title')).toHaveText('Refactor auth module');
    await expectNowPill(page, { text: 'At Risk', cls: 'at-risk', rgb: 'rgb(244, 63, 94)' }); // var(--color-risk)
  });

  test('NOW status pill — on_track KR shows green "On Track"', async ({ page }) => {
    // Lock the day plan to task-1 → kr-1 (on_track). The plan lock is plain
    // localStorage; the sync event makes DayPlanBody recompute from it.
    await lockDayPlanTo(page, ['task-1']);
    await expect(page.locator('.today-now-title')).toHaveText('Design new dashboard layout');
    await expectNowPill(page, { text: 'On Track', cls: 'on-track', rgb: 'rgb(34, 197, 94)' }); // var(--okr-on-track)
  });

  test('NOW status pill — not_set KR shows a neutral gray "Not Set"', async ({ page }) => {
    // Add a task linked to kr-6 (seeded not_set) through the real storage
    // layer, then lock the plan to it. "Not Set" must NOT wear green.
    await page.evaluate(async () => {
      const storage = await import('/src/lib/pomodoro-storage.ts');
      const tasks = await storage.loadTasks();
      tasks.push({
        id: 'task-ns',
        title: 'Draft blog launch post',
        estimatedPomodoros: 3,
        completedPomodoros: 0,
        isCompleted: false,
        category: 'do',
        keyResultId: 'kr-6',
        createdAt: '2026-05-20T09:00:00.000Z',
        todos: [],
        comments: [],
      });
      await storage.saveTasks(tasks);
    });
    await lockDayPlanTo(page, ['task-ns']);
    await expect(page.locator('.today-now-title')).toHaveText('Draft blog launch post');
    await expectNowPill(page, { text: 'Not Set', cls: 'not-set', rgb: 'rgb(113, 113, 122)' }); // var(--text-muted)
  });

  test('NOW status pill — task without a KR link shows no pill at all', async ({ page }) => {
    // task-3 has no keyResultId. "On Track" with nothing to be on track
    // against is a false positive — the pill is hidden entirely.
    await lockDayPlanTo(page, ['task-3']);
    await expect(page.locator('.today-now-title')).toHaveText('Write API documentation');
    await expect(page.locator('.today-now-status-pill')).toHaveCount(0);
    // The rank badge stays.
    await expect(page.locator('.today-now-rank-pill')).toHaveText('NOW · #1');
  });

  test('padding parity with the Plan-group shell across responsive tiers', async ({ page }) => {
    // Event-based nav works at every viewport (the sidebar collapses to a drawer <900px).
    const go = (section: string) =>
      page.evaluate((s) => {
        window.dispatchEvent(new CustomEvent('myokr-navigate-to-section', { detail: s }));
      }, section).then(() => page.waitForTimeout(200));

    const outerPad = (sel: string) =>
      page.locator(sel).first().evaluate((el) => {
        const s = getComputedStyle(el);
        return `${s.paddingTop}|${s.paddingRight}|${s.paddingBottom}|${s.paddingLeft}|${s.maxWidth}`;
      });
    const innerPad = (sel: string) =>
      page.locator(sel).first().evaluate((el) => getComputedStyle(el).padding);

    // 1280 (>932, base), 1000 (≤932), 700 (≤768) — the three .pomodoro-container
    // padding regions. The Focus outer reuses .pomodoro-container, so it must
    // match the Plan shell at every tier.
    for (const vw of [1280, 1000, 700]) {
      await page.setViewportSize({ width: vw, height: 800 });

      await go('day-plan');
      const focusOuter = await outerPad('.focus-shell');
      const focusInner = await innerPad('.focus-shell-inner');

      await go('tasks');
      const planOuter = await outerPad('.pomodoro-container.plan-group-shell');
      const planInner = await innerPad('.tasks-view-container');

      expect(focusOuter, `outer padding/maxWidth @${vw}px`).toBe(planOuter);
      expect(focusInner, `inner padding @${vw}px`).toBe(planInner);
    }
  });
});
