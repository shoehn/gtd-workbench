import type { ComponentProps } from 'react';
import { cx } from './cx';

/** 10 px tracked mono label, uppercase. */
export function SectionHead({ className, ...rest }: ComponentProps<'h2'>) {
  return (
    <h2
      className={cx('font-mono text-label font-normal uppercase tracking-[0.1em] text-muted', className)}
      {...rest}
    />
  );
}
