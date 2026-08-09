import { invoke } from '@tauri-apps/api/core';
import type { CredentialStore } from './credential-store';

/**
 * Production adapter: OS keychain via Tauri commands, localStorage as the
 * legacy store. In the browser-only dev/test env the commands are absent —
 * secureGet falls back to null and the legacy path keeps the app working.
 */
export const tauriCredentialStore: CredentialStore = {
  secureGet: (key) =>
    invoke<string | null>('secure_get', { key }).catch(() => null),
  secureSet: (key, value) => invoke('secure_set', { key, value }),
  secureDelete: (key) => invoke('secure_delete', { key }),
  legacyGet: (key) => localStorage.getItem(key),
  legacyRemove: (key) => localStorage.removeItem(key),
};
