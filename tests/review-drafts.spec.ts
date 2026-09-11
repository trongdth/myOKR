import { test, expect } from '@playwright/test';

// Draft-review storage contract (ADR-0019): a WeeklyReview without completedAt
// is a draft — autosaved via saveReviewDraft (in place, never clobbering a
// finished review), finished via saveCompletedReview (dedupe by week), and
// ignored by every sync path. normalizeReview must round-trip the structured
// prompts array; unknown fields survive normalization for cross-app parity.

const WEEK_START = '2026-06-08';
const WEEK_END = '2026-06-14';

async function importStorage(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const mod = await import('/src/lib/okr-storage.ts') as Record<string, unknown>;
    // Re-expose as globals for the subsequent evaluates in this test.
    (window as any).__okr = mod;
    return Object.keys(mod).length > 0;
  });
}

async function seedWeekScope(page: import('@playwright/test').Page) {
  await page.evaluate(async ({ WEEK_START, WEEK_END }) => {
    await (window as any).__updateAutomergeDoc('Seed review test scope', (d: any) => {
      d.cycles = [{
        id: 'cycle-draft-test', name: 'June 2026', month: 5, year: 2026,
        isActive: true, createdAt: '2026-06-01T00:00:00.000Z',
      }];
      d.objectives = [{
        id: 'obj-draft-test', cycleId: 'cycle-draft-test', title: 'Core Work',
        order: 0, createdAt: '2026-06-01T00:00:00.000Z',
      }];
      d.keyResults = [{
        id: 'kr-draft-test', objectiveId: 'obj-draft-test', title: 'Draft KR',
        targetValue: 10, currentValue: 0, unit: 'tasks', confidence: 'not_set',
        completionMode: 'manual', order: 0,
        createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z',
      }];
      d.reviews = [];
      void WEEK_START; void WEEK_END;
    });
  }, { WEEK_START, WEEK_END });
}

test.describe('draft review storage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
    await seedWeekScope(page);
    await importStorage(page);
  });

  test('draft with prompts round-trips through save/load, then edits replace in place', async ({ page }) => {
    const first = await page.evaluate(async ({ WEEK_START, WEEK_END }) => {
      const okr = (window as any).__okr;
      await okr.saveReviewDraft({
        id: 'rev-draft-1',
        weekStartDate: WEEK_START,
        weekEndDate: WEEK_END,
        cycleId: 'cycle-draft-test',
        entries: [{
          keyResultId: 'kr-draft-test', previousValue: 2, currentValue: 5,
          confidence: 'on_track', note: undefined,
        }],
        prompts: [
          { id: 'p1', type: 'mover', keyResultId: 'kr-draft-test', text: 'What made that possible?', answer: 'Deep work blocks' },
          { id: 'p2', type: 'one_change', text: 'One change for next week?', answer: '' },
        ],
        pomodoroStats: { totalPomodoros: 4, totalFocusMinutes: 100, tasksCompleted: 1, pomodorosByKeyResult: { 'kr-draft-test': 4 } },
      });
      const loaded = await okr.loadReviews();
      return { loaded, count: loaded.length };
    }, { WEEK_START, WEEK_END });

    expect(first.count).toBe(1);
    const draft = first.loaded[0];
    expect(draft.completedAt).toBeUndefined();
    expect(draft.entries).toHaveLength(1);
    expect(draft.entries[0].note).toBeUndefined();
    expect(draft.prompts).toHaveLength(2);
    expect(draft.prompts[0]).toMatchObject({ id: 'p1', type: 'mover', keyResultId: 'kr-draft-test', answer: 'Deep work blocks' });
    expect(draft.prompts[1]).toMatchObject({ id: 'p2', type: 'one_change', answer: '' });

    // Second autosave for the same week replaces the draft instead of duplicating.
    const second = await page.evaluate(async ({ WEEK_START }) => {
      const okr = (window as any).__okr;
      await okr.saveReviewDraft({
        id: 'rev-draft-1', weekStartDate: WEEK_START, weekEndDate: '2026-06-14',
        cycleId: 'cycle-draft-test',
        entries: [{ keyResultId: 'kr-draft-test', previousValue: 2, currentValue: 6, confidence: 'at_risk' }],
        prompts: [],
        pomodoroStats: { totalPomodoros: 5, totalFocusMinutes: 125, tasksCompleted: 2, pomodorosByKeyResult: {} },
      });
      return okr.loadReviews();
    }, { WEEK_START });

    expect(second).toHaveLength(1);
    expect(second[0].entries[0].currentValue).toBe(6);
    expect(second[0].prompts).toHaveLength(0);
  });

  test('saveReviewDraft never clobbers a completed review for the same week', async ({ page }) => {
    const result = await page.evaluate(async ({ WEEK_START, WEEK_END }) => {
      const okr = (window as any).__okr;
      await okr.saveCompletedReview({
        id: 'rev-done-1', weekStartDate: WEEK_START, weekEndDate: WEEK_END,
        cycleId: 'cycle-draft-test', entries: [],
        prompts: [{ id: 'p1', type: 'free', text: 'Remember?', answer: 'Quiet week' }],
        pomodoroStats: { totalPomodoros: 1, totalFocusMinutes: 25, tasksCompleted: 0, pomodorosByKeyResult: {} },
      });
      await okr.saveReviewDraft({
        id: 'rev-late-draft', weekStartDate: WEEK_START, weekEndDate: WEEK_END,
        cycleId: 'cycle-draft-test', entries: [],
        prompts: [{ id: 'p9', type: 'free', text: 'Stray autosave', answer: 'should not land' }],
        pomodoroStats: { totalPomodoros: 0, totalFocusMinutes: 0, tasksCompleted: 0, pomodorosByKeyResult: {} },
      });
      const loaded = await okr.loadReviews();
      return { count: loaded.length, review: loaded[0] };
    }, { WEEK_START, WEEK_END });

    expect(result.count).toBe(1);
    expect(result.review.id).toBe('rev-done-1');
    expect(result.review.completedAt).toBeTruthy();
    expect(result.review.prompts[0].answer).toBe('Quiet week');
  });

  test('saveCompletedReview replaces the week’s draft, never duplicates', async ({ page }) => {
    const result = await page.evaluate(async ({ WEEK_START, WEEK_END }) => {
      const okr = (window as any).__okr;
      await okr.saveReviewDraft({
        id: 'rev-draft-2', weekStartDate: WEEK_START, weekEndDate: WEEK_END,
        cycleId: 'cycle-draft-test', entries: [],
        prompts: [{ id: 'p1', type: 'one_change', text: 'One change?', answer: 'Ship the demo' }],
        pomodoroStats: { totalPomodoros: 0, totalFocusMinutes: 0, tasksCompleted: 0, pomodorosByKeyResult: {} },
      });
      await okr.saveCompletedReview({
        id: 'rev-draft-2', weekStartDate: WEEK_START, weekEndDate: WEEK_END,
        cycleId: 'cycle-draft-test',
        entries: [{ keyResultId: 'kr-draft-test', previousValue: 0, currentValue: 5, confidence: 'on_track' }],
        prompts: [{ id: 'p1', type: 'one_change', text: 'One change?', answer: 'Ship the demo' }],
        pomodoroStats: { totalPomodoros: 0, totalFocusMinutes: 0, tasksCompleted: 0, pomodorosByKeyResult: {} },
      });
      const loaded = await okr.loadReviews();
      const found = okr.findReviewForWeek(loaded, WEEK_START);
      return { loaded, found };
    }, { WEEK_START, WEEK_END });

    expect(result.loaded).toHaveLength(1);
    expect(result.loaded[0].completedAt).toBeTruthy();
    expect(result.found?.completedAt).toBeTruthy();
    expect(result.found?.prompts[0].answer).toBe('Ship the demo');
  });

  test('findReviewForWeek prefers completed over draft and returns null when empty', async ({ page }) => {
    const result = await page.evaluate(async ({ WEEK_START, WEEK_END }) => {
      const okr = (window as any).__okr;
      const mk = (id: string, completedAt?: string) => ({
        id, weekStartDate: WEEK_START, weekEndDate: WEEK_END, cycleId: 'cycle-draft-test',
        completedAt, entries: [], prompts: [],
        pomodoroStats: { totalPomodoros: 0, totalFocusMinutes: 0, tasksCompleted: 0, pomodorosByKeyResult: {} },
      });
      const none = okr.findReviewForWeek([], WEEK_START);
      const draftOnly = okr.findReviewForWeek([mk('d1')], WEEK_START);
      const both = okr.findReviewForWeek([mk('d2'), mk('c1', '2026-06-15T08:00:00.000Z')], WEEK_START);
      return {
        none: none?.id ?? null,
        draftOnly: draftOnly?.id ?? null,
        both: both?.id ?? null,
      };
    }, { WEEK_START, WEEK_END });

    expect(result.none).toBeNull();
    expect(result.draftOnly).toBe('d1');
    expect(result.both).toBe('c1');
  });
});
