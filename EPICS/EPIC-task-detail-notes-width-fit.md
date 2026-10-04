EPIC: Task Detail Notes Width Fit

# Problem

In the Task Detail modal, the Notes section behaves inconsistently between
editing and saved states. While editing (`.notes-textarea`), the textarea
spans the full width of the container (`width: 100%`). However, once saved,
the rendered markdown view (`.notes-content-view`) is artificially constrained
to `max-width: 72ch`.

On standard desktop panels (~880px width), this constraint leaves an awkward
~300px blank space on the right side of the Notes section, misaligning it
with surrounding full-width components (Task Title, Properties strip, Pomodoro
progress bar, Sub-tasks input row, and panel footer). Furthermore, structured
content within notes—such as fenced code blocks (`.md-code-block`), tables,
and CLI snippets—gets squeezed into the narrow column and unnecessarily clipped
or forced into horizontal scrolling despite ample available horizontal space.

# Goal

Allow the saved Notes container (`.notes-content-view`) and its inner
elements (such as code blocks and markdown tables) to fit seamlessly across
the entire available width of the Task Detail panel (`width: 100%`), eliminating
awkward right-hand whitespace and preventing unnecessary horizontal scrolling
on structured notes.

# Users

- Knowledge workers and software engineers managing tasks and storing code
  snippets, terminal commands, or configuration notes.
- Project managers and team members reading structured notes and markdown
  checklists within task details.

# User journey

1. User opens a task detail panel on the Pomodoro board.
2. User clicks into the Notes area to edit content, utilizing the full width
   of the panel.
3. User saves notes by clicking outside or pressing ⌘/Ctrl+Enter.
4. The rendered Notes view remains full-width (`100%`), neatly aligned with
   the header, property strip, and sub-task controls.
5. Fenced code blocks and tables expand across the full panel width, displaying
   long lines comfortably with no premature horizontal scrolling.

# Business rules

- Rendered notes (`.notes-content-view`) must occupy 100% of the Task Detail
  scroll body container, matching the edit textarea (`.notes-textarea`).
- Inline text and URLs must continue wrapping smoothly within the container
  (`overflow-wrap: break-word`).
- Fenced code blocks (`.md-code-block`) and tables must expand to the full
  container width, with horizontal scrolling preserved only when line lengths
  exceed the full panel width.
- The "click anywhere to edit" interaction area must cover the entire full-width
  surface.

# Assumptions & Constraints

Assumptions (including external dependencies):

- The Task Detail modal retains its 880px minimum panel width on desktop.
- The shared `.md-body` typography system handles line wrapping and spacing
  cleanly across variable widths.

Constraints:

- Must use semantic CSS variables and design tokens (`--bg-*`, `--text-*`,
  `--border-color`); no hardcoded pixel widths or raw hex colors.
- Existing Playwright restyle regression tests must be updated to validate
  full-width layout rather than the superseded 72ch constraint.

# Out of scope

- Redesigning other Task Detail tabs (Sub-tasks, Comments).
- Altering the Markdown parsing, sanitization rules, or autolink protocol-stripping
  logic.
- Mobile layout changes beyond ensuring shared styles maintain responsive integrity.

# Acceptance criteria

- After saving notes, `.notes-content-view` occupies 100% of the Task Detail
  scroll body, aligning flush with the "Add a sub-task" input row below and
  the Properties strip above.
- Fenced code blocks (`.md-code-block`) span the full width of the Notes
  container, eliminating premature line clipping and unnecessary scrollbars.
- Switching between edit mode (`.notes-textarea`) and view mode
  (`.notes-content-view`) does not cause layout jumping or width shifts.
- Playwright tests in `tests/task-detail-restyle.spec.ts` pass and assert
  full container width.
