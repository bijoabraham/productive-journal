/**
 * End-to-end verification.
 *
 * Boots the real stack — a temporary SQLite file, the real IPC handlers, the
 * real preload bridge and the built renderer — drives the UI the way a user
 * would, then asserts BOTH the layout constraints from
 * UI_Design_Presentation.md AND that every interaction reached the database.
 *
 *   npx electron scripts/ui-verify.mjs [outputPng]
 */
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.join(import.meta.dirname, '..');
const outPng = process.argv[2] ?? path.join(root, 'ui-verify.png');
const load = (rel) => import(pathToFileURL(path.join(root, 'dist-electron', rel)).href);

const GOALS = ['Finish project proposal', 'Schedule team meeting', 'Workout: 45 min'];
const TASKS = ['Review marketing report', 'Finalize client contract', 'Prepare deck for Q3 review', 'Call re: timeline'];
const REMINDERS = ['Book dentist appointment', 'Renew gym membership', 'Pay utility bill'];
const SLOTS = {
  '7 AM': 'Wake Up/Morning Routine', '8 AM': 'Workout: Gym', '9 AM': 'Emails/Slack',
  '10 AM': 'Project Alpha focus', '12 PM': 'Lunch', '1 PM': 'Team Sync',
  '3 PM': 'Work Blocks', '6 PM': 'Wrap Up/Dinner', '9 PM': 'Journaling',
  '2 PM': 'Quarterly planning workshop with the product and design teams, including a roadmap review and open risks',
};
const LONG_SLOT_LABEL = '2 PM';
const BRAIN_DUMP = 'Ideas for new blog post\nBuy milk & eggs\nResearch project B requirements';

const DRIVE = `(async () => {
  const setNative = (el, v) => {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const enter = (el) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const blur = (el) => el.dispatchEvent(new FocusEvent('blur', { bubbles: false }));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const byPlaceholder = (p) => [...document.querySelectorAll('input,textarea')]
    .find((e) => e.placeholder && e.placeholder.startsWith(p));

  // Writes are async now (IPC + re-read), so wait on the result, never a guess.
  const waitFor = async (fn, what, ms = 4000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (fn()) return; await sleep(25); }
    throw new Error('timed out waiting for: ' + what);
  };
  const listHas = (text) => [...document.querySelectorAll('main li')]
    .some((li) => li.textContent.includes(text));

  for (const g of ${JSON.stringify(GOALS)}) {
    const el = byPlaceholder('Add a goal'); setNative(el, g); enter(el);
    await waitFor(() => listHas(g), 'goal ' + g);
  }
  for (const t of ${JSON.stringify(TASKS)}) {
    const el = byPlaceholder('Add a task'); setNative(el, t); enter(el);
    await waitFor(() => listHas(t), 'task ' + t);
  }
  for (const r of ${JSON.stringify(REMINDERS)}) {
    const el = byPlaceholder('Add a reminder'); setNative(el, r); enter(el);
    await waitFor(() => listHas(r), 'reminder ' + r);
  }

  for (const [label, text] of Object.entries(${JSON.stringify(SLOTS)})) {
    const el = document.querySelector(\`textarea[aria-label="Activity at \${label}"]\`);
    setNative(el, text); blur(el); await sleep(15);
  }

  const ta = document.querySelector('textarea[aria-label="Brain dump"]');
  setNative(ta, ${JSON.stringify(BRAIN_DUMP)}); blur(ta);
  await sleep(60);

  const box = (label) => [...document.querySelectorAll('input[type=checkbox]')]
    .find((b) => b.getAttribute('aria-label') === label);
  for (const label of ['Finalize client contract', 'Schedule team meeting', 'Book dentist appointment']) {
    box(label).click();
    await waitFor(() => box(label) && box(label).checked, 'checked ' + label);
  }

  // Enter must stay a newline in a schedule slot: not intercepted, no blur.
  const slot11 = document.querySelector('textarea[aria-label="Activity at 11 AM"]');
  slot11.focus();
  const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  slot11.dispatchEvent(ev);
  window.__enterDefaultPrevented = ev.defaultPrevented;
  window.__enterKeptFocus = document.activeElement === slot11;
  setNative(slot11, 'Focus session\\nno meetings');
  blur(slot11);
  await sleep(60);

  // Productivity: automatic by default, user override, then back to automatic.
  const filledCircles = () => [...document.querySelectorAll('[role=radio]')]
    .filter((r) => r.className.includes('bg-body')).length;
  const resetBtn = () => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'reset');

  const scoreText = () => document.querySelector('[role=radiogroup]').textContent.replace(/\\s+/g, ' ').trim();
  window.__score = { auto: { filled: filledCircles(), text: scoreText(), hasReset: !!resetBtn() } };

  document.querySelector('[role=radio][aria-label^="4 "]').click();
  await waitFor(() => document.querySelector('[role=radio][aria-label^="4 "]').getAttribute('aria-checked') === 'true', 'score 4');
  window.__score.overridden = { filled: filledCircles(), text: scoreText(), hasReset: !!resetBtn() };

  resetBtn().click();
  await waitFor(() => !resetBtn(), 'reset back to automatic');
  window.__score.reset = { filled: filledCircles(), text: scoreText(), hasReset: !!resetBtn() };

  // Re-pin 4 so the persistence checks below see an explicit override.
  document.querySelector('[role=radio][aria-label^="4 "]').click();
  await waitFor(() => document.querySelector('[role=radio][aria-label^="4 "]').getAttribute('aria-checked') === 'true', 'score 4 again');

  // Give the 500ms autosave debounce room to land before we read the database.
  await sleep(900);
  return 'driven';
})()`;

const ASSERT = `(() => {
  // Colour transitions are cosmetic, and measuring them mid-flight is flaky.
  // Freeze them and force a reflow so every reading is the settled value.
  const freeze = document.createElement('style');
  freeze.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}';
  document.head.appendChild(freeze);
  void document.body.offsetHeight;

  const out = {};
  const cols = document.querySelectorAll('main > div');
  const total = document.querySelector('main').getBoundingClientRect().width;
  out.columnPercents = [...cols].map((c) => +(c.getBoundingClientRect().width / total * 100).toFixed(1));
  out.gapPercent = parseFloat(getComputedStyle(document.querySelector('main')).columnGap) / total * 100;

  out.appBg = getComputedStyle(document.body).backgroundColor;
  const cards = [...document.querySelectorAll('section')];
  out.cardShadow = getComputedStyle(cards[0]).boxShadow;

  const rows = [...document.querySelectorAll('main > div:nth-child(2) li')];
  out.scheduleRowCount = rows.length;
  out.scheduleRowBgs = [...new Set(rows.map((r) => getComputedStyle(r).backgroundColor))];
  out.scheduleRowBgSeq = rows.slice(0, 4).map((r) => getComputedStyle(r).backgroundColor);
  out.gutterBgs = [...new Set(rows.map((r) => getComputedStyle(r.querySelector('label')).backgroundColor))];
  const frame = document.querySelector('main > div:nth-child(2) section > div > div');
  const strip = frame ? frame.firstElementChild : null;
  out.tableHeaderText = strip ? strip.textContent.trim() : null;
  out.tableHeaderBg = strip ? getComputedStyle(strip).backgroundColor : null;
  out.tableFrameBorder = frame ? getComputedStyle(frame).borderTopWidth : null;
  out.tableFrameBorderColor = frame ? getComputedStyle(frame).borderTopColor : null;
  const remindersCard = [...document.querySelectorAll('section')]
    .find((sec) => sec.querySelector('h2').textContent.trim() === 'Reminders');
  out.remindersBg = getComputedStyle(remindersCard).backgroundColor;
  // An outline on a child of overflow:auto is clipped at the container edge,
  // so every add-field must live outside the scrolling list.
  const clipped = (el) => {
    let n = el.parentElement;
    while (n && n.tagName !== 'BODY') {
      if (['auto', 'scroll', 'hidden'].includes(getComputedStyle(n).overflowY)) return true;
      n = n.parentElement;
    }
    return false;
  };
  out.clippedAddFields = [...document.querySelectorAll('input[placeholder^="Add"]')]
    .filter(clipped).map((el) => el.placeholder);
  out.addFieldClasses = [...new Set([...document.querySelectorAll('input[placeholder^="Add"]')]
    .map((el) => el.className))];
  out.sectionShadows = [...new Set([...document.querySelectorAll('section')]
    .map((sec) => getComputedStyle(sec).boxShadow))];
  out.scheduleFirstLabel = rows[0]?.querySelector('label')?.textContent?.trim();
  out.scheduleLastLabel = rows[rows.length - 1]?.querySelector('label')?.textContent?.trim();
  out.scheduleBorders = [...new Set(rows.slice(0, -1).map((r) => getComputedStyle(r).borderBottomColor))];

  const items = [...document.querySelectorAll('main li')].filter((li) => li.querySelector('input[type=checkbox]'));
  out.checklistRowBgs = [...new Set(items.map((li) => getComputedStyle(li).backgroundColor))];

  const done = items.filter((li) => li.querySelector('input[type=checkbox]').checked);
  out.completedCount = done.length;
  const label = (li) => li.querySelector('button[title="Click to edit"]');
  out.completedDecoration = [...new Set(done.map((li) => getComputedStyle(label(li)).textDecorationLine))];
  out.completedColors = [...new Set(done.map((li) => getComputedStyle(label(li)).color))];
  out.completedRowBgs = [...new Set(done.map((li) => getComputedStyle(li).backgroundColor))];

  const isGreen = (c) => { const m = c.match(/\\d+/g); if (!m) return false;
    const [r, g, b] = m.map(Number); return g > r + 25 && g > b + 25; };
  out.greenElements = [...document.querySelectorAll('main *')].filter((e) => {
    const s = getComputedStyle(e);
    return isGreen(s.color) || isGreen(s.backgroundColor);
  }).length;

  const radios = [...document.querySelectorAll('[role=radio]')];
  out.scoreCircleCount = radios.length;
  out.scoreFilled = radios.filter((r) => getComputedStyle(r).backgroundColor !== 'rgba(0, 0, 0, 0)').length;
  out.scoreFilledClasses = radios.filter((r) => r.className.includes('bg-body')).length;
  out.scoreAriaChecked = radios.map((r) => r.getAttribute('aria-checked'));
  out.scoreCircleSizePx = Math.round(radios[0].getBoundingClientRect().width);
  const scoreBlock = radios[0].closest('div').parentElement;
  out.scoreBlockHeightPx = Math.round(scoreBlock.getBoundingClientRect().height);
  out.scoreHasPercent = /%/.test(scoreBlock.textContent);
  out.scoreIsCard = scoreBlock.closest('section') !== null;
  out.scoreSnapshots = window.__score;

  const ta = document.querySelector('textarea[aria-label="Brain dump"]');
  out.brainDumpBorder = getComputedStyle(ta).borderTopWidth;
  out.brainDumpBg = getComputedStyle(ta).backgroundColor;
  out.fontFamily = getComputedStyle(document.body).fontFamily.split(',')[0];
  out.pageScrolls = document.documentElement.scrollHeight > document.documentElement.clientHeight;
  out.headings = [...document.querySelectorAll('h1,h2')].map((h) => h.textContent.trim());

  const overflowing = (el) => el.scrollHeight - el.clientHeight > 1;
  const scrollable = (el) => ['auto', 'scroll'].includes(getComputedStyle(el).overflowY);
  const scheduleList = document.querySelector('main > div:nth-child(2) ul');
  const scheduleBody = scheduleList;

  // Overflow is fine as long as it is reachable — flag only content that is
  // clipped with no way to scroll to it.
  out.clippedPanels = [...document.querySelectorAll('section')]
    .filter((sec) => [...sec.querySelectorAll('div,ul')].some((el) => overflowing(el) && !scrollable(el)))
    .map((sec) => sec.querySelector('h2').textContent.trim());

  // The whole section scrolls, and actually responds to being scrolled.
  out.scheduleBodyScrollable = scrollable(scheduleBody);
  out.scheduleOverflows = overflowing(scheduleBody);
  scheduleBody.scrollTop = 40;
  out.scheduleScrolledTo = Math.round(scheduleBody.scrollTop);
  scheduleBody.scrollTop = 0;

  // Wrapping: the long entry is taller than a plain one, and neither the row
  // nor the field scrolls sideways.
  const slotEl = (l) => document.querySelector(\`textarea[aria-label="Activity at \${l}"]\`);
  const longEl = slotEl(${JSON.stringify(LONG_SLOT_LABEL)});
  const shortEl = slotEl('7 AM');
  out.longSlotHeight = Math.round(longEl.getBoundingClientRect().height);
  out.shortSlotHeight = Math.round(shortEl.getBoundingClientRect().height);
  out.longSlotOverflowsX = longEl.scrollWidth - longEl.clientWidth > 1;
  out.longSlotOverflowsY = longEl.scrollHeight - longEl.clientHeight > 1;
  out.longSlotWhiteSpace = getComputedStyle(longEl).whiteSpace;
  out.listOverflowsX = scheduleList.scrollWidth - scheduleList.clientWidth > 1;
  out.enterDefaultPrevented = window.__enterDefaultPrevented;
  out.enterKeptFocus = window.__enterKeptFocus;
  out.multilineRowHeight = Math.round(slotEl('11 AM').getBoundingClientRect().height);

  return JSON.stringify(out);
})()`;

app.whenReady().then(async () => {
  const db = await load('database/db.mjs');
  const { registerIpc } = await load('electron/ipc.mjs');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pj-e2e-'));
  const file = path.join(dir, 'productive-journal.db');
  const raw = db.initDatabase(file);
  db.ensureDay(db.today());
  const settingsMod = await load('electron/settings.mjs');
  settingsMod.initSettings(path.join(dir, 'settings.json'));

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    // A hidden window throttles compositing, so capturePage() returns a stale
    // frame. Show it and disable throttling to capture what the user would see.
    show: true,
    webPreferences: {
      preload: path.join(root, 'dist-electron', 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  registerIpc(() => win);
  await win.loadFile(path.join(root, 'dist', 'index.html'));
  // Zoom is remembered per origin across runs, so a previous run's zoom would
  // otherwise decide this run's viewport. Pin it before measuring anything.
  win.webContents.setZoomFactor(1);
  await new Promise((r) => setTimeout(r, 900));

  await win.webContents.executeJavaScript(DRIVE);
  const r = JSON.parse(await win.webContents.executeJavaScript(ASSERT));

  // The focus ring only renders while the window itself has focus, and a real
  // notification fired earlier in the run can take it away — so reclaim focus
  // before measuring, rather than reading a ring that is not being painted.
  win.focus();
  await new Promise((res) => setTimeout(res, 400));
  const ring = JSON.parse(await win.webContents.executeJavaScript(`(() => {
    const ta = document.querySelector('textarea[aria-label="Activity at 9 AM"]');
    ta.focus();
    const cs = getComputedStyle(ta);
    return JSON.stringify({
      focusVisible: ta.matches(':focus-visible'),
      offset: parseFloat(cs.outlineOffset),
      width: parseFloat(cs.outlineWidth),
      style: cs.outlineStyle,
    });
  })()`));

  await new Promise((res) => setTimeout(res, 600));
  fs.writeFileSync(outPng, (await win.capturePage()).toPNG());

  // Neutral = no colour cast: all three channels within a few points.
  const neutral = (c) => {
    const m = (c || '').match(/\d+/g);
    if (!m) return false;
    const [rr, gg, bb] = m.map(Number);
    return Math.max(rr, gg, bb) - Math.min(rr, gg, bb) <= 12;
  };

  let pass = 0;
  const fails = [];
  const check = (name, cond, detail) => {
    if (cond) { pass++; console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`); }
    else { fails.push(name); console.log(`  FAIL ${name} — ${detail}`); }
  };

  console.log('\n— layout (§2) —');
  const [c1, c2, c3] = r.columnPercents;
  check('column 1 is a tenth narrower than column 3 (25% -> 22.5%)',
    Math.abs(c1 / c3 - 0.9) < 0.01, `col1/col3 = ${(c1 / c3).toFixed(3)}, want 0.900`);
  check('column 2 absorbed that width (52.5% vs 22.5%)',
    Math.abs(c2 / c1 - 7 / 3) < 0.02, `col2/col1 = ${(c2 / c1).toFixed(3)}, want 2.333`);
  check('columns still total the content area',
    Math.abs(c1 + c2 + c3 + r.gapPercent * 2 - 100) < 0.3,
    `${r.columnPercents.join(' / ')} + 2 gaps of ${r.gapPercent.toFixed(1)}%`);
  check('page itself does not scroll', r.pageScrolls === false, `scrolls=${r.pageScrolls}`);
  check('five cards + title, score intentionally card-less',
    r.headings.join('|') === 'Productive Journal|Goals for Today|Priority Tasks|Time Block Schedule|Brain Dump|Reminders',
    r.headings.join(' | '));
  check('no panel clips content unreachably', r.clippedPanels.length === 0, r.clippedPanels.join(', ') || 'none');

  console.log('\n— paper aesthetic (§1) —');
  check('canvas is the mockup grey #EDEDE9', r.appBg === 'rgb(237, 237, 233)', r.appBg);
  check('every add-field renders its focus ring unclipped',
    r.clippedAddFields.length === 0, r.clippedAddFields.join(', ') || 'none clipped');
  check('all three add-fields share one styling',
    r.addFieldClasses.length === 1, r.addFieldClasses.length + ' distinct class sets');
  check('sections are flat (no card shadow)',
    r.sectionShadows.every((v) => v === 'none'), r.sectionShadows.join(' | '));
  check('font is Inter', /Inter/.test(r.fontFamily), r.fontFamily);
  check('brain dump has no inner border', r.brainDumpBorder === '0px', r.brainDumpBorder);
  check('brain dump is transparent', r.brainDumpBg === 'rgba(0, 0, 0, 0)', r.brainDumpBg);

  console.log('\n— strict constraints (§1) —');
  check('schedule rows ALTERNATE between exactly two tints', r.scheduleRowBgs.length === 2, r.scheduleRowBgs.join(', '));
  check('the alternation is strict (a,b,a,b)',
    r.scheduleRowBgSeq[0] === r.scheduleRowBgSeq[2] && r.scheduleRowBgSeq[1] === r.scheduleRowBgSeq[3] &&
    r.scheduleRowBgSeq[0] !== r.scheduleRowBgSeq[1], r.scheduleRowBgSeq.join(' / '));
  check('checklists stay uniform (striping is schedule-only)', r.checklistRowBgs.length === 1, r.checklistRowBgs.join(', '));
  check('Reminders no longer carries the yellow tint',
    r.remindersBg !== 'rgb(254, 249, 195)', r.remindersBg);
  check('completed rows are NOT tinted', r.completedRowBgs.length === 1 && r.completedRowBgs[0] === 'rgba(0, 0, 0, 0)', r.completedRowBgs.join(', '));
  check('completed text is struck through', r.completedDecoration.every((d) => d.includes('line-through')), r.completedDecoration.join(', '));
  check('completed text is a neutral grey, not green',
    r.completedColors.length === 1 && neutral(r.completedColors[0]), r.completedColors.join(', '));
  check('nothing in the app renders green', r.greenElements === 0, `${r.greenElements} green elements`);

  console.log('\n— schedule (§3, col 2) —');
  check('16 rows, 7 AM to 10 PM',
    r.scheduleRowCount === 16 && r.scheduleFirstLabel === '7 AM' && r.scheduleLastLabel === '10 PM',
    `${r.scheduleRowCount} rows, ${r.scheduleFirstLabel} → ${r.scheduleLastLabel}`);
  check('rows separated by a single subtle neutral rule',
    r.scheduleBorders.length === 1 && neutral(r.scheduleBorders[0]), r.scheduleBorders.join(', '));
  // 1px CSS snaps to one device pixel, so the used value is fractional at 150%.
  check('table is framed with a visible border',
    parseFloat(r.tableFrameBorder) > 0 && neutral(r.tableFrameBorderColor),
    r.tableFrameBorder + ' ' + r.tableFrameBorderColor);
  check('date header strip shows just the day', /^\w{3}, \w{3} \d+\s+\|\s+Today$/.test(r.tableHeaderText || ''),
    JSON.stringify(r.tableHeaderText));
  check('header strip is tinted apart from the rows',
    r.tableHeaderBg === 'rgb(228, 228, 223)', r.tableHeaderBg);
  check('hour gutter is uniform down the table (not striped)',
    r.gutterBgs.length === 1, r.gutterBgs.join(', '));
  check('the section scrolls as a whole', r.scheduleBodyScrollable && r.scheduleScrolledTo === 40,
    `scrollable=${r.scheduleBodyScrollable}, scrollTop reached ${r.scheduleScrolledTo}`);
  check('long entry WRAPS instead of running off the side',
    r.longSlotOverflowsX === false && r.longSlotWhiteSpace !== 'nowrap',
    `overflowX=${r.longSlotOverflowsX}, white-space=${r.longSlotWhiteSpace}`);
  check('wrapped row grows to fit its text',
    r.longSlotHeight > r.shortSlotHeight && r.longSlotOverflowsY === false,
    `long ${r.longSlotHeight}px vs short ${r.shortSlotHeight}px, innerScroll=${r.longSlotOverflowsY}`);
  check('nothing scrolls horizontally', r.listOverflowsX === false, `listOverflowsX=${r.listOverflowsX}`);
  check('a focused slot shows its whole border (ring drawn inside the field)',
    ring.focusVisible === true && ring.width > 0 && ring.style !== 'none' && ring.offset < 0,
    `${ring.width}px ${ring.style} at offset ${ring.offset}px, focusVisible=${ring.focusVisible}`);
  check('Enter inserts a newline (not intercepted, keeps focus)',
    r.enterDefaultPrevented === false && r.enterKeptFocus === true,
    `defaultPrevented=${r.enterDefaultPrevented}, keptFocus=${r.enterKeptFocus}`);
  check('a multi-line block grows to fit both lines',
    r.multilineRowHeight > r.shortSlotHeight,
    `${r.multilineRowHeight}px vs single-line ${r.shortSlotHeight}px`);

  console.log('\n— productivity score (§3, col 1) —');
  check('exactly 5 circles', r.scoreCircleCount === 5, String(r.scoreCircleCount));
  check('filled left-to-right for the rating',
    r.scoreFilled === 4 && r.scoreFilledClasses === 4 && r.scoreAriaChecked.join() === 'false,false,false,true,false',
    `${r.scoreFilled} painted / ${r.scoreFilledClasses} classed`);
  check('circles are tiny (<=14px)', r.scoreCircleSizePx <= 14, `${r.scoreCircleSizePx}px`);
  check('block is compact (<=56px tall)', r.scoreBlockHeightPx <= 56, `${r.scoreBlockHeightPx}px`);
  check('circles only — no percentage or text score rendered',
    r.scoreSnapshots.auto.text === '' && r.scoreHasPercent === false,
    JSON.stringify(r.scoreSnapshots.auto.text));
  check('automatic mode fills circles from the formula (30% -> 2)',
    r.scoreSnapshots.auto.filled === 2, r.scoreSnapshots.auto.filled + ' circles');
  check('no reset offered while automatic', r.scoreSnapshots.auto.hasReset === false,
    'hasReset=' + r.scoreSnapshots.auto.hasReset);
  check('clicking a circle pins the user rating',
    r.scoreSnapshots.overridden.filled === 4, r.scoreSnapshots.overridden.filled + ' circles');
  check('an override offers a reset', r.scoreSnapshots.overridden.hasReset === true,
    'hasReset=' + r.scoreSnapshots.overridden.hasReset);
  check('reset returns the day to the computed score',
    r.scoreSnapshots.reset.filled === 2 && r.scoreSnapshots.reset.hasReset === false,
    r.scoreSnapshots.reset.filled + ' circles, hasReset=' + r.scoreSnapshots.reset.hasReset);
  check('not wrapped in a card', r.scoreIsCard === false, `insideCard=${r.scoreIsCard}`);

  // ---- The Phase 3 question: did any of that actually reach SQLite? ----
  console.log('\n— persistence: UI actions reached the database —');
  const today = db.today();
  const rows = (sql, ...a) => raw.prepare(sql).all(...a);
  const one = (sql, ...a) => raw.prepare(sql).get(...a);

  const log = one('SELECT * FROM DailyLogs WHERE LogDate = ?', today);
  check('a DailyLogs row exists for today', !!log, log ? `Id ${log.Id} / ${log.LogDate}` : 'missing');

  const dbTasks = rows('SELECT * FROM Tasks WHERE DailyLogId = ? ORDER BY DisplayOrder', log.Id);
  check('all 4 typed tasks stored, in order',
    dbTasks.map((t) => t.TaskName).join('|') === TASKS.join('|'),
    dbTasks.map((t) => t.TaskName).join(' | '));
  check('checking a task set Completed=1 in the DB',
    dbTasks.find((t) => t.TaskName === 'Finalize client contract')?.Completed === 1,
    `Completed=${dbTasks.find((t) => t.TaskName === 'Finalize client contract')?.Completed}`);
  check('unchecked tasks stay Completed=0',
    dbTasks.filter((t) => t.Completed === 0).length === 3, `${dbTasks.filter((t) => t.Completed === 0).length} pending`);

  const dbGoals = rows('SELECT * FROM Goals WHERE DailyLogId = ? ORDER BY DisplayOrder', log.Id);
  check('all 3 goals stored', dbGoals.map((g) => g.GoalText).join('|') === GOALS.join('|'),
    dbGoals.map((g) => g.GoalText).join(' | '));
  check('checked goal persisted', dbGoals.find((g) => g.GoalText === 'Schedule team meeting')?.Completed === 1,
    `Completed=${dbGoals.find((g) => g.GoalText === 'Schedule team meeting')?.Completed}`);

  const dbRem = rows('SELECT * FROM Reminders WHERE DailyLogId = ? ORDER BY DisplayOrder', log.Id);
  check('reminders stored as discrete rows (not a text blob)',
    dbRem.length === 3 && dbRem.map((x) => x.ReminderText).join('|') === REMINDERS.join('|'),
    `${dbRem.length} rows: ${dbRem.map((x) => x.ReminderText).join(' | ')}`);
  check('checking a reminder persisted',
    dbRem.find((x) => x.ReminderText === 'Book dentist appointment')?.Completed === 1,
    `Completed=${dbRem.find((x) => x.ReminderText === 'Book dentist appointment')?.Completed}`);

  check('brain dump text persisted verbatim', log.BrainDump === BRAIN_DUMP,
    JSON.stringify(log.BrainDump));
  check('an explicit override persists as a number', log.ProductivityScore === 4,
    'ProductivityScore=' + log.ProductivityScore);

  // NULL is the stored form of "score this day automatically".
  db.setProductivityScore(today, null);
  const cleared = one('SELECT ProductivityScore AS s FROM DailyLogs WHERE LogDate = ?', today);
  check('resetting to automatic stores NULL, not a cached number', cleared.s === null,
    'ProductivityScore=' + JSON.stringify(cleared.s));

  const autoStats = db.getStats(today);
  check('getStats computes the weighted productivity', autoStats.productivityPercent === 30,
    autoStats.productivityPercent + '%');
  check('getStats falls back to the computed rating when unscored',
    autoStats.score === null && autoStats.effectiveRating === 2,
    'score=' + autoStats.score + ', effectiveRating=' + autoStats.effectiveRating);

  db.setProductivityScore(today, 4);
  const pinnedStats = db.getStats(today);
  check('an override wins over the computed rating in getStats',
    pinnedStats.effectiveRating === 4 && pinnedStats.productivityPercent === 30,
    'effectiveRating=' + pinnedStats.effectiveRating + ', computed=' + pinnedStats.productivityPercent + '%');

  const dbSlots = rows('SELECT * FROM ScheduleItems WHERE DailyLogId = ? ORDER BY TimeSlot', log.Id);
  check('only the 11 filled hour slots stored (empties wrote no rows)',
    dbSlots.length === 11, `${dbSlots.length} rows`);
  check('long wrapped entry persisted in full, unbroken',
    dbSlots.find((x) => x.TimeSlot === '14:00')?.Description === SLOTS[LONG_SLOT_LABEL],
    (dbSlots.find((x) => x.TimeSlot === '14:00')?.Description || '').slice(0, 55) + '…');
  check('newlines survive the round trip to SQLite',
    dbSlots.find((x) => x.TimeSlot === '11:00')?.Description === 'Focus session\nno meetings',
    JSON.stringify(dbSlots.find((x) => x.TimeSlot === '11:00')?.Description));
  check('a slot maps to the right hour',
    dbSlots.find((s) => s.TimeSlot === '07:00')?.Description === 'Wake Up/Morning Routine' &&
    dbSlots.find((s) => s.TimeSlot === '21:00')?.Description === 'Journaling',
    `07:00="${dbSlots.find((s) => s.TimeSlot === '07:00')?.Description}", 21:00="${dbSlots.find((s) => s.TimeSlot === '21:00')?.Description}"`);

  // ---- Hourly reminders: the toggle, the setting file, and a real toast ----
  console.log('\n\u2014 hourly reminders (end to end) \u2014');
  const notify = await load('electron/notifications.mjs');
  const settingsFile = path.join(dir, 'settings.json');

  const bell = `[...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Hourly Time Block reminders')`;
  const bellState = async () => JSON.parse(await win.webContents.executeJavaScript(
    `JSON.stringify({ present: !!${bell}, on: ${bell} ? ${bell}.getAttribute('aria-checked') : null })`));

  const before = await bellState();
  check('the header offers a reminders toggle', before.present === true, 'present=' + before.present);
  check('reminders start switched off', before.on === 'false', 'aria-checked=' + before.on);

  await win.webContents.executeJavaScript(`${bell}.click()`);
  await new Promise((res) => setTimeout(res, 500));
  const after = await bellState();
  check('clicking the bell switches them on', after.on === 'true', 'aria-checked=' + after.on);
  check('the setting is written to disk',
    fs.existsSync(settingsFile) && JSON.parse(fs.readFileSync(settingsFile, 'utf8')).hourlyReminders === true,
    fs.existsSync(settingsFile) ? fs.readFileSync(settingsFile, 'utf8').replace(/\s+/g, ' ') : 'no file');

  // 4 PM was left blank by the driving above, so a reminder is due for it.
  const blankHour = 16;
  const firedOnBlank = notify.fireIfDue(new Date(2026, 8, 8, blankHour, 0, 2), () => win);
  check('a real notification fires for a blank hour', firedOnBlank === true, 'fired=' + firedOnBlank);

  // 7 AM was filled in, so it must stay quiet.
  const firedOnFilled = notify.fireIfDue(new Date(2026, 8, 8, 7, 0, 2), () => win);
  check('no notification for an hour already filled in', firedOnFilled === false, 'fired=' + firedOnFilled);

  // Outside 7 AM - 10 PM nothing fires at all.
  const firedAtNight = notify.fireIfDue(new Date(2026, 8, 8, 3, 0, 2), () => win);
  check('nothing fires outside 7 AM - 10 PM', firedAtNight === false, 'fired=' + firedAtNight);

  await win.webContents.executeJavaScript(`${bell}.click()`);
  await new Promise((res) => setTimeout(res, 500));
  const off = await bellState();
  check('switching them off persists', off.on === 'false'
    && JSON.parse(fs.readFileSync(settingsFile, 'utf8')).hourlyReminders === false, 'aria-checked=' + off.on);
  const firedWhenOff = notify.fireIfDue(new Date(2026, 8, 8, blankHour, 0, 2), () => win);
  check('nothing fires once switched off', firedWhenOff === false, 'fired=' + firedWhenOff);

  // ---- A taller window: the table fills its box instead of leaving a gap ----
  console.log('\n\u2014 larger window: schedule fills the box \u2014');
  const baseHeight = await win.webContents.executeJavaScript('window.innerHeight');
  win.webContents.setZoomFactor(0.5);
  // Wait for the larger viewport to reach the renderer rather than guessing at
  // a delay, then let the row heights settle.
  const grewTo = async (minHeight, timeoutMs = 6000) => {
    const t0 = Date.now();
    let h = baseHeight;
    while (Date.now() - t0 < timeoutMs) {
      h = await win.webContents.executeJavaScript('window.innerHeight');
      if (h >= minHeight) break;
      await new Promise((res) => setTimeout(res, 100));
    }
    return h;
  };
  const grownHeight = await grewTo(baseHeight * 1.6);
  await new Promise((res) => setTimeout(res, 400));
  const big = JSON.parse(await win.webContents.executeJavaScript(`(() => {
    const ul = document.querySelector('main > div:nth-child(2) ul');
    const rows = [...ul.children];
    const last = rows[rows.length - 1].getBoundingClientRect();
    const box = ul.getBoundingClientRect();
    return JSON.stringify({
      innerHeight: window.innerHeight,
      gapBelowLastRow: Math.round(box.bottom - last.bottom),
      scrolls: ul.scrollHeight - ul.clientHeight > 1,
      rowHeights: rows.map((r) => Math.round(r.getBoundingClientRect().height)),
      fieldFillsRow: rows.every((r) => {
        const ta = r.querySelector('textarea');
        return r.getBoundingClientRect().height - ta.getBoundingClientRect().height <= 2;
      }),
      firstLabel: rows[0].querySelector('label').textContent.trim(),
      lastLabel: rows[rows.length - 1].querySelector('label').textContent.trim(),
    });
  })()`));

  check('the viewport actually grew before measuring', grownHeight >= baseHeight * 1.6,
    grownHeight + 'px viewport, up from ' + baseHeight + 'px');
  check('no empty gap under the last row', big.gapBelowLastRow <= 1,
    big.gapBelowLastRow + 'px gap at innerHeight ' + big.innerHeight);
  check('all 16 hours visible without scrolling on a tall window',
    big.scrolls === false && big.firstLabel === '7 AM' && big.lastLabel === '10 PM',
    'scrolls=' + big.scrolls + ', ' + big.firstLabel + ' \u2192 ' + big.lastLabel);
  check('the whole row is clickable (field fills it, no dead space)',
    big.fieldFillsRow === true, 'fieldFillsRow=' + big.fieldFillsRow);
  check('rows grew beyond their 28px minimum',
    Math.min(...big.rowHeights) > 28,
    'shortest row ' + Math.min(...big.rowHeights) + 'px');
  check('the wrapped row is still taller than the plain ones',
    Math.max(...big.rowHeights) > Math.min(...big.rowHeights),
    'range ' + Math.min(...big.rowHeights) + '-' + Math.max(...big.rowHeights) + 'px');

  win.webContents.setZoomFactor(1);
  await new Promise((res) => setTimeout(res, 500));
  await win.webContents.executeJavaScript('window.innerHeight');

  // ---- Restart: reload the renderer against the same database file ----
  console.log('\n— restart: data reloads from disk —');
  await win.webContents.reload();
  await new Promise((res) => setTimeout(res, 1200));

  const afterRestart = JSON.parse(await win.webContents.executeJavaScript(`(() => {
    const texts = (sel) => [...document.querySelectorAll(sel)].map((e) => e.textContent.trim());
    return JSON.stringify({
      goals: texts('main > div:nth-child(1) section:nth-of-type(1) li button[title="Click to edit"]'),
      tasks: texts('main > div:nth-child(1) section:nth-of-type(2) li button[title="Click to edit"]'),
      reminders: texts('main > div:nth-child(3) section:nth-of-type(2) li button[title="Click to edit"]'),
      brainDump: document.querySelector('textarea[aria-label="Brain dump"]').value,
      checked: [...document.querySelectorAll('input[type=checkbox]')].filter((b) => b.checked)
        .map((b) => b.getAttribute('aria-label')),
      score: [...document.querySelectorAll('[role=radio]')].filter((r) => r.className.includes('bg-body')).length,
      slot7: document.querySelector('textarea[aria-label="Activity at 7 AM"]').value,
    });
  })()`));

  check('tasks reload after restart', afterRestart.tasks.join('|') === TASKS.join('|'), afterRestart.tasks.join(' | '));
  check('goals reload after restart', afterRestart.goals.join('|') === GOALS.join('|'), afterRestart.goals.join(' | '));
  check('reminders reload after restart', afterRestart.reminders.join('|') === REMINDERS.join('|'), afterRestart.reminders.join(' | '));
  check('brain dump reloads after restart', afterRestart.brainDump === BRAIN_DUMP, JSON.stringify(afterRestart.brainDump));
  check('completed state reloads', afterRestart.checked.length === 3, afterRestart.checked.join(', '));
  check('score reloads', afterRestart.score === 4, afterRestart.score + ' filled');
  check('schedule slot reloads', afterRestart.slot7 === 'Wake Up/Morning Routine', afterRestart.slot7);

  // ---- History: the previous day is a different, empty entry ----
  console.log('\n— history (§5) —');
  const history = JSON.parse(await win.webContents.executeJavaScript(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const label = () => document.querySelector('h1 + div span').textContent.trim();
    const taskRows = () => document.querySelectorAll('main > div:nth-child(1) section:nth-of-type(2) li').length;
    const todayLabel = label();
    document.querySelector('[aria-label="Previous day"]').click();
    await sleep(600);
    const prev = {
      label: label(), tasks: taskRows(),
      brainDump: document.querySelector('textarea[aria-label="Brain dump"]').value,
      score: [...document.querySelectorAll('[role=radio]')].filter((r) => r.className.includes('bg-body')).length,
      slot7: document.querySelector('textarea[aria-label="Activity at 7 AM"]').value,
    };
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Today').click();
    await sleep(600);
    const back = { label: label(), tasks: taskRows(), brainDump: document.querySelector('textarea[aria-label="Brain dump"]').value };
    return JSON.stringify({ todayLabel, prev, back });
  })()`));

  check('previous day shows a different date', history.prev.label !== history.todayLabel,
    history.todayLabel + ' -> ' + history.prev.label);
  check('previous day is empty (nothing leaks across days)',
    history.prev.tasks === 0 && history.prev.brainDump === '' && history.prev.score === 0 && history.prev.slot7 === '',
    history.prev.tasks + ' tasks, score ' + history.prev.score + ', brainDump ' + JSON.stringify(history.prev.brainDump));
  check('"Today" returns to the populated day',
    history.back.label === history.todayLabel && history.back.tasks === TASKS.length && history.back.brainDump === BRAIN_DUMP,
    history.back.label + ', ' + history.back.tasks + ' tasks');

  const dayRows = raw.prepare('SELECT COUNT(*) n FROM DailyLogs').get().n;
  check('browsing history created no empty DailyLogs rows', dayRows === 1, dayRows + ' day row(s)');

  console.log(`\n${fails.length === 0 ? 'PASS' : 'FAIL'} — ${pass} checks passed, ${fails.length} failed`);
  if (fails.length) console.log('\nraw: ' + JSON.stringify(r, null, 1));
  console.log(`screenshot: ${outPng}`);
  db.closeDatabase();
  fs.rmSync(dir, { recursive: true, force: true });
  app.exit(fails.length === 0 ? 0 : 1);
});
