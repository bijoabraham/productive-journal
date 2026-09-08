/**
 * Phase 1 verification: exercises database/db.mts against a real SQLite file.
 *
 * Runs under the Electron runtime (not plain node) because better-sqlite3 is
 * compiled against the Electron ABI:
 *
 *   npx electron scripts/db-smoke.mjs
 */
import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.join(import.meta.dirname, '..');
const db = await import(pathToFileURL(path.join(root, 'dist-electron', 'database', 'db.mjs')).href);
const prod = await import(pathToFileURL(path.join(root, 'dist-electron', 'shared', 'productivity.js')).href);
const notify = await import(pathToFileURL(path.join(root, 'dist-electron', 'electron', 'notifications.mjs')).href);
const settings = await import(pathToFileURL(path.join(root, 'dist-electron', 'electron', 'settings.mjs')).href);

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}\n         expected ${e}\n         actual   ${a}`);
    console.log(`  FAIL ${name} — expected ${e}, got ${a}`);
  }
}

function throws(name, fn, needle) {
  try {
    fn();
    failures.push(`${name} — expected a throw, none happened`);
    console.log(`  FAIL ${name} — expected a throw`);
  } catch (e) {
    if (needle && !e.message.includes(needle)) {
      failures.push(`${name} — message "${e.message}" lacks "${needle}"`);
      console.log(`  FAIL ${name} — message "${e.message}" lacks "${needle}"`);
    } else {
      passed++;
      console.log(`  ok   ${name} (${e.message})`);
    }
  }
}

app.whenReady().then(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pj-smoke-'));
  const file = path.join(dir, 'productive-journal.db');
  const raw = db.initDatabase(file);

  console.log('\n— schema —');
  const tables = raw
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => r.name);
  check('all five tables created', tables, ['DailyLogs', 'Goals', 'Reminders', 'ScheduleItems', 'Tasks']);
  check('db file exists on disk', fs.existsSync(file), true);
  check('WAL mode enabled', raw.pragma('journal_mode', { simple: true }), 'wal');
  check('user_version stamped', raw.pragma('user_version', { simple: true }), 1);

  const cols = (t) => raw.prepare(`PRAGMA table_info(${t})`).all().map((c) => `${c.name}:${c.type}`);
  check('DailyLogs columns match spec §10', cols('DailyLogs'), [
    'Id:INTEGER', 'LogDate:DATE', 'ProductivityScore:INTEGER',
    'BrainDump:TEXT', 'CreatedAt:DATETIME', 'UpdatedAt:DATETIME',
  ]);
  check('Tasks columns match spec §10', cols('Tasks'), [
    'Id:INTEGER', 'DailyLogId:INTEGER', 'TaskName:TEXT', 'Completed:INTEGER',
    'DisplayOrder:INTEGER', 'CreatedAt:DATETIME', 'UpdatedAt:DATETIME',
  ]);
  check('ScheduleItems columns match spec §10', cols('ScheduleItems'), [
    'Id:INTEGER', 'DailyLogId:INTEGER', 'TimeSlot:TEXT', 'Description:TEXT',
  ]);

  console.log('\n— daily log —');
  const D = '2026-09-08';
  check('getDay before creation is null', db.getDay(D), null);
  const day = db.ensureDay(D);
  check('ensureDay creates the log', day.log.LogDate, D);
  check('new day starts unscored', day.log.ProductivityScore, null);
  check('new day has empty brain dump', day.log.BrainDump, '');
  check('ensureDay is idempotent', db.ensureDay(D).log.Id, day.log.Id);
  check('LogDate UNIQUE holds one row', raw.prepare('SELECT COUNT(*) n FROM DailyLogs').get().n, 1);
  throws('rejects a malformed date', () => db.ensureDay('08/09/2026'), 'Invalid date');

  console.log('\n— tasks —');
  const t1 = db.tasks.add(D, 'Review marketing report');
  const t2 = db.tasks.add(D, '  Finalize client contract  ');
  const t3 = db.tasks.add(D, 'Prepare deck for Q3 review');
  check('task text is trimmed', t2.TaskName, 'Finalize client contract');
  check('tasks default to pending', t1.Completed, 0);
  check('DisplayOrder increments', [t1.DisplayOrder, t2.DisplayOrder, t3.DisplayOrder], [0, 1, 2]);
  db.tasks.setCompleted(t2.Id, true);
  db.tasks.rename(t3.Id, 'Prepare Q3 deck');
  db.tasks.reorder([t3.Id, t1.Id, t2.Id]);
  const afterTasks = db.getDay(D).tasks;
  check('reorder persists', afterTasks.map((t) => t.TaskName), [
    'Prepare Q3 deck', 'Review marketing report', 'Finalize client contract',
  ]);
  check('completion persists', afterTasks.find((t) => t.Id === t2.Id).Completed, 1);
  db.tasks.remove(t1.Id);
  check('delete persists', db.getDay(D).tasks.length, 2);
  throws('rejects an empty task', () => db.tasks.add(D, '   '), 'empty task');
  throws('rejects renaming a missing task', () => db.tasks.rename(99999, 'x'), 'No task with id');

  console.log('\n— per-day caps (spec §4.2 / §4.3) —');
  const capDay = '2026-09-09';
  for (let i = 0; i < 20; i++) db.tasks.add(capDay, `Task ${i}`);
  check('20 tasks accepted', db.getDay(capDay).tasks.length, 20);
  throws('21st task rejected', () => db.tasks.add(capDay, 'overflow'), 'at most 20 tasks');
  for (let i = 0; i < 5; i++) db.goals.add(capDay, `Goal ${i}`);
  check('5 goals accepted', db.getDay(capDay).goals.length, 5);
  throws('6th goal rejected', () => db.goals.add(capDay, 'overflow'), 'at most 5 goals');

  console.log('\n— goals & reminders —');
  const g1 = db.goals.add(D, 'Finish project proposal');
  db.goals.setCompleted(g1.Id, true);
  check('goal completion persists', db.getDay(D).goals[0].Completed, 1);
  const r1 = db.reminders.add(D, 'Book dentist appointment');
  const r2 = db.reminders.add(D, 'Renew gym membership');
  db.reminders.setCompleted(r1.Id, true);
  db.reminders.reorder([r2.Id, r1.Id]);
  const rem = db.getDay(D).reminders;
  check('reminders are discrete rows, reordered', rem.map((r) => r.ReminderText), [
    'Renew gym membership', 'Book dentist appointment',
  ]);
  check('reminder completion persists', rem.find((r) => r.Id === r1.Id).Completed, 1);

  console.log('\n— brain dump & score —');
  db.setBrainDump(D, 'Ideas for new blog post\nBuy milk & eggs');
  check('brain dump persists', db.getDay(D).log.BrainDump, 'Ideas for new blog post\nBuy milk & eggs');
  db.setProductivityScore(D, 4);
  check('score persists', db.getDay(D).log.ProductivityScore, 4);
  db.setProductivityScore(D, null);
  check('score can be cleared', db.getDay(D).log.ProductivityScore, null);
  db.setProductivityScore(D, 4);
  throws('rejects score 0', () => db.setProductivityScore(D, 0), '1-5');
  throws('rejects score 6', () => db.setProductivityScore(D, 6), '1-5');

  console.log('\n— schedule —');
  db.setScheduleSlot(D, '07:00', 'Wake Up/Morning Routine');
  db.setScheduleSlot(D, '09:00', 'Emails/Slack');
  db.setScheduleSlot(D, '09:00', 'Deep work');
  check('slot upsert replaces, not duplicates', db.getDay(D).schedule.length, 2);
  check('slot holds latest text', db.getDay(D).schedule.find((s) => s.TimeSlot === '09:00').Description, 'Deep work');
  db.setScheduleSlot(D, '09:00', '   ');
  check('clearing a slot deletes the row', db.getDay(D).schedule.length, 1);

  console.log('\n— stats, history, search —');
  const stats = db.getStats(D);
  check('stats count tasks', [stats.tasksTotal, stats.tasksCompleted], [2, 1]);
  check('stats compute percent', stats.completionPercent, 50);
  check('stats carry the score', stats.score, 4);
  check('stats for an unopened day', db.getStats('2020-01-01').completionPercent, null);
  check('prev date', db.adjacentDate(capDay, 'prev'), D);
  check('next date', db.adjacentDate(D, 'next'), capDay);
  check('no next past the end', db.adjacentDate(capDay, 'next'), null);
  check('listDates is newest first', db.listDates(), [capDay, D]);
  check('search finds a task', db.search('Q3').map((h) => [h.kind, h.text]), [['task', 'Prepare Q3 deck']]);
  check('search finds a goal', db.search('proposal').map((h) => h.kind), ['goal']);
  check('search finds a reminder', db.search('dentist').map((h) => h.kind), ['reminder']);
  check('search finds brain dump text', db.search('blog post').map((h) => h.kind), ['brainDump']);
  check('search spans types', db.search('e').length > 3, true);
  check('empty query returns nothing', db.search('   '), []);
  check('wildcards are escaped, not interpreted', db.search('%'), []);

  console.log('\n— productivity formula —');
  const mk = (g, t, r) => ({
    goals: g.map((c) => ({ Completed: c })),
    tasks: t.map((c) => ({ Completed: c })),
    reminders: r.map((c) => ({ Completed: c })),
  });
  const pc = (g, t, r, w) => prod.computeProductivity(mk(g, t, r), w).percent;

  check('an untouched day is unrated, not 0%', pc([], [], []), null);
  check('everything done is 100%', pc([1, 1], [1, 1, 1], [1]), 100);
  check('nothing done is 0%', pc([0, 0], [0, 0, 0], [0]), 0);

  // Goals outrank tasks: same rate on each list, different weight.
  const goalsOnly = pc([1, 1], [0, 0], []);
  const tasksOnly = pc([0, 0], [1, 1], []);
  check('goals outweigh tasks', goalsOnly > tasksOnly, true);
  check('goals carry 5/9 when only goals+tasks exist', goalsOnly, 56);
  check('tasks carry 4/9 when only goals+tasks exist', tasksOnly, 44);

  // Reminders are a token contributor.
  const noRem = pc([1, 0], [1, 0], []);
  const allRemDone = pc([1, 0], [1, 0], [1, 1]);
  const noRemDone = pc([1, 0], [1, 0], [0, 0]);
  check('reminders move the score only slightly', allRemDone - noRemDone <= 10, true);
  check('finishing every reminder adds 10 points at most', allRemDone - noRem <= 10, true);
  check('reminders can be switched off entirely',
    pc([1, 0], [1, 0], [0, 0], { goals: 0.5, tasks: 0.4, reminders: 0 }), noRem);

  // Empty lists drop out instead of dragging the score to zero.
  check('an empty reminder list does not penalise the day', pc([1, 1], [1, 1], []), 100);
  check('a day of only goals scores on goals alone', pc([1, 0], [], []), 50);
  check('a long task list cannot drown out the goals',
    pc([1, 1, 1], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], []) >= 55, true);

  // The worked example from the write-up.
  check('3/5 goals, 1/4 tasks, 1/3 reminders -> 43%', pc([1, 1, 1, 0, 0], [1, 0, 0, 0], [1, 0, 0]), 43);

  const detail = prod.computeProductivity(mk([1, 1, 1, 0, 0], [1, 0, 0, 0], [1, 0, 0]));
  check('weights renormalise to 1', +detail.parts.reduce((a, b) => a + b.weight, 0).toFixed(6), 1);
  check('breakdown reports per-list counts',
    detail.parts.map((x) => x.kind + ' ' + x.completed + '/' + x.total).join(', '),
    'goals 3/5, tasks 1/4, reminders 1/3');

  // Rating bands.
  check('0% -> 1 circle (scale has no zero)', prod.percentToRating(0), 1);
  check('43% -> 3 circles', prod.percentToRating(43), 3);
  check('80% -> 4 circles', prod.percentToRating(80), 4);
  check('81% -> 5 circles', prod.percentToRating(81), 5);
  check('100% -> 5 circles', prod.percentToRating(100), 5);
  check('rating rises with percent',
    [0, 25, 45, 65, 85].map(prod.percentToRating).join(','), '1,2,3,4,5');

  console.log('\n— hourly reminders —');
  const N = notify;

  // Hour -> slot mapping covers exactly 7 AM to 10 PM.
  check('7 AM maps to the first slot', N.slotForHour(7), '07:00');
  check('10 PM maps to the last slot', N.slotForHour(22), '22:00');
  check('6 AM is out of range', N.slotForHour(6), null);
  check('11 PM is out of range', N.slotForHour(23), null);
  check('midnight is out of range', N.slotForHour(0), null);
  check('every in-range hour has a slot',
    [7, 8, 12, 15, 19, 22].map(N.slotForHour).filter(Boolean).length, 6);
  check('labels match the schedule gutter',
    ['07:00', '12:00', '13:00', '22:00'].map(N.slotLabel).join(' '), '7 AM 12 PM 1 PM 10 PM');

  // The timer always lands on the next exact hour.
  const at = (h, m, sec) => new Date(2026, 8, 8, h, m, sec ?? 0);
  check('59 minutes past waits one minute', N.msUntilNextHour(at(9, 59, 0)), 60 * 1000);
  check('exactly on the hour waits a full hour', N.msUntilNextHour(at(9, 0, 0)), 60 * 60 * 1000);
  check('half past waits thirty minutes', N.msUntilNextHour(at(9, 30, 0)), 30 * 60 * 1000);
  check('the delay is never zero or negative',
    [0, 1, 30, 59].every((m) => N.msUntilNextHour(at(9, m, 30)) > 0), true);
  check('the delay never exceeds an hour',
    [0, 1, 30, 59].every((m) => N.msUntilNextHour(at(9, m, 30)) <= 3600000), true);
  check('it rolls over midnight', N.msUntilNextHour(at(23, 45, 0)), 15 * 60 * 1000);

  // The fire/skip decision.
  const RD = '2026-09-20';
  const withSlots = (pairs) => () => ({ schedule: pairs.map(([TimeSlot, Description]) => ({ TimeSlot, Description })) });
  const decide = (hour, enabled, lookup) => N.shouldRemind(RD, hour, { enabled, lookup });

  check('nothing fires while the setting is off',
    decide(9, false, withSlots([])).remind, false);
  check('an empty slot fires', decide(9, true, withSlots([])).remind, true);
  check('a filled slot stays quiet',
    decide(9, true, withSlots([['09:00', 'Emails/Slack']])).remind, false);
  check('a whitespace-only slot still fires',
    decide(9, true, withSlots([['09:00', '   ']])).remind, true);
  check('another hour being filled does not silence this one',
    decide(9, true, withSlots([['10:00', 'Focus']])).remind, true);
  check('out-of-range hours never fire', decide(3, true, withSlots([])).remind, false);
  check('a day with no entry at all fires', decide(9, true, () => null).remind, true);
  check('the reason is reported for the quiet cases',
    [decide(9, false, withSlots([])).reason,
     decide(3, true, withSlots([])).reason,
     decide(9, true, withSlots([['09:00', 'x']])).reason].join(' | '),
    'reminders are off | 3:00 is outside 7 AM - 10 PM | slot already filled');
  check('the fired decision carries the slot to open',
    decide(14, true, withSlots([])).slot, '14:00');

  // Settings persistence.
  console.log('\n— settings —');
  const settingsFile = path.join(dir, 'settings.json');
  check('defaults to reminders off', settings.initSettings(settingsFile).hourlyReminders, false);
  check('reminders are off by default (spec §2 lists notifications as V1 Must Not Have)',
    settings.DEFAULT_SETTINGS.hourlyReminders, false);
  check('turning them on returns the new state',
    settings.updateSettings({ hourlyReminders: true }).hourlyReminders, true);
  check('the change is written to disk',
    JSON.parse(fs.readFileSync(settingsFile, 'utf8')).hourlyReminders, true);
  check('the setting survives a reload', settings.initSettings(settingsFile).hourlyReminders, true);
  settings.updateSettings({ hourlyReminders: false });
  check('it can be turned back off', settings.getSettings().hourlyReminders, false);
  check('a corrupt file falls back to defaults', (() => {
    fs.writeFileSync(settingsFile, 'not json at all');
    return settings.initSettings(settingsFile).hourlyReminders;
  })(), false);
  check('junk fields are ignored', (() => {
    fs.writeFileSync(settingsFile, JSON.stringify({ hourlyReminders: 'yes please', evil: 1 }));
    const loaded = settings.initSettings(settingsFile);
    return [loaded.hourlyReminders, Object.keys(loaded).join(',')].join(' ');
  })(), 'false hourlyReminders');

  console.log('\n— persistence across reopen —');
  db.closeDatabase();
  db.initDatabase(file);
  const reopened = db.getDay(D);
  check('data survives a close/reopen', [
    reopened.tasks.length, reopened.goals.length, reopened.reminders.length,
    reopened.schedule.length, reopened.log.ProductivityScore,
  ], [2, 1, 2, 1, 4]);
  db.closeDatabase();

  console.log(`\n${failures.length === 0 ? 'PASS' : 'FAIL'} — ${passed} checks passed, ${failures.length} failed`);
  if (failures.length) failures.forEach((f) => console.log(`  - ${f}`));
  fs.rmSync(dir, { recursive: true, force: true });
  app.exit(failures.length === 0 ? 0 : 1);
});
