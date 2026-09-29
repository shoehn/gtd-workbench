import type { ComponentProps } from 'react';
import { cx } from './cx';

interface ContextChipProps extends Omit<ComponentProps<'button'>, 'aria-pressed'> {
  pressed?: boolean;
}

/** Mono 12 px toggle pill for a context or filter value. */
export function ContextChip({ pressed = false, className, ...rest }: ContextChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cx(
        'h-(--wb-hit-desktop) rounded border px-2.5 font-mono text-xs',
        pressed ? 'border-ink bg-ink text-panel' : 'border-control bg-panel text-ink hover:border-muted',
        className,
      )}
      {...rest}
    />
  );
}
