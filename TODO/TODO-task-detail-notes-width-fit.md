# TODO: Task Detail Notes Width Fit

## Phase 1: Test & Regression Baseline (TDD)

Goal: Update the restyle Playwright test to assert that `.notes-content-view` spans the full container width before touching styles.

- [x] Inspect existing test `tests/task-detail-restyle.spec.ts` around line 222 asserting the 72ch constraint.
- [x] Update the test to assert `.notes-content-view` bounding box width matches full container width (`available - 2px`).
- [x] Run Playwright restyle test to confirm it fails (red) on the current CSS code.

**Definition of Done:** The test is updated to assert full-width behavior and fails as expected against the existing 72ch cap.

## Phase 2: CSS Layout & Full-Width Adjustment

Goal: Remove the artificial 72ch cap and enable full section width for rendered notes.

- [x] In `src/styles/pomodoro.css`, update `.notes-content-view` rule from `max-width: 72ch;` to `width: 100%;`.
- [x] Update inline CSS comments in `src/styles/pomodoro.css` to record that the 2026-09-17 72ch reading measure cap is superseded.
- [x] Verify that child elements (`.md-code-block`, `table`, `.md-body`) expand to 100% width while keeping horizontal overflow contained.

**Definition of Done:** Rendered notes view occupies 100% of the scroll body container without layout shifts when toggling edit mode.

## Phase 3: Design System Documentation

Goal: Keep the design system doc synchronized with the layout rule change.

- [x] In `docs/design-system.md`, update the notes measure section around lines 1235–1254.
- [x] Document the decision to use full section width (`100%`) for both editor and rendered view, replacing the 72ch cap.

**Definition of Done:** `docs/design-system.md` accurately describes the full-width behavior of both `.notes-textarea` and `.notes-content-view`.

## Phase 4: Verification & Evidence Collection

Goal: Verify tests pass, TypeScript compiles, and gather verification evidence.

- [x] Run Playwright tests (`tests/task-detail-restyle.spec.ts` and `tests/notes-markdown.spec.ts`) and confirm green.
- [x] Run `npx tsc --noEmit` to confirm zero type errors.
- [x] Run `npm run build` to confirm production Vite bundle succeeds without errors.
- [x] Capture evidence / visual verification that notes and code blocks fit the full width of the task detail modal.

**Definition of Done:** All automated checks pass cleanly and evidence is documented.
