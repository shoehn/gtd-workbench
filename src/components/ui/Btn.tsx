import Link from 'next/link';
import type { ComponentProps } from 'react';
import { cx } from './cx';

const variants = {
  primary: 'border border-accent bg-accent font-medium text-panel hover:bg-accent-hover',
  outline: 'border border-control bg-panel text-ink hover:border-muted',
  ghost: 'border border-transparent bg-transparent text-accent hover:text-accent-hover',
};
const sizes = {
  // Below lg every button is a 44 px touch target (SPEC §7).
  sm: 'h-(--wb-hit-phone) px-2.5 text-xs lg:h-(--wb-hit-desktop)',
  md: 'h-(--wb-hit-phone) px-3 lg:h-(--wb-hit-input)',
  lg: 'h-(--wb-hit-phone) px-4 text-(length:--wb-text-body-phone)',
};

type BtnProps = { variant?: keyof typeof variants; size?: keyof typeof sizes } & (
  | ({ href?: undefined } & ComponentProps<'button'>)
  | ({ href: string } & ComponentProps<typeof Link>)
);

/** Button, or a link styled as one when `href` is given. */
export function Btn({ variant = 'outline', size = 'md', className, ...rest }: BtnProps) {
  const cls = cx(
    'inline-flex items-center justify-center gap-2 rounded no-underline disabled:opacity-50',
    variants[variant],
    sizes[size],
    className,
  );
  if (rest.href !== undefined) return <Link className={cls} {...(rest as ComponentProps<typeof Link>)} />;
  return <button type="button" className={cls} {...(rest as ComponentProps<'button'>)} />;
}
