import type { ComponentProps } from 'react';
import { cx } from './cx';

/** Key hint, mono 11 px muted. */
export function Kbd({ className, ...rest }: ComponentProps<'kbd'>) {
  return <kbd className={cx('font-mono text-meta text-muted', className)} {...rest} />;
}
