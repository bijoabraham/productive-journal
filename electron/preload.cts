import { contextBridge, ipcRenderer } from 'electron';
import type { Envelope } from './ipc.mjs';
import type { AppSettings, DayEntry, IsoDate, JournalApi, ListApi } from '../shared/types.js';

/**
 * The single, explicit surface the renderer is allowed to touch.
 * Nothing else — no Node, no ipcRenderer, no filesystem — is exposed.
 */

/** Unwraps the main process envelope back into a value or a normal Error. */
async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(`journal:${channel}`, ...args)) as Envelope<T>;
  if (!res.ok) throw new Error(res.error);
  return res.value;
}

function listApi<T>(group: 'tasks' | 'goals' | 'reminders'): ListApi<T> {
  return {
    add: (date, text) => call<T>(`${group}.add`, date, text),
    rename: (id, text) => call<void>(`${group}.rename`, id, text),
    setCompleted: (id, completed) => call<void>(`${group}.setCompleted`, id, completed),
    remove: (id) => call<void>(`${group}.remove`, id),
    reorder: (orderedIds) => call<void>(`${group}.reorder`, orderedIds),
  };
}

const api: JournalApi = {
  today: () => call<IsoDate>('today'),
  getDay: (date) => call<DayEntry | null>('getDay', date),
  ensureDay: (date) => call<DayEntry>('ensureDay', date),

  setBrainDump: (date, text) => call<void>('setBrainDump', date, text),
  setProductivityScore: (date, score) => call<void>('setProductivityScore', date, score),
  setScheduleSlot: (date, timeSlot, description) =>
    call<void>('setScheduleSlot', date, timeSlot, description),

  tasks: listApi('tasks'),
  goals: listApi('goals'),
  reminders: listApi('reminders'),

  getSettings: () => call<AppSettings>('getSettings'),
  setHourlyReminders: (enabled) => call<AppSettings>('setHourlyReminders', enabled),
  onFocusSlot: (handler) => {
    // Only the slot string crosses over — never the raw IpcRendererEvent.
    const listener = (_event: unknown, timeSlot: string) => handler(timeSlot);
    ipcRenderer.on('journal:focus-slot', listener);
    return () => ipcRenderer.removeListener('journal:focus-slot', listener);
  },

  getStats: (date) => call('getStats', date),
  listDates: () => call('listDates'),
  search: (query) => call('search', query),
};

contextBridge.exposeInMainWorld('journal', api);
