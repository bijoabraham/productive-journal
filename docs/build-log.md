# Productive Journal — Build Log

A record of how this application was built, what was decided along the way, and
what was found by testing rather than by reading code.

**Date:** 2026-09-08
**Repository:** https://github.com/bijoabraham/productive-journal (public)
**Release:** [v1.0.0](https://github.com/bijoabraham/productive-journal/releases/tag/v1.0.0) — Windows installer + portable exe
**Stack:** Electron 39 · React 19 · TypeScript · Vite 8 · Tailwind CSS 4 · SQLite (better-sqlite3)
**Verification:** 193 automated checks across two suites (`npm test`)

---

## 1. What was built

A distraction-free desktop productivity journal: one screen, one day. Goals,
priority tasks, an hourly time block from 7 AM to 10 PM, a brain dump, reminders
and a productivity score — modelled on a paper daily-log planner page.

Offline-first and single-user. No accounts, no cloud, no network access. All data
lives in a local SQLite file at `%APPDATA%\Productive Journal\productive-journal.db`.

---

## 2. How it was built

Work was driven from two specification documents written before any code:
`Productive_Journal_Spec.md` (functional and data requirements) and
`UI_Design_Presentation.md` (layout and styling constraints).

The build ran in three phases, each verified before moving on.

### Phase 0 — Scaffold

Vite + React + TypeScript, then Electron, Tailwind and `better-sqlite3`.

Decisions worth recording:

- **Main process is ESM (`.mts`), preload is CommonJS (`.cts`).** A sandboxed
  preload cannot be ESM, while ESM in main gives a clean `import.meta.dirname`.
  Explicit file extensions sidestep `type: module` ambiguity entirely.
- **All SQLite lives in the main process.** `better-sqlite3` is synchronous and
  native; the renderer runs with `contextIsolation: true`, `nodeIntegration:
  false`, `sandbox: true` and a CSP, and reaches data only through
  `window.journal`.
- **`better-sqlite3` needs rebuilding for Electron.** The npm package ships a
  Node binary, not an Electron one. `electron-rebuild` runs on `postinstall`.
  This is the usual first wall in an Electron + SQLite project, and it was
  cleared and proven before any feature code was written.

### Phase 1 — Database

`database/schema.mts` reproduces the spec's five `CREATE TABLE` statements
verbatim; the test suite asserts this structurally by reading `PRAGMA
table_info` and comparing column names *and* declared types, so drift becomes a
failing test rather than a subtle bug.

`database/db.mts` is the service layer. Two choices shaped everything above it:

- **Mutations key off a date, not a `DailyLogId`.** `tasks.add(date, name)`
  resolves the day internally, so log-id plumbing never reaches the renderer.
- **`getDay()` never writes; `ensureDay()` creates.** Browsing 30 days of history
  therefore does not litter the database with 30 empty rows — a day materialises
  on first edit.

Tasks, goals and reminders are one generic implementation over a `ListSpec`, so
all three share identical add/rename/toggle/delete/reorder semantics instead of
three copies that drift apart.

### Phase 2 — Interface

The 25 / 50 / 25 three-column layout, built to the styling constraints and
verified by measuring the real DOM rather than by eye.

### Phase 3 — Integration

React bound to SQLite over IPC.

- **Handlers return an envelope** (`{ok,value} | {ok,error}`) instead of throwing
  across the boundary. Electron wraps thrown errors in framing noise, which would
  turn `"A day holds at most 20 tasks."` into something unusable in the UI.
- **Reads are authoritative.** Writes apply optimistically for responsiveness,
  then the day is re-read, so the screen always shows what was actually stored and
  a rejected write self-corrects.
- **Debounce ordering matters.** `mutate` flushes pending text writes *before* its
  own write; without that, typing in the brain dump then ticking a checkbox would
  re-read stale text over the user's keystrokes.

---

## 3. Changes made after the first build

Each of these came from using the app, and several exposed real defects.

| Request | Outcome |
| --- | --- |
| Wrap long schedule entries; scroll the section | Slots became auto-growing textareas; rows size to content and the list scrolls |
| `Enter` should insert a newline | Reverted an earlier decision to make Enter commit |
| Adopt the mockup's colour and style | Warm grey canvas, flat sections, ruled schedule table with alternating rows |
| Goals field border differs from Add a task | Structural fix — see §4 |
| Schedule should fill a larger window | Rows share spare height; field fills its row |
| Compute productivity from completions | Weighted formula with a manual override |
| Circles only, no percentage | Readout removed; value exposed via `aria-label` |
| Hourly reminder notifications | Native OS toast, off by default |
| Narrow column 1 by a tenth | 25 → 22.5%, absorbed by the schedule |
| Focused schedule row shows a partial border | Focus ring drawn inside the field — see §4 |

---

## 4. Defects found by verification

None of these were visible from reading the code. They are recorded because the
class of bug matters more than the individual fix.

**`npm start` opened a blank window.** `isDev` was `!app.isPackaged`, true for
*any* unpackaged run — so the production path tried to reach a Vite dev server
that was not running. Now keyed off an explicit `NODE_ENV` / `VITE_DEV_SERVER_URL`
signal. Found only by actually launching the app; the test harness loaded
`dist/index.html` directly and never exercised the real launch path.

**Data was being written to the wrong folder.** Without `app.setName`, Electron
used a generic `AppData\Roaming\Electron` directory — shared with every other
unpackaged Electron app, and a *different* location from a packaged build, so a
user's journal would not have survived packaging.

**Layout broke on scaled displays.** The machine runs 150% Windows scaling, so a
900px window yields a 609px CSS viewport, not ~860px. Sixteen rows at 28px
overflowed the 427px available. Testing only at nominal size would have shipped
this broken on every scaled display.

**A stale screenshot nearly passed review.** A hidden window throttles
compositing, so `capturePage()` returned a mid-run frame showing 2 goals and no
tasks. The DOM assertions were correct and the *image* was lying. Fixed by
showing the window and disabling `backgroundThrottling`.

**Tailwind utilities could never override base styles.** The base rules in
`index.css` were unlayered, and unlayered CSS beats anything in a `@layer`
regardless of specificity. An inset focus ring was silently ignored — and so, it
turned out, had a `focus:outline-none` that had been dead for most of the build.
Base rules now live in `@layer base`.

**A focus ring hidden behind a scrollbar.** The schedule's focus outline sat at
`outline-offset: 1px`, painted outside the field, where the scrollbar covered its
right edge and the scrolling list clipped it top and bottom. Now drawn inside the
field with a negative offset.

**Two fields that looked identical behaved differently.** The Goals add-field had
byte-identical classes to the Tasks one, but sat *inside* the scrolling list —
and an outline on a child of `overflow: auto` is clipped at the container edge.
The fix was structural, not stylistic.

**A regex that matched the letter "s".** Inside a template literal an
unrecognised escape collapses, so `/\s+/` had silently become `/s+/`. Caught by
the linter, not by a failing test — it passed because the string it cleaned was
empty.

**A genuinely flaky test.** Resizing a real OS window is environment-dependent —
Windows ignored `setSize` outright on one run — and zoom persists across runs, so
each run inherited the previous one's viewport. Replaced with zoom-based viewport
control and a pinned starting zoom; three consecutive runs then produced
identical results.

---

## 5. Testing approach

Two suites, both running under the Electron runtime because `better-sqlite3` is
compiled against the Electron ABI and will not load under plain `node`.

**`npm run test:db` — 104 checks.** The database layer against a real SQLite
file: schema shape, per-day caps, ordering, search escaping, persistence across
close/reopen; the productivity formula; the reminder eligibility rules; settings
persistence including corrupt-file recovery.

**`npm run test:ui` — 89 checks.** Boots the real stack — temporary SQLite file,
real IPC handlers, real preload bridge, built renderer — drives the UI as a user
would, then asserts both the layout constraints *and* that every interaction
reached the database. It also reloads the renderer to prove data survives a
restart, and navigates history to prove days do not leak into one another.

Two things this suite does that a conventional UI test does not:

- **It asserts design decisions, not just logic.** That no checklist row is
  tinted, that nothing in the app renders green, that the score block stays under
  56px, that all 16 hours fit without clipping. Constraints written down in a spec
  became constraints a machine can check.
- **It queries the database directly after driving the UI**, rather than trusting
  that the screen reflects storage.

The packaged binary was verified the same way: launched with a fresh database and
driven over the DevTools protocol to confirm the renderer loads from inside
`app.asar` and the native module from `app.asar.unpacked`.

---

## 6. Deliberate deviations from the specifications

All approved explicitly during the build, and recorded in each document's
revision history so they are not later "corrected" back.

| Deviation | Original spec | Why |
| --- | --- | --- |
| Alternating schedule rows | UI §1 forbade them | User chose the mockup over the text |
| Flat surfaces, `#EDEDE9` canvas | UI §1 specified white shadowed cards | Same |
| Computed productivity score | Functional §4.7 described a manual rating | User request |
| Circles only, no percentage | — | User request, after the score became computed |
| Notifications exist | Functional §2 listed them under *Must Not Have* | User request; off by default |
| Columns 22.5 / 52.5 / 25 | UI §2.2 specified 25 / 50 / 25 | User request |

Both specification documents were updated to v1.1 to match the built
application.

---

## 7. Not built

Documented in the spec, with tested back-ends but no interface:

- **§7 Search** — `search()` is implemented, wildcard-escaped and tested; there is
  no UI and no `Ctrl+F` binding.
- **§6 Dashboard** — `getStats()` returns task counts, completion, weighted
  productivity and the effective rating; nothing renders it.
- **Drag-to-reorder** — the `reorder` API exists and is tested; there is no drag
  affordance.

---

## 8. Final state

```
electron/     main process, IPC, preload bridge, settings, hourly reminders
database/     SQLite service layer and schema
shared/       types, IPC contract, productivity formula
src/          React renderer (components, pages, hooks, services, styles)
scripts/      the two verification suites
docs/         screenshots and this log
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite + Electron with hot reload |
| `npm start` | Build, then run |
| `npm test` | All 193 checks |
| `npm run dist` | Windows installer + portable exe into `release/` |

Lint clean. Both suites passing and stable across repeated runs.
