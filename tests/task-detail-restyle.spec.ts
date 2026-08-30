import { test, expect } from '@playwright/test';

/**
 * Task-detail restyle (2026-08-29) — the P4 polish round:
 *  header: split eyebrow (no ·), text-only ghost Complete, larger Start focus;
 *  meta bar: full-bleed 4-cell row, no per-field boxes, formatted due date
 *  that opens the native picker, bare KR trigger without chevron;
 *  pomodoros band: POMODOROS THIS WEEK label, bar before readout, elevated bg;
 *  notes: full render (no Expand/fade/counter), protocol-stripped link
 *  labels, one Copy per code block;
 *  sub-tasks: add row above the progress bar, outlined Add, card rows
 *  collapsed to 4 + "N more · M completed", subdued sans tab badges;
 *  panel: 880px max-width.
 */
test.describe('Task detail restyle', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(async () => {
      const okr = await import('/src/lib/okr-storage.ts');
      const storage = await import('/src/lib/pomodoro-storage.ts');
      await okr.saveCycles([{ id: 'c1', name: 'May cycle', month: 4, year: 2026, isActive: true, createdAt: '2026-05-01T00:00:00Z' }]);
      await okr.saveObjectives([{ id: 'o1', cycleId: 'c1', title: 'CCA Objective', order: 0, createdAt: '2026-05-01T00:00:00Z' }]);
      await okr.saveKeyResults([{ id: 'kr1', objectiveId: 'o1', title: 'Pass CCA certification', targetValue: 30, currentValue: 11, unit: 'pomodoros', order: 0, createdAt: '2026-05-01T00:00:00Z' }]);
      await storage.saveTasks([{
        id: 't1',
        title: '[CCA] Exam',
        category: 'decide',
        bucket: 'this_week',
        dueDate: '2026-07-31',
        keyResultId: 'kr1',
        estimatedPomodoros: 20,
        completedPomodoros: 20,
        isCompleted: false,
        createdAt: '2026-07-01T10:00:00Z',
        description: [
          '1. Link to join — https://anthropic.skilljar.com/cca-foundations',
          '2. Training courses — https://anthropic.skilljar.com',
          '3. Playbook',
          '',
          '```',
          'drive.google.com/file/d/xyz',
          '```',
        ].join('\n'),
        todos: [
          { id: 's1', text: 'Domain 1: Agentic architecture', completed: true, createdAt: '2026-07-05T10:00:00Z' },
          { id: 's2', text: 'Domain 2: Tool design', completed: true, createdAt: '2026-07-05T10:00:01Z' },
          { id: 's3', text: 'Domain 3: Evaluation', completed: false, createdAt: '2026-07-05T10:00:02Z' },
          { id: 's4', text: 'Domain 4: Safety and cost', completed: false, createdAt: '2026-07-05T10:00:03Z' },
          { id: 's5', text: 'Domain 5: Mock exam A', completed: true, createdAt: '2026-07-05T10:00:04Z' },
          { id: 's6', text: 'Domain 6: Mock exam B', completed: true, createdAt: '2026-07-05T10:00:05Z' },
        ],
        comments: [],
      }]);
    });
    await page.evaluate(() => window.localStorage.setItem('myokr_active_section', 'tasks'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('.board-task-card', { hasText: '[CCA] Exam' }).locator('.card-title').click();
    await expect(page.locator('.task-detail-panel')).toBeVisible();
    // Lazy-loaded Markdown must settle before notes assertions.
    await expect(page.locator('.notes-content-view')).toBeVisible();
  });

  test('header: split eyebrow without separator, text-only ghost Complete, larger primary Start focus', async ({ page }) => {
    const eyebrow = page.locator('.detail-eyebrow');
    await expect(eyebrow.locator('.eyebrow-label')).toHaveText('TASK');
    await expect(eyebrow.locator('.eyebrow-hint')).toHaveText('click any field to edit');
    await expect(eyebrow).not.toContainText('·');

    // Complete: no icon, ghost styling — transparent fill, muted 1px border.
    const complete = page.locator('.complete-btn');
    await expect(complete).toHaveText('Complete');
    await expect(complete.locator('svg')).toHaveCount(0);
    const ghost = await complete.evaluate(el => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, borderStyle: s.borderStyle };
    });
    expect(ghost.bg).toBe('rgba(0, 0, 0, 0)');
    expect(ghost.borderStyle).not.toBe('none');

    // Start focus stays the solid primary and reads larger than Complete.
    const start = page.locator('.start-focus-btn');
    await expect(start.locator('svg')).toHaveCount(1);
    const startBox = await start.boundingBox();
    const completeBox = await complete.boundingBox();
    expect(startBox!.height).toBeGreaterThan(completeBox!.height);

    // The header itself carries no divider rule — the meta bar separates.
    const headerBorder = await page.locator('.detail-panel-header').evaluate(
      el => getComputedStyle(el).borderBottomWidth,
    );
    expect(headerBorder).toBe('0px');
  });

  test('meta bar: full-bleed cells, formatted due date + chevron, iconless bucket, bare KR', async ({ page }) => {
    const panel = page.locator('.task-detail-panel');
    const panelBox = await panel.boundingBox();
    const barBox = await page.locator('.detail-properties-bar').boundingBox();
    // The strip bleeds past the panel padding to the panel's edges.
    expect(barBox!.x).toBeLessThanOrEqual(panelBox!.x + 2);
    expect(barBox!.x + barBox!.width).toBeGreaterThanOrEqual(panelBox!.x + panelBox!.width - 2);

    // Priority: text wears the category color, chevron present.
    const priority = page.locator('.detail-properties-bar [aria-label="Priority"]');
    await expect(priority.locator('.sel-text')).toHaveText('Decide');
    await expect(priority.locator('.sel-chevron')).toHaveCount(1);
    const priorityColor = await priority.locator('.sel-text').evaluate(el => getComputedStyle(el).color);
    expect(priorityColor).toBe('rgb(234, 179, 8)'); // EISENHOWER_META.decide

    // Bucket: text + chevron only — no calendar icon.
    const bucket = page.locator('.detail-properties-bar [aria-label="Bucket"]');
    await expect(bucket.locator('.sel-text')).toHaveText('This week');
    await expect(bucket.locator('.sel-icon')).toHaveCount(0);
    await expect(bucket.locator('.sel-chevron')).toHaveCount(1);

    // Due: human date (EEE d MMM) + chevron; clicking opens the shared
    // in-app DatePicker (tests/date-picker.spec.ts covers the picker itself).
    const due = page.locator('[aria-label="Due date"]');
    await expect(due).toContainText('Fri 31 Jul');
    await expect(due.locator('svg')).toHaveCount(1);
    await due.click();
    await expect(page.locator('.date-picker-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.date-picker-panel')).toHaveCount(0);

    // Key result: full violet label, no chevron, no box.
    const kr = page.locator('.detail-properties-bar [aria-label="Key result"]');
    await expect(kr.locator('.sel-text')).toHaveText('Pass CCA certification');
    await expect(kr.locator('.sel-chevron')).toHaveCount(0);
    const krColor = await kr.locator('.sel-text').evaluate(el => getComputedStyle(el).color);
    expect(krColor).toBe('rgb(168, 85, 247)'); // --color-objective
  });

  test('pomodoros band: THIS WEEK label, bar before readout, elevated surface', async ({ page }) => {
    const block = page.locator('.weekly-plan-block');
    await expect(block.locator('.prop-label')).toHaveText('POMODOROS THIS WEEK');
    await expect(block.locator('.task-pomo-count')).toHaveText('20 / 20 planned');

    const barBox = await block.locator('.weekly-plan-bar').boundingBox();
    const countBox = await block.locator('.task-pomo-count').boundingBox();
    expect(barBox!.x).toBeLessThan(countBox!.x);

    const bg = await block.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('notes: full render without Expand/fade/counter, protocol-stripped links, one Copy per code block', async ({ page }) => {
    await expect(page.locator('.notes-expand-btn')).toHaveCount(0);
    await expect(page.locator('.notes-fade')).toHaveCount(0);
    await expect(page.locator('.notes-count')).toHaveCount(0);

    // Link display text drops the protocol; the href keeps it.
    const link = page.locator('.notes-content-view a').first();
    await expect(link).toHaveText('anthropic.skilljar.com/cca-foundations');
    await expect(link).toHaveAttribute('href', 'https://anthropic.skilljar.com/cca-foundations');

    // One block-level Copy button; zero per-link chips.
    await expect(page.locator('.md-code-copy')).toHaveCount(1);
    await expect(page.locator('.md-link-copy')).toHaveCount(0);
  });

  test('sub-tasks: add row above progress, outlined Add, subdued badges, 4-row collapse', async ({ page }) => {
    // Add row first, progress below.
    const addBox = await page.locator('.add-todo-row').boundingBox();
    const progBox = await page.locator('.detail-tab-progress').boundingBox();
    expect(addBox!.y).toBeLessThan(progBox!.y);

    // Placeholder without ellipsis; Add is outlined cyan on transparent.
    await expect(page.locator('.add-todo-input')).toHaveAttribute('placeholder', 'Add a sub-task');
    const add = await page.locator('.add-todo-btn').evaluate(el => {
      const s = getComputedStyle(el);
      return { color: s.color, borderColor: s.borderColor, bg: s.backgroundColor };
    });
    expect(add.color).toBe('rgb(34, 211, 238)');
    expect(add.borderColor).toBe('rgb(34, 211, 238)');
    expect(add.bg).toBe('rgba(0, 0, 0, 0)');

    // Active tab: subdued badge (no cyan outline); comments count is bare text.
    const badge = page.locator('.detail-tab-btn.active .tab-badge');
    await expect(badge).toHaveText('4/6');
    const badgeStyle = await badge.evaluate(el => {
      const s = getComputedStyle(el);
      return { family: s.fontFamily, border: s.borderStyle, color: s.color };
    });
    expect(badgeStyle.border).toBe('none');
    expect(badgeStyle.color).not.toBe('rgb(34, 211, 238)');
    expect(badgeStyle.family).not.toContain('JetBrains Mono');
    await expect(page.locator('.detail-tab-btn').last()).toContainText('Comments');
    await expect(page.locator('.detail-tab-btn .tab-count')).toHaveText('0');

    // Collapse: 4 card rows + muted more-line; click reveals the rest.
    await expect(page.locator('.todos-list .todo-item-row')).toHaveCount(4);
    const more = page.locator('.todos-more-btn');
    await expect(more).toHaveText('2 more · 2 completed');
    const cardBg = await page.locator('.todo-item-row').first().evaluate(
      el => getComputedStyle(el).backgroundColor,
    );
    expect(cardBg).not.toBe('rgba(0, 0, 0, 0)');
    await more.click();
    await expect(page.locator('.todos-list .todo-item-row')).toHaveCount(6);
    await expect(page.locator('.todos-more-btn')).toHaveCount(0);
  });

  test('panel widens so the four meta columns and note lines fit', async ({ page }) => {
    const box = await page.locator('.task-detail-panel').boundingBox();
    expect(box!.width).toBeGreaterThan(800);
  });

  test('body never swipes horizontally; band and footer are pinned (2026-08-30 feedback)', async ({ page }) => {
    // Feedback 1: the scroll body (and the panel) must not be wider than
    // their visible box — the band's old negative-margin bleed inside the
    // scroll container made everything shift when swiped sideways.
    const overflow = await page.evaluate(() => {
      const body = document.querySelector('.detail-scroll-body') as HTMLElement;
      const panel = document.querySelector('.task-detail-panel') as HTMLElement;
      return {
        bodyX: body.scrollWidth - body.clientWidth,
        panelX: panel.scrollWidth - panel.clientWidth,
      };
    });
    expect(overflow.bodyX).toBeLessThanOrEqual(0);
    expect(overflow.panelX).toBeLessThanOrEqual(0);

    // Feedback 2: the footer is pinned — it lives outside the scroll body
    // and its bottom edge sits at the panel's inner bottom (inside the
    // panel's 1.5rem padding + 1px border), never after the last section.
    await expect(page.locator('.detail-scroll-body .detail-footer')).toHaveCount(0);
    const footerBox = await page.locator('.detail-footer').boundingBox();
    const panelBox = await page.locator('.task-detail-panel').boundingBox();
    const bottomGap = panelBox!.y + panelBox!.height - (footerBox!.y + footerBox!.height);
    expect(bottomGap).toBeGreaterThanOrEqual(20); // padding + border only
    expect(bottomGap).toBeLessThanOrEqual(28);

    // The band is pinned with it: attached flush under the meta bar, so the
    // band's bottom border sits directly above the scroll body's top.
    const bandBox = await page.locator('.weekly-plan-block').boundingBox();
    const scrollBox = await page.locator('.detail-scroll-body').boundingBox();
    expect(Math.abs(bandBox!.y + bandBox!.height - scrollBox!.y)).toBeLessThanOrEqual(2);
    await expect(page.locator('.detail-scroll-body .weekly-plan-block')).toHaveCount(0);
  });
});
