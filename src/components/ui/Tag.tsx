import type { ComponentProps } from 'react';
import { cx } from './cx';

const variants = {
  muted: 'border-line text-muted',
  warn: 'border-warn text-warn',
  ok: 'border-ok text-ok',
  accent: 'border-accent text-accent',
};

interface TagProps extends ComponentProps<'span'> {
  variant?: keyof typeof variants;
}

/** Mono 11 px label. */
export function Tag({ variant = 'muted', className, ...rest }: TagProps) {
  return (
    <span
      className={cx('inline-block rounded-chip border px-1 font-mono text-meta', variants[variant], className)}
      {...rest}
    />
  );
}
