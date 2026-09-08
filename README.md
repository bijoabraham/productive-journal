# Productive Journal

A distraction-free, offline-first desktop productivity journal.
Electron + React + TypeScript + Vite + Tailwind CSS + SQLite (better-sqlite3).

Specs: [`Productive_Journal_Spec.md`](./Productive_Journal_Spec.md) (functional/data),
[`UI_Design_Presentation.md`](./UI_Design_Presentation.md) (layout/style).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server + Electron with hot reload |
| `npm run build` | Type-check and build renderer (`dist/`) and main (`dist-electron/`) |
| `npm start` | Build, then run the app in production mode |
| `npm test` | Both suites below (191 checks) |
| `npm run test:db` | Database, productivity formula, reminder logic, settings (104 checks) |
| `npm run test:ui` | End-to-end: drives the UI, asserts layout, persistence, notifications (87 checks) |
| `npm run rebuild` | Rebuild `better-sqlite3` against the Electron ABI |
| `npm run dist` | Package an installer via electron-builder (`release/`) |

## Structure

```text
electron/     Main process (main.mts), IPC (ipc.mts), preload bridge (preload.cts),
              settings (settings.mts), hourly reminders (notifications.mts)
database/     SQLite service layer (db.mts) + schema (schema.mts)
shared/       Types shared across the process boundary (incl. the JournalApi contract)
src/          React renderer (components, pages, hooks, services, styles)
scripts/      Verification suites
```

## Data flow

```text
React component
  -> useJournal (optimistic state, 500ms debounce for free text)
    -> window.journal.*        preload bridge, contextIsolated
      -> journal:* IPC         envelope {ok,value} | {ok,error}
        -> database/db.mts     better-sqlite3, synchronous
          -> productive-journal.db
```

After every write the day is re-read from SQLite, so the screen always shows
what was actually stored; a rejected write (for example the 21st task) surfaces
its message and is corrected by that re-read.

## Architecture notes

- **Process split.** `better-sqlite3` is synchronous and native, so all database
  work lives in the main process. The renderer never touches Node or SQLite.
- **Security.** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
  The renderer's only privileged surface is `window.journal`, defined by the
  `JournalApi` interface in `shared/types.ts` and implemented in `preload.cts`.
- **Module format.** The main process is ESM (`.mts` → `.mjs`); the preload is
  CommonJS (`.cts` → `.cjs`), which is what a sandboxed preload requires.
- **Native module.** `better-sqlite3` is compiled for Node, not Electron, so
  `postinstall` runs `electron-rebuild`. Re-run `npm run rebuild` after changing
  the Electron version.

## Productivity score

Each list is scored on its own completion rate, then weighted:

```text
percent = Σ(weightᵢ × rateᵢ) / Σ(weightᵢ)      over non-empty lists only

  goals      0.50    the day's intended outcomes
  tasks      0.40    the day's priorities
  reminders  0.10    errands, not achievement
```

Rates rather than raw item counts, so a long task list cannot drown out the
goals. Empty lists drop out and the remaining weights renormalise. A day with
nothing logged scores `null` (unrated), not 0%. Set `reminders: 0` in
`PRODUCTIVITY_WEIGHTS` to exclude reminders entirely — nothing else changes.

The 0-100 result maps onto the spec's 1-5 scale in equal bands and drives the
five circles. `DailyLogs.ProductivityScore` stores **only an explicit override**:
NULL means "score this day automatically".

## Hourly reminders

Off by default. When enabled from the bell in the header, the app raises a native
OS notification on the hour (7 AM - 10 PM) if that hour's Time Block slot is still
empty; clicking it focuses the window and puts the caret in that row. Preferences
live in `settings.json` beside the database, not in it.

Spec §2 lists Notifications under "Must Not Have" for V1, so this is a deliberate
post-V1 addition, added on request and off unless switched on.
