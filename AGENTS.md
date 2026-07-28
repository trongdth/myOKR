# myOKR

Tauri v2 + React + TypeScript desktop app. All user data lives in a single
Automerge CRDT document; persistence is the most fragile part of this codebase.

**Before touching `src/lib/automerge-storage.ts`, `src/lib/dropbox-service.ts`,
or anything that persists data, read `docs/automerge-localstorage-rules.md`.**
Those rules come from a real data-loss incident — follow them exactly, and give
any bug fix in that layer a regression test proven red on the old code.

**Before touching UI, colors, icons, or any screen's styles, read
`docs/design-system.md`.** Color is for meaning, never decoration: use the
`--color-*` / `--okr-*` semantic tokens and `--text-*` / `--bg-*` neutrals
(never raw hex), amber means streak only, the cyan→violet gradient is
logo-only, and each screen's responsive re-stacking follows the 2a breakpoints
plus its own per-screen section in that doc.

- Tests: `npx playwright test` (mocked Tauri env, see the rules doc)
- Typecheck: `npx tsc --noEmit` · Build: `npm run build` · App: `npx tauri build`
- Mobile app: `mobile/` is a git submodule (`https://github.com/trongdth/myOKR-mobile`). Run `git submodule update --init --recursive` when checking out.
  - Tech Stack: Flutter (Dart) + Rust (`flutter_rust_bridge`).
  - Tests: `cd mobile && flutter test` · Rust check: `cd mobile/rust && cargo check`
  - Directive: When modifying shared Automerge CRDT schemas, persistence rules, or domain logic, inspect and update `mobile/` alongside desktop code.
