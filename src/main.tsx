import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SessionProvider } from "./components/session/SessionProvider";
import { initAndMigrateData, getAutomergeDoc, updateAutomergeDoc, flushAutomergeQueue, getQueueInfoForTesting, mergeExternalBinary } from "./lib/automerge-storage";
import { getEffectiveCurrentValue, getEffectiveCurrentValueAsOf, isTickInCycleMonth } from "./lib/okr-storage";

const SelectFixture = lazy(() => import("./components/dev/SelectFixture"));

// Expose data-layer hooks for E2E tests, but only in dev (the Playwright webServer
// runs `vite`, where import.meta.env.DEV is true). Strip them from prod bundles so a
// shipped app never exposes arbitrary read/write access to the full doc on `window`.
if (import.meta.env.DEV) {
  window.__runMigration = initAndMigrateData;
  window.__getAutomergeDoc = getAutomergeDoc;
  window.__updateAutomergeDoc = updateAutomergeDoc;
  window.__flushAutomergeQueue = flushAutomergeQueue;
  window.__getQueueInfoForTesting = getQueueInfoForTesting;
  window.__mergeExternalBinary = mergeExternalBinary;
  window.__getEffectiveCurrentValue = getEffectiveCurrentValue;
  window.__getEffectiveCurrentValueAsOf = getEffectiveCurrentValueAsOf;
  window.__isTickInCycleMonth = isTickInCycleMonth;
}

// Dev-only component fixture page for the Playwright suite. The gate lives here —
// before App mounts — so the fixture never runs App's effects/handlers, and no
// handler-declaration ordering inside App can affect it. Statically false in prod
// builds, so the fixture chunk never loads there.
const isSelectFixture = import.meta.env.DEV
  && new URLSearchParams(window.location.search).get("fixture") === "select";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      {isSelectFixture ? (
        <Suspense fallback={null}>
          <SelectFixture />
        </Suspense>
      ) : (
        <SessionProvider>
          <App />
        </SessionProvider>
      )}
    </ErrorBoundary>
  </React.StrictMode>,
);
