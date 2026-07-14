import { test, expect, type Page } from '@playwright/test';
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
});
