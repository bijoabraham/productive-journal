import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { closeDatabase, ensureDay, initDatabase, today } from '../database/db.mjs';
import { registerIpc } from './ipc.mjs';
import { getSettings, initSettings } from './settings.mjs';
import { startHourlyReminders, stopHourlyReminders } from './notifications.mjs';

// Set before anything reads a path: userData is derived from the app name, and
// without this an unpackaged run stores the database in a generic "Electron"
// folder — shared with every other dev Electron app, and a different location
// from the packaged build, so data would not carry over.
app.setName('Productive Journal');
// Windows attributes toast notifications to this id; without it the hourly
// reminders would show as coming from "electron.app.Electron".
app.setAppUserModelId('com.bijoabraham.productivejournal');

/**
 * Whether to load from the Vite dev server rather than the built files.
 *
 * Keyed off an explicit signal, NOT `app.isPackaged`: every unpackaged run —
 * including `npm start`, which builds first — would otherwise try to reach a
 * dev server that isn't running and show a blank window.
 */
const DEV_SERVER_URL =
  process.env.VITE_DEV_SERVER_URL ??
  (process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : null);

/** dist-electron/electron/ -> project root at runtime. */
const rootDir = path.join(import.meta.dirname, '..', '..');

/**
 * The database lives in Electron's per-user data directory so it survives
 * reinstalls and never sits inside the app bundle. PJ_DB_PATH overrides it,
 * which is what the smoke tests use.
 */
function resolveDbPath(): string {
  return (
    process.env.PJ_DB_PATH ?? path.join(app.getPath('userData'), 'productive-journal.db')
  );
}

/** The single journal window, so a notification click can focus it. */
let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Productive Journal',
    backgroundColor: '#F9F9F8',
    show: false,
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  // Avoid a white flash on a paper-coloured app.
  win.once('ready-to-show', () => win.show());

  if (DEV_SERVER_URL) {
    void win.loadURL(DEV_SERVER_URL);
  } else {
    void win.loadFile(path.join(rootDir, 'dist', 'index.html'));
  }
}

void app.whenReady().then(() => {
  const dbPath = resolveDbPath();
  initDatabase(dbPath);
  // Spec §4.1: if no entry exists for today, create it automatically at startup.
  const { log } = ensureDay(today());
  const settings = initSettings(path.join(path.dirname(dbPath), 'settings.json'));
  registerIpc(() => mainWindow);
  if (settings.hourlyReminders) startHourlyReminders(() => mainWindow);
  console.log(`[notify] hourly reminders ${getSettings().hourlyReminders ? 'on' : 'off'}`);
  console.log(`[db] ${dbPath}`);
  console.log(`[db] today = ${log.LogDate} (log #${log.Id})`);
  console.log(`[ui] ${DEV_SERVER_URL ?? 'dist/index.html'}`);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  stopHourlyReminders();
  closeDatabase();
});
