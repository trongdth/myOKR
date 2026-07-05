import type * as AutomergeType from '@automerge/automerge';
import { BaseDirectory, exists, readFile, writeFile } from '@tauri-apps/plugin-fs';
import { load } from '@tauri-apps/plugin-store';

import type { OKRCycle, Objective, KeyResult, WeeklyReview, WalkthroughState } from './okr-storage';
import type { PomodoroSettings, PomodoroTask, DailyRecord, TimerState } from './pomodoro-storage';
import { DEFAULT_SETTINGS } from './pomodoro-storage';

let AutomergeLib: typeof import('@automerge/automerge') | null = null;

async function getAutomerge() {
  if (!AutomergeLib) {
    AutomergeLib = await import('@automerge/automerge');
  }
  return AutomergeLib;
}

/**
 * Automerge throws an error if any property is `undefined`.
 * This recursively strips `undefined` from objects and arrays.
 */
export function sanitizeForAutomerge<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForAutomerge) as unknown as T;
  const result: any = {};
  for (const key in obj) {
    if ((obj as any)[key] !== undefined) {
      result[key] = sanitizeForAutomerge((obj as any)[key]);
    }
  }
  return result;
}

export interface AppState {
  cycles: OKRCycle[];
  objectives: Objective[];
  keyResults: KeyResult[];
  reviews: WeeklyReview[];
  walkthroughState: WalkthroughState;

  settings: PomodoroSettings;
  tasks: PomodoroTask[];
  history: DailyRecord[];
  timerState: TimerState | null;
}

export const AUTOMERGE_FILE = 'myokr-data.automerge';
const BACKUP_FILE = 'myokr-data.automerge.bak';

// Compact (rebuild the doc from current state, dropping all change history) once
// the persisted file grows past this size. Automerge docs grow forever and load
// is O(history); measured on a real 9.6 MB doc, load was ~13.5 s. Compaction
// brought it to 57 KB / 57 ms. See PERFORMANCE_PLAN.md "Open question" for the
// CRDT trade-off — a .bak is written first so the step is reversible.
const COMPACTION_THRESHOLD = 2 * 1024 * 1024; // 2 MB

let currentDoc: AutomergeType.Doc<AppState> | null = null;
// Mirrors the bytes of AUTOMERGE_FILE on disk: a full save() snapshot followed
// by zero or more appended saveIncremental() chunks. Kept in memory so a write
// only ever appends its small incremental chunk instead of re-serializing the
// whole doc; bounded small by compaction. Always represents `currentDoc`.
let persistedBuffer: Uint8Array | null = null;

// Phase 0 guardrail: log Automerge timings in dev so regressions are visible.
// Compiled away in production (import.meta.env.DEV is statically false there).
function timed<T>(label: string, fn: () => T): T {
  if (!import.meta.env.DEV) return fn();
  const start = performance.now();
  const result = fn();
  console.log(`[automerge] ${label}: ${(performance.now() - start).toFixed(1)} ms`);
  return result;
}

function concatBytes(prefix: Uint8Array, suffix: Uint8Array): Uint8Array {
  const out = new Uint8Array(prefix.length + suffix.length);
  out.set(prefix, 0);
  out.set(suffix, prefix.length);
  return out;
}

// Yield to the event loop before heavy synchronous WASM work (the 5-minute
// background sync merge) so an in-flight click isn't starved. Prefers idle time
// so the merge lands between frames rather than mid-interaction.
function yieldToIdle(): Promise<void> {
  return new Promise((resolve) => {
    const ric = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout?: number }) => void)
      | undefined;
    if (typeof ric === 'function') {
      ric(() => resolve(), { timeout: 500 });
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Rebuild a brand-new doc from the current materialized state, dropping ALL
 * change history. The result has a fresh actor id, so it can no longer CRDT-merge
 * cleanly with a peer that still holds the pre-compaction history.
 */
function compactDoc(
  Automerge: typeof import('@automerge/automerge'),
  doc: AutomergeType.Doc<AppState>,
): AutomergeType.Doc<AppState> {
  return Automerge.change<AppState>(Automerge.init<AppState>(), (d) => {
    d.cycles = doc.cycles;
    d.objectives = doc.objectives;
    d.keyResults = doc.keyResults;
    d.reviews = doc.reviews;
    d.walkthroughState = doc.walkthroughState;
    d.settings = doc.settings;
    d.tasks = doc.tasks;
    d.history = doc.history;
    d.timerState = doc.timerState;
  });
}

export async function initAndMigrateData(): Promise<AutomergeType.Doc<AppState>> {
  if (currentDoc) return currentDoc;

  let hasAutomerge = false;
  try {
    hasAutomerge = await exists(AUTOMERGE_FILE, { baseDir: BaseDirectory.AppData });
  } catch (e) {
    console.error('Filesystem capability error checking automerge file:', e);
    // If the check fails (e.g. permission denied), do NOT proceed to migration, which would wipe data.
    throw new Error(`Fatal: Could not check filesystem. ${e}`);
  }

  const Automerge = await getAutomerge();

  if (hasAutomerge) {
    const buffer = await readFile(AUTOMERGE_FILE, { baseDir: BaseDirectory.AppData });
    let doc: AutomergeType.Doc<AppState>;
    try {
      if (!buffer || buffer.length === 0) {
        throw new Error('Local Automerge file is empty');
      }
      doc = timed('load', () => Automerge.load<AppState>(buffer));
    } catch (e) {
      // Last-resort recovery: a truncated/corrupt main file may still have a
      // valid pre-compaction backup. Surface it loudly, never silent.
      console.error('Automerge load failed; attempting .bak recovery', e);
      let backup: Uint8Array | null = null;
      try {
        backup = await readFile(BACKUP_FILE, { baseDir: BaseDirectory.AppData });
      } catch {
        backup = null;
      }
      if (backup && backup.length > 0) {
        try {
          doc = Automerge.load<AppState>(backup);
        } catch (backupErr) {
          console.error('Automerge backup load failed, initializing new document', backupErr);
          doc = Automerge.init<AppState>();
        }
      } else {
        console.warn('No valid backup found, initializing new document');
        doc = Automerge.init<AppState>();
      }
    }

    // Compaction: history has bloated the file → rebuild from current state.
    if (buffer.length > COMPACTION_THRESHOLD) {
      const compacted = timed('compact', () => compactDoc(Automerge, doc));
      try {
        // Back up the pre-compaction file before overwriting (reversible).
        await writeFile(BACKUP_FILE, buffer, { baseDir: BaseDirectory.AppData });
      } catch (e) {
        console.error('Failed to write compaction backup; aborting compaction', e);
        // Fall through to the non-compaction path below using the original doc.
        return finishLoad(Automerge, doc, buffer);
      }
      // save() on the compacted doc both produces the new file contents and
      // resets the incremental baseline so later writes append cleanly.
      const snapshot = timed('save(compacted)', () => Automerge.save(compacted));
      try {
        await writeFile(AUTOMERGE_FILE, snapshot, { baseDir: BaseDirectory.AppData });
      } catch (e) {
        console.error('Failed to write compacted Automerge file:', e);
      }
      console.info(
        `[automerge] compacted ${buffer.length} → ${snapshot.length} bytes`,
      );
      persistedBuffer = snapshot;
      currentDoc = compacted;
      return currentDoc;
    }

    return finishLoad(Automerge, doc, buffer);
  }

  // MIGRATION: v0.1.8 -> v0.1.9
  let doc = Automerge.init<AppState>();

  // Load old JSON stores
  const okrStore = await load('okr-data.json');
  const pomoStore = await load('pomodoro-data.json');

  const cycles = (await okrStore.get<OKRCycle[]>('cycles')) || [];
  const objectives = (await okrStore.get<Objective[]>('objectives')) || [];
  const keyResults = (await okrStore.get<KeyResult[]>('keyResults')) || [];
  const reviews = (await okrStore.get<WeeklyReview[]>('reviews')) || [];
  const walkthroughState = (await okrStore.get<WalkthroughState>('walkthroughState')) || 'not_seen';

  const rawSettings = (await pomoStore.get<Partial<PomodoroSettings>>('settings')) || {};
  const settings = { ...DEFAULT_SETTINGS, ...rawSettings };
  const tasks = (await pomoStore.get<PomodoroTask[]>('tasks')) || [];
  const history = (await pomoStore.get<DailyRecord[]>('history')) || [];
  const timerState = (await pomoStore.get<TimerState | null>('timerState')) || null;

  doc = Automerge.change(doc, 'Migrate v0.1.8 JSON to Automerge', (d) => {
    d.cycles = cycles;
    d.objectives = objectives;
    d.keyResults = keyResults;
    d.reviews = reviews;
    d.walkthroughState = walkthroughState;
    d.settings = settings;
    d.tasks = tasks;
    d.history = history;
    d.timerState = timerState;
  });

  try {
    const binary = Automerge.save(doc);
    await writeFile(AUTOMERGE_FILE, binary, { baseDir: BaseDirectory.AppData });
    persistedBuffer = binary;
  } catch (e) {
    console.error('Failed to write Automerge file during migration:', e);
  }

  currentDoc = doc;
  return doc;
}

/**
 * Finish a non-compacting load: keep the on-disk file as-is (it already
 * represents the loaded state) but reset the in-memory incremental baseline.
 *
 * A bare `load()` leaves the incremental tracker pointing before the last
 * appended chunk, so the next `saveIncremental()` would re-emit it; calling
 * `save()` once (and discarding the bytes) advances the tracker to the current
 * state without a needless disk rewrite.
 */
function finishLoad(
  Automerge: typeof import('@automerge/automerge'),
  doc: AutomergeType.Doc<AppState>,
  buffer: Uint8Array,
): AutomergeType.Doc<AppState> {
  timed('save(reset baseline)', () => Automerge.save(doc));
  persistedBuffer = buffer;
  currentDoc = doc;
  return doc;
}

export async function getAutomergeDoc(): Promise<AutomergeType.Doc<AppState>> {
  if (!currentDoc) {
    return await initAndMigrateData();
  }
  return currentDoc;
}

type UpdateTask = () => Promise<void>;
const updateQueue: UpdateTask[] = [];
let isUpdating = false;

async function processQueue() {
  if (isUpdating) return;
  isUpdating = true;
  while (updateQueue.length > 0) {
    const task = updateQueue.shift();
    if (task) {
      try {
        await task();
      } catch (e) {
        console.error('Error processing automerge update:', e);
      }
    }
  }
  isUpdating = false;
}

// Append an incremental chunk (the new changes since the last save) to the
// persisted file. Returns the chunk, or null if there were no new changes.
async function appendIncremental(
  Automerge: typeof import('@automerge/automerge'),
  doc: AutomergeType.Doc<AppState>,
): Promise<Uint8Array | null> {
  const inc = timed('saveIncremental', () => Automerge.saveIncremental(doc));
  if (inc.length === 0) return null;
  const base = persistedBuffer ?? new Uint8Array();
  persistedBuffer = concatBytes(base, inc);
  try {
    await writeFile(AUTOMERGE_FILE, persistedBuffer, { baseDir: BaseDirectory.AppData });
  } catch (e) {
    console.error('Failed to append Automerge changes to file:', e);
  }
  return inc;
}

export function updateAutomergeDoc(
  message: string,
  callback: (state: AppState) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    updateQueue.push(async () => {
      try {
        const Automerge = await getAutomerge();
        const doc = await getAutomergeDoc();
        const next = Automerge.change(doc, message, callback);
        currentDoc = next;
        await appendIncremental(Automerge, next);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
    processQueue();
  });
}

export async function getAutomergeBinary(): Promise<Uint8Array> {
  await getAutomergeDoc();
  // persistedBuffer is a complete, loadable byte stream (snapshot + appended
  // incrementals) and always mirrors currentDoc — return it directly instead
  // of re-running an O(doc) save().
  if (persistedBuffer) return persistedBuffer;
  const Automerge = await getAutomerge();
  return Automerge.save(currentDoc!);
}

export function mergeExternalBinary(remoteBinary: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    updateQueue.push(async () => {
      try {
        // Yield before the synchronous WASM load/merge so a pending UI event
        // (e.g. Start/Pause click) is processed first instead of freezing.
        await yieldToIdle();
        const Automerge = await getAutomerge();
        const localDoc = await getAutomergeDoc();
        if (!remoteBinary || remoteBinary.length === 0) {
          throw new Error('Remote binary is empty');
        }
        let remoteDoc;
        try {
          remoteDoc = timed('load(remote)', () => Automerge.load<AppState>(remoteBinary));
        } catch (loadErr) {
          console.error('Failed to load remote Automerge binary:', loadErr);
          throw new Error('The remote sync file is corrupted or invalid. You can overwrite the cloud file with your local data to resolve this.');
        }
        const merged = Automerge.merge(localDoc, remoteDoc);
        currentDoc = merged;
        await appendIncremental(Automerge, merged);
        resolve(persistedBuffer ?? Automerge.save(merged));
      } catch (e) {
        reject(e);
      }
    });
    processQueue();
  });
}
