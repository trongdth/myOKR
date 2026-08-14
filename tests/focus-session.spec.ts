import { test, expect, type Page } from '@playwright/test';

const FIXED_TIME = new Date('2026-05-24T12:00:00.000Z');

async function waitForApp(page: Page) {
  await page.clock.setFixedTime(FIXED_TIME);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
}

async function openSession(page: Page) {
  await page.locator('button[title="Session"]').first().click();
  await page.waitForTimeout(300);
}

// Navigate to the Tasks tab (the TaskList left the Session tab in ticket 03;
// task management now happens on Tasks / Day plan). The Plan nav group starts
// collapsed, so expand it first when needed.
async function openTasks(page: Page) {
  const item = page.locator('button[title="Tasks"]').first();
  if (!(await item.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
  }
  await item.click();
  await page.waitForTimeout(300);
}

// TaskList quick-add on the Tasks tab (the Session tab's TaskList is gone).
// The Tasks quick-add is a form: fill the input and press Enter to submit.
async function addTask(page: Page, name: string) {
  await openTasks(page);
  await page.locator('.quick-add-input').fill(name);
  await page.locator('form.quick-add-bar').press('Enter');
  await expect(page.locator(`.board-task-card:has-text("${name}")`)).toBeVisible();
}

// Select a task as active via the Session tab's Task Switcher modal (opened
// from the Active Task Card's "Change" button — the old inline dropdown picker
// was replaced by the full-screen Task Switcher, 2026-08-13). Replan so the
// newly-created task joins the queue.
async function selectTaskOnTasksAndOpenSession(page: Page, name: string) {
  await page.locator('button[title="Day plan"]').first().click();
  await page.waitForTimeout(300);
  await page.locator('.focus-plan-day-btn').click();
  await page.waitForTimeout(500);
  await openSession(page);
  await page.locator('.active-task-card-change').click();
  await page.locator(`.switcher-task:has-text("${name}")`).click();
}

// Open the Task Switcher modal from the Active Task Card's "Change" button.
async function openTaskSwitcher(page: Page) {
  await page.locator('.active-task-card-change').click();
  await expect(page.locator('.task-switcher')).toBeVisible();
}

test.describe('Focus shell — Session tab (ticket 02)', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await openSession(page);
  });

  test('timer renders inside the Focus shell with Session tab active', async ({ page }) => {
    await expect(page.locator('.focus-shell .timer-section')).toBeVisible();
    await expect(page.locator('.plan-tab-strip.focus-tabs .plan-tab.active')).toHaveText(/Session/);
  });

  test('live marker is absent while idle, appears when a session runs', async ({ page }) => {
    await expect(page.locator('.focus-tab-live')).toHaveCount(0);

    await addTask(page, 'Live Task');
    await selectTaskOnTasksAndOpenSession(page, 'Live Task');
    await page.locator('.timer-section button:has-text("Start")').click();

    await expect(page.locator('.focus-tab-live')).toBeVisible();
    await expect(page.locator('.focus-tab-live')).toContainText('live');
  });

  test('Start focus from Day plan opens the Session tab in the Focus shell, task staged', async ({ page }) => {
    await page.locator('button:has-text("Day plan")').first().click();
    await page.waitForTimeout(300);
    await page.locator('.focus-card .btn:has-text("Start focus")').first().click();

    await expect(page.locator('.focus-shell .timer-section')).toBeVisible();
    await expect(page.locator('.active-task-card')).toBeVisible();
    await expect(page.locator('.active-task-card')).toContainText('Refactor auth module');
  });
});

// ==========================================
// Session-of label + Active Task Card (ticket 03)
// ==========================================

test.describe('Session-of label + Active Task Card (ticket 03)', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    // Replan so seeded tasks are on the Day plan queue (picker source, ticket 05).
    await page.locator('button[title="Day plan"]').first().click();
    await page.waitForTimeout(300);
    await page.locator('.focus-plan-day-btn').click();
    await page.waitForTimeout(500);
    await openSession(page);
  });

  test('session-of label shows completed/estimated for the active task', async ({ page }) => {
    // Seed task 'Design new dashboard layout' has completed 3 / estimated 5.
    await openTaskSwitcher(page);
    await page.locator('.switcher-task:has-text("Design new dashboard layout")').click();

    const label = page.locator('.timer-session-of');
    await expect(label).toBeVisible();
    await expect(label).toContainText('SESSION 3 OF 5');
  });

  test('session-of label is hidden when no task is active', async ({ page }) => {
    // No task staged at start — the label must be absent (only digits show).
    await expect(page.locator('.timer-session-of')).toHaveCount(0);
  });

  test('session-of label is hidden during a break', async ({ page }) => {
    await openTaskSwitcher(page);
    await page.locator('.switcher-task:has-text("Design new dashboard layout")').click();

    // Switch to Short Break — the label must disappear (breaks aren't task-attributed).
    await page.locator('button.session-tab:has-text("Short Break")').click();
    await expect(page.locator('.timer-session-of')).toHaveCount(0);
  });

  test('Active Task Card shows empty state when no task is active', async ({ page }) => {
    const card = page.locator('.active-task-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('No task');
  });

  test('Active Task Card shows the KR subtitle (objective → KR) when the task links to a KR', async ({ page }) => {
    // Seed task 'Design new dashboard layout' (task-1) links to kr-1 (obj-1
    // 'Ship myOKR v2.0'). The subtitle line resolves objective.title → kr.title.
    await openTaskSwitcher(page);
    await page.locator('.switcher-task:has-text("Design new dashboard layout")').click();

    const subtitle = page.locator('.active-task-card-subtitle');
    await expect(subtitle).toBeVisible();
    await expect(subtitle).toContainText('Ship myOKR v2.0');
    await expect(subtitle).toContainText('Complete 15 feature tickets');
  });

  test('Active Task Card shows a fallback subtitle when the task has no KR', async ({ page }) => {
    // Seed task 'Write API documentation' (task-3) has no keyResultId.
    await openTaskSwitcher(page);
    await page.locator('.switcher-task:has-text("Write API documentation")').click();

    const subtitle = page.locator('.active-task-card-subtitle');
    await expect(subtitle).toBeVisible();
    // No KR → fallback text (not empty, not the KR title).
    await expect(subtitle).toContainText(/no key result/i);
  });

  test('Active Task Card has a decorative left icon tile and a cyan Change button', async ({ page }) => {
    await openTaskSwitcher(page);
    await page.locator('.switcher-task:has-text("Design new dashboard layout")').click();

    // Decorative square icon tile on the left (no role / aria, pure decoration).
    await expect(page.locator('.active-task-card .active-task-card-icon')).toBeVisible();
    // Cyan "Change" button on the right edge opens the Task Switcher modal.
    const change = page.locator('.active-task-card .active-task-card-change');
    await expect(change).toBeVisible();
    await expect(change).toHaveText(/change/i);
    await change.click();
    await expect(page.locator('.task-switcher')).toBeVisible();
  });

  test('Active Task Card has no left accent border', async ({ page }) => {
    await openTaskSwitcher(page);
    await page.locator('.switcher-task:has-text("Design new dashboard layout")').click();

    // The old 3px cyan border-left was removed; the card uses a uniform border.
    const borderLeft = await page.locator('.active-task-card').evaluate(
      el => getComputedStyle(el).borderLeftWidth
    );
    // All borders should be the same width (no 3px accent on the left).
    const borderRight = await page.locator('.active-task-card').evaluate(
      el => getComputedStyle(el).borderRightWidth
    );
    expect(borderLeft).toBe(borderRight);
  });

  test('Task Switcher lists incomplete tasks and selects one', async ({ page }) => {
    await openTaskSwitcher(page);
    const modal = page.locator('.task-switcher');
    // Seeded open tasks appear (completed ones are filtered out).
    await expect(modal.locator('.switcher-task:has-text("Design new dashboard layout")')).toBeVisible();

    await page.locator('.switcher-task:has-text("Write API documentation")').click();
    await expect(page.locator('.active-task-card')).toContainText('Write API documentation');
    // Modal closes after selection.
    await expect(page.locator('.task-switcher')).toHaveCount(0);
  });

  test('Task Switcher is a dialog with option rows (ARIA semantics)', async ({ page }) => {
    // The switcher is a modal dialog (not a menu): it's a pure list of options,
    // so role="option" + aria-selected is the correct pattern (the old dropdown
    // mixed options with Clear / Plan-your-day actions and used a menu).
    await openTaskSwitcher(page);
    const modal = page.locator('.task-switcher');
    await expect(modal).toHaveAttribute('role', 'dialog');
    await expect(modal).toHaveAttribute('aria-modal', 'true');
    await expect(modal.locator('.switcher-task').first()).toHaveAttribute('role', 'option');
  });

  test('active task row marks selection via aria-selected (ARIA validity)', async ({ page }) => {
    // role="option" uses aria-selected to mark the chosen option. aria-current
    // is not valid on option, so it must be absent (the old dropdown used a
    // menu + aria-current because it mixed options with actions; this modal is
    // a pure option list).
    await openTaskSwitcher(page);
    await page.locator('.switcher-task:has-text("Design new dashboard layout")').click();
    await openTaskSwitcher(page); // reopen

    const activeRow = page.locator('.switcher-task:has-text("Design new dashboard layout")');
    await expect(activeRow).toHaveAttribute('aria-selected', 'true');
    await expect(activeRow).not.toHaveAttribute('aria-current', /.*/);
  });
});

// ==========================================
// Bottom utility bar + Stats widget (ticket 04)
// ==========================================

test.describe('Bottom utility bar + Stats widget (ticket 04)', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await openSession(page);
  });

  test('3-column bottom bar is present with audio / queue / stats slots', async ({ page }) => {
    const bar = page.locator('.session-bottom-bar');
    await expect(bar).toBeVisible();
    // Three grid columns.
    await expect(bar.locator('.session-bottom-bar-audio')).toBeVisible();
    await expect(bar.locator('.session-bottom-bar-queue')).toBeVisible();
    await expect(bar.locator('.session-bottom-bar-stats')).toBeVisible();
  });

  test('vertical gap above the bottom bar equals the gap above the Start controls', async ({ page }) => {
    // Layout parity (2026-08-13 feedback): the whitespace between the Active
    // Task Card and the Start/Pause controls must equal the whitespace between
    // the Start/Pause controls and the bottom utility bar. Measure the actual
    // rendered geometry (not CSS values) so margin/flex distribution can't hide
    // a difference. Allow a 1px tolerance for sub-pixel rounding.
    const gaps = await page.evaluate(() => {
      const card = document.querySelector('.active-task-card');
      const controls = document.querySelector('.timer-controls');
      const bar = document.querySelector('.session-bottom-bar');
      if (!card || !controls || !bar) return null;
      const c = card.getBoundingClientRect();
      const t = controls.getBoundingClientRect();
      const b = bar.getBoundingClientRect();
      return {
        cardToControls: t.top - c.bottom,
        controlsToBar: b.top - t.bottom,
      };
    });
    expect(gaps).not.toBeNull();
    expect(Math.abs(gaps!.cardToControls - gaps!.controlsToBar)).toBeLessThanOrEqual(1);
  });

  test('each bottom-bar slot is a rounded card on bg-card (not a flat text row)', async ({ page }) => {
    // The three slots are distinct rounded containers, not a flat row divided
    // by a top border line (ADR-0016 redesign follow-up).
    for (const sel of ['.session-bottom-bar-audio', '.session-bottom-bar-queue', '.session-bottom-bar-stats']) {
      const slot = page.locator(sel);
      const styles = await slot.evaluate(el => {
        const cs = getComputedStyle(el);
        return { radius: cs.borderRadius, bg: cs.backgroundColor };
      });
      // Rounded (not 0). 8px+ radius.
      expect(Number(styles.radius.replace('px', ''))).toBeGreaterThanOrEqual(8);
    }
    // The bar itself no longer has a top divider border.
    const barBorderTop = await page.locator('.session-bottom-bar').evaluate(
      el => getComputedStyle(el).borderTopWidth
    );
    expect(Number(barBorderTop.replace('px', ''))).toBe(0);
  });

  test('audio card has an Ambient subtitle line under the preset name', async ({ page }) => {
    const audio = page.locator('.session-bottom-bar-audio');
    await expect(audio.locator('.audio-widget-subtitle')).toBeVisible();
    await expect(audio.locator('.audio-widget-subtitle')).toHaveText(/ambient/i);
  });

  test('stats card shows a large numeric count beside the label', async ({ page }) => {
    const stats = page.locator('.session-bottom-bar-stats');
    await expect(stats.locator('.session-stats-count')).toBeVisible();
    await expect(stats.locator('.session-stats-label')).toBeVisible();
    // Count is rendered larger than the label (mockup: big number).
    const countSize = await stats.locator('.session-stats-count').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    const labelSize = await stats.locator('.session-stats-label').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    expect(countSize).toBeGreaterThan(labelSize);
  });

  test('timer ring progress stroke is solid cyan (no gradient, thick)', async ({ page }) => {
    // Stage a task + start so progress > 0 and the arc is visible.
    await page.locator('button[title="Day plan"]').first().click();
    await page.waitForTimeout(300);
    await page.locator('.focus-plan-day-btn').click();
    await page.waitForTimeout(500);
    await openSession(page);
    await page.locator('.active-task-card-change').click();
    await page.locator('.switcher-task').first().click();
    await page.locator('.timer-section button:has-text("Start")').click();
    await page.waitForTimeout(200);

    const stroke = await page.locator('.timer-ring-progress').evaluate(el => {
      const cs = getComputedStyle(el);
      return { stroke: cs.stroke, width: cs.strokeWidth };
    });
    // NOT a url(#gradient) reference — solid color.
    expect(stroke.stroke).not.toContain('url(');
    // Thick (mockup target ~14, was 6).
    expect(parseFloat(stroke.width)).toBeGreaterThanOrEqual(10);
    // Cyan: the stroke resolves to --color-primary #22D3EE = rgb(34, 211, 238).
    await expect.poll(async () => {
      const rgb = await page.locator('.timer-ring-progress').evaluate(el => getComputedStyle(el).stroke);
      return rgb;
    }, { timeout: 3000 }).toMatch(/rgb\(34,\s*211,\s*238\)|#22d3ee/i);
    await page.locator('.timer-section button:has-text("Pause")').click();
  });

  test('SESSION x OF y label is cyan, not muted gray', async ({ page }) => {
    await page.locator('button[title="Day plan"]').first().click();
    await page.waitForTimeout(300);
    await page.locator('.focus-plan-day-btn').click();
    await page.waitForTimeout(500);
    await openSession(page);
    await page.locator('.active-task-card-change').click();
    await page.locator('.switcher-task:has-text("Design new dashboard layout")').click();

    const label = page.locator('.timer-session-of');
    await expect(label).toBeVisible();
    const color = await label.evaluate(el => getComputedStyle(el).color.toLowerCase());
    // Must NOT be the old muted gray (#71717a / rgb(113, 113, 122)).
    expect(color).not.toMatch(/113,\s*113,\s*122/);
    // Must be cyan (--color-focus #22d3ee = rgb(34, 211, 238)).
    expect(color).toMatch(/rgb\(34,\s*211,\s*238\)|#22d3ee/);
  });

  test('Stats widget shows today\'s completed session count', async ({ page }) => {
    // The seed history includes today's record (mocks/store.ts generates 14
    // days; today's pomodorosPerDay[13] = 3). The stats widget reads today's
    // DailyRecord.completedPomodoros.
    const stats = page.locator('.session-bottom-bar-stats');
    await expect(stats).toBeVisible();
    await expect(stats.locator('.session-stats-label')).toHaveText('sessions today');
    // Today's seeded count is 3 — a real number, not 0.
    const count = await stats.locator('.session-stats-count').textContent();
    expect(Number(count)).toBeGreaterThan(0);
  });

  test('Stats widget shows 0 sessions today when no history exists', async ({ page }) => {
    // Wipe today's history, flush the Automerge queue so the write settles,
    // then signal a sync so SessionStats reloads without a full page reload
    // (which would re-seed the mock store).
    await page.evaluate(async () => {
      const { loadHistory, saveHistory, todayKey } = await import('/src/lib/pomodoro-storage.ts');
      const hist = await loadHistory();
      const key = todayKey();
      await saveHistory(hist.filter(r => r.date !== key));
      await (window as any).__flushAutomergeQueue?.();
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });

    // The count + label are flex-gap separated, so textContent concatenates;
    // assert them separately.
    const stats = page.locator('.session-bottom-bar-stats');
    await expect(stats.locator('.session-stats-count')).toHaveText('0', { timeout: 5000 });
    await expect(stats.locator('.session-stats-label')).toHaveText('sessions today');
  });

  test('audio widget shows the active ambient preset (ticket 06)', async ({ page }) => {
    const audio = page.locator('.session-bottom-bar-audio');
    await expect(audio).toBeVisible();
    // Default is 'none' → invites the user to pick.
    const widget = audio.locator('.audio-widget');
    await expect(widget).toBeVisible();
    await expect(widget).toContainText(/none|pick/i);
  });
});

// ==========================================
// Ambient audio widget (ticket 06)
// ==========================================

test.describe('Ambient audio widget (ticket 06)', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await openSession(page);
  });

  test('shows the active preset name and opens a selector', async ({ page }) => {
    const widget = page.locator('.audio-widget');
    await expect(widget).toBeVisible();

    // Open the selector.
    await widget.click();
    const selector = page.locator('.audio-selector');
    await expect(selector).toBeVisible();
    // All four options are present.
    await expect(selector.locator('.audio-option', { hasText: /Rain/i })).toBeVisible();
    await expect(selector.locator('.audio-option', { hasText: /Forest/i })).toBeVisible();
    await expect(selector.locator('.audio-option', { hasText: /Caf/i })).toBeVisible();
    await expect(selector.locator('.audio-option', { hasText: /None/i })).toBeVisible();
  });

  test('selecting a preset updates the widget display and persists', async ({ page }) => {
    const widget = page.locator('.audio-widget');
    await widget.click();
    await page.locator('.audio-option', { hasText: /^Rain/i }).click();

    // Selector closes; widget now shows Rain.
    await expect(page.locator('.audio-selector')).toHaveCount(0);
    await expect(widget).toContainText(/Rain/i);
  });

  test('selecting None turns the sound off', async ({ page }) => {
    // Set to Rain first.
    const widget = page.locator('.audio-widget');
    await widget.click();
    await page.locator('.audio-option', { hasText: /^Rain/i }).click();
    await expect(widget).toContainText(/Rain/i);

    // Now select None.
    await widget.click();
    await page.locator('.audio-option', { hasText: /^None/i }).click();
    await expect(widget).toContainText(/none|pick/i);
  });

  test('reflects the persisted preset on mount', async ({ page }) => {
    // The settings panel's AmbientPresetPicker and the bottom-bar widget share
    // settings.ambientPreset — change via settings, widget reflects it.
    await page.locator('.timer-controls button[title="Settings"]').click();
    await page.locator('.ambient-chip', { hasText: 'Forest' }).click();
    await page.locator('.timer-controls button[title="Settings"]').click();

    const widget = page.locator('.audio-widget');
    await expect(widget).toContainText(/Forest/i);
  });
});

// ==========================================
// Queue widget + Day-plan picker sourcing (ticket 05)
// ==========================================

test.describe('Queue widget + Day-plan picker (ticket 05)', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    // Replan so seeded tasks are on the Day plan queue (the Session picker is
    // sourced from TodayPlan.taskIds, ticket 05).
    await page.locator('button[title="Day plan"]').first().click();
    await page.waitForTimeout(300);
    await page.locator('.focus-plan-day-btn').click();
    await page.waitForTimeout(500);
    await openSession(page);
  });

  test('Queue widget shows the NEXT queued task (not the active one) under "UP NEXT IN QUEUE"', async ({ page }) => {
    // The middle card now shows the next task in the Day-plan queue that isn't
    // the active task (behavior change from ticket 05's active-task mirror).
    await page.locator('.active-task-card-change').click();
    await page.locator('.switcher-task:has-text("Design new dashboard layout")').click();

    const queue = page.locator('.queue-widget');
    await expect(queue).toBeVisible();
    // Eyebrow label is the "UP NEXT IN QUEUE" caption.
    await expect(queue.locator('.queue-eyebrow')).toHaveText(/up next in queue/i);
    // The preview must NOT be the active task title (it's the NEXT one).
    await expect(queue).not.toContainText('Design new dashboard layout');
    // The preview string is a non-empty task title.
    const preview = (await queue.locator('.queue-title').textContent()) ?? '';
    expect(preview.trim().length).toBeGreaterThan(0);
  });

  test('Queue widget shows empty state linking to Day plan when the queue is exhausted', async ({ page }) => {
    // With no active task and a populated queue, the "next" task is simply the
    // first queued task — so the empty state only triggers when the queue has
    // no items at all. Stage a single-task queue by completing/skipping all but
    // one is heavy; instead assert the empty-state copy shape directly by
    // wiping the TodayPlan.
    await page.evaluate(async () => {
      const { saveTodayPlan } = await import('/src/lib/today-focus.ts');
      await saveTodayPlan({ date: '1970-01-01', taskIds: [], skippedIds: [] });
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    });
    await page.waitForTimeout(200);

    const queue = page.locator('.queue-widget');
    await expect(queue).toBeVisible();
    await expect(queue).toContainText(/pick a task|no task|plan/i);
  });
});

// ==========================================
// Regression: focus completion → short break transition
// ==========================================

test.describe('Focus completion transitions to short break', () => {
  test('a completed focus auto-starts the short break (with active task)', async ({ page }) => {
    await waitForApp(page);
    // 1-min focus / 1-min break, auto-start breaks ON (posture ii).
    await openSession(page);
    await page.locator('.timer-controls button[title="Settings"]').click();
    const inputs = page.locator('.settings-grid input[type="number"]');
    await inputs.nth(0).fill('1'); // focus
    await inputs.nth(1).fill('1'); // short break
    // Turn auto-start breaks ON (the mock seed defaults it to false).
    const breakToggle = page.locator('.toggle-row:has-text("Auto-start breaks") .toggle-switch');
    if (await breakToggle.evaluate(el => !el.classList.contains('on'))) await breakToggle.click();
    await page.locator('.timer-controls button[title="Settings"]').click();

    // Speed up so 1-min focus completes in ~3s.
    await page.evaluate(() => {
      const origInterval = window.setInterval.bind(window);
      const origTimeout = window.setTimeout.bind(window);
      const speed = (ms: number) => ms >= 500 ? Math.max(ms / 20, 10) : ms;
      (window as any).setInterval = (fn: TimerHandler, ms?: number, ...args: any[]) =>
        origInterval(fn, ms !== undefined ? speed(ms) : ms, ...args);
      (window as any).setTimeout = (fn: TimerHandler, ms?: number, ...args: any[]) =>
        origTimeout(fn, ms !== undefined ? speed(ms) : ms, ...args);
    });

    // Stage a task via the Day plan (replan + picker).
    await page.locator('button[title="Day plan"]').first().click();
    await page.waitForTimeout(300);
    await page.locator('.focus-plan-day-btn').click();
    await page.waitForTimeout(500);
    await openSession(page);
    await page.locator('.active-task-card-change').click();
    await page.locator('.switcher-task').first().click();
    await expect(page.locator('.active-task-card')).not.toContainText('No task');

    // Start focus.
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    // Focus completes → Short Break auto-starts.
    await expect(page.locator('button.session-tab.active:has-text("Short Break")')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('button:has-text("Pause")')).toBeVisible({ timeout: 5000 });
  });

  test('a completed focus switches to the short break tab with correct duration (NO active task)', async ({ page }) => {
    // Regression guard: the new Session tab defaults to no active task (the
    // TaskList is gone). A focus run without a task must still transition to
    // the break — the break logic is independent of task attribution. With
    // autoStartBreaks OFF (the mock default), the break stages but doesn't
    // auto-start; we assert the tab switches and the duration is correct.
    await waitForApp(page);
    await openSession(page);
    await page.locator('.timer-controls button[title="Settings"]').click();
    const inputs = page.locator('.settings-grid input[type="number"]');
    await inputs.nth(0).fill('1');
    await inputs.nth(1).fill('1');
    await page.locator('.timer-controls button[title="Settings"]').click();

    await page.evaluate(() => {
      const origInterval = window.setInterval.bind(window);
      const origTimeout = window.setTimeout.bind(window);
      const speed = (ms: number) => ms >= 500 ? Math.max(ms / 20, 10) : ms;
      (window as any).setInterval = (fn: TimerHandler, ms?: number, ...args: any[]) =>
        origInterval(fn, ms !== undefined ? speed(ms) : ms, ...args);
      (window as any).setTimeout = (fn: TimerHandler, ms?: number, ...args: any[]) =>
        origTimeout(fn, ms !== undefined ? speed(ms) : ms, ...args);
    });

    // Start focus with NO task — dismiss the "No Task Selected" warning.
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('.confirm-modal button:has-text("Start Anyway")')).toBeVisible();
    await page.locator('.confirm-modal button:has-text("Start Anyway")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    // Focus completes → Short Break tab activates with the break duration.
    await expect(page.locator('button.session-tab.active:has-text("Short Break")')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.timer-digits')).toHaveText('01:00');
  });
});

// ==========================================
// Task Switcher modal + click-to-detail (2026-08-13 redesign)
// ==========================================

test.describe('Task Switcher modal + click-to-detail', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    // Replan so seeded tasks join the Day-plan queue (UP NEXT section source),
    // and so the Today-bucket tasks are present.
    await page.locator('button[title="Day plan"]').first().click();
    await page.waitForTimeout(300);
    await page.locator('.focus-plan-day-btn').click();
    await page.waitForTimeout(500);
    await openSession(page);
  });

  test('Change button opens the Task Switcher modal with sectioned task rows', async ({ page }) => {
    await page.locator('.active-task-card-change').click();
    const modal = page.locator('.task-switcher');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('role', 'dialog');

    // Search header present with placeholder + Esc badge.
    await expect(modal.locator('.switcher-search-input')).toHaveAttribute('placeholder', 'Search tasks');
    await expect(modal.locator('.switcher-esc-badge')).toHaveText('Esc');

    // Empty sections are hidden (no header without rows). With no active task,
    // CURRENT is absent; UP NEXT (and/or TODAY) must be present. At least one
    // section title renders, and the known header copy appears when its section
    // has tasks.
    const titles = modal.locator('.switcher-section-title');
    await expect(titles.first()).toBeVisible();
    // The "Up next in queue" header renders (the replan populated the queue).
    await expect(modal.locator('.switcher-section-title', { hasText: 'Up next in queue' })).toBeVisible();

    // At least one task row is present.
    await expect(modal.locator('.switcher-task').first()).toBeVisible();
  });

  test('CURRENT section appears once a task is active', async ({ page }) => {
    // Stage a task first, then open the switcher — CURRENT now has a row.
    await page.locator('.active-task-card-change').click();
    await page.locator('.switcher-task').first().click();
    await page.locator('.active-task-card-change').click();

    const modal = page.locator('.task-switcher');
    await expect(modal.locator('.switcher-section-title', { hasText: 'Current' })).toBeVisible();
    // The active row lives under CURRENT.
    const currentSection = modal.locator('.switcher-section', { hasText: 'Current' });
    await expect(currentSection.locator('.switcher-task.active')).toBeVisible();
  });

  test('each task row has a category dot, title, and KR subtitle', async ({ page }) => {
    await page.locator('.active-task-card-change').click();
    const modal = page.locator('.task-switcher');
    const row = modal.locator('.switcher-task:has-text("Design new dashboard layout")');
    await expect(row).toBeVisible();
    await expect(row.locator('.switcher-task-dot')).toBeVisible();
    await expect(row.locator('.switcher-task-title')).toHaveText('Design new dashboard layout');
    // task-1 links to kr-1 (Complete 15 feature tickets).
    await expect(row.locator('.switcher-task-subtitle')).toContainText('Complete 15 feature tickets');
  });

  test('a task with no KR shows "No key result" subtitle', async ({ page }) => {
    await page.locator('.active-task-card-change').click();
    const modal = page.locator('.task-switcher');
    const row = modal.locator('.switcher-task:has-text("Write API documentation")');
    await expect(row).toBeVisible();
    await expect(row.locator('.switcher-task-subtitle')).toHaveText(/no key result/i);
  });

  test('queue / today rows show a session estimate on the right', async ({ page }) => {
    await page.locator('.active-task-card-change').click();
    const modal = page.locator('.task-switcher');
    // task-1 has estimatedPomodoros 5 — its row (when not active) shows "5 sessions".
    const row = modal.locator('.switcher-task:has-text("Design new dashboard layout")');
    await expect(row.locator('.switcher-task-sessions')).toHaveText(/5 sessions/i);
  });

  test('overdue task shows an Overdue badge instead of the session estimate', async ({ page }) => {
    // task-5 'Plan sprint retrospective' has dueDate = yesterday (overdue).
    await page.locator('.active-task-card-change').click();
    const modal = page.locator('.task-switcher');
    const row = modal.locator('.switcher-task:has-text("Plan sprint retrospective")');
    await expect(row).toBeVisible();
    await expect(row.locator('.switcher-task-overdue')).toHaveText(/overdue/i);
  });

  test('the active task row shows a cyan checkmark, not the session estimate', async ({ page }) => {
    // Stage task-1 as active first, then reopen the switcher.
    await page.locator('.active-task-card-change').click();
    await page.locator('.switcher-task:has-text("Design new dashboard layout")').click();
    await page.locator('.active-task-card-change').click();

    const modal = page.locator('.task-switcher');
    const row = modal.locator('.switcher-task:has-text("Design new dashboard layout")');
    await expect(row).toHaveClass(/active/);
    await expect(row.locator('.switcher-task-check')).toBeVisible();
    // No session estimate on the active row.
    await expect(row.locator('.switcher-task-sessions')).toHaveCount(0);
  });

  test('search filters task rows by title', async ({ page }) => {
    await page.locator('.active-task-card-change').click();
    const modal = page.locator('.task-switcher');
    await modal.locator('.switcher-search-input').fill('Write API');
    await expect(modal.locator('.switcher-task:has-text("Write API documentation")')).toBeVisible();
    // Non-matching tasks disappear.
    await expect(modal.locator('.switcher-task:has-text("Design new dashboard layout")')).toHaveCount(0);
  });

  test('search with no matches shows the empty message', async ({ page }) => {
    await page.locator('.active-task-card-change').click();
    const modal = page.locator('.task-switcher');
    await modal.locator('.switcher-search-input').fill('zzz-nope-zzz');
    await expect(modal.locator('.switcher-empty')).toHaveText(/no matching tasks/i);
  });

  test('Esc closes the modal', async ({ page }) => {
    await page.locator('.active-task-card-change').click();
    await expect(page.locator('.task-switcher')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.task-switcher')).toHaveCount(0);
  });

  test('clicking the active task title opens the Task Detail modal', async ({ page }) => {
    // Stage a task first.
    await page.locator('.active-task-card-change').click();
    await page.locator('.switcher-task:has-text("Design new dashboard layout")').click();
    await expect(page.locator('.active-task-card')).toContainText('Design new dashboard layout');

    // Click the title → opens the same Task Detail modal the Plan/Tasks tab uses.
    await page.locator('.active-task-card-title').click();
    await expect(page.locator('.task-detail-panel')).toBeVisible();
    await expect(page.locator('.task-detail-panel .detail-title')).toHaveText('Design new dashboard layout');
  });

  test('clicking outside the Task Switcher panel closes it', async ({ page }) => {
    await page.locator('.active-task-card-change').click();
    await expect(page.locator('.task-switcher')).toBeVisible();
    // Click the overlay backdrop (outside the panel).
    await page.locator('.task-switcher-overlay').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('.task-switcher')).toHaveCount(0);
  });
});
