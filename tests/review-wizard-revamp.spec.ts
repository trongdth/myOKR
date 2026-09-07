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
  await page.locator('.progress-week-select .sel-trigger').click();
  await page.locator('.sel-panel .sel-row').nth(1).click(); // first row = "all weeks"
  await page.waitForTimeout(300);
}

test.describe('Weekly review wizard revamp', () => {
  test.beforeEach(async ({ page }) => {
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
    await expect(wizard.locator('.rw-footer-note')).toHaveText('Step 1 of 3 · about 4 minutes left');
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

    await expect(wizard.locator('.rw-footer-note')).toHaveText('1 of 2 key results scored');
  });

  test('reload resumes the draft; reflect prompts; Finish stamps and syncs', async ({ page }) => {
    const wizard = page.locator('.rw-wizard');

    // Build a draft: score the manual KR.
    await wizard.locator('.rw-rail-item:has-text("Score key results")').click();
    const kr2Row = wizard.locator('.rw-score-row:has-text("Ship tickets")');
    await kr2Row.locator('input[type="number"]').fill('9');
    await kr2Row.locator('.review-confidence-btn.at-risk').click();
    await expect(wizard.locator('.rw-save-indicator')).toHaveText('Saved just now', { timeout: 5000 });

    // Reload → the draft resumes on the first step with unanswered work.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openReview(page);
    await selectWeek1(page);
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

    // Finished week renders the read-only wizard.
    await expect(page.locator('.rw-footer-note')).toContainText('Review completed');
    await expect(page.locator('.rw-btn:has-text("Finish review")')).toHaveCount(0);

    // History keeps post-finish editing: expand the card, edit the prompt
    // answer, save, and the doc reflects it.
    await page.locator('.review-history-card').first().click();
    const promptRow = page.locator('.review-history-prompt:has-text("One change for next week")');
    await promptRow.locator('.review-history-action-btn.edit').click();
    await page.locator('.review-history-edit-textarea').fill('Blocked 9–11 mornings');
    await page.locator('.review-history-edit-actions .review-nav-btn.primary').click();
    await expect.poll(async () => {
      return page.evaluate(async () => {
        const doc = await (window as any).__getAutomergeDoc();
        const week1 = window.localStorage.getItem('__test_week1');
        const review = (doc.reviews as any[]).find(r => week1 === r.weekStartDate);
        return review?.prompts?.find((x: any) => x.type === 'one_change')?.answer;
      });
    }).toBe('Blocked 9–11 mornings');
  });

  test('draft cards appear in history; Continue review jumps to the week', async ({ page }) => {
    const wizard = page.locator('.rw-wizard');

    // Start a draft for week 1.
    await wizard.locator('.rw-rail-item:has-text("Score key results")').click();
    await wizard.locator('.rw-score-row:has-text("Ship tickets") input[type="number"]').fill('10');
    await wizard.locator('.rw-score-row:has-text("Ship tickets") .review-confidence-btn.on-track').click();
    await expect(wizard.locator('.rw-save-indicator')).toHaveText('Saved just now', { timeout: 5000 });

    // Move the selector away to the current week — the draft card stays.
    await page.locator('.progress-week-select .sel-trigger').click();
    await page.locator('.sel-panel .sel-row').nth(0).click(); // all weeks
    await page.waitForTimeout(400);

    const draftCard = page.locator('.review-history-card.draft');
    await expect(draftCard).toHaveCount(1);
    await expect(draftCard.locator('.review-draft-chip')).toHaveText('In progress');

    // Continue review jumps the week selector back to the draft's week.
    await draftCard.locator('.review-continue-btn').click();
    await page.waitForTimeout(400);
    await expect(page.locator('.rw-wizard .rw-step-heading h2')).toBeVisible();
    await expect(page.locator('.rw-score-row:has-text("Ship tickets") input[type="number"]')).toHaveValue('10');
    await expect(page.locator('.rw-footer-note')).toHaveText('1 of 2 key results scored');

    // Deleting the draft removes it from history.
    await page.locator('.review-history-card.draft .review-delete-btn').click();
    await page.locator('.confirm-modal .btn:has-text("Delete"), .btn:has-text("Delete")').last().click();
    await expect(page.locator('.review-history-card.draft')).toHaveCount(0);
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
});
