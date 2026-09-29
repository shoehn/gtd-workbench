import type { ComponentProps } from 'react';
import { cx } from './cx';

/** White panel with line border and radius. */
export function Card({ className, ...rest }: ComponentProps<'section'>) {
  return <section className={cx('rounded border border-line bg-panel', className)} {...rest} />;
}
