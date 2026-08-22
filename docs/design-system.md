# myOKR Desktop — Design System

The canonical reference for the desktop UI's tokens, layout, icons, and empty-state
pattern. This is the presentation counterpart to `CONTEXT.md` (which is the pure
domain glossary): color roles, spacing, and grid live **here**, not in
`CONTEXT.md`. Decided in the item-1a grilling session; see
[ADR-0010](./adr/0010-desktop-ui-design-system.md).

Source of the redesign: `~/Downloads/myOKR Redesign - Standalone.html`
("MYOKR DESKTOP v0.2.0 — UI REVIEW & PROPOSED FIX"). The Plan-group
sections P1–P7 live in `~/Downloads/myOKR Redesign.html`.

## Fidelity policy (Plan Group)

**Hybrid fidelity** (decided in the Plan-group grilling session): structural
and behavioral parity with the design's *intent* everywhere, using tokens;
**mockup-exact values** (its hexes and paddings; JetBrains Mono stands in for
the mockup's IBM Plex Mono — no font loading added) on the **flagship screens
only**: Tasks board (P1), Objectives (P7), Done (P5), Task detail (P4).
Raw mockup hexes are illustrative elsewhere — never copied verbatim (no-raw-hex
rule). Two standing constraints:

- **Sidebar is frozen** — the left nav (logo, Focus/Day plan/Session/Habits,
  Plan/Tasks/Objectives/Done, Progress, Settings, Help & tour, v0.3.0) is
  excluded from the redesign. No ⌘K chip next to the logo, no nav restructuring.
- **No keyboard shortcuts** — ⌘1/⌘2/⌘3 navigation, ⌘↵ start-focus, ⌘⇧ reopen,
  and shortcut legends are deferred (see [ADR-0011](./adr/0011-no-keyboard-shortcuts.md)). The existing Meta+K opening
  of the search modal is kept (it predates this policy); no new keybindings.

## Color roles (semantic tokens)

Defined as CSS custom properties on `:root` in `src/styles/global.css`. Color is
for **meaning, never decoration**. One hue can carry more than one role when the
meaning aligns (cyan = primary action = focus).

| Token | Value | Role |
|---|---|---|
| `--color-primary` | `#22D3EE` | THE single primary action per screen (e.g. the one Start / Save CTA) |
| `--color-focus` | `#22D3EE` | Focus-session / timer semantics (same hue as primary) |
| `--color-focus-border` | `#1a4b54` | Subtle teal border for session-timer surfaces (the global Session widget card) |
| `--color-objective` | `#a855f7` (violet) | OKR Objectives |
| `--color-streak` | `#f59e0b` (amber) | Streaks (current/best) — amber means streak, nothing else. **One carve-out:** the Habits analytics weak-day insight banner (2026-08-08, Habits tracker) — an insight derived from streak data, documented in the Habits section below |
| `--color-risk` | `#f43f5e` (rose) | At-risk / warning |

OKR `Confidence` status mapping (the enum is domain vocabulary in `CONTEXT.md`;
its colors are presentation, recorded here):

| Confidence | Color |
|---|---|
| `on_track` | green `#22c55e` |
| `at_risk` | rose (`--color-risk`) |
| `off_track` | red `#ef4444` |
| `not_set` | grey `#6b7280` |

**Gradient rule:** the cyan→violet `--accent-gradient` is **logo-only**. The
global `.btn` class is solid `--color-primary`, not gradient. Do not reintroduce
the gradient on buttons, chart bars, or page titles — that is the P03 regression.

> Migration note: the old `--accent-cyan` (`#06b6d4`) brightens to `#22D3EE`;
> the old `--okr-at-risk` (amber) is repurposed — at-risk is now rose, and amber
> is reserved for streaks.

## Spacing scale

`4 · 8 · 12 · 16 · 24 · 32 · 48px` (exposed as tokens). Page gutters use **32px**.

## Typography

Two font families only — both loaded by the `@import` at the top of
`src/styles/global.css` and exposed as tokens on `:root`. Reference the tokens;
never hardcode a family stack.

| Token | Stack | Role |
|---|---|---|
| `--font-sans` | `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` | all UI text — set on `body`, inherited everywhere |
| `--font-mono` | `"JetBrains Mono", monospace` | numbers / code / mono labels (pomodoros, dates, counts) |

JetBrains Mono stands in for the mockup's IBM Plex Mono — no IBM Plex is loaded.
Form controls use `font-family: inherit` so they pick up `--font-sans` instead of
the browser default. (SVG `<text>` can't use `var()` in attributes, so the
Walkthrough sets the font once via `.walkthrough-svg text` and lets `<text>`
inherit it.)

## Page shell

A `.page-shell` container inside `.app-main`:

- **max-width:** 1180px (centered; content stops sprawling on wide canvases)
- **gutters:** 32px
- **grid:** a 12-column CSS grid utility screens span into, instead of
  hand-rolled per-screen widths

The outer shell stays `flex` (sidebar + main); the page shell is the inner
content system.

## Responsive layout (Turn 2, section 2a)

The responsive behaviour is specified verbatim in **Turn 2 / section 2a** of the
redesign document (`~/Downloads/myOKR Redesign - Standalone.html`). The reference
"small" target is **1024×720** — "the size an Electron window lands at on a 13″
laptop with something else open beside it." Principle: **nothing is hidden, only
re-stacked.**

| Viewport | Sidebar | Content |
|---|---|---|
| ≥ 1280px | 212px labelled | full layout — three columns, side rails visible ("everything in turn 1") |
| 1100 – 1280px | 60px icon rail + tooltips + Pomodoro flyout | keeps **three columns** (gains back ~150px) |
| 900 – 1100px | icon rail | **two columns** — side rails move under the main pane as a horizontal strip; Tasks drops to two buckets with Backlog collapsed |
| < 900px | drawer (hamburger) | single column, list fallbacks |

Habits also gets a dedicated **860px** state (the case the audit called out): the
tracker re-stacks rather than hiding — the bottom panels (suggestions +
analytics) go single-column and the matrix's day cells shrink (see the Habits
tracker section).

The Pomodoro sub-items (Timer / Tasks / Analytics) show as a **hover flyout** on
the collapsed icon rail. Per-screen resize examples continue in the document as
**2b (Today at 1024)**, **2c (Tasks at 1024)**, etc. — consult those when
implementing each screen.

**Window:** default 1280×800, minimum **820×640** in `src-tauri/tauri.conf.json`
(was default 540×820 / min 420×600 — the old default opened already in the
sub-900 state). Habits also gets an 860px state.

## Today screen (1b) — per-screen rules

The responsive detail section 2b of the redesign doc specifies ("Today at 1024:
Now card goes horizontal · ring and streak join the bottom strip"). The wide
layout is unchanged (hero row + 3-col grid from Turn 1); only the 900–1100px
tier re-stacks.

| Tier (window width) | Today layout |
|---|---|
| ≥ 1100px | Hero row `[NOW · Plan · Streak]` (3-across) above grid `[UP NEXT · HABITS · CYCLE]` (3-col). "Everything in turn 1." |
| 900 – 1100px (2b) | **Three zones:** NOW card full-width horizontal (top) → UP NEXT + HABITS as two equal columns (middle) → **bottom strip** holding Plan stat + Streak stat + Cycle panel in one horizontal row. The Plan & Streak stats leave the hero and join the Cycle at the bottom. |
| < 900px | Single column: NOW → Plan → Streak → UP NEXT → HABITS → CYCLE. |

Implemented as one `.today-body` CSS grid driven by `grid-template-areas`, so
the Plan/Streak cards can relocate from the hero zone to the bottom strip at the
2-col tier — a cross-container move that needs a shared parent grid.

> **Every tier's `grid-template-columns` must use `minmax(0, …)`, including the
> `<900px` single column (`minmax(0, 1fr)`, never bare `1fr`).** A bare `1fr`
> track is `minmax(auto, 1fr)` — the `auto` minimum lets a long task title or
> KR/objective breadcrumb set the track's min-width, blowing the grid (and the
> whole pane) far past the viewport. With a bounded track the NOW title wraps
> (line-clamp 2) and the UP NEXT / KR text truncates (ellipsis) as designed.
> Short seed data hides this; it only shows with realistic long content.

> The mockup draws the Plan stat as a circular ring; that visualization is
> **deferred**. The stat stays a numeric readout (`X/Y pomodoros`) for now.

### Up Next card accent

The left accent stripe on Up Next items uses the task's **Eisenhower category
color** — the canonical `EISENHOWER_META` scheme shared with the Tasks and
Prioritize screens:

| Category | Accent |
|---|---|
| `do` | red `#ef4444` |
| `decide` | amber `#eab308` |
| `delegate` | orange `#f97316` |
| `delete` | grey `#6b7280` (never shown — filtered out before UP NEXT) |

> Reverses the earlier "accent = KR confidence only" decision: the stripe now
> signals the task's priority quadrant, matching Tasks. The category palette
> (`EISENHOWER_META`) is applied by value as the canonical Eisenhower scheme —
> an exception to the "no raw hex" rule, consistent with how Tasks renders it.

### Token usage

Today follows the `okr.css` / `review.css` precedent: semantic colors via
`var(--color-*)` / `var(--okr-*)`, neutrals via `var(--text-*)` / `var(--bg-*)`,
**zero raw hex**. Alpha tints of a token use `color-mix()`, not hardcoded RGB.

## Icons

- **Library:** `lucide-react` — the single icon set. The sidebar's hand-inlined
  SVGs are already Lucide paths and migrate to Lucide components.
- **Size/stroke:** 16px nav/content icons (the review's "16px stroke icon set"),
  18px for top-level nav glyphs, `strokeWidth` 1.5–2, round caps.
- **Timer action icons are solid, not outline (2026-08-15):** every pause/start
  action button — the Session tab's Pause/Start, the global Session widget's
  ring button, Task detail's "Start focus", and the Day plan NOW card's "Start
  focus" (the original precedent) — renders its Lucide `Play`/`Pause` with
  `fill="currentColor"`: a solid play triangle / two solid pause bars. At
  action-button size a stroked outline reads as a disabled ghost. Guarded by
  fill-attribute assertions in `tests/focus-session.spec.ts` and
  `tests/session-widget.spec.ts`.
- **No emoji for UI affordances.** Emoji are replaced by Lucide components
  (🍅→Timer/Play, 🏆→Trophy, 🔥→Flame, 📊→ChartBar, 📅→Calendar, 📖→BookOpen, …).
- **Logo:** the 🎯 emoji becomes a gradient-filled Lucide `Target` — the one
  surface where `--accent-gradient` is permitted.

## Empty states

Shared `<EmptyState>` primitive: icon + heading + message + **3 one-click starter
actions**. An empty state must offer a next step, never a dead end.

Applied to: Review ("do 2 reviews first" → starter actions), OKR empty. Habits
shipped its own take on 2026-08-08 (tracker): the starter suggestions became an
**always-visible** `SuggestedHabits` chip panel (mockup authority) — see the
Habits tracker section below.

**Cloud Sync:** the five-step Dropbox developer-console tutorial is replaced by
the EmptyState pattern, with the bring-your-own-app-key flow behind an
"Advanced" disclosure. True one-click connect (bundled Dropbox key + Tauri
deep-link) is deferred — see ADR-0010.

## Verification

Screenshot tests in `tests/screenshots.spec.ts` carry `toHaveScreenshot()`
assertions at **1280×800** for all nine screens, plus a **1024×720** snapshot
covering the collapsed icon-rail state. Baselines regenerated once when 1a lands;
after that, unintended visual drift fails CI.

## Focus group screen — per-screen rules

Decided in the Focus-group grilling session (2026-08-04); desktop only. The
Focus group (Day plan / Session / Habits) is **one screen with an in-content tab
strip**, mirroring the Plan group's structure — see
[ADR-0014](./adr/0014-focus-group-consolidated-screen.md). This is a **shell**
change: the three existing screen bodies are embedded behind the tabs unchanged,
not redesigned. **Structural parity only** (not mockup-exact), consistent with
the Today screen (1b).

### Shell

| Slot | Rule |
|---|---|
| Header title | **Today's date, day-first**, real (never hardcoded): `{Weekday}, {D} {Mon-short}` → "Tuesday, 4 Aug". The old "Today's Focus" label is dropped. (Today's code builds this `en-US`, which prints month-first "Aug 3"; switch to day-first.) |
| Header action | **"Plan day"** button (renamed from "Replan day"; opens the preview-and-commit modal). **Cyan-outlined accent** (2026-08-16 revamp): `Asterisk` icon (six-spoke starburst, per the 2026-08-17 reference), `--color-primary` border/text, semibold, gap-2 — still **outlined, never solid**, so the NOW card's "Start focus" remains the single primary CTA (`--color-primary`) on the Day plan screen. **Day plan tab only** (2026-08-08 feedback): Session/Habits keep the date title with an empty right side. |
| Tab strip | `Day plan` · `Session` · `Habits`, reusing the `.plan-tab-strip` / `.plan-tab` styles for parity with the Plan group. |
| Cycle slot (right of tabs) | **Static text** "May cycle · week N of M" via `cycleWeekLabel()`. **Not a dropdown** — Day plan is today-scoped, so there is nothing to filter (unlike the Plan group's cycle-week dropdown). |

### Tab badges

| Tab | Badge | Rule |
|---|---|---|
| Day plan | none | A dashboard, not a list — no count. |
| Session | `live` | Shown while `isRunning` — any phase, focus or break; hidden when idle. |
| Habits | `4/21` | **This week's** completion ratio — `{completed scheduled cells}/{scheduled cells this week}` (habits × 7, implicit every-day scheduling). Same math as the week matrix. **Hidden when there are no habits** (no `0/0`). *(2026-08-08: was the daily `2/3` ratio; the tracker made the badge weekly.)* |

### NOW card status pill (2026-08-16)

Decided in the NOW-pill grilling session. The Day plan NOW card's status pill
**mirrors the linked KR's confidence, verbatim** (`CONFIDENCE_META` labels) —
KR health, never day-scoped task progress (the pomodoro segments one row below
already carry that). Three visual states: green `on-track` (`--okr-on-track`)
for `on_track`, red `at-risk` (`--color-risk`) for `at_risk`/`off_track`, and
**neutral gray `not-set`** (`--text-muted` + `color-mix()` tint) for
`not_set` — unknown ≠ healthy, so "Not Set" never wears green. (`at_risk` and
`off_track` deliberately collapse to the one red here, unlike the OKR screen's
confidence table, which keeps their two hexes distinct.) A task with
**no KR link shows no pill at all**: "On Track" with nothing to be on track
against is a false positive (the old code's unreachable `At Risk` fallback
always printed "On Track"). The pill is non-interactive, and UP NEXT rows
stay label-free — only the current commitment carries a status. Guarded by
class/text/color assertions in `tests/focus-shell.spec.ts`.

### Session tab ↔ global SessionWidget

No change to the existing architecture. The global `SessionWidget` already hides
when `activeSection === 'session'` (the full timer is on screen) and its "Open"
button navigates to the Session tab; the Session tab's `live` badge mirrors the
same `isRunning` flag the widget uses.

### Plan-day modal (2026-08-16)

The Day plan tab's **"Plan day"** header action opens a preview-and-commit modal
(`PlanDayModal`, ~640px, 86vh, internal scroll) instead of silently replanning.
Decided in the plan-day grilling session:

- **Open = fresh deterministic ranking** (reset semantics, no exclusions —
  previously-skipped tasks reappear); the tie-shuffle lives on the modal's
  explicit **Re-rank** action, which also discards manual edits. With no
  genuine ties and no edits the recompute is identical — the button flashes
  **"No changes"** rather than looking dead. The saved plan is untouched until **Accept**;
  X/Esc/overlay-click are true cancels. Snapshot-on-open — no live re-sync.
- **Accept writes only `TodayPlan`** (localStorage): `taskIds` = in-capacity
  order, `skippedIds` = declined candidates, so the dashboard's budget top-up
  can't silently re-add a task the user saw in overflow and passed on. No
  bucket/CRDT writes — the source-bucket badges (TODAY dark, THIS WEEK /
  FROM BACKLOG slate — **not amber**, amber is streak-only) are display-only.
- **Capacity bar** = committed pomos (`completedToday + Σ in-list slices`) over
  the daily budget; fill is solid `--color-primary` (no gradient), caps at
  100%, and switches to `--color-risk` when over. The CAPACITY REACHED divider
  (risk color, dashed flanks) is the in/overflow boundary, hidden with no
  overflow. The in-capacity list is **budget-bounded — `MAX_CARDS` does not
  apply** (it stays a dashboard auto-fill constraint).
- **PINNED** (cyan) is display-only on row 1 — the future NOW task. Card ratios
  use the canonical `displayedPomoCount` position derivation. **Reorder is
  click-select** (grip pick-up → row click places above → Esc cancels the pick
  before closing the modal) — same WKWebView constraint as sub-tasks. Row menu:
  *Pin to top* · *Move to overflow*. Overflow cards: title + KR/priority line +
  *Add anyway* only.
- Footer note names the real algorithm: "Ranked by priority, then remaining
  effort vs cycle time, then key-result confidence." (the algorithm itself is
  unchanged — no due-date tie-break exists).

### Responsive

The bodies inherit their existing rules — Day plan from the
[Today screen (1b)](#today-screen-1b--per-screen-rules) three-tier grid; Habits
its 860px state. The new shell mirrors the Plan-group shell. Two Focus-specific
rules:

- **Padding parity (hard constraint):** the Focus shell's top / right / bottom /
  left padding **must equal the Plan-group shell's exactly**, at all three
  responsive tiers (≥1100 / 900–1100 / <900). Asserted by a visual-regression
  baseline so drift fails CI.
- **Cycle text** hides at `<900px` (drawer sidebar, single column); the tab row
  stays. An exception to the global "nothing is hidden, only re-stacked" rule —
  a tab-row context label has nowhere useful to re-stack to.

### Verification

New `toHaveScreenshot()` baselines at **1280×800** for the Focus shell on each
tab (Day plan / Session / Habits), plus the **1024×720** collapsed-icon-rail
state. Padding-parity against the Plan group is asserted in the same suite.


## Habits tracker (2026-08-08) — per-screen rules

The Habits tab is a full tracker: a weekly/monthly completion matrix, one-click
suggestion chips, and a 30-day consistency panel. Desktop-only; the data model
is unchanged (`Habit = {id, name, status, ticks, createdAt, updatedAt}` — no
frequency/category fields, so **scheduling is implicit every-day**).

### Layout

- Header: `Habits` title · **[Week] [Month]** segmented toggle (Week default) ·
  `+ New habit` CTA (`.btn`, cyan `--color-primary`, the screen's single primary
  action). The CTA **expands** the existing inline input (type + Enter/Add) —
  no modal. Cycle context ("May cycle · week N of M") is already rendered by the
  Focus shell's tab strip (`cycleWeekLabel()`); the tracker does not repeat it.
- Matrix card: `HABIT | Mon..Sun | STREAK`. Each week block carries its own
  full header with the weekday **and day number stacked in the same header
  cell** (`Mon` / `25`; today in cyan) so month view shows correct dates per
  block. Cells are **~40px rounded squares**: completed = solid habit accent +
  ✓, pending = dark container (`--bg-tertiary`) with a subtle border, future =
  dashed + faded and **inert**. Past/today cells toggle (tap again to un-tick).
  The matrix **always shows the current period — no in-card navigation**
  (2026-08-08 feedback reversed the chevron decision; history lives in the
  analytics panel). Month view stacks one Mon–Sun block per week of the month.
- **STREAK column (2026-08-08 feedback, final):** the STREAK cell counts the
  ticks **inside the visible period** — week view: the current Mon–Sun week;
  month view: per week block. No visible ticks → "0 days"; three ticks in the
  visible week → "3 days". A global consecutive run proved unreadable (it read
  "1 day" for habits whose ticks didn't form a run ending today/yesterday, and
  "1 day" even with no visible ticks). The Today screen's streak pill and the
  mobile app keep `computeHabitStreaks` (consecutive run) for their own stats;
  the matrix does not use it.
- Bottom grid: `SuggestedHabits` (left) + `HabitAnalytics` (right), two equal
  columns; single column below 900px.

### Derived habit accents (no category field)

Each habit gets a **stable accent derived from its id** — a presentation hash
over the token palette, so the same habit always has the same color and no
category field is needed (a future stored category replaces the derivation):

| Class | Accent |
|---|---|
| `habit-accent-0` | `--okr-on-track` (green) |
| `habit-accent-1` | `--color-objective` (violet) |
| `habit-accent-2` | `--accent-emerald` |
| `habit-accent-3` | `--accent-orange` (new token, added with the tracker) |

Excluded by semantics: cyan (primary action), amber (streaks), rose (risk).
The accent paints the row dot, completed cells, and analytics bars.

### Streak / amber

The STREAK column and any streak numbers use `--color-streak` amber (the streak
role — no exception). The **analytics weak-day insight banner** is the single
carve-out: amber banner, because the insight is computed from streak history
(2026-08-08; see the color-roles table).

### Suggestion chips

`SUGGESTED — ONE CLICK TO ADD` renders four **daily-shaped** templates: *Inbox
to zero · Walk 8,000 steps · Lights out by 23:00 · Plan tomorrow before
closing*. Weekly-only templates were dropped (all habits are implicitly
every-day). A chip whose exact name already exists is **hidden** (dedupe). One
click creates the habit (`want_to_form`, no ticks). The footer keeps the
original empty-state copy: *"A habit needs a cue and a size you can't fail
at…"* — the chips are always visible (mockup authority), superseding the
empty-state-only reading of the Empty states section.

### Analytics math

Rolling **30-day window ending today** vs the **previous 30 days**:
`overall % = completed / scheduled` (per habit, a window day counts as
scheduled only on/after `createdAt` — a new habit isn't charged for days it
didn't exist). Trend badge (emerald, `+N pts vs last month`; rose when
negative) is the current-window rate minus the previous window's; **hidden when
either window has no scheduled days**. Per-habit bars use the derived accent.
Weak-day insight = the lowest-rate weekday with data, shown **only when it is
strictly below the best weekday** (an all-100% week has no weak day). Empty
state when nothing was scheduled in the window.

### Responsive

Bottom panels stack at ≤900px; matrix day cells shrink to 2rem (from 2.5rem)
at ≤900px; **row actions (status select + delete) are always visible at ≤900px**
(hover-reveal only applies above — touch devices have no hover; 2026-08-09 PR
feedback). Nothing else re-stacks — the matrix stays a matrix ("nothing hidden,
only re-stacked").

## Plan group screens (P1–P7) — per-screen rules

Decided in the Plan-group grilling session (2026-08-01); all rules below apply
to the desktop app. Cycle-scoped filters on these screens follow the
presentational-rollover rule — see [ADR-0012](./adr/0012-presentational-cycle-rollover.md).

> **Shared content width (2026-08-02):** Tasks and Done are no longer clamped
> by the 900px `.pomodoro-container` timer/analytics shell — a `.plan-group-shell`
> modifier widens that wrapper to `.okr-container`'s 1280px on the `tasks`/`done`
> tabs only, so all three Plan-group tabs share identical left/right insets.

### Pomo count display — position, not completed (2026-08-03)

"pomo N of M" is the pomodoro you are **on**, not the count you have
**finished** — N advances when a focus *starts*, not when it ends. Decided in
the session-widget grilling; it resolves the "count jumps during the break"
report. Root cause of the report: focus-completion and the focus→break
transition fire in one handler (`handleSessionComplete`,
`src/components/PomodoroApp.tsx`), so a *completed*-count display ticks up at
the exact instant the break begins — reading as "increased during the break."

- **Persisted truth unchanged.** `task.completedPomodoros` still advances on
  focus completion only (`applyPomodoroCompletion`,
  `src/lib/pomodoro-storage.ts`); the focus-branch increment is untouched. The
  long break uses the same branch, so it inherits this for free — no separate
  long-break case.
- **Displayed N is derived:** `min(completedPomodoros + (focusRunning ? 1 : 0),
  estimatedPomodoros)`. M is `estimatedPomodoros` (per-task), **not**
  `pomosBeforeLongBreak` — the timer-screen dot row is the *cycle* position and
  is a separate control.
- **Applies everywhere the count shows:** Tasks card `4/6`, list-view POMOS
  cell, Task-detail weekly line, and the forthcoming global session widget.
  Mobile should mirror the derivation for parity.

### Session posture — auto-break, manual-focus (2026-08-03)

Decided in the session-widget grilling (posture **ii**). Resolves the "focus
doesn't auto-start after short break" report: that is the *intended* default,
not a bug — confirmed green by `tests/pomodoro-confirmations.spec.ts` ("Default
(auto-start off)" describe, short *and* long break). Long break behaves
identically; there is no separate long-break case.

- **`autoStartBreaks` default → `true`; `autoStartFocus` stays `false`.** Focus
  ending auto-starts the break; a break ending *stages* focus (full duration,
  paused) and waits for a deliberate tap — the global session widget's resume
  job. Concretely a one-field change in `DEFAULT_SETTINGS`
  (`src/lib/pomodoro-storage.ts`).
- **Existing-user wrinkle.** Settings persist per-doc; a user who already has
  `autoStartBreaks: false` stored won't inherit the new default. For the app
  owner it's a one-toggle change; a one-time migration is deferred (low-stakes,
  single-user-via-Dropbox). Revisit if the app ships beyond personal use.
- **Tests.** `pomodoro-confirmations.spec.ts` "Posture ii — auto-break,
  manual-focus" sets autoStartBreaks on / autoStartFocus off and asserts the
  break auto-starts (reaching Focus with no manual break click) while focus
  stays staged. The mock seed still stores `autoStartBreaks: false`
  (existing-user state), so posture ii is toggled on explicitly per test.

### Tasks board (P1/P2, flagship — mockup-exact values)

- **Header block**: title `PLAN` + cycle pill (`May cycle`) · Board/List
  segmented switch · **"New task"** button (focuses the add-row). **No Search
  button on the board** (search stays reachable via Meta+K; "Search ⌘K" appears
  on List and Done per P3/P5 — Objectives dropped its button in the 2026-08-19
  P7 revamp below).
- **Tab strip** (present on every Plan-group screen): `Tasks N | Objectives N |
  Done N` with the count badge styling, and `May cycle · week 4 of 5` on the
  right. N = open tasks / objectives / completed tasks **in this cycle**
  (ADR-0012 rule; unlinked tasks always count).
- **SERVING strip**: the active cycle's *objectives* with progress bars (violet
  `--color-objective` at >0%, rose `--color-risk` at 0%) and a `0% · no tasks`
  warning when no open task in this cycle serves any of the objective's KRs,
  plus an `Open Objectives →` action that switches to the Objectives tab.
- **Add-row**: `[type, then ↵ to set priority and key result] [category] [key
  result] [Add]` — **no bucket select, no due date**. New tasks land in
  **Backlog** (matches the storage default; schema rule in CONTEXT.md).
- **Card anatomy**: `[✓ tick]` (tick = complete; same-session undo via the
  completed strip) · title · mono `4/6` (current-position / estimated — see
  *Pomo count display* above) · KR line ·
  mono category · due chip (`Thu`, mono) · **dashed "Add to <bucket>" button**
  = the move-to-bucket menu. 3px left accent stripe in the task's Eisenhower
  category color (`EISENHOWER_META`, via `--today-accent`-style CSS var).
  **No focus button on cards** — focus starts from the detail modal's `Start
  focus` or ⌘K `Start`. No emoji (🎯🍅📅 → mono text / Lucide).
- **Bucket headers**: `Today · N · X pomos` (mono count pill + planned-pomo
  sum; mockup numbers are illustrative).
- **Completed strip**: `N completed today · Show` collapsed **at the foot of
  the Backlog column** (not below the grid). Filtered to tasks completed today
  *in this cycle* (ADR-0012).
- **Responsive ≤1100px (P2)**: Today + This week stay open; **Backlog collapses
  to a slim bar** (`Backlog · N · X pomos`, "drop a card here to defer it")
  that expands to a mini-list on click. **Board bucket-moving/deferring uses
  click-select → click-target, matching UP NEXT** — and so does **in-list
  reordering (Task-detail sub-tasks): click-select** (2026-08-05; HTML5
  drag-and-drop was tried and is dead in the packaged app — see the P4
  section).
  as precedent). The grip handle is the drag source; drop on a row inserts above.

### List view (P3, structural parity)

- Toolbar: **Group by** (bucket / key result / priority) + **Sort**
  (priority / due / pomos) dropdowns, **"New task"** button, and the bulk bar
  `N selected · Move to` (existing). Group headers carry the planning line
  (`TODAY — 3 tasks · 9 pomodoros planned`).
- Columns already match the mockup (`TASK | PRIORITY | KEY RESULT | BUCKET |
  DUE | POMOS | SUBTASKS`); bucket/priority/KR stay inline-editable cells
  (the design's "re-schedule without dragging").

### Task detail (P4, flagship)

- Properties row across the top: PRIORITY · BUCKET · DUE · KEY RESULT
  (existing selects, restyled) + "click any field to edit" hint. Header:
  `Start focus` + `Complete` buttons. **Four columns only** (2026-08-04): the
  estimate editor that used to be a 5th POMODOROS column moved into the
  pomodoro line. **2026-08-05:** the inline `est. N` control was replaced by
  the shared `PomoEstimatePopover` — the readout IS the editor (see below).
- **POMODOROS — `X / Y planned` on one row** (2026-08-05; replaces the weekly
  plan). **Lifetime** totals only: `X` = `completedPomodoros`, `Y` =
  `estimatedPomodoros`. The readout is clickable — it opens the shared
  "Adjust Total Pomodoros" popover (hold-to-repeat −/+, 1–20, same component
  as the Tasks rows). A thin muted bar (4px, `color-mix` of `--color-primary`)
  flexes to fill the rest of the row and mirrors the same ratio, capped at
  100%. Label · readout · bar align on one row and fit the modal width.
- **Weekly pomodoro plan — removed (2026-08-05).** The per-week plan
  (`weeklyPomodoroPlan` + "Change weekly plan") is gone: a total *and* a
  weekly counter per task duplicated the same intent with extra complexity,
  and the Session/Timer inline detail silently showed `0 / N` (it never had
  the history feed). The field is dropped from `PomodoroTask` and
  `normalizeTask` (destructure-dropped so the orphaned key never leaks into
  the typed view); legacy docs keep the key harmlessly in the CRDT
  (regression: `tests/task-detail-pomodoro.spec.ts` Seam A).
  `computeWeekTaskPomos` + the review flow are untouched. Desktop-only this
  week — mobile still ships the weekly plan (ticket
  `.scratch/pomodoro-weekly-plan-removal-mobile/`).
- Notes render Markdown links wrapped with a copy button (presentation only).
  The whole block is one Markdown field (not per-line); clicking anywhere in the
  rendered view swaps it for the raw-markdown editor (links/copy still work).
- Sub-tasks / comments as equal-weight tabs **only where the model has the
  data** (comments exist on the task type; an empty tab shows the empty state,
  never a dead end).

> **Shipped 2026-08-02:** the header is one row — the `TASK · click any field
> to edit` eyebrow on its own line, then the title (left) and `Start focus`
> (cyan `--color-primary`, the screen's single primary action) + `Complete` +
> close (right) with a separator. The pomodoro line and the sub-tasks tab each
> carry a cyan progress bar (`X / Y planned`, `X of Y done`); the sub-task Add
> button is cyan primary. *(The old "Open: 4 vs 5 property columns" item is
> resolved — see 2026-08-04 redesign below: four columns, estimate folded into
> the pomodoro line.)*

> **Redesign 2026-08-04 (task-detail grilling session):**
>
> - **Pin / scroll.** The header + 4-column properties row are pinned; the body
>   (pomodoro line → notes → tabs → footer) scrolls beneath them. A long notes
>   block no longer shoves the Sub-tasks/Comments tabs off-screen.
> - **Notes — autosave, not explicit Save.** This **overrides** the prior
>   "explicit Save" posture (and the Objectives rule at line 352). Rationale:
>   autosave-on-blur cannot lose a long note the way a forgotten explicit Save
>   can, so it serves the original "losing a long note is unacceptable" goal
>   better. **Blur-autosave / ⌘+Enter save / Esc revert** — never per-keystroke
>   (the persistence-rules line still holds; a blur write is one `onUpdate`, not
>   a keystroke write). Esc sets a guard ref so the imminent blur-save is skipped
>   and the revert wins.
> - **Notes cap + Expand.** Rendered notes cap at 220px with a bottom fade and a
>   `N lines · M chars` count; a separate **Expand** chevron toggles a full
>   read view (clicking the text still swaps to edit — two distinct click
>   targets). The edit textarea is also capped ~220px with internal scroll.
> - **Sub-tasks.** Checkbox commits instantly (existing); click the label to
>   edit in place (Enter/click-away autosaves, Esc reverts); `×` opens a
>   `ConfirmModal` then deletes (no undo toast — considered and skipped).
>   **Reorder is click-select** — grip click picks the row up (it glows), a
>   click on another row places it *above* that row, Esc / re-click cancels.
>   HTML5 drag-and-drop was adopted on 2026-08-05 and **reverted the same day**:
>   WKWebView (the packaged macOS app) never initiates a drag inside a scrollable
>   region — an instrumented repro shows **zero drag events** when the list
>   overflows, and the modal body always scrolls. (`PrioritizeModal`'s drag
>   survives only because its grid never scrolls; the sub-task grip being a
>   `<button>` was a red herring — a `<div draggable>` fails identically.)
>   Click-select needs only plain clicks, so it works in every engine.
>   Show all sub-tasks (no collapse).
> - **Comments.** Click the label to edit in place (Enter/click-away autosaves);
>   `×` opens a `ConfirmModal` then deletes (comments previously deleted
>   silently — they now match the sub-task confirm). Chronological, not
>   reorderable.
> - **Footer.** `Created {date} · updated {rel} · {n} pomodoros logged` + a red
>   `Delete task` (→ `ConfirmModal` → new `onDelete` prop). "updated" reads a
>   new `updatedAt?: string` on `PomodoroTask` (falls back to `completedAt ??
>   createdAt` for legacy tasks), stamped centrally in `handleTasksChange`
>   (SessionProvider) on every edit path — and in `OKRApp.updateTask`, which
>   holds its own task state. Mobile mirrors the stamp in `_saveTask`; its
>   normalizer already preserves the field.
> - **Title.** Click to edit in place (Enter/blur saves, Esc cancels); the
>   pencil edit-icon was dropped — `cursor:text` + the eyebrow cover affordance.
>
> **Follow-up 2026-08-05 (task-detail feedback round 2):**
> - **Header is a 2-row grid** (`eyebrow` row; `title | actions` row,
>   `align-items: start`). A long title wraps to 2 lines inside its cell while
>   `Start focus`/`Complete`/X stay pinned **top-right** — they never wrap below
>   the title. (Replaces the old `flex-wrap` header, which dropped the buttons to
>   a new row on long titles.)
> - **Bar is subtle and fills the row.** The loud full-width bright-cyan bar
>   became a thin (4px), muted (`color-mix` of `--color-primary`) bar that
>   flexes to fill the row beside the readout. The estimate is the focal
>   point — the `PomoEstimatePopover` readout IS the count (final state: the
>   weekly plan was removed the same day, see the POMODOROS bullet above).
> - **Sub-task reorder: click-select (final).** HTML5 drag-and-drop was adopted
>   (this bullet's predecessor) and reverted the same day — WKWebView won't
>   start a drag in a scroll region, so the packaged app never dragged.
>   Click-select (grip pick-up → row place → Esc cancels) works everywhere.

### Done (P5, flagship)

- Header: filters `This week | All key results | All priorities` + summary
  `N pomodoros spent · X.X average per task`, then a **table**
  `TASK | KEY RESULT | POMODOROS | FINISHED | UNDO` (rows `4 / 4` · `14:20` ·
  `Reopen`), grouped by day (`TODAY · MONDAY 25 MAY — 2 tasks · 7 pomodoros`,
  `YESTERDAY · SUNDAY 24 MAY — …`). "This week" is a date-range filter;
  "All key results" / "All priorities" are dropdowns defaulting to All.

### Objectives (P7, flagship)

Redesigned in the objectives-revamp grilling session (2026-08-19). Desktop only
— no CRDT/schema changes, so `mobile/` is untouched.

- **Header**: eyebrow `PLAN`, h1 `{Mon} cycle` (e.g. "May cycle"), the
  `CycleSelector` chip **inline right of the h1** (not stacked below), countdown
  line (`N days left in cycle · X objectives · Y key results`) beneath; the
  tab strip keeps the Plan-group's **1.25rem gap** above the first card
  (2026-08-19 polish — `okr-container` isn't flex, so the gap is a scoped
  `margin-bottom` on the strip). Right
  side: **inline `Cycle progress {N}%`** label + violet (`--color-objective`)
  bar — replacing the boxed "Overall" widget (whose logo-only gradient fill was
  a violation) — then the **"+ New objective"** button. **No Search ⌘K button**
  on this screen (List/Done keep theirs); the same Meta+K listener as Tasks
  opens the ⌘K modal.
- **Objective card**: **no left accent border** (uniform border). One header
  row: collapse chevron · **static violet dot** (`--color-objective`; there is
  no category field — the dot is identity, not data) · bold title (dbl-click
  edit, ellipsis) ⟷ **reward pill** · progress bar (**always violet** — no
  objective-level health color; health lives on the KR pills) + `%` · `✕`
  (ConfirmModal). Body = KR list + add-KR affordance only.
- **Reward pill is the sole reward UI**: empty = ghost pill (`Gift` + "Add
  reward", dashed); click → inline input swap (Enter saves / Esc cancels with
  an esc-guard so blur doesn't double-write; blur saves). Locked = `Gift` +
  text + `Lock`; unlocked (progress 100%) = `Trophy` + violet tint — **no amber,
  no pulse** (amber is streak-only). Pill text truncates.
- **KR row — 4-column grid**: `info | value badge | /target + bar | status pill
  | delete`. Col 1: title (dbl-click edit) + **muted subtitle** = mode label +
  linkage (`Completed Tasks · 3 tasks linked` / `Manual` / `Habit Ticks ·
  {habit}`; unserved shows `no tasks serving this KR` in risk color;
  **recency line dropped**); the subtitle **click opens the mode-change popup**.
  Col 2: current value in an outlined mono badge (click opens the existing
  value popover — **Manual adjusts the hand-set current; every derived mode
  adjusts its target** (Focus Hours included); derived currents are computed
  from linked tasks/habits and are never hand-written). Col 3: `/ {target}` mono + bar in **confidence colors**
  (green/rose/red per `CONFIDENCE_META`; `not_set` = grey `--okr-not-set`,
  never the gradient). **No percent readout** after the bar (2026-08-19 polish
  round — the badge/target carry the numbers); the bar is a **fixed width**
  (140px base; 90px ≤1100; flex only in the ≤900 re-stack) — **right-flushed**
  (`margin-left: auto`) and the col-3 track **caps at `max-content`** (a fixed
  220px max let the grid pump the track wide and blow a hole between target
  and bar), so `badge → "/ target" → bar → pill` share **one uniform 0.9em
  gap** (2026-08-20 feedback) — and the pills are
  **equal-width** (`min-width` + centered) so On Track / At Risk / Off Track
  align down the column. Col 4: confidence pill, far right. Delete ✕
  is **hover-reveal** (always visible ≤900px — touch rule). Habit KRs keep the
  habit-link select on a full-width nested line.
- **Add-KR row**: collapsed **"+ Add key result"** text button; click expands
  inline — title input · Type dropdown · the `− current / − target +`
  **stepper pair** (the KR row's value-popover stepper interaction compacted
  to 22px buttons; hold to repeat; **current locks (`.disabled`) for non-Manual
  modes** — "Nothing to update by hand") · cyan `Add` · outlined `Cancel`, plus
  a **dynamic helper line** per type (`COMPLETION_MODE_HELPER`). Esc/Cancel
  collapse; Add keeps the row open (cleared) for rapid entry. The displayed
  `current` badge and `/ target` share one compact mono scale (0.75rem,
  2026-08-20 feedback — the first pass left them oversized).
- **"+ New objective"** inserts an **inline form card at the top of the list**:
  violet dot + bold name input · `REWARD` row (gift icon, `optional` tag) ·
  `FIRST KEY RESULT` row (name + Type + `0 / target`) · `Create objective`
  (disabled = dark-teal + muted until name + KR name; enabled = solid cyan) +
  `Cancel` + "Needs a name and one key result" hint. **Esc = Cancel; Enter
  never submits** — only the explicit button writes. Always creates in the
  **viewed cycle** (no in-form cycle picker — the header selector scopes the
  list; creating elsewhere strands the card off-screen). New objectives always
  get ≥1 KR; habit-tick KRs are created unlinked (linked in the row after);
  targets default per mode (`DEFAULT_KR_TARGET`). The **bottom add-objective
  bar is removed**; the empty state (shared `EmptyState`) starter action opens
  the form.
- **Keep the explicit Save posture** — the creation form's button-only write and
  the reward pill's Enter-save honor the persistence rules
  (`docs/automerge-localstorage-rules.md`); no per-keystroke doc writes.
- **Responsive**: the objective title is a one-row-header invariant (ellipsis at
  all widths; wraps only ≤640). ≤1100 — reward pill gains a max-width, KR target
  column slims. ≤900 — KR row re-stacks to two lines (title+subtitle on top;
  badge · target+bar · pill below), delete ✕ always visible. <700 — the
  cycle-progress bar hides (percentage text stays; the one hide-not-restack
  exception here). ≤640 — the objective header wraps (pill, badge, actions flow
  to a second row) instead of hiding anything.
- **Verification**: `tests/objectives-redesign.spec.ts` (header, card, KR grid,
  hover-reveal, value popover, add-KR row, creation form, empty state) +
  `objective-rewards.spec.ts` (pill lifecycle) + `cycle-clone.spec.ts`
  (`.okr-overall-text` unchanged) — plus regenerated 1280×800 / 1024×720
  visual baselines.

### ⌘K search (P6, structural parity)

- Results grouped into **OPEN · N / COMPLETED · N / INSIDE TASKS · N**
  (sub-task & note matches) with per-section counts. Scope chips, cycle
  selector, `Start`/`Reopen` row actions stay as implemented. **No** matched-term
  highlighting, **no** footer shortcut legend (no-shortcuts policy).
