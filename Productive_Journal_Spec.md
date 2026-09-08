# Productive Journal Desktop Application
## Functional & Technical Specification (V1)

**Version:** 1.1  
**Application Name:** Productive Journal  
**Platform:** Windows + macOS  
**Technology Stack:** Electron + React + TypeScript + SQLite

---

# 0. Revision History

**1.1 — 2026-09-08.** Updated to match the built application. Changes from 1.0,
all made at the user's explicit direction during implementation:

- §2 — Notifications removed from *Must Not Have*; hourly Time Block reminders
  added, off by default.
- §4.4 — Time Block entries wrap and accept multiple lines; the section scrolls
  and fills the available height.
- §4.7 — The productivity rating is now **computed** from completions, with a
  manual override, rather than being purely self-rated.
- §6 — Dashboard gains the weighted productivity figure.
- §9, §12 — `settings.json` added alongside the database; folder structure
  updated to the built layout.

See `UI_Design_Presentation.md` §0 for the parallel visual changes.

---

# 1. Vision

Create a simple, distraction-free productivity journal that mirrors the experience of using a paper productivity planner.

Unlike traditional task management tools, the application focuses on:

- Daily priorities
- Daily goals
- Time-block planning
- Brain dump capture
- Daily reflection
- Productivity scoring

The application should feel like a digital notebook, not a project management system.

---

# 2. Design Principles

## Must Have

- Simple and minimal
- Fast startup
- Offline first
- Keyboard friendly
- No unnecessary features
- No complex workflows
- Single-user

## Must Not Have (V1)

- Projects
- Teams
- Collaboration
- Subtasks
- Labels
- Tags
- Cloud Sync
- AI Features
- Account/Login

> **Changed in 1.1.** *Notifications* was previously on this list. A single,
> narrowly-scoped notification now exists — the hourly Time Block reminder in
> §4.8 — added on request. It is off by default, and no other notification
> exists anywhere in the app.

---

# 3. Application Layout

The application shall consist of a single primary screen featuring a 3-column layout (25% / 50% / 25%).

```text
-------------------------------------------------------------------------
| PRODUCTIVE JOURNAL                           Tuesday, August 18, 2026 |
-------------------------------------------------------------------------
| LEFT COLUMN (25%)   | MIDDLE COLUMN (50%)      | RIGHT COLUMN (25%)   |
|                     |                          |                      |
| [GOALS FOR TODAY]   | [TIME BLOCK SCHEDULE]    | [BRAIN DUMP]         |
| 1. Goal 1           | 7 AM _________________   | Free-form text area  |
| 2. Goal 2           | 8 AM _________________   |                      |
|                     | 9 AM _________________   |                      |
| [PRIORITY TASKS]    | ...                      | [REMINDERS]          |
| ☐ Task 1            | 10 PM ________________   | ☐ Reminder 1         |
| ☐ Task 2            |                          | ☐ Reminder 2         |
| ☑ Task 3            |                          |                      |
|                     |                          |                      |
| [PRODUCTIVITY SCORE]|                          |                      |
| ○ ○ ○ ○ ○           |                          |                      |
-------------------------------------------------------------------------
```

---

# 4. Functional Requirements

## 4.1 Daily Log

Every day has a dedicated journal entry.

Contents:
- Date
- Tasks
- Goals (with completion state)
- Schedule
- Brain Dump
- Reminders (checklist)
- Productivity Score

If no entry exists for today, create it automatically at startup.

## 4.2 Priority Tasks

Features:
- Add task
- Edit task
- Delete task
- Mark task complete
- Reorder tasks

Fields:
- Task ID
- Task Name
- Completed
- Display Order
- Created Date

Rules:
- Maximum 20 tasks per day
- Default status = Pending

## 4.3 Goals For Today

User can enter 1-5 goals.

Features:
- Add goal
- Edit goal
- Delete goal
- Mark goal complete
- Reorder goals

Fields:
- Goal ID
- Goal Text
- Completed
- Date
- Order

Rules:
- Default status = Pending

## 4.4 Time Block Schedule

Time blocks from 7:00 AM to 10:00 PM (16 hourly slots).

Features:
- Create activity
- Edit activity
- Delete activity

Entry behaviour:
- Each slot is a multi-line field. Long text **wraps** to the column width; it
  never scrolls sideways or is truncated.
- `Enter` inserts a newline. `Escape` leaves the field.
- A row grows to fit its wrapped content, and the field fills its row so the
  whole row is clickable.
- The section scrolls as a whole when the rows do not fit, and the rows share
  any spare height so the table fills its box on a taller window.

Storage:
- Only slots the user has filled in are stored. Clearing a slot deletes its row,
  so an empty day holds no `ScheduleItems` rows rather than 16 blank ones.

## 4.5 Brain Dump

Free-form notes area for:
- Ideas
- Meeting notes
- Thoughts
- Action items

Features:
- Multiline text
- Auto save

## 4.6 Reminders

Sticky-note style reminder checklist (not free-form text).

Features:
- Add reminder
- Edit reminder
- Delete reminder
- Mark reminder complete
- Reorder reminders
- Auto save

Fields:
- Reminder ID
- Reminder Text
- Completed
- Display Order
- Created Date

## 4.7 Productivity Rating

Scale:
- 1 = Very Poor
- 2 = Poor
- 3 = Average
- 4 = Good
- 5 = Excellent

UI:

```text
○ ○ ○ ○ ○
```

### Computed by default (changed in 1.1)

The rating is **derived from the day's completions**. Each list is scored on its
own completion rate, and the rates are weighted:

```text
percent = Σ(weightᵢ × rateᵢ) / Σ(weightᵢ)      over non-empty lists only

  goals      0.50    the day's intended outcomes
  tasks      0.40    the day's priorities
  reminders  0.10    errands, not achievement
```

Rules:

- **Rates, not raw item counts.** Scoring items directly would let a 20-item task
  list outweigh 5 goals and drown them out; per-list rates mean 2-of-2 goals is a
  full goal score regardless of how many tasks sit beside it.
- **Empty lists drop out** and the remaining weights renormalise. A day with no
  reminders is scored on goals and tasks alone (5/9 and 4/9), not penalised.
- **A day with nothing logged is unrated (`null`), not 0%.** The circles stay
  empty.
- Setting the reminders weight to `0` excludes reminders entirely; the maths
  renormalises and nothing else changes.
- `percent` maps onto the 1-5 scale in five equal bands (0-20 → 1 … 81-100 → 5).
  0% is a 1: the scale has no zero.

### Manual override

Clicking a circle pins that rating for the day. Clicking the pinned rating again,
or the reset control, hands the day back to the formula.

`DailyLogs.ProductivityScore` therefore stores **only an explicit override**:

| Stored value | Meaning |
| --- | --- |
| `NULL` | Score this day automatically |
| `1`-`5` | The user's explicit rating, which wins |

The column is never used to cache a computed value — anything derivable is
recomputed on read.

## 4.8 Hourly Time Block Reminder (added in 1.1)

Off by default; toggled from the bell in the header.

When enabled, on each hour from 7:00 AM to 10:00 PM the application raises a
native OS notification **only if that hour's Time Block slot is still empty**.
Clicking the notification focuses the window and places the caret in that hour's
row.

Rules:
- Nothing fires outside 7:00 AM - 10:00 PM.
- Nothing fires for an hour that already has an entry (whitespace does not count
  as an entry).
- The schedule re-computes the delay to the next hour on every tick, so it
  cannot drift and survives the machine sleeping through one or more hours.
- The preference is stored in `settings.json` (§9), not in the database.

---

# 5. History View

Features:
- Today
- Previous Day
- Next Day
- Date Picker

Actions:
- View old entries
- Edit old entries

---

# 6. Dashboard (Simple)

```text
Today's Completion

Tasks: 8 / 10
Completion: 80%
Productivity: 74%
Score: 4 / 5
```

`Completion` is task completion alone. `Productivity` is the weighted figure from
§4.7. `Score` is the rating actually shown — the override if one is set,
otherwise the computed rating.

No charts in V1.

> **Status:** the data layer for this view is implemented and tested
> (`getStats()` returns all of the above). The view itself is not yet built.

---

# 7. Search

Search across:
- Tasks
- Goals
- Brain Dump
- Reminders

Options:
- Keyword search
- Date search

---

# 8. Keyboard Shortcuts

```text
Ctrl/Cmd + N  Add New Task
Ctrl/Cmd + S  Save
Ctrl/Cmd + F  Search
Ctrl/Cmd + D  Jump To Today
```

---

# 9. Data Storage

Database: SQLite

Library: better-sqlite3

Database file:

```text
productive-journal.db
```

Both files live in the per-user application data directory
(`app.getPath('userData')`), so they survive reinstalls and are never written
inside the application bundle. `PJ_DB_PATH` overrides the location, which is what
the test suites use.

User preferences are stored **beside** the database, not inside it:

```text
settings.json
```

Preferences are not journal data: they should not travel with a copied `.db`
file, appear in search results, or require a schema change. A missing, unreadable
or corrupt file falls back to defaults, and unrecognised fields are discarded.

---

# 10. Database Schema

## DailyLogs

```sql
CREATE TABLE DailyLogs (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  LogDate DATE UNIQUE,
  ProductivityScore INTEGER,
  BrainDump TEXT,
  CreatedAt DATETIME,
  UpdatedAt DATETIME
);
```

## Tasks

```sql
CREATE TABLE Tasks (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  DailyLogId INTEGER,
  TaskName TEXT NOT NULL,
  Completed INTEGER DEFAULT 0,
  DisplayOrder INTEGER,
  CreatedAt DATETIME,
  UpdatedAt DATETIME
);
```

## Goals

```sql
CREATE TABLE Goals (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  DailyLogId INTEGER,
  GoalText TEXT,
  Completed INTEGER DEFAULT 0,
  DisplayOrder INTEGER,
  CreatedAt DATETIME,
  UpdatedAt DATETIME
);
```

## Reminders

```sql
CREATE TABLE Reminders (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  DailyLogId INTEGER,
  ReminderText TEXT NOT NULL,
  Completed INTEGER DEFAULT 0,
  DisplayOrder INTEGER,
  CreatedAt DATETIME,
  UpdatedAt DATETIME
);
```

## ScheduleItems

```sql
CREATE TABLE ScheduleItems (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  DailyLogId INTEGER,
  TimeSlot TEXT,
  Description TEXT
);
```

---

# 11. Technology Stack

- Electron
- React
- TypeScript
- Tailwind CSS
- SQLite
- better-sqlite3
- Electron Builder

---

# 12. Folder Structure

```text
productive-journal/
├── electron/          main process, IPC, preload bridge, settings, notifications
├── database/          SQLite service layer (db.mts) and schema (schema.mts)
├── shared/            types + productivity formula, shared across the boundary
├── src/
│   ├── pages/
│   ├── components/
│   ├── hooks/
│   ├── services/
│   └── styles/
├── scripts/           verification suites
└── package.json
```

`shared/` holds everything both processes need: the row types, the IPC contract
(`JournalApi`), and the productivity formula. Keeping the formula there means the
renderer and `getStats()` cannot disagree about a day's score.

---

# 13. Non-Functional Requirements

- Startup < 2 seconds
- Save operations < 200 ms
- Search results < 500 ms
- Auto-save every 5 seconds
- Auto-save on field change
  (free text coalesces keystrokes into one write after 500 ms, and also flushes
  on field blur, window blur, day change and Ctrl/Cmd+S)
- Local database only
- No internet required

---

# 14. Future Roadmap (V2+)

- Weekly Review
- Monthly Review
- PDF Export
- Cloud Sync
- Mobile App
- Calendar Integration
- AI Daily Summary
- Productivity Insights
- Habit Tracking
- Dark Theme

---

# Final Product Definition

Productive Journal is a lightweight desktop productivity notebook that digitizes a paper planner workflow.

Core Questions:
1. What are my priorities today?
2. What outcomes do I want today?
3. How am I spending my time?
4. How productive was I today?

The application should prioritize simplicity, speed, and daily usability over feature richness.
