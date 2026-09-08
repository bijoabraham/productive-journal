import type { IsoDate } from '../../shared/types';

/** "07:00" -> "7 AM", "13:00" -> "1 PM" — the Time Block Schedule gutter labels. */
export function formatSlotLabel(slot: string): string {
  const hour = Number(slot.slice(0, 2));
  const suffix = hour < 12 ? 'AM' : 'PM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${suffix}`;
}

/** "2026-09-08" -> "Mon, Oct 28 | Today" for the schedule table strip. */
export function formatTableDate(date: IsoDate): string {
  const [y, m, d] = date.split('-').map(Number);
  const short = new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return date === todayIso() ? `${short}  |  Today` : short;
}

/** "2026-09-08" -> "Tuesday, September 8, 2026" for the header. */
export function formatLongDate(date: IsoDate): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Local-timezone `YYYY-MM-DD`; mirrors `today()` in the database layer. */
export function todayIso(): IsoDate {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Shifts an ISO date by whole days, staying in local time. */
export function shiftDate(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(y, m - 1, d + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}
