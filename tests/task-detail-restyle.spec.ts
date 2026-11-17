import { test, expect } from '@playwright/test';

/**
 * Task-detail restyle (2026-08-29) — the P4 polish round:
 *  header: split eyebrow (no ·), text-only ghost Complete, equal-height
 *  Start primary (label shortened from "Start focus" 2026-09-21);
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

  test('header: split eyebrow without separator, text-only ghost Complete, equal-height Start primary', async ({ page }) => {
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

    // Start stays the solid primary — equal height, wider footprint
    // (design-system.md, task-detail follow-up 2026-09-21).
    const start = page.locator('.start-focus-btn');
    await expect(start).toHaveText('Start');
    await expect(start.locator('svg')).toHaveCount(1);
    const startBox = await start.boundingBox();
    const completeBox = await complete.boundingBox();
    expect(startBox!.height).toBeCloseTo(completeBox!.height, 0);
    // Wider horizontal padding is what keeps the primary the bigger target.
    const pads = await Promise.all(
      [start, complete].map(el =>
        el.evaluate(node => {
          const s = getComputedStyle(node);
          return { v: parseFloat(s.paddingTop), h: parseFloat(s.paddingLeft) };
        }),
      ),
    );
    expect(pads[0]!.v).toBeCloseTo(pads[1]!.v, 1);
    expect(pads[0]!.h).toBeGreaterThan(pads[1]!.h);

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

    // Floating modal sheet: elevated --bg-card surface + modal drop shadow (not flat --bg-primary void)
    const panelSurface = await panel.evaluate(el => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, shadow: s.boxShadow };
    });
    expect(panelSurface.bg).toBe('rgb(21, 21, 31)'); // var(--bg-card)
    expect(panelSurface.shadow).not.toBe('none');

    // Priority: text wears the category color, chevron present, cushioned pill padding prevents
    // clipping the dot on hover while keeping the dot flush-aligned under PRIORITY label.
    const priority = page.locator('.detail-properties-bar [aria-label="Priority"]');
    await expect(priority.locator('.sel-text')).toHaveText('Decide');
    await expect(priority.locator('.sel-chevron')).toHaveCount(1);
    const priorityColor = await priority.locator('.sel-text').evaluate(el => getComputedStyle(el).color);
    expect(priorityColor).toBe('rgb(234, 179, 8)'); // EISENHOWER_META.decide
    const priorityPadLeft = await priority.evaluate(el => parseFloat(getComputedStyle(el).paddingLeft));
    expect(priorityPadLeft).toBeGreaterThanOrEqual(6);
    const priorityLabelBox = await page.locator('.prop-priority .prop-label').boundingBox();
    const priorityDotBox = await priority.locator('.sel-icon').boundingBox();
    expect(Math.abs(priorityDotBox!.x - priorityLabelBox!.x)).toBeLessThanOrEqual(2);

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

    // Key result: full violet label + consistent dropdown chevron affordance.
    const kr = page.locator('.detail-properties-bar [aria-label="Key result"]');
    await expect(kr.locator('.sel-text')).toHaveText('Pass CCA certification');
    await expect(kr.locator('.sel-text')).toHaveAttribute('title', 'Pass CCA certification');
    await expect(kr.locator('.sel-chevron')).toHaveCount(1);
    const krColor = await kr.locator('.sel-text').evaluate(el => getComputedStyle(el).color);
    expect(krColor).toBe('rgb(168, 85, 247)'); // --color-objective

    // Uniform 0.8rem (12.8px) typography across all four property triggers
    const fontSizes = await Promise.all(
      [priority.locator('.sel-text'), bucket.locator('.sel-text'), due, kr.locator('.sel-text')].map(
        loc => loc.evaluate(el => getComputedStyle(el).fontSize),
      ),
    );
    expect(new Set(fontSizes).size).toBe(1);
    expect(fontSizes[0]).toBe('12.8px');
  });

  test('pomodoros band: POMODOROS label, bar before interactive readout pill with icon and chevron, elevated surface', async ({ page }) => {
    const block = page.locator('.weekly-plan-block');
    await expect(block.locator('.prop-label')).toHaveText('POMODOROS');
    await expect(block.locator('.task-pomo-count')).toHaveText('20 / 20 planned');
    await expect(block.locator('.task-pomo-icon')).toHaveCount(1);
    await expect(block.locator('.pomo-chevron')).toHaveCount(1);

    const barBox = await block.locator('.weekly-plan-bar').boundingBox();
    const countBox = await block.locator('.task-pomo-count').boundingBox();
    expect(barBox!.x).toBeLessThan(countBox!.x);

    const bg = await block.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('notes: full render without Expand/fade/counter, protocol-stripped links, one Copy per code block, explicit Edit/Save/Cancel controls', async ({ page }) => {
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

    // Explicit Edit button in notes header allows entering edit mode without
    // clicking inside link-heavy note content; swaps to Cancel + Save in edit mode.
    // Markdown format hint stays hidden in view mode (no false-button box) and
    // appears quietly as inline text only while editing.
    const editBtn = page.locator('.notes-edit-btn');
    await expect(editBtn).toBeVisible();
    await expect(page.locator('.notes-format-hint')).toHaveCount(0);
    await editBtn.click();
    await expect(page.locator('.notes-textarea')).toBeVisible();
    await expect(page.locator('.notes-format-hint')).toBeVisible();
    await expect(page.locator('.notes-format-hint')).toHaveText('Markdown supported');
    await expect(page.locator('.notes-cancel-btn')).toBeVisible();
    await expect(page.locator('.notes-save-btn')).toBeVisible();

    // Cancel reverts draft changes and exits edit mode
    await page.locator('.notes-textarea').fill('Temporary draft text');
    await page.locator('.notes-cancel-btn').click();
    await expect(page.locator('.notes-content-view')).toBeVisible();
    await expect(page.locator('.notes-content-view')).not.toContainText('Temporary draft text');

    // Edit -> Save commits changes and shows transient Saved confirmation
    await editBtn.click();
    await page.locator('.notes-textarea').fill('Updated handover note');
    await page.locator('.notes-save-btn').click();
    await expect(page.locator('.notes-content-view')).toContainText('Updated handover note');
    await expect(page.locator('.notes-saved-badge')).toBeVisible();
  });

  test('sub-tasks: progress docked in tab strip, custom rounded-square checkboxes, zero-shift row edit, outlined Add, 4-row collapse', async ({ page }) => {
    // Progress meter docks right in .detail-tab-headers (above the Add composer row) so
    // two full-width neon bars no longer compete across the panel.
    await expect(page.locator('.detail-tab-headers .detail-tab-progress')).toHaveCount(1);
    const addBox = await page.locator('.add-todo-row').boundingBox();
    const progBox = await page.locator('.detail-tab-progress').boundingBox();
    expect(progBox!.y).toBeLessThan(addBox!.y);

    // Custom rounded-square checkbox replaces browser-default checkbox, uses --okr-on-track green when checked, and toggles cleanly
    const firstCheck = page.locator('.todo-item-row .todo-checkbox').first();
    await expect(firstCheck).toBeChecked();
    const checkMetrics = await firstCheck.evaluate(el => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { appearance: s.appearance, w: r.width, h: r.height, bg: s.backgroundColor };
    });
    expect(checkMetrics.appearance).toBe('none');
    expect(checkMetrics.w).toBeCloseTo(18, 0);
    expect(checkMetrics.h).toBeCloseTo(18, 0);
    expect(checkMetrics.bg).toBe('rgb(34, 197, 94)'); // var(--okr-on-track)
    await firstCheck.click();
    await expect(firstCheck).not.toBeChecked();
    await firstCheck.click();
    await expect(firstCheck).toBeChecked();

    // Zero-shift inline row editing: .todo-item-row carries .is-editing and holds stable height
    const firstRow = page.locator('.todo-item-row').first();
    const rowBefore = await firstRow.boundingBox();
    await firstRow.locator('.todo-text').click();
    await expect(firstRow).toHaveClass(/is-editing/);
    const rowDuring = await firstRow.boundingBox();
    expect(Math.abs(rowDuring!.height - rowBefore!.height)).toBeLessThanOrEqual(1);
    await firstRow.locator('.todo-edit-input').press('Escape');

    // Placeholder without ellipsis; Add is disabled when input is empty, and outlined cyan when populated.
    const addInput = page.locator('.add-todo-input');
    const addBtn = page.locator('.add-todo-btn');
    await expect(addInput).toHaveAttribute('placeholder', 'Add a sub-task');
    await expect(addBtn).toBeDisabled();
    await addInput.fill('Domain 7: Production readiness');
    await expect(addBtn).toBeEnabled();
    const add = await addBtn.evaluate(el => {
      const s = getComputedStyle(el);
      return { color: s.color, borderColor: s.borderColor, bg: s.backgroundColor };
    });
    expect(add.color).toBe('rgb(34, 211, 238)');
    expect(add.borderColor).toBe('rgb(34, 211, 238)');
    expect(add.bg).toBe('rgba(0, 0, 0, 0)');
    await addInput.fill('');

    // Active tab & Comments tab: consistent subdued .tab-badge pills (no cyan outline).
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
    await expect(page.locator('.detail-tab-btn').last().locator('.tab-badge')).toHaveText('0');

    // Reorder grip uses pointer cursor (click-select reorder, not drag-and-drop).
    const gripCursor = await page.locator('.todo-grip').first().evaluate(el => getComputedStyle(el).cursor);
    expect(gripCursor).toBe('pointer');

    // Collapse: 4 card rows + muted more-line; click reveals the rest and shows "Show less".
    await expect(page.locator('.todos-list .todo-item-row')).toHaveCount(4);
    const more = page.locator('.todos-more-btn');
    await expect(more).toHaveText('2 more · 2 completed');
    const cardBg = await page.locator('.todo-item-row').first().evaluate(
      el => getComputedStyle(el).backgroundColor,
    );
    expect(cardBg).not.toBe('rgba(0, 0, 0, 0)');
    await more.click();
    await expect(page.locator('.todos-list .todo-item-row')).toHaveCount(6);
    await expect(more).toContainText('Show less');

    // Clicking Show less collapses back to 4 rows; adding a new sub-task while collapsed auto-expands so the new item is visible.
    await more.click();
    await expect(page.locator('.todos-list .todo-item-row')).toHaveCount(4);
    await addInput.fill('Domain 7: Production readiness');
    await addBtn.click();
    await expect(page.locator('.todos-list .todo-item-row')).toHaveCount(7);
    await expect(page.locator('.todos-list .todo-item-row').last()).toContainText('Domain 7: Production readiness');
  });

  test('IME-safe Enter: composing Enter (isComposing or keyCode 229) does not prematurely submit inputs', async ({ page }) => {
    const addInput = page.locator('.add-todo-input');
    await addInput.fill('Đang gõ dở');
    // Dispatch an IME-confirming Enter keydown (isComposing: true)
    await addInput.evaluate(el => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true }));
    });
    // Input must remain unsubmitted
    await expect(addInput).toHaveValue('Đang gõ dở');

    // WebKit / WKWebView out-of-order compositionend fallback (keyCode: 229)
    await addInput.evaluate(el => {
      const evt = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      Object.defineProperty(evt, 'keyCode', { get: () => 229 });
      el.dispatchEvent(evt);
    });
    await expect(addInput).toHaveValue('Đang gõ dở');

    // Normal non-composing Enter submits cleanly
    await addInput.press('Enter');
    await expect(addInput).toHaveValue('');
    await expect(page.locator('.todos-list .todo-item-row').last()).toContainText('Đang gõ dở');
  });

  test('notes: rendered view and code blocks span full panel width, matching edit textarea with stable transition (2026-10-04)', async ({ page }) => {
    // 2026-10-04 (supersedes the 2026-09-17 72ch reading measure cap):
    // both editor and rendered view span 100% of the panel to align with
    // the form layout, eliminating awkward whitespace and code block clipping.
    const scrollBox = await page.locator('.detail-scroll-body').boundingBox();
    const available = scrollBox!.width - 4; // the scroll body's right padding

    // 1. Rendered view width matches available space within ±2px (both bounds)
    const notesBox = await page.locator('.notes-content-view').boundingBox();
    expect(Math.abs(notesBox!.width - available)).toBeLessThanOrEqual(2);

    // 2. Fenced code block occupies full inner content width of notes container
    const codeBlock = page.locator('.notes-content-view .md-code-block');
    await expect(codeBlock).toBeVisible();
    const codeBox = await codeBlock.boundingBox();
    const notesContentWidth = await page.locator('.notes-content-view').evaluate(el => {
      const s = getComputedStyle(el);
      return (
        el.getBoundingClientRect().width -
        parseFloat(s.paddingLeft) -
        parseFloat(s.paddingRight) -
        parseFloat(s.borderLeftWidth) -
        parseFloat(s.borderRightWidth)
      );
    });
    expect(Math.abs(codeBox!.width - notesContentWidth)).toBeLessThanOrEqual(2);

    // 3. Edit mode transition: textarea width AND inner padding/line-height match rendered view (zero text jump)
    const viewMetrics = await page.locator('.notes-content-view').evaluate(el => {
      const s = getComputedStyle(el);
      return { pt: parseFloat(s.paddingTop), pl: parseFloat(s.paddingLeft), lh: parseFloat(s.lineHeight) };
    });
    await page.locator('.notes-content-view').click();
    await expect(page.locator('.notes-textarea')).toBeVisible();
    const textareaBox = await page.locator('.notes-textarea').boundingBox();
    const editMetrics = await page.locator('.notes-textarea').evaluate(el => {
      const s = getComputedStyle(el);
      return { pt: parseFloat(s.paddingTop), pl: parseFloat(s.paddingLeft), lh: parseFloat(s.lineHeight) };
    });
    expect(Math.abs(textareaBox!.width - notesBox!.width)).toBeLessThanOrEqual(2);
    expect(editMetrics.pt).toBeCloseTo(viewMetrics.pt, 1);
    expect(editMetrics.pl).toBeCloseTo(viewMetrics.pl, 1);
    expect(editMetrics.lh).toBeCloseTo(viewMetrics.lh, 1);

    // 4. View mode transition: reverting via Escape restores rendered view with no layout shift
    await page.locator('.notes-textarea').press('Escape');
    await expect(page.locator('.notes-content-view')).toBeVisible();
    const revertedBox = await page.locator('.notes-content-view').boundingBox();
    expect(Math.abs(revertedBox!.width - notesBox!.width)).toBeLessThanOrEqual(1);

    // 5. Title inline edit preserves header height (zero vertical jump below header)
    const propsBefore = await page.locator('.detail-properties-bar').boundingBox();
    await page.locator('.detail-title').click();
    await expect(page.locator('.detail-title-input')).toBeVisible();
    const propsDuring = await page.locator('.detail-properties-bar').boundingBox();
    expect(Math.abs(propsDuring!.y - propsBefore!.y)).toBeLessThanOrEqual(1);
    await page.locator('.detail-title-input').press('Escape');
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

  test('adversarial edge cases: blur-save works after Cancel/Escape, Escape closes innermost layer only, text selection skips edit mode, and reorder handles downward move & checkbox click', async ({ page }) => {
    // 1. C1: Cancelling notes edit (via Cancel button or Escape) must NOT poison
    // skipBlurSaveRef so the next edit's onBlur saves and exits edit mode cleanly.
    await page.locator('.notes-edit-btn').click();
    await page.locator('.notes-textarea').fill('Discarded draft');
    await page.locator('.notes-cancel-btn').click();
    await expect(page.locator('.notes-content-view')).toBeVisible();

    await page.locator('.notes-edit-btn').click();
    await page.locator('.notes-textarea').fill('Saved via blur after cancel');
    await page.locator('.notes-textarea').blur();
    await expect(page.locator('.notes-content-view')).toBeVisible();
    await expect(page.locator('.notes-content-view')).toContainText('Saved via blur after cancel');

    // 2. C4: Highlighting/selecting text inside .notes-content-view must NOT swap to edit mode on click.
    await page.evaluate(() => {
      const el = document.querySelector('.notes-content-view p');
      if (!el) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    });
    await page.locator('.notes-content-view').dispatchEvent('click', { bubbles: true });
    await expect(page.locator('.notes-textarea')).toHaveCount(0);
    await expect(page.locator('.notes-content-view')).toBeVisible();
    await page.evaluate(() => window.getSelection()?.removeAllRanges());

    // 3. C3: Escape while PomoEstimatePopover, sub-task reorder, or ConfirmModal is active
    // dismisses only that child state while keeping TaskDetailModal open.
    await page.locator('.weekly-plan-block .task-pomodoros').click();
    await expect(page.locator('.pomo-estimate-popover')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.pomo-estimate-popover')).toHaveCount(0);
    await expect(page.locator('.task-detail-panel')).toBeVisible();

    await page.locator('.todo-grip').first().click();
    await expect(page.locator('.reorder-hint')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.reorder-hint')).toHaveCount(0);
    await expect(page.locator('.task-detail-panel')).toBeVisible();

    await page.locator('.todo-item-row .delete-sub-btn').first().click({ force: true });
    await expect(page.locator('.confirm-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.confirm-modal')).toHaveCount(0);
    await expect(page.locator('.task-detail-panel')).toBeVisible();

    // 4. H1: During reorder mode, clicking another row's checkbox toggles that checkbox
    // without clobbering it, and clicking a lower row moves the item downward after it.
    await page.locator('.todo-grip').first().click();
    await expect(page.locator('.reorder-hint')).toBeVisible();
    const fourthCheckbox = page.locator('.todo-item-row').nth(3).locator('input[type="checkbox"]');
    await expect(fourthCheckbox).not.toBeChecked();
    await fourthCheckbox.click();
    await expect(fourthCheckbox).toBeChecked();

    // Moving row 0 ("Domain 1: Agentic architecture") onto row 3 places it immediately above row 3 (index 2).
    await page.locator('.todo-item-row').nth(3).click();
    await expect(page.locator('.reorder-hint')).toHaveCount(0);
    await expect(page.locator('.todo-item-row').nth(2)).toContainText('Domain 1: Agentic architecture');

    // 5. Clearing title to empty string and blurring reverts, and re-opening title edit preserves original title.
    const origTitle = await page.locator('.detail-title').textContent();
    await page.locator('.detail-title').click();
    await page.locator('.detail-title-input').fill('   ');
    await page.locator('.detail-title-input').press('Enter');
    await expect(page.locator('.detail-title')).toHaveText(origTitle!);
    await page.locator('.detail-title').click();
    await expect(page.locator('.detail-title-input')).toHaveValue(origTitle!);
    await page.locator('.detail-title-input').press('Escape');
  });

  test('window blur autosaves drafts without exiting edit mode, Cancel still reverts to session baseline, and completed task shows status pill', async ({ page }) => {
    // 1. Notes: OS window blur (focusout while textarea remains activeElement) saves draft to storage
    //    without closing the editor; Cancel after window-blur still reverts to pre-edit baseline.
    const originalNotes = await page.evaluate(async () => {
      const s = await import('/src/lib/pomodoro-storage.ts');
      return (await s.loadTasks()).find(t => t.id === 't1')?.description;
    });

    await page.locator('.notes-edit-btn').click();
    const textarea = page.locator('.notes-textarea');
    await expect(textarea).toBeVisible();
    await textarea.fill('Draft written before Cmd+Tab');

    // Simulate OS window deactivation: focusout fires while document.activeElement stays textarea
    await textarea.evaluate(el => {
      el.focus();
      el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });

    // Editor stays mounted in edit mode AND draft is safely persisted
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue('Draft written before Cmd+Tab');
    const persistedMidEdit = await page.evaluate(async () => {
      const s = await import('/src/lib/pomodoro-storage.ts');
      return (await s.loadTasks()).find(t => t.id === 't1')?.description;
    });
    expect(persistedMidEdit).toBe('Draft written before Cmd+Tab');

    // Pressing Cancel restores the pre-edit session baseline even after a window-blur autosave
    await page.locator('.notes-cancel-btn').click();
    await expect(page.locator('.notes-content-view')).toBeVisible();
    const restoredNotes = await page.evaluate(async () => {
      const s = await import('/src/lib/pomodoro-storage.ts');
      return (await s.loadTasks()).find(t => t.id === 't1')?.description;
    });
    expect(restoredNotes).toBe(originalNotes);

    // Subsequent edit -> window-blur autosave -> in-app .blur() commits and exits edit mode cleanly
    await page.locator('.notes-edit-btn').click();
    await textarea.fill('Committed after window switch');
    await textarea.evaluate(el => {
      el.focus();
      el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    await expect(textarea).toBeVisible();
    await textarea.blur();
    await expect(page.locator('.notes-content-view')).toBeVisible();
    await expect(page.locator('.notes-content-view')).toContainText('Committed after window switch');

    // Comment inline edit also preserves card height (0px vertical strut shift)
    await page.locator('.detail-tab-btn', { hasText: 'Comments' }).click();
    await page.locator('.add-comment-input').fill('Check PillarsHub batch retry behavior');
    await page.locator('.add-comment-btn').click();
    const commentCard = page.locator('.comment-item-card').first();
    const commentBefore = await commentCard.boundingBox();
    await commentCard.locator('.comment-text').click();
    await expect(commentCard).toHaveClass(/is-editing/);
    const commentDuring = await commentCard.boundingBox();
    expect(Math.abs(commentDuring!.height - commentBefore!.height)).toBeLessThanOrEqual(1);
    await commentCard.locator('.comment-edit-input').press('Escape');
    await page.locator('.detail-tab-btn', { hasText: 'Sub-tasks' }).click();

    // 2. Title: OS window blur persists trimmed draft without stripping trailing space in the live input
    await page.locator('.detail-title').click();
    const titleInput = page.locator('.detail-title-input');
    await titleInput.fill('Helm / Updated Title ');
    await titleInput.evaluate(el => {
      el.focus();
      el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    await expect(titleInput).toBeVisible();
    await expect(titleInput).toHaveValue('Helm / Updated Title ');
    await titleInput.press('Enter');
    await expect(page.locator('.detail-title')).toHaveText('Helm / Updated Title');

    // 3. Completed status pill appears in eyebrow when task is completed
    await expect(page.locator('.detail-completed-pill')).toHaveCount(0);
    await page.locator('.complete-btn').click();
    await expect(page.locator('.detail-completed-pill')).toBeVisible();
    await expect(page.locator('.detail-completed-pill')).toContainText('Completed');
  });
});
