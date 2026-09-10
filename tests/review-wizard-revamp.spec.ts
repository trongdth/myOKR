import { test, expect, type Page } from '@playwright/test';

// The three-step weekly review wizard (ADR-0019): Week at a glance →
// Score key results → Reflect, with autosaved drafts and Finish→sync.
// Deterministic strategy: select cycle week 1 in the shared strip selector
// and seed everything relative to its Monday.

async function openReview(page: Page) {
  const item = page.locator('button[title="Weekly review"]').first();
  if (!(await item.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Progress', exact: true }).click();
  }
  await item.click();
  await page.waitForTimeout(300);
}

async function selectWeek1(page: Page) {
  const trigger = page.locator('[aria-label="Review cycle and week"]');
  await trigger.click();
  // The (only, newest) cycle is expanded by default; its first week row is
  // week 1 — always finished under the mid-month clock freeze.
  await page.locator('.cwp-panel .cwp-week-row').nth(0).click();
  await page.waitForTimeout(300);
}

test.describe('Weekly review wizard revamp', () => {
  test.beforeEach(async ({ page }) => {
    // Freeze mid-month so the seeded cycle's week 1 is always a FINISHED
    // week — unfinished weeks are unselectable in the picker (round-2 rule).
    const now = new Date();
    await page.clock.setFixedTime(new Date(now.getFullYear(), now.getMonth(), 15, 12, 0, 0));
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });

    await page.evaluate(async () => {
      const okr = await import('/src/lib/okr-storage.ts');
      const pomo = await import('/src/lib/pomodoro-storage.ts');
      const habitMod = await import('/src/lib/habit-storage.ts');
      const { getExclusiveCycleMondays } = await import('/src/lib/cycle-windows.ts');

      const now = new Date();
      const cycle = {
        id: 'c-test', name: 'May cycle', month: now.getMonth(), year: now.getFullYear(),
        isActive: true, createdAt: new Date().toISOString(),
      };
      const week1 = getExclusiveCycleMondays(cycle)[0];
      const dayOf = (offset: number) => {
        const d = new Date(`${week1}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + offset);
        return d.toISOString().slice(0, 10);
      };

      await okr.saveCycles([cycle]);
      await okr.saveObjectives([
        { id: 'o-1', cycleId: 'c-test', title: 'Ship myOKR', order: 0, createdAt: new Date().toISOString() },
      ]);
      await okr.saveKeyResults([
        { id: 'kr-1', objectiveId: 'o-1', title: 'Ship pomodoros', targetValue: 20, currentValue: 0, unit: 'pomodoros', confidence: 'not_set', completionMode: 'focus_pomodoros', order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: 'kr-2', objectiveId: 'o-1', title: 'Ship tickets', targetValue: 15, currentValue: 8, unit: 'tickets', confidence: 'not_set', completionMode: 'manual', order: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ]);
      await pomo.saveTasks([
        { id: 't-1', title: 'Code task', keyResultId: 'kr-1', isCompleted: false, completedPomodoros: 0, estimatedPomodoros: 5, createdAt: new Date().toISOString() },
        { id: 't-2', title: 'Wrap task', keyResultId: 'kr-1', isCompleted: true, completedAt: `${dayOf(0)}T10:00:00.000Z`, completedPomodoros: 0, estimatedPomodoros: 2, createdAt: new Date().toISOString() },
      ] as any);

      const sessions = (taskId: string, n: number, date: string) =>
        Array.from({ length: n }, (_, i) => ({
          startedAt: `${date}T09:0${i}:00.000Z`, endedAt: `${date}T09:25:00.000Z`,
          type: 'focus', taskId, completed: true,
        }));
      await pomo.saveHistory([
        { date: dayOf(-7), completedPomodoros: 1, totalFocusMinutes: 25, tasksCompleted: 0, sessions: sessions('t-1', 1, dayOf(-7)) },
        { date: dayOf(0), completedPomodoros: 3, totalFocusMinutes: 75, tasksCompleted: 1, sessions: sessions('t-1', 3, dayOf(0)) },
      ] as any);

      await habitMod.saveHabits([
        { id: 'h-1', name: 'Read', status: 'in_progress', ticks: [dayOf(0)], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ]);

      // Two consecutive completed reviews flagging kr-1 at risk → streak.
      const endOf = (start: string) => {
        const e = new Date(`${start}T00:00:00Z`);
        e.setUTCDate(e.getUTCDate() + 6);
        return e.toISOString().slice(0, 10);
      };
      await okr.saveReviews([
        { id: 'rev-p1', weekStartDate: dayOf(-7), weekEndDate: endOf(dayOf(-7)), cycleId: 'c-test',
          completedAt: `${dayOf(-6)}T08:00:00.000Z`,
          entries: [{ keyResultId: 'kr-1', previousValue: 0, currentValue: 1, confidence: 'at_risk' }],
          pomodoroStats: { totalPomodoros: 0, totalFocusMinutes: 0, tasksCompleted: 0, pomodorosByKeyResult: {} } },
        { id: 'rev-p2', weekStartDate: dayOf(-14), weekEndDate: endOf(dayOf(-14)), cycleId: 'c-test',
          completedAt: `${dayOf(-13)}T08:00:00.000Z`,
          entries: [{ keyResultId: 'kr-1', previousValue: 0, currentValue: 0, confidence: 'at_risk' }],
          pomodoroStats: { totalPomodoros: 0, totalFocusMinutes: 0, tasksCompleted: 0, pomodorosByKeyResult: {} } },
      ]);

      window.localStorage.setItem('__test_week1', week1);
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.app-sidebar')).toBeVisible();

    await openReview(page);
    await selectWeek1(page);
  });

  test('step 1 renders the deterministic glance for cycle week 1', async ({ page }) => {
    const wizard = page.locator('.rw-wizard');
    await expect(wizard.locator('.rw-step-heading h2')).toHaveText('Here is the week you just had');

    // Sessions: 3 this week (+2 vs 1 last week)
    const cards = wizard.locator('.rw-stat-card');
    await expect(cards).toHaveCount(4);
    await expect(cards.nth(0).locator('.rw-stat-label')).toHaveText('Sessions');
    await expect(cards.nth(0).locator('.rw-stat-value')).toContainText('3');
    await expect(cards.nth(0).locator('.rw-delta-pos')).toHaveText('+2');
    await expect(cards.nth(0).locator('.rw-stat-sub')).toHaveText('vs 1 last week');

    // Value text reads number-then-unit (75 focus minutes -> "1h 15m";
    // 1 tick of 1 habit over 7 days -> "14%").
    await expect(cards.nth(1).locator('.rw-stat-value')).toHaveText('1h 15m');
    await expect(cards.nth(3).locator('.rw-stat-value')).toHaveText('14%');

    // Tasks: t-2 completed in-week, t-1 carried
    await expect(cards.nth(2).locator('.rw-stat-value')).toContainText('1');
    await expect(cards.nth(2).locator('.rw-stat-of')).toHaveText('of 2');
    await expect(cards.nth(2).locator('.rw-stat-sub')).toHaveText('1 carried to next week');

    // Bars + insight
    await expect(wizard.locator('.rw-bars')).toBeVisible();
    await expect(wizard.locator('.rw-insight')).toContainText('Mon carried the week.');

    // Moved panel: kr-1 +2 (as-of 1 → 3); kr-2 manual unchanged → footnote only
    await expect(wizard.locator('.rw-moved-row')).toHaveCount(1);
    await expect(wizard.locator('.rw-moved-title')).toHaveText('Ship pomodoros');
    await expect(wizard.locator('.rw-moved-row .rw-delta-pos')).toHaveText('+3');
    await expect(wizard.locator('.rw-panel-footnote')).toContainText('1 other key result had no linked sessions');

    // Link banner: 4 of 4 sessions unlinked?? — t-1 links to kr-1 (derived, in cycle)
    // so 4 linked, 0 unlinked → banner absent.
    await expect(wizard.locator('.rw-link-banner')).toHaveCount(0);

    // Footer + tab badge
    await expect(wizard.locator('.rw-footer-note')).toHaveText('Step 1 of 3');
    await expect(page.locator('.rw-tab-badge')).toHaveText('step 1/3');
  });

  test('step 2 scores KRs: derived read-only, autosave, streak banner, scored count', async ({ page }) => {
    const wizard = page.locator('.rw-wizard');
    await wizard.locator('.rw-rail-item:has-text("Score key results")').click();
    await expect(wizard.locator('.rw-step-heading h2')).toHaveText('Where did each key result land?');

    const kr1Row = wizard.locator('.rw-score-row:has-text("Ship pomodoros")');
    const kr2Row = wizard.locator('.rw-score-row:has-text("Ship tickets")');

    // Derived KR: computed value read-only ("auto"), no number input.
    await expect(kr1Row.locator('.review-kr-auto-badge')).toHaveText('auto');
    await expect(kr1Row.locator('input[type="number"]')).toHaveCount(0);
    // At-risk streak: 2 prior completed reviews → "3 weeks running".
    await expect(kr1Row.locator('.rw-risk-banner')).toHaveText('Flagged at risk 2 weeks running.');

    // Manual KR: editable input carrying the KR value.
    const input = kr2Row.locator('input[type="number"]');
    await expect(input).toHaveValue('8');
    await input.fill('9');

    await kr2Row.locator('.review-confidence-btn.at-risk').click();

    // Autosave → draft in the doc, indicator flips to "Saved just now".
    await expect(wizard.locator('.rw-save-indicator')).toHaveText('Saved just now', { timeout: 5000 });
    const draft = await page.evaluate(async () => {
      const week1 = window.localStorage.getItem('__test_week1') as string;
      const doc = await (window as any).__getAutomergeDoc();
      const reviews = doc.reviews as any[];
      return reviews.find(r => r.weekStartDate === week1 && !r.completedAt);
    });
    expect(draft).toBeTruthy();
    const manualEntry = draft.entries.find((e: any) => e.keyResultId === 'kr-2');
    expect(manualEntry.currentValue).toBe(9);
    expect(manualEntry.confidence).toBe('at_risk');

    // A draft never triggers the KR sync — kr-2 keeps its stored 8 until
    // the review is finished (ADR-0019).
    const kr2DuringDraft = await page.evaluate(async () => {
      const doc = await (window as any).__getAutomergeDoc();
      return (doc.keyResults as any[]).find(k => k.id === 'kr-2')?.currentValue;
    });
    expect(kr2DuringDraft).toBe(8);

    await expect(wizard.locator('.rw-footer-note')).toHaveText('1 of 2 key results scored');
  });

  test('reload resumes the draft; reflect prompts; Finish stamps and syncs', async ({ page }) => {
    const wizard = page.locator('.rw-wizard');

    // A draft autosave must refresh the picker WITHOUT the app-wide
    // sync event (that triggers full reloads of every listener).
    await page.evaluate(() => {
      (window as any).__syncCount = 0;
      window.addEventListener('myokr-data-synced', () => { (window as any).__syncCount++; });
    });

    // Build a draft: score the manual KR.
    await wizard.locator('.rw-rail-item:has-text("Score key results")').click();
    const kr2Row = wizard.locator('.rw-score-row:has-text("Ship tickets")');
    await kr2Row.locator('input[type="number"]').fill('9');
    await kr2Row.locator('.review-confidence-btn.at-risk').click();
    await expect(wizard.locator('.rw-save-indicator')).toHaveText('Saved just now', { timeout: 5000 });

    // No app-wide reload storm was dispatched by the autosave.
    expect(await page.evaluate(() => (window as any).__syncCount)).toBe(0);

    // The selected draft week shows the tick (C1: tick wins over the
    // trailing label); the Draft hint itself is pinned in the accordion test
    // on a non-selected draft week.
    await page.locator('[aria-label="Review cycle and week"]').click();
    await expect(page.locator('.cwp-panel .cwp-week-row.cwp-selected .cwp-check')).toBeVisible();
    await page.keyboard.press('Escape');

    // Reload → the draft resumes on the first step with unanswered work.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openReview(page);
    await selectWeek1(page); // the post-reload default is the latest finished week
    await expect(page.locator('.rw-wizard .rw-step-heading h2')).toHaveText('Where did each key result land?');
    await expect(page.locator('.rw-score-row:has-text("Ship tickets") input[type="number"]')).toHaveValue('9');
    await expect(page.locator('.rw-footer-note')).toHaveText('1 of 2 key results scored');

    // Reflect: at-risk prompt first, mover second, one change last.
    await page.locator('.rw-rail-item:has-text("Reflect")').click();
    const prompts = page.locator('.rw-prompt-row');
    await expect(prompts).toHaveCount(3);
    await expect(prompts.nth(0).locator('.rw-prompt-text')).toHaveText('Ship pomodoros has been at risk 2 weeks running. What is in the way?');
    await expect(prompts.nth(1).locator('.rw-prompt-text')).toHaveText('Ship pomodoros moved 1 → 4. What made that possible?');
    await expect(prompts.nth(2).locator('.rw-prompt-text')).toHaveText('One change for next week?');
    // Ticket 07: the mover prompt carries a "+N this week" chip.
    await expect(prompts.nth(1).locator('.rw-prompt-chip')).toHaveText('+3 this week');

    // Decision 7: the one-change answer surfaces in next week's Week at a
    // glance — copy must not imply Day-plan wiring the spec rejected.
    await expect(prompts.nth(2).locator('.rw-prompt-chip')).toHaveText("Surfaces in next week's review");
    const reflectText = await page.locator('.rw-reflect').innerText();
    expect(reflectText).not.toContain('plan');

    await prompts.nth(2).locator('textarea').fill('Block mornings');
    await expect(page.locator('.rw-save-indicator')).toHaveText('Saved just now', { timeout: 5000 });

    // Finish → completedAt stamped, KR values synced from the review.
    await page.locator('.rw-btn:has-text("Finish review")').click();
    const result = await page.evaluate(async () => {
      const week1 = window.localStorage.getItem('__test_week1') as string;
      const doc = await (window as any).__getAutomergeDoc();
      const review = (doc.reviews as any[]).find(r => r.weekStartDate === week1);
      const kr2 = (doc.keyResults as any[]).find(k => k.id === 'kr-2');
      return {
        completedAt: review?.completedAt,
        oneChange: review?.prompts?.find((p: any) => p.type === 'one_change')?.answer,
        kr2Value: kr2?.currentValue,
        kr2Confidence: kr2?.confidence,
      };
    });
    expect(result.completedAt).toBeTruthy();
    expect(result.oneChange).toBe('Block mornings');
    // The KR sync saves after the review lands — poll for it.
    await expect.poll(async () => {
      return page.evaluate(async () => {
        const doc = await (window as any).__getAutomergeDoc();
        return (doc.keyResults as any[]).find(k => k.id === 'kr-2')?.currentValue;
      });
    }, { timeout: 5000 }).toBe(9);
    expect(result.kr2Confidence).toBe('at_risk');

    // The spec's e2e chain link: after finishing, the review becomes a chart
    // point on the Objectives tab. Seed a second completed in-cycle review
    // (cycle week 2) so the chart has its minimum two points.
    await page.evaluate(async () => {
      const okr = await import('/src/lib/okr-storage.ts');
      const { getExclusiveCycleMondays } = await import('/src/lib/cycle-windows.ts');
      const now = new Date();
      const mondays = getExclusiveCycleMondays({ id: 'c-test', name: '', month: now.getMonth(), year: now.getFullYear(), isActive: true, createdAt: '' });
      const week2 = mondays[1];
      const endOf = (start: string) => {
        const e = new Date(`${start}T00:00:00Z`);
        e.setUTCDate(e.getUTCDate() + 6);
        return e.toISOString().slice(0, 10);
      };
      const doc = await (window as any).__getAutomergeDoc();
      await okr.saveReviews([
        ...doc.reviews,
        { id: 'rev-week2', weekStartDate: week2, weekEndDate: endOf(week2), cycleId: 'c-test',
          completedAt: `${week2}T20:00:00.000Z`,
          entries: [{ keyResultId: 'kr-1', previousValue: 0, currentValue: 1, confidence: 'on_track' }],
          pomodoroStats: { totalPomodoros: 0, totalFocusMinutes: 0, tasksCompleted: 0, pomodorosByKeyResult: {} } },
      ]);
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });
    await page.locator('.progress-tab-strip .plan-tab:has-text("Objectives")').click();
    await expect(page.locator('.progress-shell .progress-chart-svg')).toBeVisible();
    await expect(page.locator('.progress-shell .progress-chart-container')).toContainText('Ship pomodoros');
    await page.locator('.progress-tab-strip .plan-tab:has-text("Weekly review")').click();

    // Finished week renders the Finished review summary (round 3) — not a
    // wizard: the whole review on one page, no chrome, no step badge.
    await expect(page.locator('.rw-summary-head h2')).toHaveText('Your review');
    await expect(page.locator('.rw-summary-panel')).toHaveCount(3);
    await expect(page.locator('.rw-btn:has-text("Finish review")')).toHaveCount(0);
    await expect(page.locator('.rw-save-indicator')).toHaveCount(0);
    await expect(page.locator('.rw-footer')).toHaveCount(0);
    await expect(page.locator('.rw-tab-badge')).toHaveCount(0);
  });

  test('finished week renders the summary: static markers, chrome, show N more', async ({ page }) => {
    // Seed week 1 as completed with five scored KRs (so the table must cap
    // at three rows) and answered prompts.
    await page.evaluate(async () => {
      const okr = await import('/src/lib/okr-storage.ts');
      const week1 = window.localStorage.getItem('__test_week1') as string;
      const endOf = (start: string) => {
        const e = new Date(`${start}T00:00:00Z`);
        e.setUTCDate(e.getUTCDate() + 6);
        return e.toISOString().slice(0, 10);
      };
      const doc = await (window as any).__getAutomergeDoc();
      await okr.saveKeyResults([
        ...doc.keyResults,
        ...(['kr-3', 'kr-4', 'kr-5'].map((id, i) => ({
          id, objectiveId: 'o-1', title: `Filler KR ${i + 3}`, targetValue: 10, currentValue: 5,
          unit: 'things', confidence: 'on_track', completionMode: 'manual', order: i + 2,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        }))) as any[],
      ]);
      await okr.saveCompletedReview({
        id: 'rev-w1', weekStartDate: week1, weekEndDate: endOf(week1), cycleId: 'c-test',
        completedAt: `${week1}T20:14:00.000Z`,
        entries: [
          { keyResultId: 'kr-1', previousValue: 1, currentValue: 4, confidence: 'on_track' },
          { keyResultId: 'kr-2', previousValue: 8, currentValue: 8, confidence: 'at_risk' },
          { keyResultId: 'kr-3', previousValue: 5, currentValue: 7, confidence: 'on_track' },
          { keyResultId: 'kr-4', previousValue: 5, currentValue: 5, confidence: 'not_set' },
          { keyResultId: 'kr-5', previousValue: 5, currentValue: 5, confidence: 'off_track' },
        ],
        prompts: [
          { id: 'p-1', type: 'mover', keyResultId: 'kr-1', text: 'Ship pomodoros moved 1 → 4. What made that possible?', answer: 'Mornings.' },
          { id: 'p-2', type: 'at_risk', keyResultId: 'kr-2', text: 'Ship tickets is at risk. What is in the way?', answer: '' },
          { id: 'p-3', type: 'one_change', text: 'One change for next week?', answer: 'Timebox tickets.' },
        ],
        pomodoroStats: { totalPomodoros: 12, totalFocusMinutes: 300, tasksCompleted: 2, pomodorosByKeyResult: { 'kr-1': 5 } },
      });
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openReview(page);
    await selectWeek1(page);

    const main = page.locator('.rw-main');
    await expect(main.locator('.rw-summary-head h2')).toHaveText('Your review');
    await expect(main.locator('.rw-summary-panel')).toHaveCount(3);

    // Key results as scored: the review's recorded entries — 5 rows, 3
    // visible until expanded; deltas and confidence render as recorded.
    const table = main.locator('.rw-summary-table');
    await expect(table.locator('.rw-summary-row')).toHaveCount(3);
    await expect(table).toContainText('Ship pomodoros');
    await expect(table).toContainText('+3 that week');
    await expect(table).toContainText('no change');
    await expect(table).toContainText('At Risk');
    await expect(main).toContainText('4 of 5');
    await main.locator('.rw-summary-more').click();
    await expect(table.locator('.rw-summary-row')).toHaveCount(5);
    await expect(table).toContainText('Filler KR 5');
    await expect(main.locator('.rw-summary-more')).toHaveText(/Show fewer/);

    // Reflection: prompt → answer pairs; an empty answer says so.
    const qa = main.locator('.rw-summary-qa');
    await expect(qa).toContainText('Ship pomodoros moved 1 → 4');
    await expect(qa).toContainText('Mornings.');
    await expect(qa).toContainText('No answer');

    // Where the pomodoros went + That week: the review's STORED stats —
    // retro task-linking after finish must not rewrite history (round 3).
    const pomoPanel = main.locator('.rw-pomo-panel');
    await expect(pomoPanel).toContainText('Where the pomodoros went');
    await expect(pomoPanel).toContainText('12 sessions · 5h 00m');
    await expect(pomoPanel).toContainText("Linked to this cycle's KRs");
    await expect(pomoPanel.locator('.rw-pomo-split-num')).toHaveText(['5', '7']);
    const weekCard = page.locator('.rw-week-card');
    await expect(weekCard).toContainText('That week');
    await expect(weekCard).toContainText('12 sessions');
    await expect(weekCard).toContainText('300m focus');
    await expect(weekCard).toContainText('2 tasks done');

    // Left column: checked markers only — nothing clickable, no step roles.
    await expect(page.locator('.rw-done-marker')).toHaveCount(3);
    await expect(page.locator('.rw-done-marker').nth(0)).toContainText('Week at a glance');
    await expect(page.locator('.rw-done-marker').nth(2)).toContainText('Reflect');
    await expect(page.locator('.rw-side button')).toHaveCount(0);
    await expect(page.locator('.rw-wizard [role="tab"]')).toHaveCount(0);
    await expect(page.locator('.rw-week-card')).toContainText('That week');

    // No wizard chrome in the finished state.
    await expect(page.locator('.rw-save-indicator')).toHaveCount(0);
    await expect(page.locator('.rw-footer')).toHaveCount(0);
    await expect(page.locator('.rw-btn:has-text("Finish review")')).toHaveCount(0);
    await expect(page.locator('.rw-tab-badge')).toHaveCount(0);

    // Header chrome: Reviewed chip + completed line.
    await expect(page.locator('.rw-reviewed-badge')).toContainText('Reviewed');
    await expect(page.locator('.rw-completed-line')).toContainText('Completed');
  });

  test('link sessions modal assigns tasks and recomputes the numbers', async ({ page }) => {
    // Two unlinked sessions on a task with no key result.
    await page.evaluate(async () => {
      const pomo = await import('/src/lib/pomodoro-storage.ts');
      const week1 = window.localStorage.getItem('__test_week1') as string;
      const sessions = (taskId: string, n: number, date: string) =>
        Array.from({ length: n }, (_, i) => ({
          startedAt: `${date}T11:0${i}:00.000Z`, endedAt: `${date}T11:25:00.000Z`,
          type: 'focus', taskId, completed: true,
        }));
      const doc = await (window as any).__getAutomergeDoc();
      const tasks = [
        ...doc.tasks,
        { id: 't-u', title: 'Unlinked task', isCompleted: false, completedPomodoros: 0, estimatedPomodoros: 2, createdAt: new Date().toISOString() },
      ] as any[];
      await pomo.saveTasks(tasks);
      const history = [
        ...doc.history,
        { date: week1, completedPomodoros: 2, totalFocusMinutes: 50, tasksCompleted: 0, sessions: sessions('t-u', 2, week1) },
      ] as any[];
      await pomo.saveHistory(history);
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openReview(page);
    await selectWeek1(page);

    // Banner appears: 2 of 5 sessions unlinked, and the cycle has a derived KR.
    const wizard = page.locator('.rw-wizard');
    await expect(wizard.locator('.rw-link-banner')).toBeVisible();
    await expect(wizard.locator('.rw-link-banner p')).toContainText('2 of 5 sessions were not linked');

    // Open the modal, assign the task to the derived KR, save.
    await wizard.locator('.rw-link-btn').click();
    const modal = page.locator('.rw-link-modal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.rw-link-row')).toHaveCount(1);
    await expect(modal.locator('.rw-link-task-title')).toHaveText('Unlinked task');
    await modal.locator('.rw-link-picker .sel-trigger').click();
    await page.waitForTimeout(450); // let the panel's entrance animation settle
    await page.locator('.sel-panel .sel-row[data-key="kr-1"]').click();
    await modal.locator('button:has-text("Link sessions")').last().click();

    // Modal closes, tasks reload, the glance recomputes: banner gone, delta +5.
    await expect(modal).toHaveCount(0);
    await expect(wizard.locator('.rw-link-banner')).toHaveCount(0);
    await expect(wizard.locator('.rw-moved-row .rw-delta-pos')).toHaveText('+5');
    await expect(wizard.locator('.rw-panel-footnote')).toContainText('had no linked sessions');
  });

  test('linking tasks writes in place — concurrent task writes survive (rule 11)', async ({ page }) => {
    // Same setup as the modal test: an unlinked task with sessions in week 1.
    await page.evaluate(async () => {
      const pomo = await import('/src/lib/pomodoro-storage.ts');
      const week1 = window.localStorage.getItem('__test_week1') as string;
      const sessions = (taskId: string, n: number, date: string) =>
        Array.from({ length: n }, (_, i) => ({
          startedAt: `${date}T11:0${i}:00.000Z`, endedAt: `${date}T11:25:00.000Z`,
          type: 'focus', taskId, completed: true,
        }));
      const doc = await (window as any).__getAutomergeDoc();
      await pomo.saveTasks([
        ...doc.tasks,
        { id: 't-u', title: 'Unlinked task', isCompleted: false, completedPomodoros: 0, estimatedPomodoros: 2, createdAt: new Date().toISOString() },
      ] as any[]);
      await pomo.saveHistory([
        ...doc.history,
        { date: week1, completedPomodoros: 2, totalFocusMinutes: 50, tasksCompleted: 0, sessions: sessions('t-u', 2, week1) },
      ] as any[]);
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openReview(page);
    await selectWeek1(page);

    // A task lands in the doc AFTER the app loaded its state — the stand-in
    // for a focus session completing while the modal is open.
    await page.evaluate(async () => {
      await (window as any).__updateAutomergeDoc('Concurrent task write', (d: any) => {
        d.tasks.push({
          id: 't-late', title: 'Landed while modal open', isCompleted: false,
          completedPomodoros: 1, estimatedPomodoros: 2, createdAt: new Date().toISOString(),
        });
      });
    });

    const wizard = page.locator('.rw-wizard');
    await wizard.locator('.rw-link-btn').click();
    const modal = page.locator('.rw-link-modal');
    await modal.locator('.rw-link-picker .sel-trigger').click();
    await page.waitForTimeout(450);
    await page.locator('.sel-panel .sel-row[data-key="kr-1"]').click();
    await modal.locator('button:has-text("Link sessions")').last().click();
    await expect(modal).toHaveCount(0);

    // The concurrent write survives, and the assignment landed.
    await expect.poll(async () => {
      return page.evaluate(async () => {
        const doc = await (window as any).__getAutomergeDoc();
        const late = (doc.tasks as any[]).find(t => t.id === 't-late');
        const linked = (doc.tasks as any[]).find(t => t.id === 't-u');
        return { lateAlive: !!late, linkedKr: linked?.keyResultId };
      });
    }).toEqual({ lateAlive: true, linkedKr: 'kr-1' });
  });

  test('link banner hidden when the cycle has only manual KRs', async ({ page }) => {
    // Replace KRs with a manual-only set; sessions now all count unlinked but
    // the banner stays hidden (linking changes nothing for manual KRs).
    await page.evaluate(async () => {
      const okr = await import('/src/lib/okr-storage.ts');
      await okr.saveKeyResults([
        { id: 'kr-2', objectiveId: 'o-1', title: 'Ship tickets', targetValue: 15, currentValue: 8, unit: 'tickets', confidence: 'not_set', completionMode: 'manual', order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ]);
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openReview(page);
    await selectWeek1(page);

    const wizard = page.locator('.rw-wizard');
    await expect(wizard.locator('.rw-step-heading h2')).toHaveText('Here is the week you just had');
    await expect(wizard.locator('.rw-link-banner')).toHaveCount(0);
    // The sidebar card still reports the unlinked sessions honestly.
    await wizard.locator('.rw-rail-item:has-text("Score key results")').click();
    await expect(wizard.locator('.rw-week-card-sub')).toContainText('unlinked or other cycles');
  });

  test('reopen returns a finished review to an editable draft; re-finish restores the chart point', async ({ page }) => {
    // Week 1 + week 2 completed (chart needs two points); week 1 carries
    // answers that must survive the reopen.
    await page.evaluate(async () => {
      const okr = await import('/src/lib/okr-storage.ts');
      const { getExclusiveCycleMondays } = await import('/src/lib/cycle-windows.ts');
      const week1 = window.localStorage.getItem('__test_week1') as string;
      const now = new Date();
      const mondays = getExclusiveCycleMondays({ id: 'c-test', name: '', month: now.getMonth(), year: now.getFullYear(), isActive: true, createdAt: '' });
      const week2 = mondays[1];
      const endOf = (start: string) => {
        const e = new Date(`${start}T00:00:00Z`);
        e.setUTCDate(e.getUTCDate() + 6);
        return e.toISOString().slice(0, 10);
      };
      await okr.saveCompletedReview({
        id: 'rev-w1', weekStartDate: week1, weekEndDate: endOf(week1), cycleId: 'c-test',
        completedAt: `${week1}T20:14:00.000Z`,
        entries: [{ keyResultId: 'kr-2', previousValue: 8, currentValue: 9, confidence: 'on_track' }],
        prompts: [
          { id: 'p-1', type: 'mover', keyResultId: 'kr-2', text: 'Ship tickets moved 8 → 9. What made that possible?', answer: 'Mornings.' },
          { id: 'p-2', type: 'one_change', text: 'One change for next week?', answer: 'Timebox tickets.' },
        ],
        pomodoroStats: { totalPomodoros: 0, totalFocusMinutes: 0, tasksCompleted: 0, pomodorosByKeyResult: {} },
      });
      await okr.saveCompletedReview({
        id: 'rev-w2', weekStartDate: week2, weekEndDate: endOf(week2), cycleId: 'c-test',
        completedAt: `${week2}T20:00:00.000Z`,
        entries: [{ keyResultId: 'kr-2', previousValue: 9, currentValue: 10, confidence: 'on_track' }],
        prompts: [],
        pomodoroStats: { totalPomodoros: 0, totalFocusMinutes: 0, tasksCompleted: 0, pomodorosByKeyResult: {} },
      });
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openReview(page);
    await selectWeek1(page);

    const week1Label = ((await page.evaluate(() => window.localStorage.getItem('__test_week1'))) as string).slice(5);

    // Top-right slot: Reopen — this cycle isn't closed, so no closed badge.
    const reopen = page.locator('.rw-reopen-btn');
    await expect(reopen).toContainText('Reopen review');
    await expect(page.locator('.rw-closed-badge')).toHaveCount(0);

    // The week is a chart point before the reopen.
    await page.locator('.progress-tab-strip .plan-tab:has-text("Objectives")').click();
    await expect(page.locator('.progress-shell .progress-chart-svg')).toContainText(week1Label);
    await page.locator('.progress-tab-strip .plan-tab:has-text("Weekly review")').click();

    // Reopen asks first.
    await reopen.click();
    const modal = page.locator('.confirm-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Reopen review');
    await expect(modal).toContainText('draft');
    await modal.locator('button:has-text("Reopen")').click();
    await expect(modal).toHaveCount(0);

    // The editable wizard returns, with the recorded answers intact.
    const wizard = page.locator('.rw-wizard');
    await expect(wizard.locator('.rw-rail-item')).toHaveCount(3);
    await wizard.locator('.rw-rail-item:has-text("Reflect")').click();
    await expect(wizard.locator('.rw-prompt-textarea').nth(0)).toHaveValue('Mornings.');
    await expect(wizard.locator('.rw-prompt-textarea').nth(1)).toHaveValue('Timebox tickets.');

    // The picker reads the week as a draft now — the SELECTED week's row
    // shows a tick, so the Draft hint appears once another week commits.
    await page.locator('[aria-label="Review cycle and week"]').click();
    await page.locator('.cwp-panel .cwp-week-row').nth(1).click();
    await page.locator('[aria-label="Review cycle and week"]').click();
    await expect(page.locator('.cwp-panel .cwp-week-row').nth(0)).toContainText('Draft');
    await page.keyboard.press('Escape');

    // The reopened week's chart point drops — drafts are excluded, leaving
    // week 2 as the only in-cycle point (below the chart's two-point
    // minimum, hence the placeholder).
    await page.locator('.progress-tab-strip .plan-tab:has-text("Objectives")').click();
    await expect(page.locator('.progress-shell .progress-chart-container')).toContainText('Complete at least 2 weekly reviews');
    await page.locator('.progress-tab-strip .plan-tab:has-text("Weekly review")').click();

    // Back to the reopened week and re-finish: re-stamps the completion
    // and restores the chart point.
    await page.locator('[aria-label="Review cycle and week"]').click();
    await page.locator('.cwp-panel .cwp-week-row').nth(0).click();
    await wizard.locator('.rw-rail-item:has-text("Reflect")').click();
    await wizard.locator('.rw-btn:has-text("Finish review")').click();
    await expect.poll(async () => {
      return page.evaluate(async () => {
        const doc = await (window as any).__getAutomergeDoc();
        const r = (doc.reviews as any[]).find(x => x.weekStartDate === window.localStorage.getItem('__test_week1'));
        return !!r?.completedAt;
      });
    }, { timeout: 5000 }).toBe(true);
    await page.locator('.progress-tab-strip .plan-tab:has-text("Objectives")').click();
    await expect(page.locator('.progress-shell .progress-chart-svg')).toContainText(week1Label);
  });

  test('re-finishing an older week never clobbers newer synced values', async ({ page }) => {
    // kr-2 (manual) scored 4 in week 1, then 9 in week 2. Reopen week 1,
    // bump it to 5, re-finish: the sync is latest-completed-review-wins,
    // so the KR keeps week 2's 9.
    await page.evaluate(async () => {
      const okr = await import('/src/lib/okr-storage.ts');
      const { getExclusiveCycleMondays } = await import('/src/lib/cycle-windows.ts');
      const week1 = window.localStorage.getItem('__test_week1') as string;
      const now = new Date();
      const mondays = getExclusiveCycleMondays({ id: 'c-test', name: '', month: now.getMonth(), year: now.getFullYear(), isActive: true, createdAt: '' });
      const week2 = mondays[1];
      const endOf = (start: string) => {
        const e = new Date(`${start}T00:00:00Z`);
        e.setUTCDate(e.getUTCDate() + 6);
        return e.toISOString().slice(0, 10);
      };
      await okr.saveCompletedReview({
        id: 'rev-w1', weekStartDate: week1, weekEndDate: endOf(week1), cycleId: 'c-test',
        completedAt: `${week1}T20:14:00.000Z`,
        entries: [{ keyResultId: 'kr-2', previousValue: 8, currentValue: 4, confidence: 'on_track' }],
        prompts: [{ id: 'p-1', type: 'one_change', text: 'One change for next week?', answer: 'Timebox tickets.' }],
        pomodoroStats: { totalPomodoros: 0, totalFocusMinutes: 0, tasksCompleted: 0, pomodorosByKeyResult: {} },
      });
      await okr.saveCompletedReview({
        id: 'rev-w2', weekStartDate: week2, weekEndDate: endOf(week2), cycleId: 'c-test',
        completedAt: `${week2}T20:00:00.000Z`,
        entries: [{ keyResultId: 'kr-2', previousValue: 4, currentValue: 9, confidence: 'on_track' }],
        prompts: [],
        pomodoroStats: { totalPomodoros: 0, totalFocusMinutes: 0, tasksCompleted: 0, pomodorosByKeyResult: {} },
      });
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openReview(page);
    await selectWeek1(page);

    await page.locator('.rw-reopen-btn').click();
    const modal = page.locator('.confirm-modal');
    await expect(modal).toBeVisible();
    await modal.locator('button:has-text("Reopen")').click();
    await expect(modal).toHaveCount(0);

    const wizard = page.locator('.rw-wizard');
    await wizard.locator('.rw-rail-item:has-text("Score key results")').click();
    const input = wizard.locator('.rw-score-row:has-text("Ship tickets")').locator('input[type="number"]');
    // The draft's recorded value (4) survived the reopen.
    await expect(input).toHaveValue('4');
    await input.fill('5');
    await wizard.locator('.rw-rail-item:has-text("Reflect")').click();
    await wizard.locator('.rw-btn:has-text("Finish review")').click();
    await expect.poll(async () => {
      return page.evaluate(async () => {
        const doc = await (window as any).__getAutomergeDoc();
        return (doc.keyResults as any[]).find(k => k.id === 'kr-2')?.currentValue;
      });
    }, { timeout: 5000 }).toBe(9);
  });

  test('top-right slot: Reopen for a reviewed week of a closed cycle, badge otherwise', async ({ page }) => {
    // A PAST cycle (previous month) is closed; its week 1 is reviewed,
    // week 2 is not.
    await page.evaluate(async () => {
      const okr = await import('/src/lib/okr-storage.ts');
      const now = new Date();
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const cycle = {
        id: 'c-old', name: 'March cycle', month: prev.getMonth(), year: prev.getFullYear(),
        isActive: false, createdAt: new Date().toISOString(),
      };
      const { getExclusiveCycleMondays } = await import('/src/lib/cycle-windows.ts');
      const mondays = getExclusiveCycleMondays(cycle);
      const week1 = mondays[0];
      const endOf = (start: string) => {
        const e = new Date(`${start}T00:00:00Z`);
        e.setUTCDate(e.getUTCDate() + 6);
        return e.toISOString().slice(0, 10);
      };
      await okr.saveCycles([cycle]);
      await okr.saveCompletedReview({
        id: 'rev-old', weekStartDate: week1, weekEndDate: endOf(week1), cycleId: 'c-old',
        completedAt: `${week1}T20:14:00.000Z`,
        entries: [],
        prompts: [],
        pomodoroStats: { totalPomodoros: 0, totalFocusMinutes: 0, tasksCompleted: 0, pomodorosByKeyResult: {} },
      });
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openReview(page);
    await selectWeek1(page);

    // Week 1 (reviewed): the Reopen button owns the slot.
    await expect(page.locator('.rw-reopen-btn')).toBeVisible();
    await expect(page.locator('.rw-closed-badge')).toHaveCount(0);

    // Week 2 (not reviewed): the Cycle closed badge owns the slot.
    await page.locator('[aria-label="Review cycle and week"]').click();
    await page.locator('.cwp-panel .cwp-week-row').nth(1).click();
    await expect(page.locator('.rw-reopen-btn')).toHaveCount(0);
    await expect(page.locator('.rw-closed-badge')).toContainText('Cycle closed');
  });
});
