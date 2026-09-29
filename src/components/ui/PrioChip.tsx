import type { Priority } from '@/lib/model';
import { cx } from './cx';

const variants: Record<Priority, string> = {
  A: 'bg-warn text-panel font-medium',
  B: 'bg-muted-bg text-ink font-medium',
  C: 'border border-line text-muted',
};

/** Priority chip: A1 / B3 / C. */
export function PrioChip({ priority, no }: { priority: Priority; no?: number }) {
  return (
    <span
      className={cx(
        'inline-block min-w-7 rounded-chip px-1 py-px text-center font-mono text-meta',
        variants[priority],
      )}
    >
      {priority}
      {no}
    </span>
  );
}
