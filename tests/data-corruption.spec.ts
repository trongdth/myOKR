import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import * as Automerge from '@automerge/automerge';

const MAIN_KEY = 'mock_fs_myokr-data.automerge';
const CORRUPT_KEY = 'mock_fs_myokr-data.automerge.corrupt';

const CHUNK_MAGIC = [0x85, 0x6f, 0x4a, 0x83];

function countChunks(buf: Uint8Array): number {
  let count = 0;
  for (let i = 0; i <= buf.length - 4; i++) {
    if (buf[i] === CHUNK_MAGIC[0] && buf[i + 1] === CHUNK_MAGIC[1] && buf[i + 2] === CHUNK_MAGIC[2] && buf[i + 3] === CHUNK_MAGIC[3]) {
      count++;
    }
  }
  return count;
}

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
}

async function readMockFile(page: Page, key: string): Promise<Uint8Array | null> {
  const b64 = await page.evaluate((k) => localStorage.getItem(k), key);
  if (b64 === null) return null;
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

test.describe('Data file corruption resilience', () => {
  test('sync merge with a disjoint-history remote persists a single loadable snapshot chunk', async ({ page }) => {
    await waitForApp(page);

    // A remote doc with no shared history (what the Dropbox file looks like
    // after a local compaction rebuilt the doc with a fresh actor id).
    const remote = Automerge.change(Automerge.init<any>(), (d: any) => {
      d.tasks = [{ id: 'remote-task', title: 'From remote' }];
    });
    const remoteBytes = Automerge.save(remote);

    await page.evaluate(async (bytes) => {
      await (window as any).__mergeExternalBinary(new Uint8Array(bytes));
    }, Array.from(remoteBytes));

    const persisted = await readMockFile(page, MAIN_KEY);
    expect(persisted).not.toBeNull();
    // One document chunk — never a snapshot plus appended foreign change
    // chunks, which is the structure that exhausted WASM memory on load.
    expect(countChunks(persisted!)).toBe(1);
    expect(() => Automerge.load(persisted!)).not.toThrow();
  });

  test('an unloadable main file is stashed to .corrupt and replaced with a loadable snapshot', async ({ page }) => {
    const garbageB64 = Buffer.from('NOT-AN-AUTOMERGE-FILE-' + 'x'.repeat(200)).toString('base64');
    await page.addInitScript(([key, value]) => {
      localStorage.setItem(key, value);
    }, [MAIN_KEY, garbageB64]);

    await waitForApp(page);

    // The app must boot (empty doc) rather than crash.
    await expect(page.getByText('Something went wrong')).toHaveCount(0);

    // Trigger the storage layer so initAndMigrateData has definitely run.
    await page.evaluate(async () => {
      await (window as any).__getAutomergeDoc();
    });

    // The unloadable bytes are preserved for offline recovery...
    const stashed = await page.evaluate((k) => localStorage.getItem(k), CORRUPT_KEY);
    expect(stashed).toBe(garbageB64);

    // ...and the main file now holds a valid, loadable snapshot instead of
    // the corrupt bytes (which previously stayed as the incremental baseline).
    const main = await readMockFile(page, MAIN_KEY);
    expect(main).not.toBeNull();
    expect(() => Automerge.load(main!)).not.toThrow();
  });

  test('a transiently-failing load is retried — a valid file is never stashed or replaced by the stale backup', async ({ page }) => {
    // Real incident (2026-08-05): a single Automerge.load throw on a VALID file
    // (WASM init race / memory pressure) triggered the stash-and-recover path,
    // which replaced the current doc with a stale .bak — erasing the day's
    // recorded sessions and task pomodoros. Recovery must be reserved for a
    // load that fails twice; one transient failure must fall through to a retry.

    // Main file: a valid doc holding "today's" recorded progress.
    const main = Automerge.change(Automerge.init<any>(), (d: any) => {
      d.tasks = [{ id: 'task-1', title: 'Focus Group', completedPomodoros: 2 }];
      d.history = [{ date: '2026-08-05', completedPomodoros: 2, totalFocusMinutes: 80, tasksCompleted: 0, sessions: [] }];
    });
    const mainBytes = Automerge.save(main);

    // Stale backup: the pre-incident .bak, missing today's data entirely.
    const backup = Automerge.change(Automerge.init<any>(), (d: any) => {
      d.tasks = [{ id: 'task-1', title: 'Focus Group', completedPomodoros: 0 }];
    });
    const backupBytes = Automerge.save(backup);

    // NB: addInitScript serializes the function source — closure variables are
    // not defined in the page context. Keys must arrive as args (test #2 pattern).
    await page.addInitScript(([mainKey, m, b]) => {
      localStorage.setItem(mainKey, m);
      localStorage.setItem('mock_fs_myokr-data.automerge.bak', b);
      // Dev/test-only: the app's very first load attempt throws once, then the
      // retry sees a healthy file. Set before any app code runs.
      (window as any).__SIMULATE_TRANSIENT_LOAD_FAILURE = true;
    }, [MAIN_KEY, Buffer.from(mainBytes).toString('base64'), Buffer.from(backupBytes).toString('base64')]);

    await waitForApp(page);

    // The valid file must NOT have been stashed as corrupt...
    const stashed = await page.evaluate((k) => localStorage.getItem(k), CORRUPT_KEY);
    expect(stashed).toBeNull();

    // ...and the loaded doc must carry the MAIN file's state, not the stale
    // backup's (the recover-from-.bak path would have zeroed today's progress).
    const doc = await page.evaluate(async () => {
      const d = await (window as any).__getAutomergeDoc();
      return { pomos: d.tasks?.[0]?.completedPomodoros, history: d.history?.length ?? 0 };
    });
    expect(doc.pomos).toBe(2);
    expect(doc.history).toBe(1);

    // The main file on disk is untouched (still the original valid bytes).
    const mainAfter = await readMockFile(page, MAIN_KEY);
    expect(mainAfter).not.toBeNull();
    expect(Buffer.from(mainAfter!).toString('base64')).toBe(Buffer.from(mainBytes).toString('base64'));
  });

  test('transient write failure during appendIncremental recovers on next write without corrupting the document chain', async ({ page }) => {
    await waitForApp(page);

    // Initial state: 1 task
    await page.evaluate(async () => {
      await (window as any).__updateAutomergeDoc('Add task 1', (d: any) => {
        d.tasks = [{ id: 'task-1', title: 'Task 1' }];
      });
    });

    // Simulate write failure on mutation 2
    await page.evaluate(() => {
      (window as any).__SIMULATE_WRITE_FAILURE = true;
    });

    // Attempt mutation 2 (this write fails transiently)
    await page.evaluate(async () => {
      try {
        await (window as any).__updateAutomergeDoc('Add task 2', (d: any) => {
          d.tasks.push({ id: 'task-2', title: 'Task 2' });
        });
      } catch {
        // Expected transient failure
      }
    });

    // Mutation 3 occurs when write succeeds
    await page.evaluate(async () => {
      await (window as any).__updateAutomergeDoc('Add task 3', (d: any) => {
        d.tasks.push({ id: 'task-3', title: 'Task 3' });
      });
    });

    // Read the persisted file on disk
    const mainFile = await readMockFile(page, MAIN_KEY);
    expect(mainFile).not.toBeNull();

    // The file on disk must be fully loadable by Automerge.load without throwing missing heads errors!
    let loadedDoc: any;
    expect(() => {
      loadedDoc = Automerge.load(mainFile!);
    }).not.toThrow();

    // Verify tasks are present
    expect(loadedDoc.tasks.map((t: any) => t.id)).toEqual(['task-1', 'task-2', 'task-3']);
  });

  test('concurrent initial calls to getAutomergeDoc/initAndMigrateData share a singleton promise and preserve file data', async ({ page }) => {
    // Seed a valid Automerge file on disk containing user tasks and cycles
    const main = Automerge.change(Automerge.init<any>(), (d: any) => {
      d.tasks = [{ id: 'task-100', title: 'Critical Task', completedPomodoros: 5 }];
      d.cycles = [{ id: 'cycle-100', name: 'August 2026', month: 7, year: 2026, isActive: true }];
    });
    const mainBytes = Automerge.save(main);

    await page.addInitScript(([key, value]) => {
      localStorage.setItem(key, value);
    }, [MAIN_KEY, Buffer.from(mainBytes).toString('base64')]);

    await waitForApp(page);

    // Call getAutomergeDoc / initAndMigrateData concurrently from multiple callers
    const result = await page.evaluate(async () => {
      const getDoc = (window as any).__getAutomergeDoc;
      const results = await Promise.all([
        getDoc(),
        getDoc(),
        getDoc(),
        getDoc(),
        getDoc(),
      ]);
      return {
        taskCount: results[0]?.tasks?.length ?? 0,
        cycleCount: results[0]?.cycles?.length ?? 0,
      };
    });

    expect(result.taskCount).toBe(1);
    expect(result.cycleCount).toBe(1);

    // Ensure .corrupt stash was NOT written
    const stashed = await page.evaluate((k) => localStorage.getItem(k), CORRUPT_KEY);
    expect(stashed).toBeNull();
  });

  // Regression for the 2026-08-14 "all data gone" incident: the Tauri CSP was
  // tightened from `null` to a policy without `script-src 'wasm-unsafe-eval'`,
  // which blocks Automerge's WASM (instantiated via WebAssembly.instantiate by
  // vite-plugin-wasm). The webview then refuses to compile/instantiate the
  // module, getAutomerge()'s dynamic import rejects, SessionProvider's init()
  // never resolves, and the app boots to an empty screen — even though the data
  // file on disk is perfectly intact. The Playwright suite runs against a plain
  // Vite dev server (no CSP), so this only reproduced under `tauri dev`/build.
  // This reads the committed CSP and asserts it permits WASM. Proven red on the
  // broken policy (no wasm-unsafe-eval), green after the fix.
  test('Tauri CSP permits WebAssembly (script-src includes wasm-unsafe-eval)', () => {
    const conf = JSON.parse(
      readFileSync('src-tauri/tauri.conf.json', 'utf-8'),
    ) as { app: { security: { csp?: string | null } } };
    const csp = conf.app?.security?.csp;
    // A null/absent CSP imposes no restriction (the historical default) and is safe.
    if (csp === null || csp === undefined) return;

    expect(typeof csp).toBe('string');
    // Either an explicit script-src with wasm-unsafe-eval, or the token anywhere
    // in the policy (e.g. via default-src fallback). Without it, Automerge's WASM
    // fails to instantiate and the app boots empty.
    expect(csp).toContain('wasm-unsafe-eval');
  });
});
