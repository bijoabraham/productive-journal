import { useEffect, useRef, useState } from 'react';

interface ChecklistRowProps {
  text: string;
  completed: boolean;
  /** Optional "1." prefix for the numbered lists (Goals, Reminders). */
  index?: number;
  onToggle: (completed: boolean) => void;
  onRename: (text: string) => void;
  onDelete: () => void;
}

/**
 * One checklist line, shared by Priority Tasks, Goals and Reminders so all three
 * behave identically (UI spec §3, Column 3: reminders use "the same interaction
 * model as Priority Tasks").
 *
 * Styling constraints from §1, enforced here:
 *   - the row background is never set, so rows stay uniform (no alternating colours)
 *   - completion greys the text and strikes it through; it never tints the row
 */
export default function ChecklistRow({
  text,
  completed,
  index,
  onToggle,
  onRename,
  onDelete,
}: ChecklistRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function beginEdit() {
    setDraft(text);
    setEditing(true);
  }

  function commit() {
    const next = draft.trim();
    setEditing(false);
    if (!next) {
      setDraft(text); // Empty is not a delete; the × button is.
      return;
    }
    if (next !== text) onRename(next);
  }

  return (
    <li className="group flex items-start gap-2 py-1">
      <input
        type="checkbox"
        checked={completed}
        onChange={(e) => onToggle(e.target.checked)}
        className="mt-0.5 size-3.5 shrink-0 cursor-pointer rounded-sm"
        aria-label={text}
      />

      {index !== undefined && (
        <span className="shrink-0 text-sm tabular-nums text-faint">{index}.</span>
      )}

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setDraft(text);
              setEditing(false);
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-sm text-body outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={beginEdit}
          title="Click to edit"
          className={`min-w-0 flex-1 cursor-text text-left text-sm leading-snug break-words ${
            completed ? 'text-faint line-through' : 'text-body'
          }`}
        >
          {text}
        </button>
      )}

      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete "${text}"`}
        title="Delete"
        className="shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-body"
      >
        <svg viewBox="0 0 14 14" className="size-3.5" aria-hidden="true">
          <path
            d="M3.5 3.5l7 7M10.5 3.5l-7 7"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </button>
    </li>
  );
}
