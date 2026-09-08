import fs from 'node:fs';
import path from 'node:path';
import type { AppSettings } from '../shared/types.js';

/**
 * User preferences, kept in a small JSON file beside the database.
 *
 * Deliberately not a SQLite table: the schema in Productive_Journal_Spec.md §10
 * is fixed, and preferences are not journal data — they should not travel with
 * a copied .db file or appear in search.
 */
export const DEFAULT_SETTINGS: AppSettings = {
  hourlyReminders: false,
};

let filePath: string | null = null;
let cache: AppSettings = { ...DEFAULT_SETTINGS };

export function initSettings(file: string): AppSettings {
  filePath = file;
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    // Merge over defaults so a file written by an older version stays valid.
    cache = { ...DEFAULT_SETTINGS, ...sanitise(parsed) };
  } catch {
    // Missing or unreadable file simply means "defaults".
    cache = { ...DEFAULT_SETTINGS };
  }
  return cache;
}

/** Drops anything unrecognised or of the wrong type. */
function sanitise(input: Partial<AppSettings>): Partial<AppSettings> {
  const out: Partial<AppSettings> = {};
  if (typeof input.hourlyReminders === 'boolean') out.hourlyReminders = input.hourlyReminders;
  return out;
}

export function getSettings(): AppSettings {
  return { ...cache };
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  cache = { ...cache, ...sanitise(patch) };
  if (filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(cache, null, 2), 'utf8');
  }
  return getSettings();
}
