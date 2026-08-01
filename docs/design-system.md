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
  and shortcut legends are deferred (see ADR-0011). The existing Meta+K opening
  of the search modal is kept (it predates this policy); no new keybindings.

## Color roles (semantic tokens)

Defined as CSS custom properties on `:root` in `src/styles/global.css`. Color is
for **meaning, never decoration**. One hue can carry more than one role when the
meaning aligns (cyan = primary action = focus).

| Token | Value | Role |
|---|---|---|
| `--color-primary` | `#22D3EE` | THE single primary action per screen (e.g. the one Start / Save CTA) |
| `--color-focus` | `#22D3EE` | Focus-session / timer semantics (same hue as primary) |
| `--color-objective` | `#a855f7` (violet) | OKR Objectives |
| `--color-streak` | `#f59e0b` (amber) | Streaks (current/best) — amber means streak, nothing else |
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
| < 900px | drawer (hamburger) | single column, list fallbacks — Habits week-matrix → today-list + 7-dot history strip |

Habits also gets a dedicated **860px** state (the case the audit called out).

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
- **No emoji for UI affordances.** Emoji are replaced by Lucide components
  (🍅→Timer/Play, 🏆→Trophy, 🔥→Flame, 📊→ChartBar, 📅→Calendar, 📖→BookOpen, …).
- **Logo:** the 🎯 emoji becomes a gradient-filled Lucide `Target` — the one
  surface where `--accent-gradient` is permitted.

## Empty states

Shared `<EmptyState>` primitive: icon + heading + message + **3 one-click starter
actions**. An empty state must offer a next step, never a dead end.

Applied to: Habits (lone input → starter suggestions), Review ("do 2 reviews
first" → starter actions), OKR empty.

**Cloud Sync:** the five-step Dropbox developer-console tutorial is replaced by
the EmptyState pattern, with the bring-your-own-app-key flow behind an
"Advanced" disclosure. True one-click connect (bundled Dropbox key + Tauri
deep-link) is deferred — see ADR-0010.

## Verification

Screenshot tests in `tests/screenshots.spec.ts` carry `toHaveScreenshot()`
assertions at **1280×800** for all nine screens, plus a **1024×720** snapshot
covering the collapsed icon-rail state. Baselines regenerated once when 1a lands;
after that, unintended visual drift fails CI.

## Plan group screens (P1–P7) — per-screen rules

Decided in the Plan-group grilling session (2026-08-01); all rules below apply
to the desktop app. Cycle-scoped filters on these screens follow the
presentational-rollover rule — see [ADR-0012](./adr/0012-presentational-cycle-rollover.md).

### Tasks board (P1/P2, flagship — mockup-exact values)

- **Header block**: title `PLAN` + cycle pill (`May cycle`) · Board/List
  segmented switch · **"New task"** button (focuses the add-row). **No Search
  button on the board** (search stays reachable via Meta+K; "Search ⌘K" appears
  on List, Done, Objectives per P3/P5/P7).
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
  completed strip) · title · mono `4/6` (completed/estimated) · KR line ·
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
  that expands to a mini-list on click. No HTML5 drag-drop anywhere (ADR-0010);
  moving/deferring and re-ordering use click-select → click-target, matching
  UP NEXT in Day Plan.

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
  `Start focus` + `Complete` buttons.
- **POMODOROS THIS WEEK — `X / Y planned` + `Change weekly plan`** (implemented
  2026-08-01). `weeklyPomodoroPlan?: number` (0–99, absent-stays-absent) on the
  shared task schema (desktop + mobile normalizers agree: valid finite 0–99
  preserved, invalid dropped, runaway clamped to 99, explicit 0 respected).
  `X` = completed focus sessions on the task in the current **local** calendar
  week (Monday start — never UTC-sliced); `Y` = `weeklyPomodoroPlan ??
  estimatedPomodoros` (the estimate fallback keeps the line always rendering).
  Saving the plan writes the field; absent never gets the estimate injected.
- Notes render Markdown links wrapped with a copy button (presentation only).
- Sub-tasks / comments as equal-weight tabs **only where the model has the
  data** (comments exist on the task type; an empty tab shows the empty state,
  never a dead end).

### Done (P5, flagship)

- Header: filters `This week | All key results | All priorities` + summary
  `N pomodoros spent · X.X average per task`, then a **table**
  `TASK | KEY RESULT | POMODOROS | FINISHED | UNDO` (rows `4 / 4` · `14:20` ·
  `Reopen`), grouped by day (`TODAY · MONDAY 25 MAY — 2 tasks · 7 pomodoros`,
  `YESTERDAY · SUNDAY 24 MAY — …`). "This week" is a date-range filter;
  "All key results" / "All priorities" are dropdowns defaulting to All.

### Objectives (P7, flagship)

- Header: `PLAN · May cycle` + `May 2026` + `6 days left in cycle · 3
  objectives · 8 key results` countdown line; **"New objective"** button in
  the top bar; `Cycle progress 38%` (existing).
- Objectives **expanded by default** (existing). Each KR: typed mono
  `11 / 15` current/target (existing NumberInput), a **confidence pill**
  (`CONFIDENCE_META` colors — green/rose/red/grey), and a recency line
  (`updated 2 days ago · 3 tasks linked`).
- **Keep the explicit Save button** — the mockup's silent click-to-edit is
  presentation shorthand; auto-writing the Automerge doc on every keystroke
  violates the persistence rules (`docs/automerge-localstorage-rules.md`).

### ⌘K search (P6, structural parity)

- Results grouped into **OPEN · N / COMPLETED · N / INSIDE TASKS · N**
  (sub-task & note matches) with per-section counts. Scope chips, cycle
  selector, `Start`/`Reopen` row actions stay as implemented. **No** matched-term
  highlighting, **no** footer shortcut legend (no-shortcuts policy).
