import * as Automerge from '@automerge/automerge';
import { BaseDirectory, exists, readFile, writeFile } from '@tauri-apps/plugin-fs';
import { load } from '@tauri-apps/plugin-store';

import type { OKRCycle, Objective, KeyResult, WeeklyReview, WalkthroughState } from './okr-storage';
import type { PomodoroSettings, PomodoroTask, DailyRecord, TimerState } from './pomodoro-storage';
import { DEFAULT_SETTINGS } from './pomodoro-storage';

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

let currentDoc: Automerge.Doc<AppState> | null = null;

export async function initAndMigrateData(): Promise<Automerge.Doc<AppState>> {
  if (currentDoc) return currentDoc;

  let hasAutomerge = false;
  try {
    hasAutomerge = await exists(AUTOMERGE_FILE, { baseDir: BaseDirectory.AppData });
  } catch (e) {
    console.error('Filesystem capability error checking automerge file:', e);
    // If the check fails (e.g. permission denied), do NOT proceed to migration, which would wipe data.
    throw new Error(`Fatal: Could not check filesystem. ${e}`);
  }

  if (hasAutomerge) {
    const buffer = await readFile(AUTOMERGE_FILE, { baseDir: BaseDirectory.AppData });
    currentDoc = Automerge.load<AppState>(buffer);
    return currentDoc;
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
  } catch (e) {
    console.error('Failed to write Automerge file during migration:', e);
  }

  currentDoc = doc;
  return doc;
}

export async function getAutomergeDoc(): Promise<Automerge.Doc<AppState>> {
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

export function updateAutomergeDoc(
  message: string,
  callback: (state: AppState) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    updateQueue.push(async () => {
      try {
        const doc = await getAutomergeDoc();
        currentDoc = Automerge.change(doc, message, callback);
        const binary = Automerge.save(currentDoc);
        try {
          await writeFile(AUTOMERGE_FILE, binary, { baseDir: BaseDirectory.AppData });
        } catch (e) {
          console.error('Failed to write Automerge file:', e);
        }
        resolve();
      } catch (err) {
        reject(err);
      }
    });
    processQueue();
  });
}

export async function getAutomergeBinary(): Promise<Uint8Array> {
  const doc = await getAutomergeDoc();
  return Automerge.save(doc);
}

export function mergeExternalBinary(remoteBinary: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    updateQueue.push(async () => {
      try {
        const localDoc = await getAutomergeDoc();
        const remoteDoc = Automerge.load<AppState>(remoteBinary);
        currentDoc = Automerge.merge(localDoc, remoteDoc);
        const mergedBinary = Automerge.save(currentDoc);
        try {
          await writeFile(AUTOMERGE_FILE, mergedBinary, { baseDir: BaseDirectory.AppData });
        } catch (e) {
          console.error('Failed to write Automerge file during merge:', e);
        }
        resolve(mergedBinary);
      } catch (e) {
        reject(e);
      }
    });
    processQueue();
  });
}
