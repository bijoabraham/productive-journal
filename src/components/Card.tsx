import type { ReactNode } from 'react';

interface CardProps {
  title: string;
  children: ReactNode;
  /** Rendered at the right of the header — counters, small controls. */
  aside?: ReactNode;
  /** Extra classes for the section shell (sizing). */
  className?: string;
  /** Extra classes for the scrolling content region. */
  bodyClassName?: string;
}

/**
 * The section shell every panel uses.
 *
 * Flat by design, matching UI_Prototype_Final.jpg: no raised surface, no
 * shadow, no radius — sections sit directly on the canvas and are separated by
 * whitespace alone. Only the schedule draws a visible frame.
 */
export default function Card({ title, children, aside, className = '', bodyClassName = '' }: CardProps) {
  return (
    <section className={`flex min-h-0 flex-col ${className}`}>
      <header className="mb-2 flex shrink-0 items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
        {aside ? <div className="text-xs text-faint">{aside}</div> : null}
      </header>
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
