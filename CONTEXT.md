# CONTEXT — myOKR

The project's domain glossary and the canonical shape of the data that crosses
between the desktop (Tauri/React/TS) and mobile (Flutter + Rust) apps. Both apps
read/write **one shared Automerge CRDT document** via Dropbox; this file is the
single source of truth for what that document may contain. Each app's
normalizers conform to what's written here.

> Maintenance rule: when the shared schema changes, update this file **first**,
> then both apps' normalizers. ADRs under `docs/adr/` record the hard-to-reverse
> decisions.

## Glossary

- **Pomodoro document** — the single Automerge CRDT doc shared across desktop +
  mobile via Dropbox; the source of truth for all user data. Canonical shape
  defined below. Both apps normalize untrusted bytes against it at load time.
- **normalization** — defensive coercion of untrusted synced/imported doc bytes
  to safe app values at the load chokepoint. Born from a real data-loss incident
  (see `docs/automerge-localstorage-rules.md`). Desktop owns the reference
  implementation (`src/lib/pomodoro-storage.ts`); mobile mirrors it in Dart.
  See [ADR-0001](./docs/adr/0001-normalization-in-dart.md) and
  [ADR-0003](./docs/adr/0003-normalize-maps-in-place.md).
- **task** — a `PomodoroTask`. _On mobile, tasks are raw `Map<String, dynamic>`_
  throughout storage and UI (`task['title']`, `task['todos']`, `task['category']`
  in `timer_screen.dart`, `task_details_sheet.dart`). The typed `PomodoroTask`
  class in `pomodoro_models.dart` was **dead code — imported by nothing** and
  omitted `todos`/`comments`; it is deleted per ADR-0003. The canonical shape is
  the one below; the `Map` is mobile's runtime representation.
- **TimerState** — the _ephemeral, device-local_ state of the running timer
  (`sessionType`, `timeLeft`, `isRunning`, `activeTaskId`, `completedPomodoros`,
  `sessionStartedAt`, `lastUpdated`). **Not part of the synced document.**
  Desktop stores it in `localStorage`; mobile stores it in `shared_preferences`.
  Distinct from _session history_, which IS in the doc. See
  [ADR-0002](./docs/adr/0002-timerstate-device-local.md). _A stale `timerState`
  key may remain in old docs; both apps ignore it._
- **session / SessionRecord** — a completed (or abandoned) timer interval,
  recorded in `history` (synced). Carries `type`, `taskId`, `completed`.
- **DailyRecord** — one day's aggregate in `history`, keyed by `YYYY-MM-DD`.
- **Eisenhower category** — priority quadrant: `do` | `decide` | `delegate` |
  `delete`. Owned per-task.
- **OKRCycle** — monthly container (`month`: 0–11, `year`, `isActive`) for OKR planning.
- **Objective** — top-level goal (`title`, `description?`, `reward?`, `order`) bound to an `OKRCycle`.
- **KeyResult** — target metric under an Objective (`title`, `targetValue`, `currentValue`, `unit`, `confidence`, `completionMode`, `habitId?`, `order`).
- **Confidence** — qualitative metric status (`on_track` | `at_risk` | `off_track` | `not_set`).
- **CompletionMode** — metric calculation mode (`manual` | `focus_hours` | `focus_pomodoros` | `completed_tasks` | `habit`).

## Canonical Pomodoro & OKR document shape

Top-level keys in the Automerge doc. Bounds/defaults mirror desktop's
`normalize*` functions — those are the reference.

```
settings: {
  focusDuration:        number  1–120   default 25
  shortBreakDuration:   number  1–60    default 5
  longBreakDuration:    number  1–120   default 15
  pomosBeforeLongBreak: number  1–10    default 4
  autoStartBreaks:      bool            default false
  autoStartFocus:       bool            default false
  focusMusicEnabled:    bool            default false   // desktop writes it; mobile must normalize + preserve it
}

tasks: [ {
  id:                 string
  title:              string                       default ''
  description?:       string
  todos?:             [ { id, text, completed(bool), createdAt } ]
  comments?:          [ { id, text, createdAt } ]
  estimatedPomodoros: number                       default 0
  completedPomodoros: number                       default 0
  isCompleted:        bool                         default false
  createdAt:          string
  completedAt?:       string
  category?:          'do' | 'decide' | 'delegate' | 'delete'
  bucket?:            'today' | 'this_week' | 'backlog'            default 'backlog'
  dueDate?:           string                       // 'YYYY-MM-DD'
  keyResultId?:       string                       // link to OKR KeyResult
} ]

history: [ {
  date:               string  'YYYY-MM-DD'
  completedPomodoros: number
  totalFocusMinutes:  number
  tasksCompleted:     number
  sessions: [ {
    startedAt:  string
    endedAt:    string
    type:       'focus' | 'shortBreak' | 'longBreak'
    taskId?:    string
    completed:  bool
  } ]
} ]

cycles: [ {
  id:        string
  name:      string
  month:     number   0-11
  year:      number
  isActive:  bool     default false
  createdAt: string
} ]

objectives: [ {
  id:          string
  cycleId:     string
  title:       string   default ''
  description?: string
  reward?:     string
  order:       number   default 0
  createdAt:   string
} ]

keyResults: [ {
  id:             string
  objectiveId:    string
  title:          string                       default ''
  targetValue:    number                       default 0
  currentValue:   number                       default 0
  unit:           string                       default ''
  confidence:     'on_track' | 'at_risk' | 'off_track' | 'not_set'   default 'not_set'
  completionMode: 'manual' | 'focus_hours' | 'focus_pomodoros' | 'completed_tasks' | 'habit' default 'manual'
  order:          number                       default 0
  createdAt:      string
  updatedAt:      string
  habitId?:       string
} ]

reviews: [ {
  id:             string
  weekStartDate:  string   // 'YYYY-MM-DD'
  weekEndDate:    string   // 'YYYY-MM-DD'
  cycleId:        string
  completedAt?:   string
  entries: [ {
    keyResultId:   string
    previousValue: number
    currentValue:  number
    confidence:    'on_track' | 'at_risk' | 'off_track' | 'not_set'
    note?:         string
  } ]
  reflection?:    string
  pomodoroStats: {
    totalPomodoros:       number
    totalFocusMinutes:    number
    tasksCompleted:       number
    pomodorosByKeyResult: Record<string, number>
  }
} ]

timerState: ❌ NOT a key in this document (device-local — see ADR-0002).
            A stale key may persist in old docs; both apps ignore it.
```

## Decisions recorded

- **ADR-0001** — schema authority = this file (desktop); normalization in Dart;
  Rust bridge stays a thin Automerge adapter.
- **ADR-0002** — `TimerState` is device-local (`shared_preferences`); not in the
  synced doc; stale doc key left in place and ignored.
- **ADR-0003** — normalization mirrors desktop on raw Maps (dedicated
  `pomodoro_normalizer.dart` & `okr_normalizer.dart`, called by storage on every load).
- **ADR-0004** — writes are read-modify-write at the property level, so fields
  the other app added are never erased on save.
- **ADR-0005** — focus music = a bundled offline-rendered audio loop (+background
  audio session config); Eisenhower matrix = a mobile-adapted tap-to-assign
  screen, not a 1:1 drag-modal port.
- **ADR-0006** — OKR mobile port: sync-safe `okr_normalizer.dart` foundation + full feature parity for OKR screen (cycle header pill + action sheet, collapsible objective cards + bottom sheets, KR confidence quick pills + 5 completion mode auto-calculations + detail/edit sheet).
- **ADR-0007** — Weekly review mobile port: dedicated Review tab in `MainLayout`, full-screen step-by-step wizard (`ReviewWizardScreen`), `CustomPainter` progress chart (`ProgressChartWidget`), expandable review history with bottom sheet entry editing (`ReviewHistoryWidget` & `ReviewEntryEditSheet`), and startup review repair/sync in `StorageProvider`.
- **ADR-0008** — Cloud sync mobile port: OAuth PKCE flow via `url_launcher`, `DropboxService` REST API download/upload, Rust CRDT `mergeAutomergeBinaries` + Dart normalizers (`PomodoroNormalizer`, `OkrNormalizer`), background 15-min auto-sync timer in `StorageProvider`, `SharedPreferences` token management, Rule 6 compaction force-overwrite handling, and `CloudSyncScreen` UI with `AppBar.actions` integration.
- **ADR-0009** — Habits tracker mobile port: 5th navigation tab **Habits** in `MainLayout.dart`, `computeHabitStreaks` (`current` and `best` streak calculation in `habit_utils.dart`), `StorageProvider` habit CRUD & toggle tick methods, OKR Key Result linkage fallback safety on habit deletion (resets linked Key Result to `manual` mode and preserves calculated count), and `HabitsScreen` UI with Add Habit bar, status dropdown, 3-card streak row, 7-column calendar month grid with tap-to-toggle ticks, and collapsible Formed Habits section.
- **ADR-0010** — Plan Group task movement: Desktop Tauri webview does not rely on fragile HTML5 drag-and-drop. Task bucket reassignment and reordering use click-to-select/click-to-place (matching UP NEXT in Day Plan) and quick bucket action dropdowns/buttons on cards and list cells.
- **ADR-0011** — Plan Group cycle filter & search: The Plan header includes a Cycle Selector (`cycleId`) allowing users to switch between the active cycle and historical cycles to search and audit past completed tasks and OKRs. Search (⌘K) is kept clean and simple with search scope chips and standard click interactions (deferring complex multi-key shortcuts).

## Grilling outcome — spec scope (Habits Tracker Mobile Port)

**Workstream 1 — Habit Utilities & Streak Calculation:**
1. Create `mobile/lib/src/utils/habit_utils.dart` implementing `computeHabitStreaks(List<String> ticks)` calculating `current` streak (consecutive days leading to today/yesterday) and `best` streak (longest consecutive run).

**Workstream 2 — StorageProvider & OKR Linkage Fallback Logic:**
2. Add `saveHabit`, `deleteHabit`, `updateHabitStatus`, and `toggleHabitTick` methods to `StorageProvider`.
3. Implement OKR linkage fallback safety in `deleteHabit`: find linked Key Results (`kr['habitId'] == habitId`), compute current count, reset `kr['completionMode'] = 'manual'`, set `kr['currentValue'] = count`, and delete `kr['habitId']`.

**Workstream 3 — Habits Screen & Calendar Month Grid Widget:**
4. Create `HabitsScreen` (`mobile/lib/src/screens/habits_screen.dart`) featuring Add Habit bar, active habit cards, status dropdown selector (`Want to form`, `In progress`, `Formed`), 3-card stats row (`🔥 Current`, `🏆 Best`, `📅 Total Ticks`), 7-column calendar month grid (`M`, `T`, `W`, `T`, `F`, `S`, `S`) with cyan tick highlights (`AppTheme.accentCyan`) and tap-to-toggle tick callbacks, and collapsible Formed Habits section.
5. Add 5th navigation tab **Habits** (`📈 Habits`) to `MainLayout.dart`'s `BottomNavigationBar`.

## Open questions

- [x] ~~TimerState relocation~~ — resolved (ADR-0002).
- [x] ~~Normalization coverage~~ — resolved (ADR-0003 & ADR-0006).
- [x] ~~Write-side field preservation~~ — resolved (ADR-0004).
- [x] ~~Focus music scope~~ — resolved (ADR-0005).
- [x] ~~Eisenhower matrix scope~~ — resolved (ADR-0005).
- [x] ~~OKR Mobile Port scope & UX design~~ — resolved (ADR-0006).
- [x] ~~Weekly Review Mobile Port scope & UX design~~ — resolved (ADR-0007).
- [x] ~~Cloud Sync Mobile Port scope & UX design~~ — resolved (ADR-0008).
- [x] ~~Habits Tracker Mobile Port scope & UX design~~ — resolved (ADR-0009).
- [x] ~~Plan Group Redesign scope & UX design~~ — resolved (ADR-0010 & ADR-0011).

## Grilling outcome — spec scope (Plan Group Redesign)

**Workstream 1 — Schema, Normalization & Task Importance:**
1. Update `PomodoroTask` interface in `src/lib/pomodoro-storage.ts` and `CONTEXT.md` to include `bucket?: 'today' | 'this_week' | 'backlog'` (defaulting to `'backlog'`) and optional `dueDate?: string` (`YYYY-MM-DD`). Update `normalizeTask` to preserve and set defaults for both fields.
2. Implement task importance calculation helper using Priority weight (`do`: 4, `decide`: 3, `delegate`: 2, `delete`: 1), KR Risk multiplier (`off_track`: 1.5, `at_risk`: 1.25, `on_track`: 1.0, `not_set`: 1.0), Due date proximity, and Bucket multiplier (`Today`: 1.3, `This week`: 1.0, `Backlog`: 0.7).

**Workstream 2 — Plan Group Tasks Tab (Board & List Views):**
3. Create `TasksView.tsx` with a segmented Board / List view switcher, header Cycle Selector (`cycleId`) for filtering active vs historical cycles, and the top Key Result "Serving" strip.
4. **Board View (P1/P2)**: Implement 3-bucket columns (`Today`, `This week`, `Backlog`) with responsive collapse for `Backlog` at $\le 1024\text{px}$. Use click-to-select / click-to-place and quick bucket action dropdowns/buttons for task movement (ADR-0010). Include collapsed "X completed today · Show" undo strip at column footers.
5. **List View (P3)**: Build sortable data table with grouping toggles (*By Bucket*, *By Key Result*, *By Priority*), inline-editable cells (`Bucket`, `Priority`, `Key Result`, `Due Date`, `Pomodoros`), and multi-row selection for bulk updates.

**Workstream 3 — Task Detail Redesign & Direct Focus Trigger (P4):**
6. Update `TaskDetailModal.tsx` to feature the top properties strip (`Priority`, `Bucket`, `Due Date`, `Key Result`, `Pomodoros`), direct click-to-edit inline selectors, Markdown note formatting with link wrapping & copy button, equal-weight Sub-tasks and Comments tabs, and a `Start focus` button that sets the active task in timer state and switches navigation to `Focus -> Session`.

**Workstream 4 — Done Tab & Global ⌘K Search (P5 & P6):**
7. Create `DoneView.tsx` under Plan group, grouping completed tasks by day (`TODAY`, `YESTERDAY`, `LAST WEEK`) with pomodoro count, timestamp, and a `Reopen` button that returns tasks to their original bucket.
8. Build a clean, simplified global `⌘K` search overlay featuring scope chips (`Everything`, `Open`, `Completed`, `Sub-tasks`, `Notes`), cycle-aware filtering, and direct click actions.

**Workstream 5 — Objectives & Key Results Redesign (P7):**
9. Update `ObjectiveCard.tsx` and `KeyResultRow.tsx` so objectives are expanded by default, sliders are replaced with `NumberInput.tsx`, and Key Results display confidence badges, linked task counts, and the "no tasks serving this KR" warning flag.

_Grilling complete. Shared understanding reached. Ready for execution._



