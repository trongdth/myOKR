# Output

## Expected Behavior

- When a task detail panel is opened, the rendered notes container (`.notes-content-view`) expands to 100% of the available width of the scroll body.
- The rendered notes view aligns flush horizontally with the Properties bar above and the Sub-tasks row below.
- Fenced code blocks (`.md-code-block`), tables, and lists within notes span the full section width.
- Code blocks only show horizontal scrollbars if an individual line exceeds the full container width.
- Switching between edit mode (`.notes-textarea`) and rendered view (`.notes-content-view`) does not cause layout jumping or width shifts.
- Empty notes ("Click to add notes...") retain full-width clickability for entering edit mode.

## Expected Development Workflow

- Always do Plan first
- Wait for human approval
- Spawn adversarial subagent to find edge cases
- TDD: Update regression tests before implementation
- Verify zero regressions across related surfaces (e.g. mobile, responsive breakpoints)

## Acceptance Criteria

- [x] Rendered notes container (`.notes-content-view`) has `width: 100%` and no `max-width: 72ch` constraint.
- [x] Rendered notes width matches the width of `.notes-textarea` (within ±2px margin of scroll container padding).
- [x] Fenced code blocks (`.md-code-block`) occupy the full available width of the notes container.
- [x] No awkward blank space (~300px) remains to the right of notes on desktop viewports.
- [x] Text within notes continues to wrap cleanly without overflowing (`overflow-wrap: break-word`).
- [x] Automated Playwright restyle test in `tests/task-detail-restyle.spec.ts` passes with full-width assertion.
- [x] Design system documentation in `docs/design-system.md` is updated to record the full-width decision.
- [x] TypeScript check (`npx tsc --noEmit`) passes with zero errors.

## Edge Cases / Failure Cases

- Extremely long unbroken strings (e.g., raw URLs, long hashes) → text wraps cleanly without blowing out the panel horizontally.
- Empty notes state → empty placeholder renders full-width and clicking anywhere on the line switches to edit mode.
- Narrow / mobile viewports (<640px) → notes container remains responsive and scales down without horizontal overflow.
- Markdown tables with many columns → table maintains internal horizontal scrolling (`overflow-x: auto`) without expanding the parent container.
- Rapid toggle between edit and view mode → no flickering or reflow glitching.

## Evidence Required

- [x] Playwright test suite output (`tests/task-detail-restyle.spec.ts`) passing.
- [x] Typecheck output (`npx tsc --noEmit`) passing with 0 errors.
- [x] Production build (`npm run build`) passing.
- [x] Visual screenshot evidence showing rendered code block and notes spanning 100% width aligned with the sub-tasks input.
