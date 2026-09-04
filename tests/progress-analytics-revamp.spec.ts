import { test, expect, type Page } from '@playwright/test';

async function openAnalytics(page: Page) {
  const item = page.locator('button[title="Analytics"]').first();
  if (!(await item.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Progress', exact: true }).click();
  }
  await item.click();
  await page.waitForTimeout(300);
}

test.describe('Progress / Analytics Screen Revamp', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });

    // Seed test cycle and session history
    await page.evaluate(async () => {
      const okr = await import('/src/lib/okr-storage.ts');
      const pomo = await import('/src/lib/pomodoro-storage.ts');

      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = now.getMonth();
      const todayStr = pomo.getLocalDateString(now);

      await okr.saveCycles([
        { id: 'c-test', name: 'May cycle', month: mm, year: yyyy, isActive: true, createdAt: new Date().toISOString() },
      ]);

      const threeWeeksAgo = new Date(now);
      threeWeeksAgo.setDate(now.getDate() - 21);

      await okr.saveObjectives([
        { id: 'o-1', cycleId: 'c-test', title: 'Ship myOKR v2.0', order: 0, createdAt: new Date().toISOString() },
        { id: 'o-2', cycleId: 'c-test', title: 'Build eng culture', order: 1, createdAt: new Date().toISOString() },
        { id: 'o-3', cycleId: 'c-test', title: 'Improve productivity', order: 2, createdAt: threeWeeksAgo.toISOString() },
      ]);

      await okr.saveKeyResults([
        { id: 'kr-1', objectiveId: 'o-1', title: 'Release app', targetValue: 10, currentValue: 5, unit: 'releases', createdAt: new Date().toISOString() },
        { id: 'kr-2', objectiveId: 'o-2', title: 'Hire engineers', targetValue: 3, currentValue: 1, unit: 'hires', createdAt: new Date().toISOString() },
      ]);

      const tasks = [
        { id: 't-1', title: 'Release v2.0', keyResultId: 'kr-1', completedPomodoros: 3, estimatedPomodoros: 5, isCompleted: false, createdAt: new Date().toISOString() },
        { id: 't-2', title: 'Tech talk', keyResultId: 'kr-2', completedPomodoros: 2, estimatedPomodoros: 3, isCompleted: false, createdAt: new Date().toISOString() },
      ];
      await pomo.saveTasks(tasks);

      // Seed history: today 3 sessions, yesterday 2 sessions
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const yesterdayStr = pomo.getLocalDateString(yesterday);

      const history = [
        {
          date: yesterdayStr,
          completedPomodoros: 2,
          totalFocusMinutes: 50,
          tasksCompleted: 0,
          sessions: [
            { startedAt: `${yesterdayStr}T09:30:00.000Z`, endedAt: `${yesterdayStr}T09:55:00.000Z`, type: 'focus', taskId: 't-1', completed: true },
            { startedAt: `${yesterdayStr}T10:00:00.000Z`, endedAt: `${yesterdayStr}T10:25:00.000Z`, type: 'focus', taskId: 't-1', completed: true },
          ],
        },
        {
          date: todayStr,
          completedPomodoros: 3,
          totalFocusMinutes: 75,
          tasksCompleted: 1,
          sessions: [
            { startedAt: `${todayStr}T09:00:00.000Z`, endedAt: `${todayStr}T09:25:00.000Z`, type: 'focus', taskId: 't-1', completed: true },
            { startedAt: `${todayStr}T10:00:00.000Z`, endedAt: `${todayStr}T10:25:00.000Z`, type: 'focus', taskId: 't-2', completed: true },
            { startedAt: `${todayStr}T11:00:00.000Z`, endedAt: `${todayStr}T11:25:00.000Z`, type: 'focus', taskId: 't-1', completed: true },
          ],
        },
      ];
      await pomo.saveHistory(history as any);
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.app-sidebar')).toBeVisible();
  });

  test('renders ProgressApp shell with header, tabs, and week filter', async ({ page }) => {
    await openAnalytics(page);

    const shell = page.locator('.progress-shell');
    await expect(shell).toBeVisible();

    // Eyebrow and Title
    await expect(shell.locator('.tasks-title')).toHaveText('PROGRESS');
    await expect(shell.locator('.plan-header-title')).toContainText('May cycle');

    // Tabs
    const tabs = shell.locator('.plan-tab');
    await expect(tabs.nth(0)).toHaveText('Analytics');
    await expect(tabs.nth(1)).toHaveText('Weekly review');
    await expect(tabs.nth(0)).toHaveClass(/\bactive\b/);

    // Week select
    await expect(shell.locator('.progress-week-select')).toBeVisible();
  });

  test('renders 4 top metric cards with cycle-scoped values in whole cycle view and adapts when week filtered', async ({ page }) => {
    await openAnalytics(page);

    const cards = page.locator('.analytics-metric-cards .metric-card');
    await expect(cards).toHaveCount(4);

    // In Whole Cycle View (selectedWeek === 'all'):
    // Card 1: Sessions this cycle
    const card1 = cards.nth(0);
    await expect(card1.locator('.metric-card-label')).toHaveText('Sessions this cycle');
    await expect(card1.locator('.stat-value')).toHaveText('5');
    await expect(card1.locator('.metric-badge')).toHaveText('— vs last cycle');
    await expect(card1.locator('.metric-sparkline')).toHaveAttribute('aria-label', 'Cycle weeks sparkline');

    // Card 2: Focus time this cycle
    const card2 = cards.nth(1);
    await expect(card2.locator('.metric-card-label')).toHaveText('Focus time this cycle');
    await expect(card2.locator('.stat-value').first()).toHaveText('2');
    await expect(card2.locator('.metric-unit').first()).toHaveText('h');
    await expect(card2.locator('.metric-badge')).toHaveText('— vs last cycle');
    await expect(card2.locator('.metric-progress-track')).toBeVisible();
    await expect(card2.locator('.metric-subtext')).toContainText('cycle goal');

    // Card 3: Best streak in cycle
    const card3 = cards.nth(2);
    await expect(card3.locator('.metric-card-label')).toHaveText('Best streak in cycle');
    await expect(card3.locator('.stat-value')).toHaveText('2');
    await expect(card3.locator('.metric-subtext')).toContainText('Personal best is 2 days all-time');

    // Card 4: All time
    const card4 = cards.nth(3);
    await expect(card4.locator('.metric-card-label')).toHaveText('All time');
    await expect(card4.locator('.stat-value')).toHaveText('5');
    await expect(card4.locator('.metric-subtext')).toContainText('2h 5m');

    // Switch to single week via select dropdown to verify adaptation
    const selectTrigger = page.locator('.progress-week-select .sel-trigger');
    await selectTrigger.click();
    await page.locator('.sel-panel .sel-row').nth(1).click();
    await page.waitForTimeout(300);

    // Adapts to selected week mode
    await expect(card1.locator('.metric-card-label')).toHaveText('Sessions this week');
    await expect(card1.locator('.stat-value')).toHaveText('5');
    await expect(card1.locator('.metric-sparkline')).toHaveAttribute('aria-label', '7-day sessions sparkline');

    await expect(card2.locator('.metric-card-label')).toHaveText('Focus time this week');
    await expect(card2.locator('.stat-value').first()).toHaveText('2');
    await expect(card2.locator('.metric-unit').first()).toHaveText('h');
    await expect(card2.locator('.metric-subtext')).toContainText('weekly goal');

    await expect(card3.locator('.metric-card-label')).toHaveText('Best streak this week');
    await expect(card3.locator('.stat-value')).toHaveText('2');
    await expect(card3.locator('.metric-subtext')).toContainText('Personal best is 2 days');
  });

  test('renders SESSIONS PER WEEK in cycle overview and SESSIONS PER DAY when week filtered', async ({ page }) => {
    await openAnalytics(page);

    // Whole Cycle View: SESSIONS PER WEEK
    const chartCard = page.locator('.analytics-panel-card:has-text("SESSIONS PER WEEK")');
    await expect(chartCard).toBeVisible();
    await expect(chartCard.locator('h3.panel-eyebrow')).toHaveText('SESSIONS PER WEEK');
    await expect(chartCard.locator('.daily-goal-indicator')).toContainText('weekly goal');
    await expect(chartCard.locator('.sessions-chart-guideline')).toBeVisible();

    const weeklyBarCols = chartCard.locator('.sessions-bar-col.weekly');
    const weekCount = await weeklyBarCols.count();
    expect(weekCount).toBeGreaterThanOrEqual(4);

    // LAST 5 WEEKS Heatmap
    const heatmap = chartCard.locator('.heatmap-matrix');
    await expect(heatmap).toBeVisible();
    await expect(heatmap.locator('.heatmap-cell')).toHaveCount(35);
    await expect(chartCard.locator('.heatmap-legend')).toBeVisible();

    // Switch to single week via select dropdown
    const selectTrigger = page.locator('.progress-week-select .sel-trigger');
    await selectTrigger.click();
    // Select the second option (first week option)
    await page.locator('.sel-panel .sel-row').nth(1).click();
    await page.waitForTimeout(300);

    // Now renders SESSIONS PER DAY
    const dayChartCard = page.locator('.analytics-panel-card:has-text("SESSIONS PER DAY")');
    await expect(dayChartCard).toBeVisible();
    await expect(dayChartCard.locator('h3.panel-eyebrow')).toHaveText('SESSIONS PER DAY');
    await expect(dayChartCard.locator('.daily-goal-indicator')).toContainText('daily goal');
    await expect(dayChartCard.locator('.sessions-bar-col')).toHaveCount(7);
  });

  test('renders tallest completed week with accent color, unstarted weeks as dashed slots, and dynamic caption', async ({ page }) => {
    await page.evaluate(async () => {
      const okr = await import('/src/lib/okr-storage.ts');
      const pomo = await import('/src/lib/pomodoro-storage.ts');

      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = now.getMonth();

      const cycle = { id: 'c-accent-test', name: 'May cycle', month: mm, year: yyyy, isActive: true, createdAt: new Date().toISOString() };
      await okr.saveCycles([cycle]);

      const mondays = okr.getMondaysForCycle(cycle).slice().reverse();
      const history = [
        { date: mondays[0], completedPomodoros: 20, totalFocusMinutes: 500, tasksCompleted: 5, sessions: [] },
      ];
      if (mondays.length > 1) {
        history.push({ date: mondays[1], completedPomodoros: 36, totalFocusMinutes: 900, tasksCompleted: 8, sessions: [] });
      }
      await pomo.saveHistory(history as any);
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await openAnalytics(page);

    const chartCard = page.locator('.analytics-panel-card:has-text("SESSIONS PER WEEK")');
    await expect(chartCard).toBeVisible();

    // Verify dynamic caption
    const caption = chartCard.locator('.sessions-chart-caption');
    await expect(caption).toBeVisible();
    await expect(caption).toContainText('One bar per cycle week');

    // Verify dashed slots if any unstarted weeks exist
    const unstarted = chartCard.locator('.sessions-bar-col.unstarted');
    if (await unstarted.count() > 0) {
      await expect(unstarted.first().locator('.sessions-bar-val')).toHaveText('—');
      await expect(unstarted.first().locator('.unstarted-slot')).toBeVisible();
    }
  });

  test('renders WHERE YOUR FOCUS WENT breakdown and dormant objective warning', async ({ page }) => {
    await openAnalytics(page);

    const focusCard = page.locator('.analytics-panel-card:has-text("WHERE YOUR FOCUS WENT")');
    await expect(focusCard).toBeVisible();

    // Check objectives listed
    await expect(focusCard).toContainText('Ship myOKR v2.0');
    await expect(focusCard).toContainText('Build eng culture');
    await expect(focusCard).toContainText('Improve productivity');
    await expect(focusCard).toContainText('Unlinked work');

    // Dormant objective alert banner (Improve productivity has 0 sessions)
    const alert = focusCard.locator('.dormant-alert-banner');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('Improve productivity has had no focus time');
    await expect(alert).toContainText('Drop it or schedule it in the weekly review.');
  });

  test('bounds WHERE YOUR FOCUS WENT to full cycle dates even when selectedWeek is null', async ({ page }) => {
    // Seed sessions in an earlier week of the cycle
    await page.evaluate(async () => {
      const okr = await import('/src/lib/okr-storage.ts');
      const pomo = await import('/src/lib/pomodoro-storage.ts');

      const now = new Date();
      const cycle = { id: 'c-focus-test', name: 'Focus Test Cycle', month: now.getMonth(), year: now.getFullYear(), isActive: true, createdAt: new Date().toISOString() };
      await okr.saveCycles([cycle]);

      const mondays = okr.getMondaysForCycle(cycle).slice().reverse();
      const firstMonday = mondays[0];

      await okr.saveObjectives([
        { id: 'o-early', cycleId: 'c-focus-test', title: 'Early Week Objective', order: 0, createdAt: new Date().toISOString() },
      ]);
      await okr.saveKeyResults([
        { id: 'kr-early', objectiveId: 'o-early', title: 'Early KR', targetValue: 5, currentValue: 2, unit: 'items', createdAt: new Date().toISOString() },
      ]);
      await pomo.saveTasks([
        { id: 't-early', title: 'Early Task', keyResultId: 'kr-early', completedPomodoros: 4, estimatedPomodoros: 4, isCompleted: false, createdAt: new Date().toISOString() },
      ]);

      // Seed 4 sessions on the first Monday of the cycle
      const history = [
        {
          date: firstMonday,
          completedPomodoros: 4,
          totalFocusMinutes: 100,
          tasksCompleted: 1,
          sessions: [
            { startedAt: `${firstMonday}T09:00:00.000Z`, endedAt: `${firstMonday}T09:25:00.000Z`, type: 'focus', taskId: 't-early', completed: true },
            { startedAt: `${firstMonday}T10:00:00.000Z`, endedAt: `${firstMonday}T10:25:00.000Z`, type: 'focus', taskId: 't-early', completed: true },
            { startedAt: `${firstMonday}T11:00:00.000Z`, endedAt: `${firstMonday}T11:25:00.000Z`, type: 'focus', taskId: 't-early', completed: true },
            { startedAt: `${firstMonday}T12:00:00.000Z`, endedAt: `${firstMonday}T12:25:00.000Z`, type: 'focus', taskId: 't-early', completed: true },
          ],
        },
      ];
      await pomo.saveHistory(history as any);
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await openAnalytics(page);

    const focusCard = page.locator('.analytics-panel-card:has-text("WHERE YOUR FOCUS WENT")');
    await expect(focusCard).toBeVisible();

    // The early week objective should have 4 sessions counted in whole-cycle view
    const earlyObjRow = focusCard.locator('.focus-objective-row:has-text("Early Week Objective")');
    await expect(earlyObjRow).toBeVisible();
    await expect(earlyObjRow.locator('.focus-objective-stats')).toHaveText('4 · 100%');
  });

  test('renders BEST TIME TO FOCUS card', async ({ page }) => {
    await openAnalytics(page);

    const bestTimeCard = page.locator('.analytics-panel-card:has-text("BEST TIME TO FOCUS")');
    await expect(bestTimeCard).toBeVisible();
    // Either a winning window (with its sample-size chip) or the honest
    // no-standout readout — which one depends on the runner's timezone,
    // since seeded session hours land in different 2h windows per TZ.
    const readout = bestTimeCard.locator('.best-time-window, .best-time-none');
    await expect(readout).toBeVisible();
    if (await bestTimeCard.locator('.best-time-window').isVisible()) {
      await expect(bestTimeCard.locator('.best-time-completion')).toContainText('completion');
      await expect(bestTimeCard.locator('.best-time-completion')).toContainText('sessions');
    } else {
      await expect(bestTimeCard.locator('.best-time-none')).toHaveText('No standout time yet');
    }
    await expect(bestTimeCard.locator('.best-time-insight')).not.toBeEmpty();
  });

  test('cycle week bars keep only the native title tooltip', async ({ page }) => {
    await openAnalytics(page);

    // Cycle overview is the default landing view; every week bar carries
    // the week summary in its native title…
    const weekBar = page.locator('.sessions-bar-col.weekly').first();
    await expect(weekBar).toHaveAttribute('title', /sessions?|Not started yet/);

    // …so hovering must not spawn the redundant custom tooltip on top.
    await weekBar.hover();
    await expect(page.locator('.sessions-week-tooltip')).toHaveCount(0);
  });

  test('switches tabs between Analytics and Weekly review within ProgressApp', async ({ page }) => {
    await openAnalytics(page);

    // Click Weekly review tab
    await page.locator('.progress-tab-strip .plan-tab:has-text("Weekly review")').click();
    await page.waitForTimeout(300);

    // Progress shell remains, review flow mounts inside
    await expect(page.locator('.progress-shell')).toBeVisible();
    await expect(page.locator('.review-start-card')).toBeVisible();

    // Switch back to Analytics
    await page.locator('.progress-tab-strip .plan-tab:has-text("Analytics")').click();
    await page.waitForTimeout(300);
    await expect(page.locator('.analytics-metric-cards')).toBeVisible();
  });

  test('drills down into day view on week click with back-navigation', async ({ page }) => {
    await openAnalytics(page);

    const chartCard = page.locator('.analytics-panel-card:has-text("SESSIONS PER WEEK")');
    await expect(chartCard).toBeVisible();

    const weekCols = chartCard.locator('.sessions-bar-col.weekly');
    const firstWeekCol = weekCols.first();

    // Click the first week column to drill down
    await firstWeekCol.click();
    await page.waitForTimeout(300);

    // Now zoomed in to SESSIONS PER DAY
    const dayChartCard = page.locator('.analytics-panel-card:has-text("SESSIONS PER DAY")');
    await expect(dayChartCard).toBeVisible();
    await expect(dayChartCard.locator('.sessions-bar-col')).toHaveCount(7);

    // Back button exists
    const backBtn = dayChartCard.locator('.cycle-overview-back-btn');
    await expect(backBtn).toBeVisible();
    await expect(backBtn).toHaveText('← Cycle overview');

    // Click back button to return to SESSIONS PER WEEK
    await backBtn.click();
    await page.waitForTimeout(300);
    await expect(page.locator('.analytics-panel-card:has-text("SESSIONS PER WEEK")')).toBeVisible();
  });

  test('renders cycle trajectory comparison deltas when prior cycle history exists', async ({ page }) => {
    await page.evaluate(async () => {
      const okr = await import('/src/lib/okr-storage.ts');
      const pomo = await import('/src/lib/pomodoro-storage.ts');

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

      const prevMondays = okr.getMondaysForCycle({ month: prevMonth, year: prevYear }).slice().reverse();
      const curMondays = okr.getMondaysForCycle({ month: currentMonth, year: currentYear }).slice().reverse();

      const history = [
        {
          date: prevMondays[0],
          completedPomodoros: 2,
          totalFocusMinutes: 50,
          tasksCompleted: 1,
          sessions: [],
        },
        {
          date: curMondays[0],
          completedPomodoros: 5,
          totalFocusMinutes: 125,
          tasksCompleted: 2,
          sessions: [],
        },
      ];

      await pomo.saveHistory(history as any);
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await openAnalytics(page);

    const cards = page.locator('.analytics-metric-cards .metric-card');

    // Card 1: 5 sessions, diff is +3 vs last cycle (5 - 2 = 3)
    const card1 = cards.nth(0);
    await expect(card1.locator('.stat-value')).toHaveText('5');
    await expect(card1.locator('.metric-badge.positive')).toHaveText('+3 vs last cycle');

    // Card 2: 2h 5m (125m), diff is +1h 15m vs last cycle (125 - 50 = 75m)
    const card2 = cards.nth(1);
    await expect(card2.locator('.metric-badge.positive')).toHaveText('+1h 15m vs last cycle');
  });

  test('renders neutral 0 vs last cycle when session/duration trajectory delta is 0', async ({ page }) => {
    await page.evaluate(async () => {
      const okr = await import('/src/lib/okr-storage.ts');
      const pomo = await import('/src/lib/pomodoro-storage.ts');

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

      const prevMondays = okr.getMondaysForCycle({ month: prevMonth, year: prevYear }).slice().reverse();
      const curMondays = okr.getMondaysForCycle({ month: currentMonth, year: currentYear }).slice().reverse();

      const history = [
        {
          date: prevMondays[0],
          completedPomodoros: 4,
          totalFocusMinutes: 100,
          tasksCompleted: 1,
          sessions: [],
        },
        {
          date: curMondays[0],
          completedPomodoros: 4,
          totalFocusMinutes: 100,
          tasksCompleted: 1,
          sessions: [],
        },
      ];

      await pomo.saveHistory(history as any);
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await openAnalytics(page);

    const cards = page.locator('.analytics-metric-cards .metric-card');

    // Card 1: 4 sessions, diff is 0 vs last cycle
    const card1 = cards.nth(0);
    await expect(card1.locator('.stat-value')).toHaveText('4');
    await expect(card1.locator('.metric-badge.neutral')).toHaveText('0 vs last cycle');

    // Card 2: 1h 40m, diff is 0m vs last cycle
    const card2 = cards.nth(1);
    await expect(card2.locator('.metric-badge.neutral')).toHaveText('0m vs last cycle');
  });
});
