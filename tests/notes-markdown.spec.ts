import { test, expect, type Locator } from '@playwright/test';

/**
 * Notes markdown surface (2026-09-06) — the shared `.md-body` typography layer:
 *  bare autolink URLs middle-truncate past 60 chars (href + hover title keep
 *  the full URL); typed `[label](url)` labels pass through untouched;
 *  every GFM block (headings, lists, task lists, blockquote, table, code, hr)
 *  is styled by the markdown layer — no browser-default fallbacks;
 *  task-list checkboxes are display-only.
 */
test.describe('Notes markdown rendering', () => {
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
      await okr.saveObjectives([{ id: 'o1', cycleId: 'c1', title: 'Helm Objective', order: 0, createdAt: '2026-05-01T00:00:00Z' }]);
      await okr.saveKeyResults([{ id: 'kr1', objectiveId: 'o1', title: 'Launch Helm', targetValue: 30, currentValue: 11, unit: 'pomodoros', order: 0, createdAt: '2026-05-01T00:00:00Z' }]);
      await storage.saveTasks([{
        id: 't1',
        title: '[Helm] Product plan',
        category: 'decide',
        bucket: 'this_week',
        dueDate: '2026-07-31',
        keyResultId: 'kr1',
        estimatedPomodoros: 8,
        completedPomodoros: 2,
        isCompleted: false,
        createdAt: '2026-07-01T10:00:00Z',
        description: [
          '# Helm product plan',
          '### Product plan checklist',
          '- https://docs.google.com/spreadsheets/d/1H7hN_fL6W7bYk3nSUsbZ1hJ0w9ufsi2j/edit?gid=1759489338#gid=1759489338',
          '- [release doc](https://example.com/a/release/documentation/rolling-out-helm-to-initial-users "external doc")',
          '- [https://example.com/landing](https://example.com/landing-page)',
          '- [https://example.com/x](https://example.com/x)',
          '- https://main.d8irts5m6x146.amplifyapp.com/',
          '',
          '#### Phase 1 — coming soon site',
          '- [x] penetration testing booked',
          '- [ ] refactor onboarding',
          '',
          '- level-one bullet',
          '  - level-two bullet',
          '    - level-three bullet',
          '',
          '> Someone must review all documents and links.',
          '',
          '| Phase | Goal |',
          '| --- | --- |',
          '| 1 | Coming soon site |',
          '| 2 | Beta with DeFi |',
          '',
          'Inline `code snippet` and a rule:',
          '',
          '```',
          'drive.google.com/file/d/xyz/preview?usp=sharing_long_line_to_make_the_first_line_wide',
          '```',
          '',
          '---',
        ].join('\n'),
        todos: [],
        comments: [],
      }]);
    });
    await page.evaluate(() => window.localStorage.setItem('myokr_active_section', 'tasks'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('.board-task-card', { hasText: '[Helm] Product plan' }).locator('.card-title').click();
    await expect(page.locator('.task-detail-panel')).toBeVisible();
    // Lazy-loaded Markdown must settle before notes assertions.
    await expect(page.locator('.notes-content-view')).toBeVisible();
    await expect(page.locator('.notes-content-view h3')).toBeVisible();
  });

  test('links: bare autolinks over 60 chars middle-truncate; href + hover title keep the full URL', async ({ page }) => {
    const links = page.locator('.notes-content-view a');

    // The 99-char spreadsheet URL truncates to 34 chars + … + 22 chars.
    const long = links.nth(0);
    await expect(long).toHaveText('docs.google.com/spreadsheets/d/1H7…9489338#gid=1759489338');
    await expect(long).toHaveAttribute('href', 'https://docs.google.com/spreadsheets/d/1H7hN_fL6W7bYk3nSUsbZ1hJ0w9ufsi2j/edit?gid=1759489338#gid=1759489338');
    await expect(long).toHaveAttribute('title', 'docs.google.com/spreadsheets/d/1H7hN_fL6W7bYk3nSUsbZ1hJ0w9ufsi2j/edit?gid=1759489338#gid=1759489338');

    // Typed labels are never URL-shaped, so they pass through untouched —
    // including an authored hover title.
    await expect(links.nth(1)).toHaveText('release doc');
    await expect(links.nth(1)).toHaveAttribute('title', 'external doc');

    // A typed label that IS a URL still passes through verbatim — the
    // protocol strip belongs to autolinks alone.
    await expect(links.nth(2)).toHaveText('https://example.com/landing');
    await expect(links.nth(2)).toHaveAttribute('href', 'https://example.com/landing-page');

    // A label identical to its href is presentationally a bare URL — there
    // is no AST difference from a true autolink, so autolink rules apply.
    await expect(links.nth(3)).toHaveText('example.com/x');
    await expect(links.nth(3)).toHaveAttribute('href', 'https://example.com/x');

    // Short autolinks (34 chars) stay whole.
    await expect(links.nth(4)).toHaveText('main.d8irts5m6x146.amplifyapp.com/');
    await expect(links.nth(4)).not.toHaveAttribute('title');
  });

  test('md-body layer: headings scale and brighten, blockquote/table/code/hr styled — no browser defaults', async ({ page }) => {
    const view = page.locator('.notes-content-view');
    // The shared markdown component wraps its output in the .md-body layer.
    await expect(view.locator('.md-body')).toHaveCount(1);

    // Heading scale: distinct rem steps h1 > h3 > h4 > body, weight 600,
    // bright text (--text-primary) vs the secondary body color.
    const h1 = view.locator('.md-body h1');
    const h3 = view.locator('.md-body h3');
    const h4 = view.locator('.md-body h4');
    await expect(h1).toHaveCount(1);
    await expect(h3).toHaveCount(1);
    await expect(h4).toHaveCount(1);
    await expect(h1).toHaveCSS('font-size', '18.4px');
    await expect(h3).toHaveCSS('font-size', '15.2px');
    await expect(h4).toHaveCSS('font-size', '14.4px');
    await expect(h1).toHaveCSS('font-weight', '600');
    await expect(h1).toHaveCSS('color', 'rgb(228, 228, 231)'); // --text-primary
    await expect(view.locator('.md-body p').first()).toHaveCSS('color', 'rgb(161, 161, 170)'); // --text-secondary

    // Headings that follow content get breathing room above; the first
    // heading of the notes sits flush at the top.
    expect(await h4.evaluate(el => parseFloat(getComputedStyle(el).marginTop))).toBeGreaterThan(0);
    expect(await h3.evaluate(el => parseFloat(getComputedStyle(el).marginTop))).toBeGreaterThan(0);
    expect(await h1.evaluate(el => parseFloat(getComputedStyle(el).marginTop))).toBe(0);

    // Blockquote: left rule + muted text.
    const quote = view.locator('.md-body blockquote');
    await expect(quote).toHaveCount(1);
    await expect(quote).toHaveCSS('border-left-width', '2px');
    await expect(quote.locator('p')).toHaveCSS('color', 'rgb(113, 113, 122)'); // --text-muted

    // Table: ruled cells, bold bright header row.
    const th = view.locator('.md-body th');
    await expect(th).toHaveCount(2);
    await expect(th.first()).toHaveCSS('font-weight', '600');
    await expect(th.first()).toHaveCSS('color', 'rgb(228, 228, 231)');
    await expect(view.locator('.md-body td').first()).toHaveCSS('border-top-width', '1px');

    // Inline code: mono chip, not browser default serif.
    await expect(view.locator('.md-body code').first()).toHaveCSS('font-family', /JetBrains Mono/);

    // Thematic break: a quiet 1px rule.
    await expect(view.locator('.md-body hr')).toHaveCSS('border-top-width', '1px');
  });

  test('code block: the Copy button sits above the text column, never on the first line', async ({ page }) => {
    // The button floats top-right inside the block; the block must reserve
    // headroom so it never covers the code's first line.
    const geometry = await page.locator('.notes-content-view .md-code-block').evaluate(el => {
      const btn = el.querySelector('.md-code-copy')!.getBoundingClientRect();
      const pre = el.querySelector('pre')!;
      const range = document.createRange();
      range.selectNodeContents(pre);
      const text = range.getBoundingClientRect();
      return { btnBottom: btn.bottom, textTop: text.top };
    });
    expect(geometry.btnBottom).toBeLessThanOrEqual(geometry.textTop + 1);
  });

  test('lists: mono gutter markers, nesting differentiates (· then –)', async ({ page }) => {
    const view = page.locator('.notes-content-view .md-body');
    const marker = (el: Locator) => el.evaluate(e => getComputedStyle(e, '::before').content);

    // Level 1 bullets keep the app's mono dot gutter.
    const level1 = view.locator('ul > li', { hasText: 'level-one bullet' });
    await expect(level1).toHaveCount(1);
    expect(await marker(level1)).toBe('"·"');

    // Level 2 switches to an en dash so nesting reads at a glance.
    const level2 = view.locator('ul ul > li', { hasText: 'level-two bullet' });
    await expect(level2).toHaveCount(1);
    expect(await marker(level2)).toBe('"–"');

    // Every list closes tight: the last item of a list carries no bottom
    // margin, so a list ending the notes leaves no stray gap.
    await expect(level2).toHaveCSS('margin-bottom', '0px');
  });

  test('task lists: checkboxes render display-only (disabled, state visible)', async ({ page }) => {
    const boxes = page.locator('.notes-content-view .md-body input[type="checkbox"]');
    await expect(boxes).toHaveCount(2);
    await expect(boxes.nth(0)).toBeChecked();
    await expect(boxes.nth(0)).toBeDisabled();
    await expect(boxes.nth(1)).not.toBeChecked();
    await expect(boxes.nth(1)).toBeDisabled();

    // The explain-no-toggle hint lives on the list item, which still
    // receives hover — the input itself is pointer-events: none and could
    // never show a tooltip.
    const taskItem = page.locator('.notes-content-view .md-body li', { hasText: 'penetration testing booked' });
    await expect(taskItem).toHaveAttribute('title', 'Read-only — edit notes to toggle');

    // No dead zones: a disabled input swallows clicks, so the box must pass
    // them through — clicking a checkbox still enters the notes editor.
    // (This swaps the view for the textarea, so it runs last.)
    await boxes.nth(0).click({ force: true });
    await expect(page.locator('.notes-textarea')).toBeVisible();
  });
});
