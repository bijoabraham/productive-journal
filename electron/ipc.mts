import { ipcMain } from 'electron';
import * as db from '../database/db.mjs';
import { getSettings, updateSettings } from './settings.mjs';
import { startHourlyReminders, stopHourlyReminders } from './notifications.mjs';

/**
 * The IPC surface. One channel per database operation, registered from a single
 * table so the contract in shared/types.ts, the preload bridge and the handlers
 * cannot drift apart silently.
 *
 * Every handler returns an envelope rather than throwing across the boundary:
 * Electron wraps a thrown error's message in framing noise, which would turn a
 * rule violation like "A day holds at most 20 tasks." into something unusable
 * in the UI. The preload unwraps this back into a normal Error.
 */
export type Envelope<T> = { ok: true; value: T } | { ok: false; error: string };

/** Prefix for every journal channel, so nothing else can collide with them. */
export const CHANNEL_PREFIX = 'journal:';

type Handler = (...args: never[]) => unknown;

function asString(v: unknown, name: string): string {
  if (typeof v !== 'string') throw new TypeError(`${name} must be a string.`);
  return v;
}
function asNumber(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError(`${name} must be a number.`);
  return v;
}
function asBoolean(v: unknown, name: string): boolean {
  if (typeof v !== 'boolean') throw new TypeError(`${name} must be a boolean.`);
  return v;
}
function asNumberArray(v: unknown, name: string): number[] {
  if (!Array.isArray(v) || v.some((n) => typeof n !== 'number')) {
    throw new TypeError(`${name} must be an array of numbers.`);
  }
  return v as number[];
}

/** Builds the five channels for one checklist table. */
function listHandlers(list: {
  add: (date: string, text: string) => unknown;
  rename: (id: number, text: string) => void;
  setCompleted: (id: number, completed: boolean) => void;
  remove: (id: number) => void;
  reorder: (ids: number[]) => void;
}): Record<string, Handler> {
  return {
    add: ((date: unknown, text: unknown) =>
      list.add(asString(date, 'date'), asString(text, 'text'))) as Handler,
    rename: ((id: unknown, text: unknown) =>
      list.rename(asNumber(id, 'id'), asString(text, 'text'))) as Handler,
    setCompleted: ((id: unknown, completed: unknown) =>
      list.setCompleted(asNumber(id, 'id'), asBoolean(completed, 'completed'))) as Handler,
    remove: ((id: unknown) => list.remove(asNumber(id, 'id'))) as Handler,
    reorder: ((ids: unknown) => list.reorder(asNumberArray(ids, 'orderedIds'))) as Handler,
  };
}

function buildHandlers(): Record<string, Handler> {
  const handlers: Record<string, Handler> = {
    today: (() => db.today()) as Handler,
    getDay: ((date: unknown) => db.getDay(asString(date, 'date'))) as Handler,
    ensureDay: ((date: unknown) => db.ensureDay(asString(date, 'date'))) as Handler,

    setBrainDump: ((date: unknown, text: unknown) =>
      db.setBrainDump(asString(date, 'date'), asString(text, 'text'))) as Handler,
    setProductivityScore: ((date: unknown, score: unknown) => {
      if (score !== null) asNumber(score, 'score');
      return db.setProductivityScore(asString(date, 'date'), score as 1 | 2 | 3 | 4 | 5 | null);
    }) as Handler,
    setScheduleSlot: ((date: unknown, slot: unknown, description: unknown) =>
      db.setScheduleSlot(
        asString(date, 'date'),
        asString(slot, 'timeSlot'),
        asString(description, 'description'),
      )) as Handler,

    getSettings: (() => getSettings()) as Handler,
    setHourlyReminders: ((enabled: unknown) => {
      const on = asBoolean(enabled, 'enabled');
      const next = updateSettings({ hourlyReminders: on });
      // Apply immediately rather than waiting for the next launch.
      stopHourlyReminders();
      if (on) startHourlyReminders(windowProvider);
      return next;
    }) as Handler,

    getStats: ((date: unknown) => db.getStats(asString(date, 'date'))) as Handler,
    listDates: (() => db.listDates()) as Handler,
    search: ((query: unknown) => db.search(asString(query, 'query'))) as Handler,
  };

  for (const [group, list] of [
    ['tasks', db.tasks],
    ['goals', db.goals],
    ['reminders', db.reminders],
  ] as const) {
    for (const [name, fn] of Object.entries(listHandlers(list))) {
      handlers[`${group}.${name}`] = fn;
    }
  }

  return handlers;
}

/** The channel names this module serves — used by tests to assert coverage. */
export function channelNames(): string[] {
  return Object.keys(buildHandlers()).map((n) => CHANNEL_PREFIX + n);
}

/** Supplies the window that notification clicks should focus. */
let windowProvider: () => import('electron').BrowserWindow | null = () => null;

export function registerIpc(getWindow?: () => import('electron').BrowserWindow | null): void {
  if (getWindow) windowProvider = getWindow;
  for (const [name, fn] of Object.entries(buildHandlers())) {
    ipcMain.handle(CHANNEL_PREFIX + name, (_event, ...args: unknown[]): Envelope<unknown> => {
      try {
        return { ok: true, value: (fn as (...a: unknown[]) => unknown)(...args) };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[ipc] ${name} failed: ${message}`);
        return { ok: false, error: message };
      }
    });
  }
}
