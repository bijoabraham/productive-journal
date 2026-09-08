import { MAX_TASKS_PER_DAY, type Task } from '../../shared/types';
import AddItemInput from './AddItemInput';
import Card from './Card';
import ChecklistRow from './ChecklistRow';

interface TasksPanelProps {
  tasks: Task[];
  onAdd: (text: string) => void;
  onRename: (id: number, text: string) => void;
  onToggle: (id: number, completed: boolean) => void;
  onDelete: (id: number) => void;
  /** Focused by Ctrl/Cmd+N (spec §8). */
  addInputRef?: React.Ref<HTMLInputElement>;
}

/**
 * Column 1, middle. Spec §4.2.
 * Unnumbered, matching the mockup — the numbered lists are Goals and Reminders.
 */
export default function TasksPanel({
  tasks,
  onAdd,
  onRename,
  onToggle,
  onDelete,
  addInputRef,
}: TasksPanelProps) {
  const done = tasks.filter((t) => t.Completed === 1).length;
  const full = tasks.length >= MAX_TASKS_PER_DAY;

  return (
    <Card
      title="Priority Tasks"
      aside={tasks.length > 0 ? `${done}/${tasks.length}` : undefined}
      className="min-h-0 flex-1"
      bodyClassName="flex flex-col"
    >
      <ul className="min-h-0 flex-1 list-none overflow-y-auto">
        {tasks.map((task) => (
          <ChecklistRow
            key={task.Id}
            text={task.TaskName}
            completed={task.Completed === 1}
            onToggle={(c) => onToggle(task.Id, c)}
            onRename={(t) => onRename(task.Id, t)}
            onDelete={() => onDelete(task.Id)}
          />
        ))}
      </ul>
      <div className="shrink-0">
        <AddItemInput
          placeholder="Add a task…"
          onAdd={onAdd}
          enabled={!full}
          disabledHint={`Day is full — ${MAX_TASKS_PER_DAY} tasks maximum.`}
          inputRef={addInputRef}
        />
      </div>
    </Card>
  );
}
