import type { DayEntry, ProductivityScore } from './types.js';

/**
 * How much each list contributes to the day's productivity.
 *
 * Goals outrank tasks because they are the day's intended outcomes, not its
 * workload. Reminders are errands rather than achievement, so they carry a
 * token weight — set `reminders: 0` to drop them from the score entirely; the
 * maths below renormalises automatically and nothing else needs changing.
 */
export const PRODUCTIVITY_WEIGHTS = {
  goals: 0.5,
  tasks: 0.4,
  reminders: 0.1,
} as const;

export type ProductivityWeights = { goals: number; tasks: number; reminders: number };

export type ProductivityKind = 'goals' | 'tasks' | 'reminders';

export interface ProductivityPart {
  kind: ProductivityKind;
  completed: number;
  total: number;
  /** Completion rate 0-1, or null when the list is empty. */
  rate: number | null;
  /** Weight actually applied after renormalisation, 0-1. */
  weight: number;
}

export interface ProductivityResult {
  /** 0-100, or null when the day has nothing to score yet. */
  percent: number | null;
  /** The 1-5 rating shown as circles, or null when there is nothing to score. */
  rating: ProductivityScore;
  parts: ProductivityPart[];
}

const COUNTED: ProductivityKind[] = ['goals', 'tasks', 'reminders'];

/**
 * Weighted completion across the day's lists.
 *
 *     percent = Σ(weightᵢ × rateᵢ) / Σ(weightᵢ)   over non-empty lists only
 *
 * Each list is scored on its own completion *rate*, not its raw item count, so
 * finishing 2 of 2 goals is a full goal score whether or not the day also holds
 * twenty tasks. Weighting raw items instead would let a long task list drown
 * out the goals, which is the opposite of what a priorities journal is for.
 *
 * Empty lists are dropped and the remaining weights renormalised, so a day with
 * no reminders is scored purely on goals and tasks rather than being penalised
 * for an empty list. A day with nothing in any list scores `null` — an untouched
 * day is unrated, not 0%, and the circles stay empty.
 */
export function computeProductivity(
  entry: Pick<DayEntry, 'goals' | 'tasks' | 'reminders'>,
  weights: ProductivityWeights = PRODUCTIVITY_WEIGHTS,
): ProductivityResult {
  const lists = {
    goals: entry.goals.map((g) => g.Completed),
    tasks: entry.tasks.map((t) => t.Completed),
    reminders: entry.reminders.map((r) => r.Completed),
  } satisfies Record<ProductivityKind, (0 | 1)[]>;

  // Only non-empty lists with a positive weight take part.
  const active = COUNTED.filter((kind) => lists[kind].length > 0 && weights[kind] > 0);
  const totalWeight = active.reduce((sum, kind) => sum + weights[kind], 0);

  const parts: ProductivityPart[] = COUNTED.map((kind) => {
    const items = lists[kind];
    const completed = items.filter((c) => c === 1).length;
    return {
      kind,
      completed,
      total: items.length,
      rate: items.length === 0 ? null : completed / items.length,
      weight: active.includes(kind) && totalWeight > 0 ? weights[kind] / totalWeight : 0,
    };
  });

  if (totalWeight === 0) return { percent: null, rating: null, parts };

  const score = parts.reduce((sum, p) => sum + (p.rate ?? 0) * p.weight, 0);
  const percent = Math.round(score * 100);

  return { percent, rating: percentToRating(percent), parts };
}

/**
 * Maps 0-100 onto the spec's 1-5 scale (§4.7: 1 = Very Poor … 5 = Excellent)
 * in five equal bands. 0% is still a 1 rather than a 0 — the scale has no zero,
 * and "nothing scored yet" is represented by null, not by an empty rating.
 */
export function percentToRating(percent: number): ProductivityScore {
  const band = Math.ceil(percent / 20);
  return Math.min(5, Math.max(1, band)) as ProductivityScore;
}
