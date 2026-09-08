import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema.mjs';
import { computeProductivity } from '../shared/productivity.js';
import {
  MAX_GOALS_PER_DAY,
  MAX_TASKS_PER_DAY,
  type DailyLog,
  type DayEntry,
  type DayStats,
  type Goal,
  type IsoDate,
  type ProductivityScore,
  type Reminder,
  type ScheduleItem,
  type SearchHit,
  type Task,
} from '../shared/types.js';

let db: Database.Database | null = null;

/** Thrown for rule violations the UI is expected to surface (e.g. day is full). */
export class JournalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JournalError';
  }
}

function conn(): Database.Database {
  if (!db) throw new JournalError('Database is not initialised. Call initDatabase() first.');
  return db;
}

const nowIso = (): string => new Date().toISOString();

/** `YYYY-MM-DD` in the user's local timezone — the journal's day boundary. */
export function today(): IsoDate {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(date: string): IsoDate {
  if (!DATE_RE.test(date)) throw new JournalError(`Invalid date "${date}"; expected YYYY-MM-DD.`);
  return date;
}

/**
 * Opens productive-journal.db at `dbPath`, creating the file, its parent
 * directory and the schema if they do not exist. Safe to call once at startup.
 */
export function initDatabase(dbPath: string): Database.Database {
  if (db) return db;

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  // WAL keeps the synchronous writes this app makes off the read path,
  // which is what holds saves under the 200ms budget in spec §13.
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  db.exec(SCHEMA_SQL);
  migrate(db);

  return db;
}

/** Steps an existing file forward if it was created by an older schema. */
function migrate(database: Database.Database): void {
  const current = database.pragma('user_version', { simple: true }) as number;
  if (current === SCHEMA_VERSION) return;
  // v1 is the initial schema; future versions add their steps here.
  database.pragma(`user_version = ${SCHEMA_VERSION}`);
}

export function closeDatabase(): void {
  db?.close();
  db = null;
}

/* ------------------------------------------------------------------ *
 * Daily log
 * ------------------------------------------------------------------ */

/** Reads a day without creating it. Returns null if the day was never opened. */
export function getDay(date: IsoDate): DayEntry | null {
  assertDate(date);
  const log = conn()
    .prepare<[string], DailyLog>('SELECT * FROM DailyLogs WHERE LogDate = ?')
    .get(date);
  return log ? hydrate(log) : null;
}

/**
 * Reads a day, creating the DailyLogs row if it does not exist.
 * Spec §4.1: today's entry is created automatically at startup.
 */
export function ensureDay(date: IsoDate): DayEntry {
  assertDate(date);
  const existing = getDay(date);
  if (existing) return existing;

  const ts = nowIso();
  conn()
    .prepare(
      `INSERT INTO DailyLogs (LogDate, ProductivityScore, BrainDump, CreatedAt, UpdatedAt)
       VALUES (?, NULL, '', ?, ?)
       ON CONFLICT(LogDate) DO NOTHING`,
    )
    .run(date, ts, ts);

  const created = getDay(date);
  if (!created) throw new JournalError(`Failed to create daily log for ${date}.`);
  return created;
}

function hydrate(log: DailyLog): DayEntry {
  const c = conn();
  return {
    log: { ...log, BrainDump: log.BrainDump ?? '' },
    tasks: c
      .prepare<[number], Task>('SELECT * FROM Tasks WHERE DailyLogId = ? ORDER BY DisplayOrder, Id')
      .all(log.Id),
    goals: c
      .prepare<[number], Goal>('SELECT * FROM Goals WHERE DailyLogId = ? ORDER BY DisplayOrder, Id')
      .all(log.Id),
    reminders: c
      .prepare<[number], Reminder>(
        'SELECT * FROM Reminders WHERE DailyLogId = ? ORDER BY DisplayOrder, Id',
      )
      .all(log.Id),
    schedule: c
      .prepare<[number], ScheduleItem>(
        'SELECT * FROM ScheduleItems WHERE DailyLogId = ? ORDER BY TimeSlot',
      )
      .all(log.Id),
  };
}

function touchLog(logId: number): void {
  conn().prepare('UPDATE DailyLogs SET UpdatedAt = ? WHERE Id = ?').run(nowIso(), logId);
}

export function setBrainDump(date: IsoDate, text: string): void {
  const { log } = ensureDay(date);
  conn()
    .prepare('UPDATE DailyLogs SET BrainDump = ?, UpdatedAt = ? WHERE Id = ?')
    .run(text, nowIso(), log.Id);
}

export function setProductivityScore(date: IsoDate, score: ProductivityScore): void {
  if (score !== null && (!Number.isInteger(score) || score < 1 || score > 5)) {
    throw new JournalError('Productivity score must be an integer 1-5, or null.');
  }
  const { log } = ensureDay(date);
  conn()
    .prepare('UPDATE DailyLogs SET ProductivityScore = ?, UpdatedAt = ? WHERE Id = ?')
    .run(score, nowIso(), log.Id);
}

/* ------------------------------------------------------------------ *
 * Generic list handling — Tasks, Goals and Reminders share a shape
 * ------------------------------------------------------------------ */

interface ListSpec {
  table: 'Tasks' | 'Goals' | 'Reminders';
  textColumn: 'TaskName' | 'GoalText' | 'ReminderText';
  /** Per-day cap from the spec, or null when unbounded. */
  limit: number | null;
  /** Singular noun used in error messages. */
  noun: string;
  plural: string;
}

const TASKS: ListSpec = {
  table: 'Tasks',
  textColumn: 'TaskName',
  limit: MAX_TASKS_PER_DAY,
  noun: 'task',
  plural: 'tasks',
};
const GOALS: ListSpec = {
  table: 'Goals',
  textColumn: 'GoalText',
  limit: MAX_GOALS_PER_DAY,
  noun: 'goal',
  plural: 'goals',
};
const REMINDERS: ListSpec = {
  table: 'Reminders',
  textColumn: 'ReminderText',
  limit: null,
  noun: 'reminder',
  plural: 'reminders',
};

function addItem<T>(spec: ListSpec, date: IsoDate, text: string): T {
  const trimmed = text.trim();
  if (!trimmed) throw new JournalError(`Cannot add an empty ${spec.noun}.`);

  const { log } = ensureDay(date);
  const c = conn();

  if (spec.limit !== null) {
    const row = c
      .prepare<[number], { n: number }>(
        `SELECT COUNT(*) AS n FROM ${spec.table} WHERE DailyLogId = ?`,
      )
      .get(log.Id);
    if (row && row.n >= spec.limit) {
      throw new JournalError(`A day holds at most ${spec.limit} ${spec.plural}.`);
    }
  }

  const orderRow = c
    .prepare<[number], { next: number }>(
      `SELECT COALESCE(MAX(DisplayOrder), -1) + 1 AS next FROM ${spec.table} WHERE DailyLogId = ?`,
    )
    .get(log.Id);
  const nextOrder = orderRow ? orderRow.next : 0;

  const ts = nowIso();
  const info = c
    .prepare(
      `INSERT INTO ${spec.table} (DailyLogId, ${spec.textColumn}, Completed, DisplayOrder, CreatedAt, UpdatedAt)
       VALUES (?, ?, 0, ?, ?, ?)`,
    )
    .run(log.Id, trimmed, nextOrder, ts, ts);

  touchLog(log.Id);

  const created = c
    .prepare<[number], T>(`SELECT * FROM ${spec.table} WHERE Id = ?`)
    .get(Number(info.lastInsertRowid));
  if (!created) throw new JournalError(`Failed to create ${spec.noun}.`);
  return created;
}

function renameItem(spec: ListSpec, id: number, text: string): void {
  const trimmed = text.trim();
  if (!trimmed) throw new JournalError(`Cannot save an empty ${spec.noun}.`);
  const info = conn()
    .prepare(`UPDATE ${spec.table} SET ${spec.textColumn} = ?, UpdatedAt = ? WHERE Id = ?`)
    .run(trimmed, nowIso(), id);
  if (info.changes === 0) throw new JournalError(`No ${spec.noun} with id ${id}.`);
}

function setItemCompleted(spec: ListSpec, id: number, completed: boolean): void {
  const info = conn()
    .prepare(`UPDATE ${spec.table} SET Completed = ?, UpdatedAt = ? WHERE Id = ?`)
    .run(completed ? 1 : 0, nowIso(), id);
  if (info.changes === 0) throw new JournalError(`No ${spec.noun} with id ${id}.`);
}

function removeItem(spec: ListSpec, id: number): void {
  conn().prepare(`DELETE FROM ${spec.table} WHERE Id = ?`).run(id);
}

/** Rewrites DisplayOrder to match the given id order, in one transaction. */
function reorderItems(spec: ListSpec, orderedIds: number[]): void {
  const c = conn();
  const stmt = c.prepare(`UPDATE ${spec.table} SET DisplayOrder = ?, UpdatedAt = ? WHERE Id = ?`);
  const ts = nowIso();
  const run = c.transaction((ids: number[]) => {
    ids.forEach((id, index) => stmt.run(index, ts, id));
  });
  run(orderedIds);
}

/* ------------------------------------------------------------------ *
 * Public list APIs
 * ------------------------------------------------------------------ */

export const tasks = {
  add: (date: IsoDate, name: string) => addItem<Task>(TASKS, date, name),
  rename: (id: number, name: string) => renameItem(TASKS, id, name),
  setCompleted: (id: number, completed: boolean) => setItemCompleted(TASKS, id, completed),
  remove: (id: number) => removeItem(TASKS, id),
  reorder: (orderedIds: number[]) => reorderItems(TASKS, orderedIds),
};

export const goals = {
  add: (date: IsoDate, text: string) => addItem<Goal>(GOALS, date, text),
  rename: (id: number, text: string) => renameItem(GOALS, id, text),
  setCompleted: (id: number, completed: boolean) => setItemCompleted(GOALS, id, completed),
  remove: (id: number) => removeItem(GOALS, id),
  reorder: (orderedIds: number[]) => reorderItems(GOALS, orderedIds),
};

export const reminders = {
  add: (date: IsoDate, text: string) => addItem<Reminder>(REMINDERS, date, text),
  rename: (id: number, text: string) => renameItem(REMINDERS, id, text),
  setCompleted: (id: number, completed: boolean) => setItemCompleted(REMINDERS, id, completed),
  remove: (id: number) => removeItem(REMINDERS, id),
  reorder: (orderedIds: number[]) => reorderItems(REMINDERS, orderedIds),
};

/* ------------------------------------------------------------------ *
 * Schedule
 * ------------------------------------------------------------------ */

/**
 * Upserts one hour slot. An empty description deletes the row, so a day only
 * stores the slots the user actually filled in rather than 16 blanks.
 */
export function setScheduleSlot(date: IsoDate, timeSlot: string, description: string): void {
  const { log } = ensureDay(date);
  const c = conn();
  const text = description.trim();

  if (!text) {
    c.prepare('DELETE FROM ScheduleItems WHERE DailyLogId = ? AND TimeSlot = ?').run(
      log.Id,
      timeSlot,
    );
  } else {
    c.prepare(
      `INSERT INTO ScheduleItems (DailyLogId, TimeSlot, Description) VALUES (?, ?, ?)
       ON CONFLICT(DailyLogId, TimeSlot) DO UPDATE SET Description = excluded.Description`,
    ).run(log.Id, timeSlot, text);
  }
  touchLog(log.Id);
}

/* ------------------------------------------------------------------ *
 * Dashboard, history and search
 * ------------------------------------------------------------------ */

/** Spec §6: today's completion read-out. */
export function getStats(date: IsoDate): DayStats {
  const entry = getDay(date);
  if (!entry) {
    return {
      tasksTotal: 0,
      tasksCompleted: 0,
      completionPercent: null,
      score: null,
      productivityPercent: null,
      effectiveRating: null,
    };
  }

  const tasksTotal = entry.tasks.length;
  const tasksCompleted = entry.tasks.filter((t) => t.Completed === 1).length;
  const productivity = computeProductivity(entry);
  return {
    tasksTotal,
    tasksCompleted,
    completionPercent: tasksTotal === 0 ? null : Math.round((tasksCompleted / tasksTotal) * 100),
    score: entry.log.ProductivityScore,
    productivityPercent: productivity.percent,
    effectiveRating: entry.log.ProductivityScore ?? productivity.rating,
  };
}

/** The nearest day before/after `date` that has an entry, for history paging. */
export function adjacentDate(date: IsoDate, direction: 'prev' | 'next'): IsoDate | null {
  assertDate(date);
  const sql =
    direction === 'prev'
      ? 'SELECT LogDate FROM DailyLogs WHERE LogDate < ? ORDER BY LogDate DESC LIMIT 1'
      : 'SELECT LogDate FROM DailyLogs WHERE LogDate > ? ORDER BY LogDate ASC LIMIT 1';
  const row = conn().prepare<[string], { LogDate: IsoDate }>(sql).get(date);
  return row ? row.LogDate : null;
}

/** Every date that has an entry, newest first — backs the history date picker. */
export function listDates(): IsoDate[] {
  return conn()
    .prepare<[], { LogDate: IsoDate }>('SELECT LogDate FROM DailyLogs ORDER BY LogDate DESC')
    .all()
    .map((r) => r.LogDate);
}

/** Spec §7: keyword search across tasks, goals, reminders and brain dumps. */
export function search(query: string, limit = 100): SearchHit[] {
  const q = query.trim();
  if (!q) return [];
  // Escape the LIKE wildcards so a literal % or _ in the query matches itself.
  const like = '%' + q.replace(/[\\%_]/g, (m) => '\\' + m) + '%';

  return conn()
    .prepare<[string, string, string, string, number], SearchHit>(
      `SELECT 'task' AS kind, d.LogDate AS date, t.TaskName AS text, t.Id AS id
         FROM Tasks t JOIN DailyLogs d ON d.Id = t.DailyLogId
        WHERE t.TaskName LIKE ? ESCAPE '\\'
       UNION ALL
       SELECT 'goal', d.LogDate, g.GoalText, g.Id
         FROM Goals g JOIN DailyLogs d ON d.Id = g.DailyLogId
        WHERE g.GoalText LIKE ? ESCAPE '\\'
       UNION ALL
       SELECT 'reminder', d.LogDate, r.ReminderText, r.Id
         FROM Reminders r JOIN DailyLogs d ON d.Id = r.DailyLogId
        WHERE r.ReminderText LIKE ? ESCAPE '\\'
       UNION ALL
       SELECT 'brainDump', d.LogDate, d.BrainDump, NULL
         FROM DailyLogs d
        WHERE d.BrainDump IS NOT NULL AND d.BrainDump <> '' AND d.BrainDump LIKE ? ESCAPE '\\'
       ORDER BY date DESC
       LIMIT ?`,
    )
    .all(like, like, like, like, limit);
}
