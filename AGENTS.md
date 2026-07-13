# myOKR

Tauri v2 + React + TypeScript desktop app. All user data lives in a single
Automerge CRDT document; persistence is the most fragile part of this codebase.

**Before touching `src/lib/automerge-storage.ts`, `src/lib/dropbox-service.ts`,
or anything that persists data, read `docs/automerge-localstorage-rules.md`.**
Those rules come from a real data-loss incident — follow them exactly, and give
any bug fix in that layer a regression test proven red on the old code.

- Tests: `npx playwright test` (mocked Tauri env, see the rules doc)
- Typecheck: `npx tsc --noEmit` · Build: `npm run build` · App: `npx tauri build`
