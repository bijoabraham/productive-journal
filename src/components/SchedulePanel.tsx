import { useCallback, useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { TIME_SLOTS, type IsoDate, type ScheduleItem } from '../../shared/types';
import { formatSlotLabel, formatTableDate } from '../services/format';
import Card from './Card';

interface SchedulePanelProps {
  date: IsoDate;
  schedule: ScheduleItem[];
  onSetSlot: (timeSlot: string, description: string) => void;
  /** Persists the debounced edit immediately when focus leaves a slot. */
  onBlur?: () => void;
}

/**
 * Column 2. Spec §4.4: one row per hour from 7 AM to 10 PM.
 *
 * Styled as the ruled table in UI_Prototype_Final.jpg — an outer frame, a date
 * header strip, a uniform hour-label gutter, and alternating row tints. The
 * alternating tints are a deliberate override of UI_Design_Presentation.md §1,
 * approved by the user in favour of the mockup.
 *
 * The frame and header stay put while only the rows scroll. Rows size to their
 * content so a long entry wraps to the column width, and share any spare height
 * so the table fills its box on a taller window instead of leaving a gap.
 */
export default function SchedulePanel({ date, schedule, onSetSlot, onBlur }: SchedulePanelProps) {
  const bySlot = new Map(schedule.map((item) => [item.TimeSlot, item.Description]));

  return (
    <Card title="Time Block Schedule" className="min-h-0 flex-1" bodyClassName="flex flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-sm border border-rule">
        <div className="shrink-0 border-b border-rule bg-thead py-1.5 text-center text-xs font-medium text-body">
          {formatTableDate(date)}
        </div>
        <ul className="flex min-h-0 flex-1 list-none flex-col overflow-y-auto">
          {TIME_SLOTS.map((slot, i) => (
            <ScheduleRow
              key={slot}
              slot={slot}
              value={bySlot.get(slot) ?? ''}
              tint={i % 2 === 0 ? 'bg-row-a' : 'bg-row-b'}
              ruled={i < TIME_SLOTS.length - 1}
              onChange={(text) => onSetSlot(slot, text)}
              onBlur={onBlur}
            />
          ))}
        </ul>
      </div>
    </Card>
  );
}

interface ScheduleRowProps {
  slot: string;
  value: string;
  tint: string;
  ruled: boolean;
  onChange: (text: string) => void;
  onBlur?: () => void;
}

function ScheduleRow({ slot, value, tint, ruled, onChange, onBlur }: ScheduleRowProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const label = formatSlotLabel(slot);

  /**
   * Sets the field's minimum height to exactly fit its wrapped text, then hands
   * the actual height back to flex so the field stretches to fill its row —
   * otherwise the blank area under a short entry in a tall row would be dead
   * space that swallows clicks instead of focusing the field.
   *
   * Measuring needs the stretch turned off first: a stretched textarea reports
   * scrollHeight as the stretched height, which would ratchet the row taller on
   * every pass.
   */
  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.alignSelf = 'flex-start';
    el.style.minHeight = '0px';
    el.style.height = 'auto';
    const needed = el.scrollHeight;
    el.style.alignSelf = '';
    el.style.height = '';
    el.style.minHeight = `${needed}px`;
  }, []);

  // Before paint, so a row never flashes at the wrong height.
  useLayoutEffect(fit, [value, fit]);

  // Re-wrap when the column resizes. Growing the textarea also fires the
  // observer, so only a width change is acted on — otherwise this would loop.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let lastWidth = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return;
      lastWidth = el.clientWidth;
      fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter inserts a newline, as it would in any textarea — a time block is
    // free-form text, not a single-line commit field. Escape leaves the field.
    if (e.key === 'Escape') e.currentTarget.blur();
  }

  return (
    <li
      className={`flex min-h-7 grow basis-auto items-stretch shrink-0 ${tint} ${
        ruled ? 'border-b border-rule' : ''
      }`}
    >
      <label
        htmlFor={`slot-${slot}`}
        className="w-16 shrink-0 cursor-text border-r border-rule bg-gutter pt-1 pr-3 text-right text-xs tabular-nums text-muted"
      >
        {label}
      </label>
      <textarea
        id={`slot-${slot}`}
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onBlur}
        spellCheck={false}
        aria-label={`Activity at ${label}`}
        className="block min-w-0 flex-1 resize-none overflow-hidden border-0 bg-transparent px-3 py-1 text-sm leading-snug text-body placeholder:text-faint focus:outline-none"
      />
    </li>
  );
}
