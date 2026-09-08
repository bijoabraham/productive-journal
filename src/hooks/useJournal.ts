import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DayEntry, IsoDate, ProductivityScore } from '../../shared/types';
import { todayIso } from '../services/format';

/**
 * Spec §13 asks for auto-save on field change and at least every 5 seconds.
 * Free-text fields (brain dump, schedule slots) coalesce keystrokes into one
 * write after this quiet period; everything else persists immediately.
 */
const AUTOSAVE_MS = 500;

export interface JournalActions {
  setBrainDump: (text: string) => void;
  setScore: (score: ProductivityScore) => void;
  setScheduleSlot: (timeSlot: string, description: string) => void;

  addTask: (text: string) => void;
  renameTask: (id: number, text: string) => void;
  toggleTask: (id: number, completed: boolean) => void;
  deleteTask: (id: number) => void;

  addGoal: (text: string) => void;
  renameGoal: (id: number, text: string) => void;
  toggleGoal: (id: number, completed: boolean) => void;
  deleteGoal: (id: number) => void;

  addReminder: (text: string) => void;
  renameReminder: (id: number, text: string) => void;
  toggleReminder: (id: number, completed: boolean) => void;
  deleteReminder: (id: number) => void;

  /** Persists any debounced edits immediately (field blur, Ctrl/Cmd+S, day change). */
  flush: () => Promise<void>;
}

function emptyDay(date: IsoDate): DayEntry {
  const ts = new Date().toISOString();
  return {
    log: { Id: 0, LogDate: date, ProductivityScore: null, BrainDump: '', CreatedAt: ts, UpdatedAt: ts },
    tasks: [],
    goals: [],
    reminders: [],
    schedule: [],
  };
}

interface UseJournal {
  entry: DayEntry;
  error: string | null;
  dismissError: () => void;
  actions: JournalActions;
}

/**
 * Binds one day of the journal to SQLite over IPC.
 *
 * Reads are authoritative: after any change the day is re-read from the
 * database, so what the UI shows is always what was actually stored. Writes are
 * applied to local state first so the app stays responsive, and a failed write
 * is corrected by the re-read that follows it.
 */
export function useJournal(date: IsoDate): UseJournal {
  const [entry, setEntry] = useState<DayEntry>(() => emptyDay(date));
  const [shownDate, setShownDate] = useState(date);
  const [error, setError] = useState<string | null>(null);

  // Adjusting state during render when the date changes (the React-sanctioned
  // pattern) clears the old day immediately, so navigating history never shows
  // the previous day's entries under the new day's heading.
  if (shownDate !== date) {
    setShownDate(date);
    setEntry(emptyDay(date));
  }

  /** Debounced writes, keyed so repeated edits to one field collapse into one. */
  const pending = useRef(new Map<string, () => Promise<void>>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const report = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
  }, []);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const jobs = [...pending.current.values()];
    pending.current.clear();
    for (const job of jobs) {
      try {
        await job();
      } catch (e) {
        report(e);
      }
    }
  }, [report]);

  /**
   * Queues a debounced write. The job closes over the date it was created with,
   * so edits still land on the right day even if the user navigates away first.
   */
  const defer = useCallback(
    (key: string, job: () => Promise<void>) => {
      pending.current.set(key, job);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
    },
    [flush],
  );

  const reload = useCallback(async () => {
    try {
      const day = await window.journal.getDay(date);
      if (alive.current) setEntry(day ?? emptyDay(date));
    } catch (e) {
      report(e);
    }
  }, [date, report]);

  // Load the requested day. Today is created on demand (spec §4.1); past and
  // future days are only read, so browsing history never writes empty rows.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Any debounced edit belongs to the day we are leaving — land it first.
      await flush();
      try {
        const day =
          date === todayIso()
            ? await window.journal.ensureDay(date)
            : await window.journal.getDay(date);
        if (!cancelled) setEntry(day ?? emptyDay(date));
      } catch (e) {
        if (!cancelled) report(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date, flush, report]);

  // Persist outstanding edits if the window is closed or hidden mid-typing.
  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener('beforeunload', onHide);
    window.addEventListener('blur', onHide);
    return () => {
      window.removeEventListener('beforeunload', onHide);
      window.removeEventListener('blur', onHide);
      void flush();
    };
  }, [flush]);

  const actions = useMemo<JournalActions>(() => {
    /**
     * Applies an optimistic local change, lands any debounced text edits, runs
     * the write, then re-reads the day. Flushing before the write matters: it
     * stops a stale re-read from clobbering text the user just typed.
     */
    const mutate = async (optimistic: ((d: DayEntry) => DayEntry) | null, op: () => Promise<unknown>) => {
      if (optimistic) setEntry(optimistic);
      await flush();
      try {
        await op();
      } catch (e) {
        report(e);
      }
      await reload();
    };

    const setCompleted = (
      key: 'tasks' | 'goals' | 'reminders',
      id: number,
      completed: boolean,
    ) => (d: DayEntry): DayEntry => ({
      ...d,
      [key]: d[key].map((i) => (i.Id === id ? { ...i, Completed: (completed ? 1 : 0) as 0 | 1 } : i)),
    });

    const removeFrom = (key: 'tasks' | 'goals' | 'reminders', id: number) => (d: DayEntry): DayEntry => ({
      ...d,
      [key]: d[key].filter((i) => i.Id !== id),
    });

    return {
      setBrainDump: (text) => {
        setEntry((d) => ({ ...d, log: { ...d.log, BrainDump: text } }));
        defer('brainDump', () => window.journal.setBrainDump(date, text));
      },

      setScore: (score) => {
        void mutate(
          (d) => ({ ...d, log: { ...d.log, ProductivityScore: score } }),
          () => window.journal.setProductivityScore(date, score),
        );
      },

      setScheduleSlot: (timeSlot, description) => {
        setEntry((d) => {
          const rest = d.schedule.filter((s) => s.TimeSlot !== timeSlot);
          if (!description.trim()) return { ...d, schedule: rest };
          const existing = d.schedule.find((s) => s.TimeSlot === timeSlot);
          return {
            ...d,
            schedule: [
              ...rest,
              {
                Id: existing?.Id ?? -1,
                DailyLogId: d.log.Id,
                TimeSlot: timeSlot,
                Description: description,
              },
            ].sort((a, b) => a.TimeSlot.localeCompare(b.TimeSlot)),
          };
        });
        defer(`slot:${timeSlot}`, () => window.journal.setScheduleSlot(date, timeSlot, description));
      },

      // Adds have no id until the database assigns one, so they skip the
      // optimistic step and take the value from the re-read instead.
      addTask: (text) => void mutate(null, () => window.journal.tasks.add(date, text)),
      renameTask: (id, text) => void mutate(null, () => window.journal.tasks.rename(id, text)),
      toggleTask: (id, c) => void mutate(setCompleted('tasks', id, c), () => window.journal.tasks.setCompleted(id, c)),
      deleteTask: (id) => void mutate(removeFrom('tasks', id), () => window.journal.tasks.remove(id)),

      addGoal: (text) => void mutate(null, () => window.journal.goals.add(date, text)),
      renameGoal: (id, text) => void mutate(null, () => window.journal.goals.rename(id, text)),
      toggleGoal: (id, c) => void mutate(setCompleted('goals', id, c), () => window.journal.goals.setCompleted(id, c)),
      deleteGoal: (id) => void mutate(removeFrom('goals', id), () => window.journal.goals.remove(id)),

      addReminder: (text) => void mutate(null, () => window.journal.reminders.add(date, text)),
      renameReminder: (id, text) => void mutate(null, () => window.journal.reminders.rename(id, text)),
      toggleReminder: (id, c) =>
        void mutate(setCompleted('reminders', id, c), () => window.journal.reminders.setCompleted(id, c)),
      deleteReminder: (id) => void mutate(removeFrom('reminders', id), () => window.journal.reminders.remove(id)),

      flush,
    };
  }, [date, defer, flush, reload, report]);

  return { entry, error, dismissError: () => setError(null), actions };
}
