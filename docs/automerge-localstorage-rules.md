# Automerge + localStorage: Development Rules

Rules for touching the persistence layer. Written after the 2026-07-13 data-loss
incident; every rule here traces to a real bug or near-miss. **Read this before
modifying `src/lib/automerge-storage.ts`, `src/lib/dropbox-service.ts`, or any
code that persists data.**

## Architecture in one minute

All user data lives in **one Automerge CRDT document** (`AppState`), persisted
to a single binary file and optionally synced to Dropbox:

```
UI components
    │  load*/save* helpers (okr-storage, pomodoro-storage, habit-storage)
    ▼
automerge-storage.ts
    ├─ currentDoc        in-memory Automerge doc (THE source of truth at runtime)
    ├─ persistedBuffer   in-memory mirror of the on-disk bytes
    ├─ updateQueue       serial queue — ALL doc mutations go through it
    ▼
myokr-data.automerge    (Tauri AppData; snapshot + appended incremental chunks)
    ├─ .bak              pre-compaction backup, written before each compaction
    └─ .corrupt          stash of an unloadable main file (written by recovery)
    ▼
Dropbox /myokr-data.automerge   (merge-based sync every 15 min + 5 s after start)
```

`localStorage` is **only** for device-local ephemera (prefs, tokens, flags) —
never user data. Current keys:

| Key                                                            | Owner                               | Purpose                                                                                                        |
| -------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `myokr_active_section`                                         | App.tsx                             | last visited section                                                                                           |
| `myokr_timer_state`                                            | pomodoro-storage                    | live Pomodoro timer state (the `AppState.timerState` field is a migration leftover — live persistence is here) |
| `myokr_today_plan`                                             | today-focus                         | today's locked plan, self-expires by date                                                                      |
| `myokr_force_sync_overwrite`                                   | automerge-storage / dropbox-service | see "Compaction contract" below                                                                                |
| `dropbox_client_id`, `dropbox_refresh_token`, `last_sync_time` | SyncApp / App.tsx                   | Dropbox credentials + status                                                                                   |
| `mock_fs_*`                                                    | src/mocks/fs.ts                     | **tests only** — base64 file contents standing in for Tauri fs                                                 |

## Hard rules

### 1. Every doc mutation goes through `updateAutomergeDoc`

Never assign `currentDoc`, `persistedBuffer`, or `isUpdating` directly, and
never call `Automerge.change` on `currentDoc` outside the queue. The queue
serializes writes; bypassing it corrupts the incremental baseline (the
`persistedBuffer`-mirrors-disk invariant). The only sanctioned backdoor is
`getQueueInfoForTesting`, which is dev-only and test-only.

### 2. A queued task must always settle

Every code path inside a queued task must `resolve` or `reject`. A task that
never settles stalls the queue forever — every later save silently hangs.

### 3. The UI must never block on persistence

Act on user intent first (close the dialog, update the state), then persist
with `.catch(console.error)`. Incident: "Get Started" awaited
`saveWalkthroughState` before hiding the overlay; when storage was broken the
overlay became undismissable. Worst case of save-after-act is re-showing
something once — strictly better than a dead UI.

### 4. Never persist a merge as appended chunks

After `Automerge.merge`, persist with a full `Automerge.save()` snapshot (one
document chunk). **This was the root cause of the 2026-07-13 data loss**: a
merge that pulled in a large foreign history was appended as ~215 change
chunks, and one-shot `Automerge.load` of that file exhausts WASM memory even
though each chunk applies fine individually. `saveIncremental` appends are only
for ordinary local edits.

### 5. Corrupt bytes must never become the baseline

If `Automerge.load(buffer)` fails at startup:

- stash `buffer` to `myokr-data.automerge.corrupt` (it is usually recoverable — see playbook);
- recover from `.bak` or `Automerge.init()`, then persist a fresh `save()` snapshot as the new main file;
- **never** set `persistedBuffer = buffer`, never let `buffer` reach the compaction path (it would overwrite the good `.bak`), and abort (`throw`) rather than continue if the stash write fails.

### 6. The compaction contract

Compaction (`compactDoc`) rebuilds the doc with a **fresh actor id and no
history**. Consequences you must preserve:

- `.bak` is written from the verified pre-compaction buffer _before_ the main file is overwritten. Keep it reversible.
- A compacted doc must **never CRDT-merge** with a remote written before the compaction: with no shared history, every root key is re-decided as a conflict with an unpredictable winner. This silently reverts user data (observed live — "the merge lottery").
- Therefore compaction sets `FORCE_SYNC_OVERWRITE_FLAG`; while set, `syncWithDropbox` **replaces** the remote instead of merging, then clears the flag only after a successful upload.
- In `syncWithDropbox`, read the flag **after** `await getAutomergeBinary()` — that await guarantees init (and any compaction) has finished setting it.
- This force-overwrite assumes a **single device**. If multi-device sync is ever added, this design must be revisited first.

### 7. No `undefined` enters the doc

Automerge throws on `undefined` properties. Anything built from app objects
must pass through `sanitizeForAutomerge` (or be constructed without optional
holes) before being written into a change callback.

### 8. localStorage discipline

- No user data (tasks, KRs, history, reviews, habits) in localStorage — it isn't synced, isn't backed up, and diverges from the doc.
- No Dropbox tokens inside the Automerge doc — the doc gets uploaded; tokens would leak into the cloud copy.
- Wrap writes in try/catch (quota/privacy modes); a failed pref write must not crash a flow.

### 9. Heavy WASM work yields first

`Automerge.load`/`merge` on a multi-MB doc freezes the UI thread for seconds.
Follow the existing `yieldToIdle()` pattern before synchronous WASM work in
background paths (sync merge), so in-flight clicks are processed first.

### 10. Shutdown flushes the queue

The Tauri `window-close-requested` handler calls `flushAutomergeQueue(5000)`
before hiding the window. Anything that changes shutdown behavior must keep a
bounded-time flush — no unbounded awaits, no skipping the flush.

### 11. In-place element updates over root-array overwrites

When mutating a single item (e.g. completing a pomodoro on an active task, toggling a todo), modify the target item in-place inside `updateAutomergeDoc` (e.g. `d.tasks[idx] = ...`) rather than overwriting `d.tasks` with a snapshot from React component state (`d.tasks = reactState`). Incident: `handleSessionComplete` closed over a stale `tasks` state array and called `saveTasks(updatedTasks)`, which executed `d.tasks = ...` and wiped out all tasks created while the timer was running.

## Testing rules

- Browser tests run against mocks wired in `vite.screenshots.config.ts`:
  Tauri fs → `src/mocks/fs.ts` (files live in localStorage as base64 under
  `mock_fs_*`), stores → `src/mocks/store.ts` (seeded, `walkthroughState:
'dismissed'`).
- Data-layer hooks (`window.__getAutomergeDoc`, `__updateAutomergeDoc`,
  `__mergeExternalBinary`, `__getQueueInfoForTesting`, …) are exposed in
  `src/main.tsx` **inside `if (import.meta.env.DEV)` only**. Never expose them
  unconditionally; declare new ones in `src/vite-env.d.ts`.
- A bug fix in this layer needs a regression test proven **red on the old
  code, green on the new** (stash the fix, run, restore). Existing coverage:
  `tests/data-corruption.spec.ts` (rules 4–5), `tests/automerge-queue.spec.ts`
  (rules 1–2, 10), `tests/pomodoro-storage.spec.ts` (rule 11), `tests/migration.spec.ts`, `tests/walkthrough.spec.ts`
  (rule 3).
- Playwright specs run in Node, so they can `import * as Automerge from
'@automerge/automerge'` directly to build fixture binaries and decode what
  the app persisted.

## Incident playbook (data looks lost or app boots empty)

1. **Do not let the app write.** Quit it first. Recovery scripts run only
   while the app is closed — its in-memory doc rewrites the file on any save.
2. Check `~/Library/Application Support/com.trongdth.myokr/` for
   `myokr-data.automerge.corrupt` and `.bak`, and copy everything somewhere
   safe before experimenting.
3. An "unloadable" file is usually recoverable: Automerge files are chunks
   delimited by magic bytes `85 6F 4A 83`. Load the first (document) chunk
   with `Automerge.load`, then apply each following chunk with
   `Automerge.loadIncremental` one at a time — this succeeds where one-shot
   load OOMs. Re-persist with a single `Automerge.save()`.
4. The Dropbox copy and its version history are additional fallbacks.
