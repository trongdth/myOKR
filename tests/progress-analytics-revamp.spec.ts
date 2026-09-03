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

      await okr.saveObjectives([
        { id: 'o-1', cycleId: 'c-test', title: 'Ship myOKR v2.0', order: 0, createdAt: new Date().toISOString() },
        { id: 'o-2', cycleId: 'c-test', title: 'Build eng culture', order: 1, createdAt: new Date().toISOString() },
        { id: 'o-3', cycleId: 'c-test', title: 'Improve productivity', order: 2, createdAt: new Date().toISOString() },
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

  test('renders 4 top metric cards with correct values and sparkline', async ({ page }) => {
    await openAnalytics(page);

    const cards = page.locator('.analytics-metric-cards .metric-card');
    await expect(cards).toHaveCount(4);

    // Card 1: Sessions today
    const card1 = cards.nth(0);
    await expect(card1.locator('.metric-card-label')).toHaveText('Sessions today');
    await expect(card1.locator('.stat-value')).toHaveText('3');
    await expect(card1.locator('.metric-sparkline')).toBeVisible();

    // Card 2: Focus time today
    const card2 = cards.nth(1);
    await expect(card2.locator('.metric-card-label')).toHaveText('Focus time today');
    await expect(card2.locator('.stat-value')).toHaveText('75');
    await expect(card2.locator('.metric-unit')).toHaveText('m');
    await expect(card2.locator('.metric-progress-track')).toBeVisible();

    // Card 3: Current streak
    const card3 = cards.nth(2);
    await expect(card3.locator('.metric-card-label')).toHaveText('Current streak');
    await expect(card3.locator('.stat-value')).toHaveText('2');
    await expect(card3.locator('.metric-subtext')).toContainText('Personal best is 2 days');

    // Card 4: All time
    const card4 = cards.nth(3);
    await expect(card4.locator('.metric-card-label')).toHaveText('All time');
    await expect(card4.locator('.stat-value')).toHaveText('5');
    await expect(card4.locator('.metric-subtext')).toContainText('2h 5m');
  });

  test('renders SESSIONS PER DAY bar chart with goal line and LAST 5 WEEKS heatmap', async ({ page }) => {
    await openAnalytics(page);

    // SESSIONS PER DAY
    const chartCard = page.locator('.analytics-panel-card:has-text("SESSIONS PER DAY")');
    await expect(chartCard).toBeVisible();
    await expect(chartCard.locator('.daily-goal-indicator')).toContainText('daily goal');
    await expect(chartCard.locator('.sessions-chart-guideline')).toBeVisible();

    const barCols = chartCard.locator('.sessions-bar-col');
    await expect(barCols).toHaveCount(7);

    // LAST 5 WEEKS Heatmap
    const heatmap = chartCard.locator('.heatmap-matrix');
    await expect(heatmap).toBeVisible();
    await expect(heatmap.locator('.heatmap-cell')).toHaveCount(35);
    await expect(chartCard.locator('.heatmap-legend')).toBeVisible();
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

  test('renders BEST TIME TO FOCUS card', async ({ page }) => {
    await openAnalytics(page);

    const bestTimeCard = page.locator('.analytics-panel-card:has-text("BEST TIME TO FOCUS")');
    await expect(bestTimeCard).toBeVisible();
    await expect(bestTimeCard.locator('.best-time-window')).toBeVisible();
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
});
