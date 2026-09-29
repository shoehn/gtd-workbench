'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cx } from '../ui/cx';

interface NavLinkProps {
  href: string;
  children: ReactNode;
  /** Right-aligned mono badge (count or state). */
  badge?: ReactNode;
  badgeWarn?: boolean;
  /** Bordered variant used for Weekly Review. */
  boxed?: boolean;
  /** Links whose target is shared with another entry never show as current. */
  noCurrent?: boolean;
}

export function NavLink({ href, children, badge, badgeWarn, boxed, noCurrent }: NavLinkProps) {
  const pathname = usePathname();
  const current = !noCurrent && pathname === href;
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={cx(
        'flex items-center justify-between rounded px-2.5 text-ink no-underline hover:bg-panel/60',
        boxed ? 'border py-2' : 'py-1.5',
        boxed && (current ? 'border-ink' : 'border-control'),
        current && 'bg-panel font-semibold hover:bg-panel',
      )}
    >
      {children}
      <span className={cx('font-mono text-meta font-normal', badgeWarn ? 'text-warn' : 'text-muted')}>{badge}</span>
    </Link>
  );
}
