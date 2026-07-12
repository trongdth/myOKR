import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { initAndMigrateData, getAutomergeDoc, updateAutomergeDoc, flushAutomergeQueue, getQueueInfoForTesting } from "./lib/automerge-storage";

// Expose data-layer hooks for E2E tests, but only in dev (the Playwright webServer
// runs `vite`, where import.meta.env.DEV is true). Strip them from prod bundles so a
// shipped app never exposes arbitrary read/write access to the full doc on `window`.
if (import.meta.env.DEV) {
  window.__runMigration = initAndMigrateData;
  window.__getAutomergeDoc = getAutomergeDoc;
  window.__updateAutomergeDoc = updateAutomergeDoc;
  window.__flushAutomergeQueue = flushAutomergeQueue;
  window.__getQueueInfoForTesting = getQueueInfoForTesting;
}


ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
