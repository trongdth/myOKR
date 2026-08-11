import { test, expect } from '@playwright/test';

// Pin the clock inside the mock May-2026 cycle: May 24 → 7 days left.
const FIXED_TIME = new Date('2026-05-24T12:00:00.000Z');

async function waitForApp(page: import('@playwright/test').Page) {
  await page.clock.setFixedTime(FIXED_TIME);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
}

test.describe('Today Focus', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await expect(page.locator('.focus-header-title')).toBeVisible({ timeout: 10000 });
  });

  test('ranks strictly by Eisenhower category, then urgency, then KR confidence', async ({ page }) => {
    // budget=13 (320/25), maxShare=6, daysLeft=7
    // do: task-6 (rem 2, at_risk KR) > task-1 (rem 2, on_track KR) — confidence tie-break
    // decide: task-3 (rem 2) > task-5 (rem 2) — urgency (more remaining effort)
    // delegate: task-7 (rem 2) — all fit into 13 budget
    const cards = page.locator('.focus-card');
    await expect(cards).toHaveCount(5);

    await expect(cards.nth(0)).toContainText('Refactor auth module');
    await expect(cards.nth(1)).toContainText('Design new dashboard layout');
    await expect(cards.nth(2)).toContainText('Write API documentation');
    await expect(cards.nth(3)).toContainText('Plan sprint retrospective');
    await expect(cards.nth(4)).toContainText('Update README screenshots');
  });

  test('plan stat shows completed-today progress against the daily budget with circular SVG ring', async ({ page }) => {
    // Seed today has 3 completed pomodoros; budget = round(320/25) = 13.
    // The stat reflects work DONE today (3/13), not the planned slice total.
    const card = page.locator('.area-plan');
    await expect(card).toContainText('TODAY');
    await expect(card.locator('.today-stat-value')).toHaveText('3/13');
    // Must contain circular SVG ring
    await expect(card.locator('.today-pomo-ring-svg')).toBeVisible();
  });

  test('STREAK card renders 7 day-squares for weekly history and 14px days label', async ({ page }) => {
    const card = page.locator('.area-streak');
    await expect(card).toContainText('STREAK');
    const daySquares = card.locator('.today-streak-day-square');
    await expect(daySquares).toHaveCount(7);

    const daysLabel = card.locator('.today-stat-subtext');
    const fontSize = await daysLabel.evaluate(el => getComputedStyle(el).fontSize);
    expect(Math.round(parseFloat(fontSize))).toBe(14);
  });

  test('delete-category task never appears', async ({ page }) => {
    const cards = page.locator('.focus-card');
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      await expect(cards.nth(i)).not.toContainText('Clean up unused dependencies');
    }
  });

  test('backlog count includes remaining uncompleted tasks', async ({ page }) => {
    // Seed has 8 tasks; 2 are completed (task-2, task-4). 6 are uncompleted.
    // 5 are displayed (task-6, task-1, task-3, task-5, task-7).
    // Remaining uncompleted task: task-8 (delete). Backlog is 6 - 5 = 1 → "+ 1 more in the backlog".
    const backlog = page.locator('.today-upnext-backlog-count');
    await expect(backlog).toContainText('+ 1 more in the backlog');
  });

  test('UP NEXT accent follows the Eisenhower category color', async ({ page }) => {
    const items = page.locator('.today-upnext-item');
    await expect(items).toHaveCount(4);
    const accentOf = (i: number) =>
      items.nth(i).evaluate(el => getComputedStyle(el).getPropertyValue('--today-accent').trim());
    // task-1 (do) → red, task-3 (decide) → amber, task-5 (decide) → amber, task-7 (delegate) → orange.
    expect(await accentOf(0)).toBe('#ef4444');
    expect(await accentOf(1)).toBe('#eab308');
    expect(await accentOf(2)).toBe('#eab308');
    expect(await accentOf(3)).toBe('#f97316');
  });

  test('UP NEXT subtitle reads "click to reorder"', async ({ page }) => {
    const subtitle = page.locator('.area-upnext .today-panel-subtitle');
    await expect(subtitle).toHaveText('click to reorder');
  });

  test('click-to-reorder: clicking 1st row then 2nd row swaps their positions', async ({ page }) => {
    const items = page.locator('.today-upnext-item');
    await expect(items).toHaveCount(4);
    // UP NEXT initial order: task-1, task-3, task-5, task-7
    await expect(items.nth(0)).toContainText('Design new dashboard layout');
    await expect(items.nth(1)).toContainText('Write API documentation');

    // Click 1st row (select), then click 2nd row (swap 1st and 2nd).
    await items.nth(0).click();
    await items.nth(1).click();

    // 1st row item moves to 2nd row and 2nd row item moves to 1st row.
    await expect(items.nth(0)).toContainText('Write API documentation');
    await expect(items.nth(1)).toContainText('Design new dashboard layout');
  });

  test('Replan reshuffles tasks tied on category + urgency + confidence', async ({ page }) => {
    // Fixture: 4 'decide' tasks, equal effort (same urgency), no KR (same
    // confidence). They're genuinely tied, so Replan must reshuffle their order.
    await page.evaluate(async () => {
      const anyWin = window as unknown as { __updateAutomergeDoc: (msg: string, fn: (d: unknown) => void) => Promise<void> };
      await anyWin.__updateAutomergeDoc('tied tasks', (doc) => {
        const d = doc as Record<string, unknown>;
        d.tasks = [
          ['AAA', '2026-05-20T01:00:00.000Z'],
          ['BBB', '2026-05-20T02:00:00.000Z'],
          ['CCC', '2026-05-20T03:00:00.000Z'],
          ['DDD', '2026-05-20T04:00:00.000Z'],
        ].map(([title, createdAt]) => ({
          id: `t-${title}`, title: `${title} tied task`, estimatedPomodoros: 2,
          completedPomodoros: 0, isCompleted: false, category: 'decide',
          createdAt, todos: [], comments: [],
        }));
        d.keyResults = [];
        d.objectives = [];
      });
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });

    const upNextTitles = () =>
      page.locator('.today-upnext-title').allTextContents();

    const initial = await upNextTitles();
    // 4 tied tasks → P(unchanged per Replan) ≈ 1/24; loop so this is robust.
    let changed = false;
    for (let i = 0; i < 5; i++) {
      await page.locator('.focus-plan-day-btn').click();
      await page.waitForTimeout(200);
      const next = await upNextTitles();
      if (JSON.stringify(next) !== JSON.stringify(initial)) { changed = true; break; }
    }
    expect(changed).toBe(true);
  });

  test('plan is stable across reloads', async ({ page }) => {
    const cards = page.locator('.focus-card');
    await expect(cards).toHaveCount(5);
    const firstTitle = await cards.nth(0).textContent();

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(cards).toHaveCount(5);
    expect(await cards.nth(0).textContent()).toBe(firstTitle);
  });

  test('top card shows KR confidence dot and link', async ({ page }) => {
    // task-6 linked to kr-2 (at_risk) under obj-1 "Ship myOKR v2.0"
    const topCard = page.locator('.focus-card').first();
    await expect(topCard).toContainText('Refactor auth module');
    await expect(topCard).toContainText('Achieve 90% test coverage');
    await expect(topCard).toContainText('At Risk');
  });

  test('Start focus button on top card jumps to Timer with task selected', async ({ page }) => {
    await page.locator('.focus-card .btn:has-text("Start focus")').click();

    await expect(page.locator('.timer-section')).toBeVisible();
    await expect(page.locator('.active-task-card')).toBeVisible();
    await expect(page.locator('.active-task-card')).toContainText('Refactor auth module');
  });

  test('Skip removes card, refills, and persists across reload', async ({ page }) => {
    const cards = page.locator('.focus-card');
    await expect(cards).toHaveCount(5);

    // Skip top card (task-6)
    await cards.nth(0).locator('button:has-text("Skip")').click();

    // After skip: task-1, task-3, task-5, task-7 fill the budget
    await expect(cards).toHaveCount(4);
    await expect(cards.nth(0)).toContainText('Design new dashboard layout');
    await expect(cards.nth(3)).toContainText('Update README screenshots');

    // Skip survives a reload — the daily plan is persisted
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(cards).toHaveCount(4);
    await expect(cards.nth(0)).toContainText('Design new dashboard layout');
    for (let i = 0; i < 4; i++) {
      await expect(cards.nth(i)).not.toContainText('Refactor auth module');
    }
  });

  test('Replan clears skips and recomputes from scratch', async ({ page }) => {
    const cards = page.locator('.focus-card');
    await cards.nth(0).locator('button:has-text("Skip")').click();
    await expect(cards.nth(0)).toContainText('Design new dashboard layout');

    await page.locator('.focus-plan-day-btn').click();

    // Skipped task-6 returns to the top
    await expect(cards.nth(0)).toContainText('Refactor auth module');
  });

  test('streak is focus-only — habit ticks on non-focus days do not inflate it', async ({ page }) => {
    // Fixture: focus today + yesterday only (focus streak = 2). A habit ticked
    // on days -2 and -3 would inflate a focus∪habits streak to 4. Today must
    // report the focus-only streak (2), matching Analytics.
    await page.evaluate(async () => {
      const day = (off: number) => {
        const x = new Date();
        x.setDate(x.getDate() + off);
        return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
      };
      const today = day(0), y1 = day(-1), y2 = day(-2), y3 = day(-3);
      const rec = (date: string, p: number) => ({
        date, completedPomodoros: p, totalFocusMinutes: p * 25, tasksCompleted: 0, sessions: [] as unknown[],
      });
      await (window as unknown as { __updateAutomergeDoc: (msg: string, fn: (d: unknown) => void) => Promise<void> })
        .__updateAutomergeDoc('streak fixture', (doc) => {
          const d = doc as Record<string, unknown>;
          d.history = [rec(today, 2), rec(y1, 1)];
          d.habits = [{
            id: 'h-streak', name: 'Read pages', status: 'want_to_form',
            ticks: [today, y1, y2, y3], order: 0, createdAt: today, updatedAt: today,
          }];
        });
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
    await page.locator('[title="Day plan"], [title="Today"]').first().click();
    await page.waitForTimeout(400);

    const streak = await page.locator('.today-streak-badge .today-stat-value').textContent();
    expect(streak?.trim()).toBe('2');
  });

  test('NOW card has no "Why this?" affordance (removed)', async ({ page }) => {
    const nowCard = page.locator('.today-now-card');
    await expect(nowCard.locator('button:has-text("Why this?")')).toHaveCount(0);
    await expect(nowCard.locator('.today-why-tooltip')).toHaveCount(0);
  });

  test('Skip button is text-only — no icon', async ({ page }) => {
    const skip = page.locator('.today-btn-skip');
    await expect(skip).toBeVisible();
    await expect(skip).toContainText('Skip');
    await expect(skip.locator('svg')).toHaveCount(0);
  });

  test('header plan button reads "Plan day"', async ({ page }) => {
    await expect(page.locator('.focus-plan-day-btn')).toContainText('Plan day');
  });

  test('NOW title wraps instead of clipping for long titles at wide widths', async ({ page }) => {
    // Long title on the top task (task-6). At the default 1280px viewport the
    // NOW column is wide enough — the title must wrap, not clip horizontally.
    await page.evaluate(async () => {
      const anyWin = window as unknown as { __updateAutomergeDoc: (msg: string, fn: (d: unknown) => void) => Promise<void> };
      await anyWin.__updateAutomergeDoc('long now title', (doc) => {
        const d = doc as { tasks: Array<{ id: string; title?: string }> };
        const t = d.tasks.find(x => x.id === 'task-6');
        if (t) t.title = 'Refactor the authentication module to support OAuth2, refresh tokens, and session management with proper error handling';
      });
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });

    const overflow = await page.evaluate(() => {
      const title = document.querySelector('.today-now-title') as HTMLElement | null;
      if (!title) return null;
      return { scrollW: title.scrollWidth, clientW: title.clientWidth };
    });
    expect(overflow, '.today-now-title present').not.toBeNull();
    expect(overflow!.scrollW).toBeLessThanOrEqual(overflow!.clientW + 1);
  });
});
