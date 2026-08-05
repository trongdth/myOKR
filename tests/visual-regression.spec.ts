import { test, expect } from '@playwright/test';

/**
 * Visual regression for the 1a UI redesign. Snapshots are deterministic:
 * `Date` is frozen so seed data + displayed dates don't drift, and the live
 * Pomodoro timer digits are masked. Baselines live in
 * `tests/visual-regression.spec.ts-snapshots/`; regenerate with --update-snapshots.
 *
 * This is deliberately a separate file from screenshots.spec.ts (which captures
 * the README assets) so the two concerns don't collide.
 */
const FROZEN_MS = Date.UTC(2026, 0, 15, 9, 0, 0); // 2026-01-15 09:00 UTC

test.describe('Visual regression (1a redesign)', () => {
  test.beforeEach(async ({ page }) => {
    // Freeze the clock so `new Date()` / `Date.now()` are stable across runs.
    await page.addInitScript((ms) => {
      const RealDate = Date;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Date = class extends RealDate {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        constructor(...args: any[]) { super(...(args.length ? args : [ms])); }
        static now() { return ms; }
      } as unknown as DateConstructor;
    }, FROZEN_MS);
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
  });

  // [snapshot id, nav title]
  const screens: [string, string][] = [
    ['today', 'Day plan'],
    ['timer', 'Session'],
    ['tasks', 'Tasks'],
    ['analytics', 'Analytics'],
    ['okrs', 'Objectives'],
    ['habits', 'Habits'],
    ['review', 'Weekly review'],
    ['sync', 'Settings'],
  ];

  for (const [id, label] of screens) {
    test(`${id} @1280`, async ({ page }) => {
      const btn = page.locator(`[title="${label}"]`).first();
      if (!await btn.isVisible()) {
        if (['Tasks', 'Objectives', 'Done'].includes(label)) {
          await page.locator('[title="Plan"]').first().click();
        } else if (['Analytics', 'Weekly review'].includes(label)) {
          await page.locator('[title="Progress"]').first().click();
        } else if (['Day plan', 'Session', 'Habits'].includes(label)) {
          await page.locator('[title="Focus"]').first().click();
        }
      }
      await btn.click();
      await page.waitForTimeout(500);
      await expect(page).toHaveScreenshot(`${id}.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.05,
        mask: [page.locator('.timer-digits')],
      });
    });
  }

  // Running-session variant of the timer (ticket 02): stage + start a focus so
  // the Session tab's `live` badge shows. The ring + digits are masked — the
  // timer ticks in real time (setInterval), so the deterministic running markers
  // are the `live` badge and the Pause control, not the elapsed ring.
  test('timer (running) @1280', async ({ page }) => {
    await page.locator('[title="Session"]').first().click();
    await page.waitForTimeout(300);
    await page.locator('input[placeholder*="What are you working on?"]').fill('Running Baseline Task');
    await page.locator('button.add-task-btn').click();
    await page.locator('.task-item:has-text("Running Baseline Task")').click();
    await page.locator('.timer-section button:has-text("Start")').click();
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('timer-running.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.05,
      mask: [page.locator('.timer-digits'), page.locator('.timer-ring-svg')],
    });
  });

  // P4 flagship: the Task detail modal — header (title + cyan Start focus +
  // actions on one row), properties strip, POMODOROS THIS WEEK bar, notes, and
  // sub-tasks tabs. Seeded rich data incl. 4 completed focus sessions this week
  // so the weekly bar renders ~80% filled.
  test('task-detail @1280', async ({ page }) => {
    await page.evaluate(async () => {
      const storage = await import('/src/lib/pomodoro-storage.ts');
      const okr = await import('/src/lib/okr-storage.ts');
      await okr.saveCycles([{ id: 'c1', name: 'Jan 2026', month: 0, year: 2026, isActive: true, createdAt: '2026-01-01T00:00:00Z' }]);
      await okr.saveObjectives([{ id: 'o1', cycleId: 'c1', title: 'Pass CCA certification', order: 0, createdAt: '2026-01-01T00:00:00Z' }]);
      await okr.saveKeyResults([{ id: 'k1', objectiveId: 'o1', title: 'Pass CCA certification', targetValue: 30, currentValue: 11, unit: 'pomodoros', confidence: 'on_track', completionMode: 'focus_pomodoros', order: 0, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-12T00:00:00Z' }]);
      await storage.saveTasks([{
        id: 'td1', title: '[CCA] Exam', category: 'decide', bucket: 'today', dueDate: '2026-01-31',
        keyResultId: 'k1', estimatedPomodoros: 20, weeklyPomodoroPlan: 5, completedPomodoros: 8,
        isCompleted: false, createdAt: '2026-01-05T10:00:00Z',
        description: '1. Read the [CCA study guide](https://example.com/guide)\n2. Practice exams\n3. Review weak areas',
        todos: [
          { id: 's1', text: 'Read study guide', completed: true, createdAt: '2026-01-05T10:00:00Z' },
          { id: 's2', text: 'Practice exam 1', completed: true, createdAt: '2026-01-06T10:00:00Z' },
          { id: 's3', text: 'Review weak areas', completed: false, createdAt: '2026-01-07T10:00:00Z' },
          { id: 's4', text: 'Final mock exam', completed: false, createdAt: '2026-01-08T10:00:00Z' },
        ],
        comments: [],
      }]);
      // FROZEN = 2026-01-15 (Thu); week = Mon 01-12 .. Sun 01-18.
      const session = (day: string, h: number) => ({
        startedAt: `${day}T0${h}:00:00Z`, endedAt: `${day}T0${h}:25:00Z`,
        type: 'focus' as const, taskId: 'td1', completed: true,
      });
      await storage.saveHistory([
        { date: '2026-01-13', completedPomodoros: 2, totalFocusMinutes: 50, tasksCompleted: 0, sessions: [session('2026-01-13', 9), session('2026-01-13', 10)] },
        { date: '2026-01-14', completedPomodoros: 2, totalFocusMinutes: 50, tasksCompleted: 0, sessions: [session('2026-01-14', 9), session('2026-01-14', 10)] },
      ]);
    });

    await page.locator('[title="Plan"]').first().click();
    await page.waitForTimeout(300);
    await page.locator('.board-task-card').first().click();
    await expect(page.locator('.task-detail-panel')).toBeVisible();
    // Let the lazy-loaded Markdown notes settle before snapping.
    await expect(page.locator('.notes-content-view')).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.locator('.task-detail-panel')).toHaveScreenshot('task-detail.png', {
      maxDiffPixelRatio: 0.05,
    });
  });

  // P5 flagship: the Done tab — completed tasks grouped by day with a Reopen
  // action. Seeded completed tasks land in TODAY / YESTERDAY groups.
  test('done @1280', async ({ page }) => {
    await page.evaluate(async () => {
      const storage = await import('/src/lib/pomodoro-storage.ts');
      await storage.saveTasks([
        { id: 'd1', title: 'Ship redesign', estimatedPomodoros: 3, completedPomodoros: 3, isCompleted: true, completedAt: '2026-01-15T10:00:00Z', createdAt: '2026-01-10T10:00:00Z' },
        { id: 'd2', title: 'Write release notes', estimatedPomodoros: 2, completedPomodoros: 2, isCompleted: true, completedAt: '2026-01-14T10:00:00Z', createdAt: '2026-01-09T10:00:00Z' },
      ]);
    });
    await page.locator('[title="Plan"]').first().click();
    await page.waitForTimeout(300);
    await page.locator('[title="Done"]').first().click();
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('done.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.05,
      mask: [page.locator('.timer-digits')],
    });
  });

  test('collapsed icon-rail @1024', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 720 });
    await page.locator('[title="Focus"]').first().click();
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('rail-1024.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.03,
      mask: [page.locator('.timer-digits')],
    });
  });
});
