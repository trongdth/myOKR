# myOKR Desktop — Design System

The canonical reference for the desktop UI's tokens, layout, icons, and empty-state
pattern. This is the presentation counterpart to `CONTEXT.md` (which is the pure
domain glossary): color roles, spacing, and grid live **here**, not in
`CONTEXT.md`. Decided in the item-1a grilling session; see
[ADR-0010](./adr/0010-desktop-ui-design-system.md).

Source of the redesign: `~/Downloads/myOKR Redesign - Standalone.html`
("MYOKR DESKTOP v0.2.0 — UI REVIEW & PROPOSED FIX").

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
