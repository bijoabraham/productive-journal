/**
 * Types shared between the Electron main process (database layer)
 * and the React renderer. Type-only: this module emits no runtime code.
 */

/** A date in `YYYY-MM-DD` form. The canonical key for a day's journal entry. */
export type IsoDate = string;

/** 1 = Very Poor ... 5 = Excellent. `null` means "not rated yet". */
export type ProductivityScore = 1 | 2 | 3 | 4 | 5 | null;

export interface DailyLog {
  Id: number;
  LogDate: IsoDate;
  ProductivityScore: ProductivityScore;
  BrainDump: string;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface Task {
  Id: number;
  DailyLogId: number;
  TaskName: string;
  Completed: 0 | 1;
  DisplayOrder: number;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface Goal {
  Id: number;
  DailyLogId: number;
  GoalText: string;
  Completed: 0 | 1;
  DisplayOrder: number;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface Reminder {
  Id: number;
  DailyLogId: number;
  ReminderText: string;
  Completed: 0 | 1;
  DisplayOrder: number;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface ScheduleItem {
  Id: number;
  DailyLogId: number;
  /** Hour slot label, e.g. "07:00" .. "22:00". */
  TimeSlot: string;
  Description: string;
}

/** Everything the UI needs to render one day, fetched in a single IPC round-trip. */
export interface DayEntry {
  log: DailyLog;
  tasks: Task[];
  goals: Goal[];
  reminders: Reminder[];
  schedule: ScheduleItem[];
}

/** User preferences. Stored beside the database, not inside it. */
export interface AppSettings {
  /** Nudge on the hour when the current Time Block slot is still empty. */
  hourlyReminders: boolean;
}

/**
 * The five operations every checklist supports. Tasks, Goals and Reminders are
 * structurally identical, so they share one shape on both sides of the bridge.
 */
export interface ListApi<T> {
  add(date: IsoDate, text: string): Promise<T>;
  rename(id: number, text: string): Promise<void>;
  setCompleted(id: number, completed: boolean): Promise<void>;
  remove(id: number): Promise<void>;
  reorder(orderedIds: number[]): Promise<void>;
}

/**
 * The contract the preload script exposes on `window.journal` — the renderer's
 * only privileged surface. Implemented in `electron/preload.cts`, served by
 * `electron/ipc.mts`, and backed by SQLite in `database/db.mts`.
 *
 * Create operations take a date rather than a DailyLogId: the main process
 * resolves (and if needed creates) the day, so the renderer never handles
 * database keys.
 */
export interface JournalApi {
  today(): Promise<IsoDate>;
  /** Reads a day without creating it; null if that day was never opened. */
  getDay(date: IsoDate): Promise<DayEntry | null>;
  /** Reads a day, creating it if absent. */
  ensureDay(date: IsoDate): Promise<DayEntry>;

  setBrainDump(date: IsoDate, text: string): Promise<void>;
  setProductivityScore(date: IsoDate, score: ProductivityScore): Promise<void>;
  setScheduleSlot(date: IsoDate, timeSlot: string, description: string): Promise<void>;

  tasks: ListApi<Task>;
  goals: ListApi<Goal>;
  reminders: ListApi<Reminder>;

  getSettings(): Promise<AppSettings>;
  setHourlyReminders(enabled: boolean): Promise<AppSettings>;
  /**
   * Fires when an hourly reminder is clicked, with the slot to jump to.
   * Returns an unsubscribe function.
   */
  onFocusSlot(handler: (timeSlot: string) => void): () => void;

  getStats(date: IsoDate): Promise<DayStats>;
  listDates(): Promise<IsoDate[]>;
  search(query: string): Promise<SearchHit[]>;
}

/** The hour slots rendered by the Time Block Schedule: 7 AM through 10 PM. */
export const TIME_SLOTS = [
  '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00',
  '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00',
] as const;

export type TimeSlot = (typeof TIME_SLOTS)[number];

/** Spec §4.2: maximum 20 tasks per day. */
export const MAX_TASKS_PER_DAY = 20;

/** Spec §4.3: the user may enter 1-5 goals. */
export const MAX_GOALS_PER_DAY = 5;

/** Spec §6: the simple dashboard read-out. */
export interface DayStats {
  tasksTotal: number;
  tasksCompleted: number;
  /** Task completion alone, 0-100. `null` when there are no tasks. */
  completionPercent: number | null;
  /** The user's explicit rating, or null when the day is scored automatically. */
  score: ProductivityScore;
  /** Weighted productivity across goals, tasks and reminders. */
  productivityPercent: number | null;
  /** What the circles actually show: the override if set, else the computed rating. */
  effectiveRating: ProductivityScore;
}

/** Spec §7: a single hit from a keyword search. */
export interface SearchHit {
  kind: 'task' | 'goal' | 'reminder' | 'brainDump';
  date: IsoDate;
  text: string;
  /** Row id in its source table; `null` for a brain dump (keyed by day). */
  id: number | null;
}
