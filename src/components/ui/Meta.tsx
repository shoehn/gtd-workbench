import type { ComponentProps } from 'react';
import { cx } from './cx';

/** Mono 11 px muted text: counts, dates, sources. */
export function Meta({ className, ...rest }: ComponentProps<'span'>) {
  return <span className={cx('font-mono text-meta text-muted', className)} {...rest} />;
}
