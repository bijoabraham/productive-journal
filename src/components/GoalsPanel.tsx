import { MAX_GOALS_PER_DAY, type Goal } from '../../shared/types';
import AddItemInput from './AddItemInput';
import Card from './Card';
import ChecklistRow from './ChecklistRow';

interface GoalsPanelProps {
  goals: Goal[];
  onAdd: (text: string) => void;
  onRename: (id: number, text: string) => void;
  onToggle: (id: number, completed: boolean) => void;
  onDelete: (id: number) => void;
}

/**
 * Column 1, top. Spec §4.3: a numbered list of 1-5 goals.
 *
 * Only the list scrolls; the add field sits outside that container, exactly as
 * in Priority Tasks and Reminders. Keeping the field out of the scroll box
 * matters visually — an outline on a child of `overflow: auto` is clipped at
 * the container edge, which made this field's focus ring differ from the others.
 */
export default function GoalsPanel({ goals, onAdd, onRename, onToggle, onDelete }: GoalsPanelProps) {
  const full = goals.length >= MAX_GOALS_PER_DAY;

  return (
    <Card
      title="Goals for Today"
      aside={`${goals.length}/${MAX_GOALS_PER_DAY}`}
      className="shrink-0"
      bodyClassName="flex flex-col"
    >
      <ul className="min-h-0 flex-1 list-none overflow-y-auto">
        {goals.map((goal, i) => (
          <ChecklistRow
            key={goal.Id}
            index={i + 1}
            text={goal.GoalText}
            completed={goal.Completed === 1}
            onToggle={(c) => onToggle(goal.Id, c)}
            onRename={(t) => onRename(goal.Id, t)}
            onDelete={() => onDelete(goal.Id)}
          />
        ))}
      </ul>
      <div className="shrink-0">
        <AddItemInput
          placeholder="Add a goal…"
          onAdd={onAdd}
          enabled={!full}
          disabledHint={`All ${MAX_GOALS_PER_DAY} goals set for today.`}
        />
      </div>
    </Card>
  );
}
