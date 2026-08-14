/**
 * Credential persistence with retry-safe legacy migration (ticket 28).
 *
 * Pure module — no Tauri/browser imports, so it is unit-testable in the
 * Node playwright runner with an injected [CredentialStore]. Production
 * wires the Tauri adapter (OS keychain via `secure_get/set/delete`), with
 * localStorage as the legacy store that is migrated from once.
 */
export interface CredentialStore {
  secureGet(key: string): Promise<string | null>;
  secureSet(key: string, value: string): Promise<void>;
  secureDelete(key: string): Promise<void>;
  legacyGet(key: string): string | null;
  legacyRemove(key: string): void;
}

export const DROPBOX_KEYS = ['dropbox_client_id', 'dropbox_refresh_token'] as const;

/**
 * Reads credentials, migrating legacy (localStorage) values into the secure
 * store on first load. Retry-safe: the legacy copy is cleared only after the
 * secure write succeeds (or when the secure slot already holds a value — a
 * stale legacy copy is dropped without overwriting it, mirroring mobile).
 */
export async function loadCredentials(
  store: CredentialStore,
  keys: readonly string[],
): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  for (const key of keys) {
    let value = await store.secureGet(key);
    const legacy = store.legacyGet(key);
    if (value == null && legacy != null) {
      try {
        await store.secureSet(key, legacy);
        // Write succeeded: the legacy copy is now redundant — clear it.
        store.legacyRemove(key);
        value = legacy;
      } catch {
        // Keychain unavailable: keep the legacy copy for the next retry and
        // use it this load so the app keeps working.
        value = legacy;
      }
    } else if (value != null && legacy != null) {
      // Stale legacy duplicate of an existing secure value — drop it
      // without overwriting the secure slot (mirrors mobile).
      store.legacyRemove(key);
    }
    result[key] = value;
  }
  return result;
}

/** Writes credentials to the secure store and drops the legacy copies. */
export async function saveCredentials(
  store: CredentialStore,
  entries: Record<string, string>,
): Promise<void> {
  for (const [key, value] of Object.entries(entries)) {
    await store.secureSet(key, value);
    store.legacyRemove(key);
  }
}

/** Removes credentials from both the secure store and legacy storage. */
export async function clearCredentials(
  store: CredentialStore,
  keys: readonly string[],
): Promise<void> {
  for (const key of keys) {
    try {
      await store.secureDelete(key);
    } catch {
      // Ignore missing entry or keychain errors during bulk clear
    }
    try {
      store.legacyRemove(key);
    } catch {}
  }
}
