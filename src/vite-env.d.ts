/// <reference types="vite/client" />
declare const __APP_VERSION__: string;

interface Window {
  __runMigration?: typeof import('./lib/automerge-storage').initAndMigrateData;
  __getAutomergeDoc?: typeof import('./lib/automerge-storage').getAutomergeDoc;
  __updateAutomergeDoc?: typeof import('./lib/automerge-storage').updateAutomergeDoc;
  __flushAutomergeQueue?: typeof import('./lib/automerge-storage').flushAutomergeQueue;
  __getQueueInfoForTesting?: typeof import('./lib/automerge-storage').getQueueInfoForTesting;
  
  __fsTestAdapter?: {
    writeFile: typeof import('@tauri-apps/plugin-fs').writeFile;
    readFile: typeof import('@tauri-apps/plugin-fs').readFile;
  };
  
  __cleanupCloseHandler?: () => void;
  __triggerTauriEvent?: (event: string, payload?: unknown) => void;
  __tauriInvokes?: string[];
  __getActiveListenerCount?: (event: string) => number;
  __mockListen?: typeof import('./mocks/tauri-api').listen;
}