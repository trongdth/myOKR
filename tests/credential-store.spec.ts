import { test, expect } from '@playwright/test';
import {
  CredentialStore,
  DROPBOX_KEYS,
  loadCredentials,
  saveCredentials,
  clearCredentials,
} from '../src/lib/credential-store';

class FakeStore implements CredentialStore {
  secure = new Map<string, string>();
  legacy = new Map<string, string>();
  failSecureSet = false;

  async secureGet(key: string): Promise<string | null> {
    return this.secure.get(key) ?? null;
  }

  async secureSet(key: string, value: string): Promise<void> {
    if (this.failSecureSet) {
      throw new Error('keychain unavailable');
    }
    this.secure.set(key, value);
  }

  async secureDelete(key: string): Promise<void> {
    this.secure.delete(key);
  }

  legacyGet(key: string): string | null {
    return this.legacy.get(key) ?? null;
  }

  legacyRemove(key: string): void {
    this.legacy.delete(key);
  }
}

test.describe('credential-store (ticket 28)', () => {
  test('round-trips credentials through the secure store', async () => {
    const store = new FakeStore();
    await saveCredentials(store, { dropbox_client_id: 'c-1', dropbox_refresh_token: 'rt-1' });

    const loaded = await loadCredentials(store, DROPBOX_KEYS);
    expect(loaded.dropbox_client_id).toBe('c-1');
    expect(loaded.dropbox_refresh_token).toBe('rt-1');
    expect(store.legacy.size).toBe(0); // no legacy copies left
  });

  test('migrates legacy values into the secure store and clears them', async () => {
    const store = new FakeStore();
    store.legacy.set('dropbox_client_id', 'legacy-c');
    store.legacy.set('dropbox_refresh_token', 'legacy-rt');

    const loaded = await loadCredentials(store, DROPBOX_KEYS);

    expect(loaded.dropbox_client_id).toBe('legacy-c');
    expect(loaded.dropbox_refresh_token).toBe('legacy-rt');
    expect(store.secure.get('dropbox_client_id')).toBe('legacy-c');
    expect(store.legacy.size).toBe(0); // localStorage no longer holds the token
  });

  test('a failing secure write keeps the legacy copy for the next retry', async () => {
    const store = new FakeStore();
    store.legacy.set('dropbox_refresh_token', 'legacy-rt');
    store.failSecureSet = true;

    await loadCredentials(store, DROPBOX_KEYS);

    expect(store.legacy.get('dropbox_refresh_token')).toBe('legacy-rt'); // not cleared
    expect(store.secure.size).toBe(0);
  });

  test('a stale legacy copy is dropped without overwriting the secure value', async () => {
    const store = new FakeStore();
    store.secure.set('dropbox_refresh_token', 'current-rt');
    store.legacy.set('dropbox_refresh_token', 'rotated-rt'); // stale duplicate

    const loaded = await loadCredentials(store, DROPBOX_KEYS);

    expect(loaded.dropbox_refresh_token).toBe('current-rt');
    expect(store.secure.get('dropbox_refresh_token')).toBe('current-rt'); // not overwritten
    expect(store.legacy.size).toBe(0); // stale copy dropped
  });

  test('clearCredentials removes from both stores', async () => {
    const store = new FakeStore();
    store.secure.set('dropbox_client_id', 'c-1');
    store.legacy.set('dropbox_client_id', 'legacy-c');

    await clearCredentials(store, DROPBOX_KEYS);

    expect(store.secure.size).toBe(0);
    expect(store.legacy.size).toBe(0);
  });

  test('clearCredentials continues and deletes refresh token even if deleting first key throws', async () => {
    const store = new FakeStore();
    store.secure.set('dropbox_refresh_token', 'rt-1');
    store.legacy.set('dropbox_refresh_token', 'legacy-rt');

    // Simulate secureDelete throwing on dropbox_client_id (e.g. NoEntry error)
    const origDelete = store.secureDelete.bind(store);
    store.secureDelete = async (key: string) => {
      if (key === 'dropbox_client_id') {
        throw new Error('No entry in keychain');
      }
      return origDelete(key);
    };

    await clearCredentials(store, DROPBOX_KEYS);

    expect(store.secure.get('dropbox_refresh_token')).toBeUndefined();
    expect(store.legacy.get('dropbox_refresh_token')).toBeUndefined();
  });
});
