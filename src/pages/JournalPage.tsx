import { useEffect, useRef, useState } from 'react';
import BrainDumpPanel from '../components/BrainDumpPanel';
import GoalsPanel from '../components/GoalsPanel';
import Header from '../components/Header';
import ProductivityScore from '../components/ProductivityScore';
import RemindersPanel from '../components/RemindersPanel';
import SchedulePanel from '../components/SchedulePanel';
import TasksPanel from '../components/TasksPanel';
import { computeProductivity } from '../../shared/productivity';
import { useJournal } from '../hooks/useJournal';
import type { AppSettings } from '../../shared/types';
import { shiftDate, todayIso } from '../services/format';

/**
 * The single primary screen (spec §3).
 *
 * Layout per UI_Design_Presentation.md §2:
 *   100vh column, 2rem outer padding, 1.5rem gaps,
 *   then a 25% / 50% / 25% row filling the remaining height.
 */
export default function JournalPage() {
  const [date, setDate] = useState(todayIso());
  const { entry, error, dismissError, actions } = useJournal(date);
  const addTaskRef = useRef<HTMLInputElement>(null);
  const productivity = computeProductivity(entry);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    window.journal.getSettings().then(setSettings).catch(() => setSettings(null));
  }, []);

  // An hourly reminder was clicked: jump to today and put the caret in that hour.
  useEffect(() => {
    return window.journal.onFocusSlot((timeSlot) => {
      setDate(todayIso());
      // Wait for the day to render before reaching for the row.
      requestAnimationFrame(() => {
        const field = document.getElementById(`slot-${timeSlot}`);
        if (field instanceof HTMLTextAreaElement) {
          field.focus();
          field.setSelectionRange(field.value.length, field.value.length);
        }
      });
    });
  }, []);

  function toggleReminders(enabled: boolean) {
    window.journal
      .setHourlyReminders(enabled)
      .then(setSettings)
      .catch(() => setSettings((s) => s));
  }

  // Spec §8 keyboard shortcuts.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      switch (e.key) {
        case 'n':
          e.preventDefault();
          addTaskRef.current?.focus();
          break;
        case 'd':
          e.preventDefault();
          setDate(todayIso());
          break;
        case 's':
          // Everything auto-saves; Ctrl+S just lands any debounced edit now.
          e.preventDefault();
          void actions.flush();
          break;
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actions]);

  return (
    <div className="flex h-full flex-col gap-6 p-8">
      <Header
        date={date}
        onDateChange={setDate}
        onStep={(days) => setDate(shiftDate(date, days))}
        remindersOn={settings ? settings.hourlyReminders : null}
        onToggleReminders={toggleReminders}
      />

      {error && (
        <div
          role="alert"
          className="flex shrink-0 items-center justify-between gap-3 rounded-md bg-card px-4 py-2 text-sm text-body shadow-card"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={dismissError}
            className="text-xs text-muted hover:text-ink"
            aria-label="Dismiss"
          >
            Dismiss
          </button>
        </div>
      )}

      <main className="flex min-h-0 flex-1 gap-6">
        {/* Column 1 — 22.5% (25% less a tenth; the space goes to column 2) */}
        <div className="flex w-[22.5%] min-w-0 flex-col gap-6">
          <GoalsPanel
            goals={entry.goals}
            onAdd={actions.addGoal}
            onRename={actions.renameGoal}
            onToggle={actions.toggleGoal}
            onDelete={actions.deleteGoal}
          />
          <TasksPanel
            tasks={entry.tasks}
            onAdd={actions.addTask}
            onRename={actions.renameTask}
            onToggle={actions.toggleTask}
            onDelete={actions.deleteTask}
            addInputRef={addTaskRef}
          />
          <ProductivityScore
            computed={productivity}
            override={entry.log.ProductivityScore}
            onChange={actions.setScore}
          />
        </div>

        {/* Column 2 — 52.5%, widened leftwards by what column 1 gave up */}
        <div className="flex w-[52.5%] min-w-0 flex-col">
          <SchedulePanel
            date={date}
            schedule={entry.schedule}
            onSetSlot={actions.setScheduleSlot}
            onBlur={() => void actions.flush()}
          />
        </div>

        {/* Column 3 — 25%, unchanged */}
        <div className="flex w-1/4 min-w-0 flex-col gap-6">
          <BrainDumpPanel
            value={entry.log.BrainDump}
            onChange={actions.setBrainDump}
            onBlur={() => void actions.flush()}
          />
          <RemindersPanel
            reminders={entry.reminders}
            onAdd={actions.addReminder}
            onRename={actions.renameReminder}
            onToggle={actions.toggleReminder}
            onDelete={actions.deleteReminder}
          />
        </div>
      </main>
    </div>
  );
}
