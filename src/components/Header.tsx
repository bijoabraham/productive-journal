import type { IsoDate } from '../../shared/types';
import { formatLongDate, todayIso } from '../services/format';

interface HeaderProps {
  date: IsoDate;
  onDateChange: (date: IsoDate) => void;
  onStep: (days: number) => void;
  /** Hourly Time Block reminders; null until settings have loaded. */
  remindersOn: boolean | null;
  onToggleReminders: (enabled: boolean) => void;
}

/** UI spec §2.1: title left, current date centre, utilities right. */
export default function Header({
  date,
  onDateChange,
  onStep,
  remindersOn,
  onToggleReminders,
}: HeaderProps) {
  const isToday = date === todayIso();

  return (
    <header className="flex shrink-0 items-center gap-4">
      <h1 className="flex flex-1 items-center gap-2 text-xl font-bold tracking-tight text-ink">
        <svg viewBox="0 0 20 20" className="size-5 text-muted" aria-hidden="true">
          <path
            d="M3 17l1-4L14.5 2.5a1.8 1.8 0 012.5 2.5L6.5 15.5 3 17z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
        Productive Journal
      </h1>

      <div className="flex items-center gap-1">
        <NavButton label="Previous day" onClick={() => onStep(-1)} d="M12 4l-6 6 6 6" />
        <span className="min-w-[15rem] text-center text-sm font-semibold text-ink">
          {formatLongDate(date)}
        </span>
        <NavButton label="Next day" onClick={() => onStep(1)} d="M8 4l6 6-6 6" />
      </div>

      <div className="flex flex-1 items-center justify-end gap-2">
        {!isToday && (
          <button
            type="button"
            onClick={() => onDateChange(todayIso())}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-muted hover:bg-card hover:text-ink"
          >
            Today
          </button>
        )}
        {remindersOn !== null && (
          <button
            type="button"
            role="switch"
            aria-checked={remindersOn}
            aria-label="Hourly Time Block reminders"
            title={
              remindersOn
                ? 'Hourly reminders on — nudges you when the current hour is blank'
                : 'Hourly reminders off'
            }
            onClick={() => onToggleReminders(!remindersOn)}
            className={`rounded-md p-1 ${remindersOn ? 'text-ink' : 'text-faint'} hover:text-ink`}
          >
            <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
              <path
                d="M10 3a4.5 4.5 0 00-4.5 4.5c0 3-1.2 4.2-1.7 4.7a.5.5 0 00.35.85h11.7a.5.5 0 00.35-.85c-.5-.5-1.7-1.7-1.7-4.7A4.5 4.5 0 0010 3zM8.4 16a1.7 1.7 0 003.2 0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* A slash through the bell when reminders are off, so the state
                  reads at a glance and not only from colour. */}
              {!remindersOn && (
                <path
                  d="M4 16L16 4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        )}
        <label className="sr-only" htmlFor="date-picker">
          Jump to date
        </label>
        <input
          id="date-picker"
          type="date"
          value={date}
          onChange={(e) => e.target.value && onDateChange(e.target.value)}
          className="rounded-md bg-card px-2 py-1 text-xs text-muted shadow-card focus:outline-none"
        />
      </div>
    </header>
  );
}

function NavButton({ label, onClick, d }: { label: string; onClick: () => void; d: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-md p-1 text-muted hover:bg-card hover:text-ink"
    >
      <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
        <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
