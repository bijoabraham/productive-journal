/**
 * Schema for productive-journal.db.
 *
 * The five CREATE TABLE statements are reproduced verbatim from
 * Productive_Journal_Spec.md §10 — column names, types and defaults are
 * unchanged. The indexes below are additive (they alter no table definition)
 * and back the two access patterns the app actually has: "load one day" and
 * "search across days".
 *
 * Note: the spec defines no FOREIGN KEY constraints on the DailyLogId columns,
 * so none are declared here. Referential integrity is maintained in db.mts,
 * which only ever inserts children against a DailyLogs row it just resolved.
 */

/** Bumped when the schema changes, so `migrate()` can step forward. */
export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS DailyLogs (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  LogDate DATE UNIQUE,
  ProductivityScore INTEGER,
  BrainDump TEXT,
  CreatedAt DATETIME,
  UpdatedAt DATETIME
);

CREATE TABLE IF NOT EXISTS Tasks (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  DailyLogId INTEGER,
  TaskName TEXT NOT NULL,
  Completed INTEGER DEFAULT 0,
  DisplayOrder INTEGER,
  CreatedAt DATETIME,
  UpdatedAt DATETIME
);

CREATE TABLE IF NOT EXISTS Goals (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  DailyLogId INTEGER,
  GoalText TEXT,
  Completed INTEGER DEFAULT 0,
  DisplayOrder INTEGER,
  CreatedAt DATETIME,
  UpdatedAt DATETIME
);

CREATE TABLE IF NOT EXISTS Reminders (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  DailyLogId INTEGER,
  ReminderText TEXT NOT NULL,
  Completed INTEGER DEFAULT 0,
  DisplayOrder INTEGER,
  CreatedAt DATETIME,
  UpdatedAt DATETIME
);

CREATE TABLE IF NOT EXISTS ScheduleItems (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  DailyLogId INTEGER,
  TimeSlot TEXT,
  Description TEXT
);

-- Additive: index the day lookup each panel performs on load.
CREATE INDEX IF NOT EXISTS IX_Tasks_DailyLogId ON Tasks (DailyLogId, DisplayOrder);
CREATE INDEX IF NOT EXISTS IX_Goals_DailyLogId ON Goals (DailyLogId, DisplayOrder);
CREATE INDEX IF NOT EXISTS IX_Reminders_DailyLogId ON Reminders (DailyLogId, DisplayOrder);
CREATE UNIQUE INDEX IF NOT EXISTS UX_ScheduleItems_Slot ON ScheduleItems (DailyLogId, TimeSlot);
CREATE INDEX IF NOT EXISTS IX_DailyLogs_LogDate ON DailyLogs (LogDate);
`;
