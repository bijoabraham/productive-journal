import type { Reminder } from '../../shared/types';
import AddItemInput from './AddItemInput';
import Card from './Card';
import ChecklistRow from './ChecklistRow';

interface RemindersPanelProps {
  reminders: Reminder[];
  onAdd: (text: string) => void;
  onRename: (id: number, text: string) => void;
  onToggle: (id: number, completed: boolean) => void;
  onDelete: (id: number) => void;
}

/**
 * Column 3, bottom. Spec §4.6 and UI spec §3.
 * A checklist of discrete rows — not a text blob — with the same interaction
 * model as Priority Tasks. Plain background, matching UI_Prototype_Final.jpg;
 * the sticky-note yellow the spec permitted is not used there.
 */
export default function RemindersPanel({
  reminders,
  onAdd,
  onRename,
  onToggle,
  onDelete,
}: RemindersPanelProps) {
  const done = reminders.filter((r) => r.Completed === 1).length;

  return (
    <Card
      title="Reminders"
      aside={reminders.length > 0 ? `${done}/${reminders.length}` : undefined}
      className="min-h-0 flex-[2]"
      bodyClassName="flex flex-col"
    >
      <ul className="min-h-0 flex-1 list-none overflow-y-auto">
        {reminders.map((reminder, i) => (
          <ChecklistRow
            key={reminder.Id}
            index={i + 1}
            text={reminder.ReminderText}
            completed={reminder.Completed === 1}
            onToggle={(c) => onToggle(reminder.Id, c)}
            onRename={(t) => onRename(reminder.Id, t)}
            onDelete={() => onDelete(reminder.Id)}
          />
        ))}
      </ul>
      <div className="shrink-0">
        <AddItemInput placeholder="Add a reminder…" onAdd={onAdd} />
      </div>
    </Card>
  );
}
