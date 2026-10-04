# Evidence

## 1. Summary

Implemented full-width display for the Task Detail Notes container after saving (`.notes-content-view`). Removed the artificial `max-width: 72ch` constraint and vestigial `font-size` styling to restore layout-only compliance, eliminated the ~300px blank right gap, allowed fenced code blocks (`.md-code-block`) and markdown tables to expand across the full panel width, fixed Escape key bubbling in notes textarea, and updated design system documentation and Playwright tests.

- PR: Local branch `develop` (pending PR)
- Commit: `0002d721160d7b4da398370ffeb72f8c67e31639` (working tree uncommitted changes)

## 2. Output Validation

| Requirement | Evidence | Status |
| --- | --- | --- |
| Rendered notes container (`.notes-content-view`) has `width: 100%` and no `max-width: 72ch` constraint | `src/styles/pomodoro.css:4727-4732` (`.notes-content-view { position: relative; cursor: text; width: 100%; }`) | PASS |
| Rendered notes width matches the width of `.notes-textarea` (within ±2px margin of scroll container padding) | `tests/task-detail-restyle.spec.ts:239-242` (`expect(Math.abs(textareaBox.width - notesBox.width)).toBeLessThanOrEqual(2)`) | PASS |
| Fenced code blocks (`.md-code-block`) occupy the full available width of the notes container | `tests/task-detail-restyle.spec.ts:232-237` (`expect(Math.abs(codeBox.width - notesBox.width)).toBeLessThanOrEqual(2)`) | PASS |
| No awkward blank space (~300px) remains to the right of notes on desktop viewports | `screenshots/task-detail-notes-fullwidth.png` & `tests/task-detail-restyle.spec.ts:228-230` (`expect(Math.abs(notesBox.width - available)).toBeLessThanOrEqual(2)`) | PASS |
| Text within notes continues to wrap cleanly without overflowing (`overflow-wrap: break-word`) | `src/styles/markdown.css:14` (`.md-body { overflow-wrap: break-word; }`) & `tests/notes-markdown.spec.ts` | PASS |
| Automated Playwright restyle test in `tests/task-detail-restyle.spec.ts` passes with full-width assertion | `npx playwright test tests/task-detail-restyle.spec.ts` (13 passed, 19.4s) | PASS |
| Design system documentation in `docs/design-system.md` is updated to record the full-width decision | `docs/design-system.md:1235-1245` ("Notes width 2026-10-04 — full section width for both editor and render.") | PASS |
| TypeScript check (`npx tsc --noEmit`) passes with zero errors | `npx tsc --noEmit` exited with code 0 | PASS |

## 3. Test Result

```text
npx playwright test tests/task-detail-restyle.spec.ts tests/notes-markdown.spec.ts

Running 13 tests using 2 workers

  ✓  Task detail restyle › notes: rendered view and code blocks span full panel width, matching edit textarea with stable transition (2026-10-04) (2.4s)
  ✓  Task detail restyle › header: split eyebrow without separator, text-only ghost Complete, equal-height Start primary (3.3s)
  ✓  Task detail restyle › meta bar: full-bleed cells, formatted due date + chevron, iconless bucket, bare KR (1.9s)
  ✓  Task detail restyle › pomodoros band: THIS WEEK label, bar before readout, elevated surface (1.9s)
  ✓  Task detail restyle › notes: full render without Expand/fade/counter, protocol-stripped links, one Copy per code block (2.4s)
  ✓  Task detail restyle › sub-tasks: add row above progress, outlined Add, subdued badges, 4-row collapse (2.0s)
  ✓  Task detail restyle › panel widens so the four meta columns and note lines fit (1.9s)
  ✓  Task detail restyle › body never swipes horizontally; band and footer are pinned (2026-08-30 feedback) (1.9s)
  ✓  Notes markdown rendering › links: bare autolinks over 60 chars middle-truncate; href + hover title keep the full URL (3.6s)
  ✓  Notes markdown rendering › md-body layer: headings scale and brighten, blockquote/table/code/hr styled — no browser defaults (2.3s)
  ✓  Notes markdown rendering › code block: the Copy button sits above the text column, never on the first line (2.3s)
  ✓  Notes markdown rendering › lists: mono gutter markers, nesting differentiates (· then –) (2.3s)
  ✓  Notes markdown rendering › task lists: checkboxes render display-only (disabled, state visible) (2.4s)

13 passed (19.4s)
```

```text
npx tsc --noEmit

0 errors (exit code 0)
```

```text
npm run build

> myokr@0.3.0 build
> tsc && vite build

✓ built in 2.60s
```

## 4. Reproduce Failure

For the pre-fix state where `.notes-content-view` was constrained by `max-width: 72ch;`:

### Saved Notes Width Constrained to 72ch (Narrow Column Defect)

```text
npx playwright test tests/task-detail-restyle.spec.ts -g "notes: rendered view"
```

- Expected: Rendered notes view width `>= 824px` (`available - 2px`) spanning the full width of the modal panel.
- Actual: Rendered notes view width was `617.73px` (~72ch), leaving a ~300px empty gap on the right and clipping long code block lines.

Current status:

```text
None.
```

## 5. Notes

1. **Escape key bubbling fix**: Added `e.stopPropagation()` and `e.nativeEvent.stopImmediatePropagation()` to `Escape` key handling on `.notes-textarea` in `src/components/pomodoro/TaskDetailModal.tsx`. Previously, pressing `Escape` to discard notes edits bubbled to `useModalEffects` on `document` and inadvertently closed the entire task detail panel.
2. **Design system conformance**: Removed `font-size: 0.85rem` from `.notes-content-view` in `src/styles/pomodoro.css` to respect the documented rule in `docs/design-system.md` that `.notes-content-view` is strictly layout-only (`position`/`cursor`), leaving all typography rules to the shared `.md-body` layer.
3. **Visual evidence asset**: Screen capture of the verified full-width rendering is preserved at `screenshots/task-detail-notes-fullwidth.png`.
