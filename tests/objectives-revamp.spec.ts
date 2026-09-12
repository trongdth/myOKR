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
  await page.locator('.sel-panel .sel-row', { hasText: 'May 2026' }).click();
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
        { id: 'o-may', cycleId: 'c-may', title: 'May focus objective', order: 0, createdAt: '2026-04-01T00:00:00.000Z' },
      ]);

      await okr.saveKeyResults([
        // 40% · 30% · 5% · 0% · 33% at a 44% marker → On pace / Behind / At
        // risk / zero-grey / Behind. kr-e is the fast-late case: 4/wk actual
        // meets the needed 4/wk, yet "Actual average" still wears amber.
        { id: 'kr-a', objectiveId: 'o-a', title: 'KR alpha', targetValue: 10, currentValue: 4, unit: 'items', completionMode: 'manual', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
        { id: 'kr-b', objectiveId: 'o-b', title: 'KR beta', targetValue: 50, currentValue: 15, unit: 'items', completionMode: 'manual', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
        { id: 'kr-c', objectiveId: 'o-c', title: 'KR gamma', targetValue: 20, currentValue: 1, unit: 'items', completionMode: 'manual', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
        { id: 'kr-d', objectiveId: 'o-d', title: 'KR delta', targetValue: 10, currentValue: 0, unit: 'items', completionMode: 'manual', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
        { id: 'kr-e', objectiveId: 'o-e', title: 'KR epsilon', targetValue: 12, currentValue: 0, unit: 'pomodoros', completionMode: 'focus_pomodoros', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
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
    await expect(shell.locator('.plan-header-title')).toHaveText('September 2026');

    // The picker reads the cycle name only — no week option, no "all weeks".
    await expect(page.locator('.obj-cycle-picker .sel-trigger')).toHaveText(/September 2026/);
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

    // The other tabs keep the shared 20px shell (padding parity).
    await page.locator('.progress-tab-strip .plan-tab:has-text("Focus analytics")').click();
    await expect(inner).toHaveCSS('padding-top', '20px');
    await expect(inner).toHaveCSS('row-gap', '20px');
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

  test('pace status is derived: On pace / Behind pace / At risk, and zero renders grey', async ({ page }) => {
    const pillOf = (title: string) =>
      page.locator('.obj-card', { hasText: title }).locator('.obj-row .obj-pill');

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
    // round((40 + 30 + 5 + 0 + 33) / 5) = 22; marker 44 − 22 = 22 points behind.
    await expect(page.locator('.obj-rollup-number')).toHaveText(/^22%/);
    await expect(page.locator('.obj-rollup-caption')).toHaveText('across 5 objectives, 5 key results');
    await expect(page.locator('.obj-rollup-footer')).toHaveText('22 points behind the pace marker');
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

  test('why-it-is-behind: rows, note, hidden when on pace or closed', async ({ page }) => {
    // Default selection (kr-d, at risk): needed = ceil(10/2 remaining) = 5,
    // actual = 0, two weeks remain → "5 / week". Unlinked note: 3 sessions.
    await expect(page.locator('.obj-why')).toBeVisible();
    const why = page.locator('.obj-why');
    await expect(why.locator('.obj-why-row').nth(0).locator('.obj-why-value')).toHaveText('5');
    await expect(why.locator('.obj-why-row').nth(1).locator('.obj-why-value')).toHaveText('0');
    await expect(why.locator('.obj-why-row').nth(1).locator('.obj-why-value')).toHaveClass(/amber/);
    await expect(why.locator('.obj-why-row').nth(2).locator('.obj-why-value')).toHaveText('5 / week');
    await expect(why.locator('.obj-why-note')).toHaveText(
      "3 of last week's sessions were unlinked. Linking them would close most of this gap.",
    );

    // On-pace selection hides the card entirely.
    await page.locator('.obj-card', { hasText: 'On pace objective' }).locator('.obj-row').click();
    await expect(page.locator('.obj-why')).toHaveCount(0);
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
    await expect(why.locator('.obj-why-row').nth(0).locator('.obj-why-value')).toHaveText('4');
    await expect(why.locator('.obj-why-row').nth(1).locator('.obj-why-value')).toHaveText('4');
    await expect(why.locator('.obj-why-row').nth(1).locator('.obj-why-value')).toHaveClass(/amber/);
    await expect(why.locator('.obj-why-row').nth(2).locator('.obj-why-value')).toHaveText('4 / week');

    // The projection extends the last data point (33⅓% at week-1 Sunday,
    // x = 30 + 6/27·340) at the current rate to cycle close (75.76% → y 27.4)
    // — the same landing the callout math quotes.
    await expect(page.locator('.obj-tj-proj')).toHaveAttribute('d', 'M105.6,61.3 L370,27.4');
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
    // Roll-up footer reads against the pinned marker: 100 − 22 = 78 behind.
    await expect(page.locator('.obj-rollup-footer')).toHaveText('78 points behind the pace marker');
  });

  test('diagnostic callout names the single worst objective once', async ({ page }) => {
    const callout = page.locator('.obj-callout');
    await expect(callout).toHaveCount(1);
    await expect(callout).toContainText('Zero objective has moved 0% in 44% of the cycle. At this rate it lands at 0%.');
  });

  test('past cycles render identically: marker at 100%, no projection, gap breaks the line', async ({ page }) => {
    await openMayCycle(page);

    await expect(page.locator('.plan-header-title')).toHaveText('May 2026');
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

  test('a cycle with no objectives offers the Plan-group way out', async ({ page }) => {
    await page.locator('.obj-cycle-picker .sel-trigger').click();
    await page.locator('.sel-panel .sel-row', { hasText: 'June 2026' }).click();
    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.locator('.empty-state')).toContainText('No objectives in this cycle');
    // The header still titles the picked cycle.
    await expect(page.locator('.plan-header-title')).toHaveText('June 2026');
  });
});
