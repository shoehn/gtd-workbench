import type { ComponentProps } from 'react';
import { cx } from './cx';

interface RowProps extends ComponentProps<'div'> {
  /** CSS grid-template-columns, e.g. "32px minmax(0,1fr) 96px". */
  cols: string;
}

/** Grid row inside a Card: padding 8/12, soft divider. */
export function Row({ cols, className, style, ...rest }: RowProps) {
  return (
    <div
      className={cx(
        'grid items-center gap-3 border-b border-line-soft px-(--wb-row-pad-x) py-(--wb-row-pad-y)',
        className,
      )}
      style={{ gridTemplateColumns: cols, ...style }}
      {...rest}
    />
  );
}
