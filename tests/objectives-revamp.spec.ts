import { test, expect, type Page } from '@playwright/test';

/**
 * Objectives tab (R3) revamp — pace marker, derived pace status (ADR-0020),
 * selection-driven trajectory, why-it-is-behind, cycle roll-up, diagnostic
 * callout, cycle-only picker, keyboard roving, past/empty cycles.
 *
 * The clock is fixed at 2026-09-12 (a Saturday, mid-cycle). September 2026's
 * exclusive Mondays are [Aug 31, Sep 7, 14, 21] — the Sep 28 week opens
 * October — with the cycle closing Sun Sep 27: span = 27 days, elapsed = 12
 * → the pace marker is exactly 44%. On pace ≥ 39 · Behind [24, 39) ·
 * At risk < 24 at that marker.
 */

const NOW = new Date('2026-09-12T12:00:00.000Z');
const SEP_MONDAYS = ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21'];
const MAY_MONDAYS = ['2026-04-27', '2026-05-04', '2026-05-11', '2026-05-18'];

async function openObjectives(page: Page) {
  // The sidebar has two "Objectives" items (Plan + Progress groups), so land
  // on Focus analytics (unique title) first, then use the tab strip.
  const item = page.locator('button[title="Focus analytics"]').first();
  if (!(await item.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Progress', exact: true }).click();
  }
  await item.click();
  await page.locator('.progress-tab-strip .plan-tab:has-text("Objectives")').click();
  await page.waitForTimeout(300);
}

async function openMayCycle(page: Page) {
  await page.locator('.obj-cycle-picker .sel-trigger').click();
  await page.locator('.sel-panel .sel-row', { hasText: 'May cycle' }).click();
  await page.waitForTimeout(200);
}

test.describe('Objectives tab (R3) revamp', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });

    await page.evaluate(async ({ sepMondays, mayMondays }) => {
      const okr = await import('/src/lib/okr-storage.ts');
      const pomo = await import('/src/lib/pomodoro-storage.ts');

      await okr.saveCycles([
        { id: 'c-may', name: 'May 2026', month: 4, year: 2026, isActive: false, createdAt: '2026-04-01T00:00:00.000Z' },
        { id: 'c-jun', name: 'June 2026', month: 5, year: 2026, isActive: false, createdAt: '2026-05-01T00:00:00.000Z' },
        { id: 'c-sep', name: 'September 2026', month: 8, year: 2026, isActive: true, createdAt: '2026-08-01T00:00:00.000Z' },
      ]);

      await okr.saveObjectives([
        { id: 'o-a', cycleId: 'c-sep', title: 'On pace objective', order: 0, createdAt: '2026-08-01T00:00:00.000Z' },
        { id: 'o-b', cycleId: 'c-sep', title: 'Behind objective', order: 1, createdAt: '2026-08-01T00:00:00.000Z' },
        { id: 'o-c', cycleId: 'c-sep', title: 'At risk objective', order: 2, createdAt: '2026-08-01T00:00:00.000Z' },
        { id: 'o-d', cycleId: 'c-sep', title: 'Zero objective', order: 3, createdAt: '2026-08-01T00:00:00.000Z' },
        { id: 'o-e', cycleId: 'c-sep', title: 'Catching up objective', order: 4, createdAt: '2026-08-01T00:00:00.000Z' },
        { id: 'o-f', cycleId: 'c-sep', title: 'Ahead objective', order: 5, createdAt: '2026-08-01T00:00:00.000Z' },
        { id: 'o-may', cycleId: 'c-may', title: 'May focus objective', order: 0, createdAt: '2026-04-01T00:00:00.000Z' },
      ]);

      await okr.saveKeyResults([
        // 42% · 30% · 5% · 0% · 33% · 55% at a 44% marker → On pace / Behind /
        // At risk / zero-grey / Behind / Ahead of pace. kr-e is the
        // fast-late case: its actual rate meets the needed rate, yet the
        // Actual-average row still wears amber.
        { id: 'kr-a', objectiveId: 'o-a', title: 'KR alpha', targetValue: 100, currentValue: 42, unit: 'items', completionMode: 'manual', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
        { id: 'kr-b', objectiveId: 'o-b', title: 'KR beta', targetValue: 50, currentValue: 15, unit: 'items', completionMode: 'manual', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
        { id: 'kr-c', objectiveId: 'o-c', title: 'KR gamma', targetValue: 20, currentValue: 1, unit: 'items', completionMode: 'manual', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
        { id: 'kr-d', objectiveId: 'o-d', title: 'KR delta', targetValue: 10, currentValue: 0, unit: 'items', completionMode: 'manual', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
        { id: 'kr-e', objectiveId: 'o-e', title: 'KR epsilon', targetValue: 12, currentValue: 0, unit: 'pomodoros', completionMode: 'focus_pomodoros', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
        { id: 'kr-f', objectiveId: 'o-f', title: 'KR zeta', targetValue: 20, currentValue: 11, unit: 'items', completionMode: 'manual', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
        // Past-cycle derived KR: focus pomodoros fed by sessions in May weeks 2 and 4.
        { id: 'kr-focus', objectiveId: 'o-may', title: 'Log focus sessions', targetValue: 10, currentValue: 0, unit: 'pomodoros', completionMode: 'focus_pomodoros', createdAt: '2026-04-01T00:00:00.000Z', updatedAt: '2026-04-01T00:00:00.000Z' },
      ]);

      await pomo.saveTasks([
        { id: 't-focus', title: 'Deep focus', keyResultId: 'kr-focus', completedPomodoros: 5, estimatedPomodoros: 10, isCompleted: false, createdAt: '2026-04-01T00:00:00.000Z' },
        { id: 't-catch', title: 'Catch-up task', keyResultId: 'kr-e', completedPomodoros: 4, estimatedPomodoros: 8, isCompleted: false, createdAt: '2026-08-01T00:00:00.000Z' },
      ]);

      const sessionsOn = (date: string, n: number, taskId?: string) =>
        Array.from({ length: n }, (_, i) => ({
          startedAt: `${date}T0${9 + i}:00:00.000Z`, endedAt: `${date}T0${9 + i}:25:00.000Z`,
          type: 'focus', taskId, completed: true,
        }));

      // May weeks 2 and 4 — a deliberate gap at weeks 1 and 3.
      await pomo.saveHistory([
        { date: mayMondays[1], completedPomodoros: 2, totalFocusMinutes: 50, tasksCompleted: 0, sessions: sessionsOn(mayMondays[1], 2, 't-focus') },
        { date: mayMondays[3], completedPomodoros: 3, totalFocusMinutes: 75, tasksCompleted: 0, sessions: sessionsOn(mayMondays[3], 3, 't-focus') },
        // Unlinked sessions (no task) in September's finished week 1 → the why note.
        { date: '2026-09-02', completedPomodoros: 3, totalFocusMinutes: 75, tasksCompleted: 0, sessions: sessionsOn('2026-09-02', 3) },
        // kr-e's week-1 burst: 4 sessions on the catch-up task (Mon Aug 31).
        { date: sepMondays[0], completedPomodoros: 4, totalFocusMinutes: 100, tasksCompleted: 0, sessions: sessionsOn(sepMondays[0], 4, 't-catch') },
      ] as any);

      // Manual KR history comes from completed reviews only — a week-1
      // completed review pins kr-d at 0; the week-2 draft must never chart.
      const endOf = (weekStart: string) =>
        new Date(Date.parse(`${weekStart}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
      const mk = (id: string, weekStart: string, completed: boolean, value: number) => ({
        id, weekStartDate: weekStart, weekEndDate: endOf(weekStart),
        cycleId: 'c-sep',
        ...(completed ? { completedAt: `${weekStart}T20:00:00.000Z` } : {}),
        entries: [{ keyResultId: 'kr-d', previousValue: 0, currentValue: value, confidence: 'on_track' }],
        pomodoroStats: { totalPomodoros: 0, totalFocusMinutes: 0, tasksCompleted: 0, pomodorosByKeyResult: {} },
      });
      await okr.saveReviews([
        mk('rev-done', sepMondays[0], true, 0),
        mk('rev-draft', sepMondays[1], false, 2),
      ] as any);

      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    }, { sepMondays: SEP_MONDAYS, mayMondays: MAY_MONDAYS });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.app-sidebar')).toBeVisible();
    await openObjectives(page);
  });

  test('shell: cycle h1, cycle-only picker (no week options), pace marker meta', async ({ page }) => {
    const shell = page.locator('.progress-shell');
    await expect(shell.locator('.tasks-title')).toHaveText('PROGRESS');
    // Default-named cycles read "{Month} cycle" (the design format) —
    // header, picker, everywhere one label rule.
    await expect(shell.locator('.plan-header-title')).toHaveText('September cycle');

    // The picker reads the cycle name only — no week option, no "all weeks".
    await expect(page.locator('.obj-cycle-picker .sel-trigger')).toHaveText(/September cycle/);
    await page.locator('.obj-cycle-picker .sel-trigger').click();
    await expect(page.locator('.sel-panel .sel-row')).toHaveCount(3);
    for (const row of await page.locator('.sel-panel .sel-row').all()) {
      await expect(row).not.toContainText(/week \d/);
      await expect(row).not.toContainText('all weeks');
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('.obj-cycle-picker .sel-trigger')).toBeFocused();

    // One selector per tab: analytics keeps the week filter.
    await page.locator('.progress-tab-strip .plan-tab:has-text("Focus analytics")').click();
    await expect(shell.locator('.progress-week-select')).toBeVisible();

    await openObjectives(page);
    await expect(shell.locator('.obj-pace-meta')).toContainText('pace marker at 44%');
  });

  test('frame: R3 padding on the Objectives tab; sibling tabs keep the shared shell', async ({ page }) => {
    const inner = page.locator('.progress-shell-inner');
    // The spec's main column: padding 28px 32px, 18px rhythm.
    await expect(inner).toHaveCSS('padding-top', '28px');
    await expect(inner).toHaveCSS('padding-left', '32px');
    await expect(inner).toHaveCSS('row-gap', '18px');
    // In-board literals: rows, cards, panels.
    await expect(page.locator('.obj-row').first()).toHaveCSS('padding', '13px 15px');
    await expect(page.locator('.obj-kr-row').first()).toHaveCSS('padding', '9px 15px 9px 47px');
    await expect(page.locator('.obj-trajectory')).toHaveCSS('padding', '16px 18px');
    await expect(page.locator('.obj-rollup')).toHaveCSS('padding', '14px 16px');
    await expect(page.locator('.obj-cards')).toHaveCSS('row-gap', '9px');
    await expect(page.locator('.obj-right')).toHaveCSS('column-gap', '11px');

    // The KR bar shares the objective bar's column: the last two grid tracks
    // (bar + reserved pill column) must be identical, so ticks line up.
    const lastTracks = (sel: string) =>
      page.locator(sel).first().evaluate(el =>
        getComputedStyle(el).gridTemplateColumns.split(' ').slice(-2).join(' '));
    expect(await lastTracks('.obj-kr-row')).toBe(await lastTracks('.obj-row'));

    // The other tabs keep the shared 20px shell (padding parity).
    await page.locator('.progress-tab-strip .plan-tab:has-text("Focus analytics")').click();
    await expect(inner).toHaveCSS('padding-top', '20px');
    await expect(inner).toHaveCSS('row-gap', '20px');
  });

  test('shell restyle actually applies (regression: --obj-* token scope)', async ({ page }) => {
    // The --obj-* palette once lived on .obj-board while these rules target
    // the header/tab strip — SIBLINGS of the board — so every var() was
    // invalid at computed-value time and the restyle silently no-oped.
    // Assert the documented literals as computed colors.
    await expect(page.locator('.progress-header .tasks-title')).toHaveCSS('color', 'rgb(90, 100, 116)');
    await expect(page.locator('.progress-header .plan-header-title')).toHaveCSS('color', 'rgb(237, 240, 245)');
    const inactiveTab = page.locator('.progress-tab-strip .plan-tab:not(.active)').first();
    await expect(inactiveTab).toHaveCSS('color', 'rgb(114, 124, 140)');
    await expect(page.locator('.progress-tab-strip')).toHaveCSS('border-bottom-color', 'rgba(255, 255, 255, 0.07)');
  });

  test('trajectory draws the four spec gridlines at y 8/48/88/128', async ({ page }) => {
    // Default selection (KR delta) renders the chart; the gridlines are the
    // spec's literal pixel-even rules, not percent-even spacing.
    const ys = await page.locator('.obj-tj-grid').evaluateAll(els =>
      els.map(el => el.getAttribute('y1')));
    expect(ys).toEqual(['8', '48', '88', '128']);
    // 0% sits on the last gridline; the baseline is its own rule below.
    await expect(page.locator('.obj-tj-baseline')).toHaveAttribute('y1', '145');
  });

  test('sibling tabs keep the shared shell — the R3 restyle does not leak', async ({ page }) => {
    // Round-1 scope decision: Focus analytics and Weekly review stay as-is.
    // The restyle rules match .progress-header/.progress-tab-strip on EVERY
    // Progress tab, so they must be scoped under the --r3 modifier — else
    // the colors fall through to inherited values and the literal eyebrow/
    // tab metrics apply group-wide.
    await page.locator('.progress-tab-strip .plan-tab:has-text("Focus analytics")').click();
    await expect(page.locator('.progress-header .tasks-title')).toHaveCSS('color', 'rgb(113, 113, 122)');
    await expect(page.locator('.progress-header .tasks-title')).toHaveCSS('font-size', '10.4px');
    const inactive = page.locator('.progress-tab-strip .plan-tab:not(.active)').first();
    await expect(inactive).toHaveCSS('color', 'rgb(113, 113, 122)');

    // …while the Objectives tab keeps the R3 restyle.
    await openObjectives(page);
    await expect(page.locator('.progress-header .tasks-title')).toHaveCSS('color', 'rgb(90, 100, 116)');
  });

  test('pace marker sits at the same percent on every bar', async ({ page }) => {
    for (const track of await page.locator('.obj-bar-track').all()) {
      await expect(track.locator('.obj-pace-tick')).toHaveAttribute('style', /left: 44%/);
    }
    for (const track of await page.locator('.obj-kr-bar-track').all()) {
      await expect(track.locator('.obj-pace-tick')).toHaveAttribute('style', /left: 44%/);
    }
    await expect(page.locator('.obj-rollup-track .obj-pace-tick')).toHaveAttribute('style', /left: 44%/);
  });

  test('pace status is derived: Ahead / On pace / Behind / At risk, and zero renders grey', async ({ page }) => {
    const pillOf = (title: string) =>
      page.locator('.obj-card', { hasText: title }).locator('.obj-row .obj-pill');

    await expect(pillOf('Ahead objective')).toHaveText('Ahead of pace');
    await expect(pillOf('On pace objective')).toHaveText('On pace');
    await expect(pillOf('Behind objective')).toHaveText('Behind pace');
    await expect(pillOf('At risk objective')).toHaveText('At risk');

    // 0%: grey bar + grey percent, derived label kept, grey pill hue.
    const zeroRow = page.locator('.obj-card', { hasText: 'Zero objective' }).locator('.obj-row');
    await expect(zeroRow.locator('.obj-bar-fill')).toHaveClass(/zero/);
    await expect(zeroRow.locator('.obj-percent')).toHaveText('0%');
    await expect(zeroRow.locator('.obj-percent')).toHaveClass(/zero/);
    await expect(zeroRow.locator('.obj-pill')).toHaveText('At risk');
    await expect(zeroRow.locator('.obj-pill')).toHaveClass(/zero/);

    // Vocabulary guard: Confidence's words never leak into pace pills.
    for (const pill of await page.locator('.obj-pill').all()) {
      await expect(pill).not.toHaveText(/On Track|Off Track/);
    }
  });

  test('cycle roll-up: unweighted mean, caption, points-behind footer', async ({ page }) => {
    // round((42 + 30 + 5 + 0 + 33 + 55) / 6) = 28; marker 44 − 28 = 16 behind.
    await expect(page.locator('.obj-rollup-number')).toHaveText(/^28%/);
    await expect(page.locator('.obj-rollup-caption')).toHaveText('across 6 objectives, 6 key results');
    await expect(page.locator('.obj-rollup-footer')).toHaveText('16 points behind the pace marker');
  });

  test('default selection is the worst-off KR with its objective expanded', async ({ page }) => {
    // Lowest projected landing: Zero objective's KR delta (landing 0).
    await expect(page.locator('.obj-card', { hasText: 'Zero objective' })).toHaveClass(/expanded/);
    await expect(page.locator('.obj-kr-row.selected .obj-kr-name')).toHaveText('KR delta');
    await expect(page.locator('.obj-trajectory-title')).toHaveText('KR delta');
    await expect(page.locator('.obj-trajectory-sub')).toHaveText('Selected key result · Zero objective');
    // kr-d has one completed review (value 0) → exactly one point; the draft adds none.
    await expect(page.locator('.obj-tj-dot')).toHaveCount(1);
  });

  test('clicking an objective expands and selects it; only one stays expanded', async ({ page }) => {
    await page.locator('.obj-card', { hasText: 'Behind objective' }).locator('.obj-row').click();
    await expect(page.locator('.obj-card', { hasText: 'Behind objective' })).toHaveClass(/expanded/);
    await expect(page.locator('.obj-card', { hasText: 'Zero objective' })).not.toHaveClass(/expanded/);
    await expect(page.locator('.obj-trajectory-sub')).toHaveText('Rolled-up objective · Behind objective');
    await expect(page.locator('.obj-kr-row')).toHaveCount(1); // only KR beta visible
  });

  test('clicking a key result selects it and drives the trajectory', async ({ page }) => {
    await page.locator('.obj-card', { hasText: 'Behind objective' }).locator('.obj-row').click();
    await page.locator('.obj-kr-row', { hasText: 'KR beta' }).click();
    await expect(page.locator('.obj-kr-row.selected .obj-kr-name')).toHaveText('KR beta');
    await expect(page.locator('.obj-trajectory-title')).toHaveText('KR beta');
    // 15/50 → 30% bar cell values.
    await expect(page.locator('.obj-kr-row.selected .obj-kr-value')).toHaveText('15 / 50');
    await expect(page.locator('.obj-kr-row.selected .obj-kr-percent')).toHaveText('30%');
  });

  test('pace card: rows derive from the week math; the label switches with status', async ({ page }) => {
    // Default selection (kr-d, At risk → WHY IT IS BEHIND). Formulas:
    // needed = 10 ÷ 4 weeks = 3 (rounded); actual = 0 ÷ elapsed weeks = 0;
    // to finish = ceil(10 ÷ 3 remaining) = "4 / week". Unlinked note: 3.
    await expect(page.locator('.obj-why')).toBeVisible();
    const why = page.locator('.obj-why');
    await expect(why.locator('.obj-panel-eyebrow')).toHaveText('WHY IT IS BEHIND');
    await expect(why.locator('.obj-why-row').nth(0).locator('.obj-why-value')).toHaveText('3');
    await expect(why.locator('.obj-why-row').nth(1).locator('.obj-why-value')).toHaveText('0');
    await expect(why.locator('.obj-why-row').nth(1).locator('.obj-why-value')).toHaveClass(/amber/);
    await expect(why.locator('.obj-why-row').nth(2).locator('.obj-why-value')).toHaveText('4 / week');
    await expect(why.locator('.obj-why-note')).toHaveText(
      "3 of last week's sessions were unlinked. Linking them would close most of this gap.",
    );

    // An on-pace selection keeps the card — same rows, PACE CHECK label.
    // kr-a: needed = 100 ÷ 4 = 25; actual = round(42 / 1.714) = 25;
    // to finish = ceil(58 ÷ 3) = "20 / week".
    await page.locator('.obj-card', { hasText: 'On pace objective' }).locator('.obj-row').click();
    await expect(why.locator('.obj-panel-eyebrow')).toHaveText('PACE CHECK');
    // Objective selection works in percentage points.
    await expect(why.locator('.obj-why-row').nth(0).locator('.obj-why-value')).toHaveText('25 pts');
    await expect(why.locator('.obj-why-row').nth(1).locator('.obj-why-value')).toHaveText('25 pts');
    await expect(why.locator('.obj-why-row').nth(2).locator('.obj-why-value')).toHaveText('20 pts / week');
  });

  test('fills and pill tints carry the status hue (regression: class mismatch)', async ({ page }) => {
    // The status classes and CSS selectors once disagreed (on_pace vs
    // on-pace) and every fill/tint rendered grey while all text tests
    // stayed green — assert the computed colors themselves.
    const fillOf = (title: string) =>
      page.locator('.obj-card', { hasText: title }).locator('.obj-row .obj-bar-fill');
    await expect(fillOf('Ahead objective')).toHaveCSS('background-color', 'rgb(52, 211, 153)');
    await expect(fillOf('On pace objective')).toHaveCSS('background-color', 'rgb(52, 211, 153)');
    await expect(fillOf('Behind objective')).toHaveCSS('background-color', 'rgb(245, 165, 36)');
    await expect(fillOf('At risk objective')).toHaveCSS('background-color', 'rgb(248, 113, 113)');
    await expect(page.locator('.obj-rollup-fill')).toHaveCSS('background-color', 'rgb(34, 211, 238)');

    // Pill: hue-matched text over a 12% tint of the same emerald.
    const pill = page.locator('.obj-card', { hasText: 'Ahead objective' }).locator('.obj-pill');
    await expect(pill).toHaveCSS('color', 'rgb(110, 231, 183)');
    await expect(pill).toHaveCSS('background-color', /0\.905882/);

    // KR bar: cyan while not behind (the ahead objective's KR), amber behind.
    await page.locator('.obj-card', { hasText: 'Ahead objective' }).locator('.obj-row').click();
    await expect(page.locator('.obj-kr-row .obj-kr-bar-fill').first()).toHaveCSS('background-color', 'rgb(34, 211, 238)');
    await page.locator('.obj-card', { hasText: 'Behind objective' }).locator('.obj-row').click();
    await expect(page.locator('.obj-kr-row .obj-kr-bar-fill').first()).toHaveCSS('background-color', 'rgb(245, 165, 36)');
  });

  test('why card: "Actual average" wears amber even when the recent rate meets the needed rate', async ({ page }) => {
    // kr-e: 4 of 12 pomodoros in week 1 → 33% (Behind pace at the 44%
    // marker), but its actual average (4/wk) equals the needed rate (4/wk).
    // Spec colours the row's value #F5A524 unconditionally — it is not a
    // conditional health verdict like the pills.
    await page.locator('.obj-card', { hasText: 'Catching up objective' }).locator('.obj-row').click();
    await page.locator('.obj-kr-row', { hasText: 'KR epsilon' }).click();

    const why = page.locator('.obj-why');
    await expect(why).toBeVisible();
    await expect(why.locator('.obj-panel-eyebrow')).toHaveText('WHY IT IS BEHIND');
    // needed = 12 ÷ 4 weeks = 3; actual = round(4 ÷ 1.714 elapsed weeks) = 2;
    // to finish = ceil(8 ÷ 3 remaining) = "3 / week".
    await expect(why.locator('.obj-why-row').nth(0).locator('.obj-why-value')).toHaveText('3');
    await expect(why.locator('.obj-why-row').nth(1).locator('.obj-why-value')).toHaveText('2');
    await expect(why.locator('.obj-why-row').nth(1).locator('.obj-why-value')).toHaveClass(/amber/);
    await expect(why.locator('.obj-why-row').nth(2).locator('.obj-why-value')).toHaveText('3 / week');

    // The projection extends the last data point — plotted on its W1 tick
    // (x 30, 33⅓% → y 88) — at the current rate to cycle close (75.76% →
    // y 37.1).
    await expect(page.locator('.obj-tj-proj')).toHaveAttribute('d', 'M30.0,88.0 L370,37.1');
  });

  test('the final Sunday counts as closed: marker 100, no why card, no projection', async ({ page }) => {
    // Sun 2026-09-27 is the cycle's closed date — the last day still inside
    // it. Marker and closed-ness must agree (100% ⇒ closed): nothing is
    // actionable on the last day, so the why card and projection stay gone.
    await page.clock.setFixedTime(new Date('2026-09-27T12:00:00.000Z'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openObjectives(page);

    await expect(page.locator('.obj-pace-meta')).toContainText('pace marker at 100%');
    await expect(page.locator('.obj-why')).toHaveCount(0);
    await expect(page.locator('.obj-tj-proj')).toHaveCount(0);
    // Roll-up footer reads against the pinned marker: 100 − 28 = 72 behind.
    await expect(page.locator('.obj-rollup-footer')).toHaveText('72 points behind the pace marker');
  });

  test('the callout hides when every objective is Ahead, not just On pace', async ({ page }) => {
    // The hide rule is "every objective Ahead/On pace" — the four-state
    // amendment must propagate to the hide condition, not just the labels.
    await page.evaluate(async () => {
      const okr = await import('/src/lib/okr-storage.ts');
      const doc = await (window as any).__getAutomergeDoc();
      await okr.saveKeyResults((doc.keyResults as any[]).map(kr => ({
        ...kr,
        // Every KR at 80% against the 44% marker → every objective ahead.
        targetValue: 100, currentValue: 80, completionMode: 'manual',
      })) as any);
      // Manual KRs read their latest completed review over currentValue —
      // clear them so the 80% seed is what renders.
      await okr.saveReviews([]);
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openObjectives(page);

    await expect(page.locator('.obj-pill').first()).toHaveText('Ahead of pace');
    await expect(page.locator('.obj-callout')).toHaveCount(0);
  });

  test('diagnostic callout names the single worst objective once', async ({ page }) => {
    const callout = page.locator('.obj-callout');
    await expect(callout).toHaveCount(1);
    // Zero-progress special case: projecting zero from zero says nothing.
    await expect(callout).toContainText('Zero objective has not moved in 44% of the cycle.');
  });

  test('past cycles render identically: marker at 100%, no projection, gap breaks the line', async ({ page }) => {
    await openMayCycle(page);

    await expect(page.locator('.plan-header-title')).toHaveText('May cycle');
    await expect(page.locator('.obj-pace-meta')).toContainText('pace marker at 100%');

    // Default selection: the focus KR (5/10 → 50%, landing = progress when closed).
    await expect(page.locator('.obj-trajectory-title')).toHaveText('Log focus sessions');
    // Weeks 2 and 4 have data, weeks 1 and 3 do not → two broken segments.
    await expect(page.locator('.obj-tj-dot')).toHaveCount(2);
    await expect(page.locator('.obj-tj-actual')).toHaveCount(2);
    await expect(page.locator('.obj-tj-proj')).toHaveCount(0);

    // Roll-up against the closed marker: round(50/1) = 50 → 50 points behind.
    await expect(page.locator('.obj-rollup-number')).toHaveText(/^50%/);
    await expect(page.locator('.obj-rollup-footer')).toHaveText('50 points behind the pace marker');

    // A closed cycle has nothing left to act on — no why card.
    await expect(page.locator('.obj-why')).toHaveCount(0);
  });

  test('keyboard: arrows move/expand/collapse rows, Enter selects', async ({ page }) => {
    const rows = page.locator('[data-row-idx]');
    await rows.first().focus();
    await expect(rows.nth(0)).toBeFocused();

    await page.keyboard.press('ArrowDown');
    await expect(rows.nth(1)).toBeFocused(); // Behind objective row

    // → expands the focused objective (and collapses the default-expanded one).
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.obj-card', { hasText: 'Behind objective' })).toHaveClass(/expanded/);
    await expect(page.locator('.obj-card', { hasText: 'Zero objective' })).not.toHaveClass(/expanded/);
    await expect(rows.nth(1)).toBeFocused();

    // ↓ into the revealed KR row; Enter selects it (drives the trajectory).
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.obj-kr-row', { hasText: 'KR beta' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.obj-trajectory-title')).toHaveText('KR beta');
    await expect(page.locator('.obj-kr-row.selected .obj-kr-name')).toHaveText('KR beta');

    // Back to the objective row; ← collapses it.
    await page.keyboard.press('ArrowUp');
    await expect(rows.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.obj-card', { hasText: 'Behind objective' })).not.toHaveClass(/expanded/);
  });

  test('deleting the picked cycle re-syncs the picker to the active cycle', async ({ page }) => {
    // Pick June, then delete it out from under the picker (the sync event
    // reloads cycles). The picker must fall back to the active cycle — and
    // stay in sync with the header, not render a stale/blank selection.
    await page.locator('.obj-cycle-picker .sel-trigger').click();
    await page.locator('.sel-panel .sel-row', { hasText: 'June cycle' }).click();
    await expect(page.locator('.plan-header-title')).toHaveText('June cycle');

    await page.evaluate(async () => {
      const okr = await import('/src/lib/okr-storage.ts');
      const doc = await (window as any).__getAutomergeDoc();
      await okr.saveCycles((doc.cycles as any[]).filter(c => c.id !== 'c-jun'));
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });
    // toHaveText retries — the picker re-renders when the sync reload lands.

    await expect(page.locator('.obj-cycle-picker .sel-trigger')).toHaveText(/September cycle/);
    await expect(page.locator('.plan-header-title')).toHaveText('September cycle');
    await expect(page.locator('.obj-card').first()).toBeVisible();
  });

  test('switching cycles keeps exactly one tabbable row (roving tabIndex)', async ({ page }) => {
    // The roving index rides focus events — but a cycle switch shrinks the
    // row set without any row focus (the picker is not a row). A deep KR
    // index must clamp so Tab can always re-enter the list.
    await page.locator('.obj-card', { hasText: 'Behind objective' }).locator('.obj-row').click();
    const krRow = page.locator('.obj-kr-row', { hasText: 'KR beta' });
    await krRow.focus();
    await expect(krRow).toBeFocused();

    await openMayCycle(page); // May: 1 objective, 1 KR — far fewer rows

    const tabbable = page.locator('[data-row-idx][tabindex="0"]');
    await expect(tabbable).toHaveCount(1);
  });

  test('the analytics column re-stacks as a real multi-column grid at 1000px', async ({ page }) => {
    // Regression: `minmax(280px, minmax(0, 1fr))` is invalid CSS (a minmax
    // cannot nest), so the whole declaration dropped and .obj-right fell
    // back to one implicit column at the ≤1100px tier.
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.waitForTimeout(200);
    const cols = await page.locator('.obj-right').evaluate(el => getComputedStyle(el).gridTemplateColumns);
    expect(cols).not.toBe('none');
    expect(cols.split(' ').length).toBeGreaterThanOrEqual(2);
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test('a cycle with no objectives offers the Plan-group way out', async ({ page }) => {
    await page.locator('.obj-cycle-picker .sel-trigger').click();
    await page.locator('.sel-panel .sel-row', { hasText: 'June cycle' }).click();
    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.locator('.empty-state')).toContainText('No objectives in this cycle');
    // The header still titles the picked cycle.
    await expect(page.locator('.plan-header-title')).toHaveText('June cycle');
  });
});
