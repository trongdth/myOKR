# myOKR

A single-user desktop (Tauri + React) and mobile (Flutter) app for planning and
tracking work against OKRs. All user data lives in one Automerge CRDT document
synced via Dropbox; the shared task schema is mirrored across both platforms.

## Language

**Task**:
A unit of work the user plans to execute in pomodoros. The central object of the
Pomodoro/Plan screens; links optionally to a Key Result.
_Avoid_: Todo, item, to-do (those words belong to Sub-task below).

**Sub-task**:
A single checkable line item nested under a Task (e.g. "Draft outline"). A Task
holds an ordered list of them. Independent of the pomodoro count.
_Storage_: `TodoItem` in `task.todos` — the field predates the "Sub-task" UI name.
_Avoid_: Todo, checklist item, action.

**Note**:
The free-form Markdown body attached to a Task (links, context, playbook). One
field per Task, not per line.
_Storage_: `task.description` — the field predates the "Notes" UI name.
_Avoid_: Description, memo, details.

**Comment**:
A timestamped remark on a Task; chronological (not reorderable). Distinct from a
Note: notes are edited in place as one block, comments are appended over time.
_Storage_: `TaskComment` in `task.comments`.

**Pomodoro**:
The unit of focused work (one focus session). Completing pomodoros advances a
Task toward its Estimate and, at the Estimate, completes the Task.

**Estimate**:
How many pomodoros a Task is sized for (`estimatedPomodoros`). Drives the card
`4/6`, the "pomo N of M" position, and the weekly line's fallback denominator.
_Avoid_: Planned count (that's the Weekly plan).

**Weekly plan**:
How many pomodoros the user intends to spend on a Task *this calendar week*
(`weeklyPomodoroPlan`, 0–99, absent-stays-absent). Distinct from the Estimate —
the Estimate is total task size; the Weekly plan is this-week intent.

**Bucket**:
The Task's planning horizon: Today, This week, or Backlog. New tasks land in
Backlog by default.

**Priority**:
The Task's Eisenhower category — Do, Decide, Delegate, Delete (urgent/important
axes). Pure planning priority; carries the card's accent color.
