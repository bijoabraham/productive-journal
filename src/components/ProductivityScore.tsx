import type { ProductivityScore as Score } from '../../shared/types';
import type { ProductivityResult } from '../../shared/productivity';

const LABELS = ['Very Poor', 'Poor', 'Average', 'Good', 'Excellent'] as const;

interface ProductivityScoreProps {
  /** Derived from the day's completions. */
  computed: ProductivityResult;
  /** The user's explicit rating, or null when the day is scored automatically. */
  override: Score;
  onChange: (score: Score) => void;
}

/**
 * UI spec §3: "very small and compact", five circles filled left-to-right.
 * So: no card, no shadow — a tiny label and five 12px circles.
 *
 * Circles only — no percentage or text score, per UI spec §3. The computed
 * value reaches assistive tech through the group's aria-label instead.
 *
 * The circles show the computed rating unless the user has pinned their own.
 * `DailyLogs.ProductivityScore` therefore stores *only* an explicit override:
 * NULL means "score this day automatically", which keeps the stored value
 * meaningful rather than a cache of something we can always recompute.
 */
export default function ProductivityScore({ computed, override, onChange }: ProductivityScoreProps) {
  const overridden = override !== null;
  const effective = override ?? computed.rating;

  return (
    <div className="shrink-0 px-1 pt-1">
      <div className="mb-1.5 text-[10px] font-medium tracking-wider text-faint uppercase">
        Productivity Score
      </div>
      <div
        className="flex items-center gap-1.5"
        role="radiogroup"
        aria-label={
          overridden
            ? 'Productivity score — your rating'
            : `Productivity score — automatic${computed.percent === null ? '' : `, ${computed.percent}%`}`
        }
        title={
          overridden
            ? 'Your rating. Click it again, or Reset, to score automatically.'
            : 'Scored automatically from completed goals, tasks and reminders.'
        }
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = effective !== null && n <= effective;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={effective === n}
              aria-label={`${n} — ${LABELS[n - 1]}`}
              title={`Rate this day ${n} — ${LABELS[n - 1]}`}
              // Clicking the rating you already pinned hands the day back to
              // the formula, so the override is never a one-way door.
              onClick={() => onChange(override === n ? null : (n as Score))}
              className={`size-3 rounded-full border transition-colors ${
                filled ? 'border-body bg-body' : 'border-rule bg-transparent hover:border-muted'
              }`}
            />
          );
        })}

        {overridden && (
          <button
            type="button"
            onClick={() => onChange(null)}
            title="Score this day automatically again"
            className="text-[10px] text-faint underline decoration-dotted underline-offset-2 hover:text-body"
          >
            reset
          </button>
        )}
      </div>
    </div>
  );
}
