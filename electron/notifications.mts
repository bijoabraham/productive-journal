import { BrowserWindow, Notification } from 'electron';
import { getDay, today } from '../database/db.mjs';
import { TIME_SLOTS, type IsoDate } from '../shared/types.js';
import { getSettings } from './settings.mjs';

/**
 * Hourly nudge to fill in the Time Block Schedule.
 *
 * On the hour, if that hour's slot is still blank, raise a native OS
 * notification. Clicking it focuses the window on that row.
 *
 * Note: Productive_Journal_Spec.md §2 lists Notifications under "Must Not Have"
 * for V1. This is a deliberate post-V1 addition at the user's request, and is
 * off by default — nothing fires until it is switched on in the header.
 */

/** Sent to the renderer when a notification is clicked. */
export const FOCUS_SLOT_CHANNEL = 'journal:focus-slot';

/** "07:00" for hour 7, or null when the hour is outside 7 AM - 10 PM. */
export function slotForHour(hour: number): string | null {
  const slot = `${String(hour).padStart(2, '0')}:00`;
  return (TIME_SLOTS as readonly string[]).includes(slot) ? slot : null;
}

/** Milliseconds from `now` to the next exact hour. Always in (0, 3600000]. */
export function msUntilNextHour(now: Date): number {
  const next = new Date(now.getTime());
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return next.getTime() - now.getTime();
}

/** "07:00" -> "7 AM". Mirrors the label shown in the schedule gutter. */
export function slotLabel(slot: string): string {
  const hour = Number(slot.slice(0, 2));
  const suffix = hour < 12 ? 'AM' : 'PM';
  return `${hour % 12 === 0 ? 12 : hour % 12} ${suffix}`;
}

/**
 * Whether the reminder for `hour` should fire — the whole decision in one pure
 * place so it can be tested without timers or a desktop session.
 */
export function shouldRemind(
  date: IsoDate,
  hour: number,
  opts: { enabled: boolean; lookup?: (d: IsoDate) => { schedule: { TimeSlot: string; Description: string }[] } | null },
): { remind: boolean; slot: string | null; reason: string } {
  if (!opts.enabled) return { remind: false, slot: null, reason: 'reminders are off' };

  const slot = slotForHour(hour);
  if (!slot) return { remind: false, slot: null, reason: `${hour}:00 is outside 7 AM - 10 PM` };

  const entry = (opts.lookup ?? getDay)(date);
  const filled = entry?.schedule.find((s) => s.TimeSlot === slot)?.Description.trim();
  if (filled) return { remind: false, slot, reason: 'slot already filled' };

  return { remind: true, slot, reason: 'slot is empty' };
}

let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Starts the on-the-hour loop. Returns a stop function.
 *
 * Each tick re-computes the delay to the next hour rather than repeating a
 * fixed interval, so the schedule cannot drift and survives the machine
 * sleeping through one or more hours.
 */
export function startHourlyReminders(getWindow: () => BrowserWindow | null): () => void {
  const tick = () => {
    try {
      fireIfDue(new Date(), getWindow);
    } catch (error) {
      console.error('[notify] hourly check failed:', error);
    }
    schedule();
  };

  const schedule = () => {
    // +1s so the timer lands just after the hour, never a hair before it.
    timer = setTimeout(tick, msUntilNextHour(new Date()) + 1000);
  };

  schedule();
  return stopHourlyReminders;
}

export function stopHourlyReminders(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}

/** Evaluates the current hour and raises the toast when it is due. */
export function fireIfDue(now: Date, getWindow: () => BrowserWindow | null): boolean {
  const { remind, slot } = shouldRemind(today(), now.getHours(), {
    enabled: getSettings().hourlyReminders,
  });
  if (!remind || !slot) return false;
  if (!Notification.isSupported()) return false;

  const label = slotLabel(slot);
  const notification = new Notification({
    title: `${label} — what's the plan?`,
    body: `Your Time Block Schedule has no entry for ${label}.`,
    silent: false,
  });

  notification.on('click', () => {
    const win = getWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    win.webContents.send(FOCUS_SLOT_CHANNEL, slot);
  });

  notification.show();
  return true;
}
