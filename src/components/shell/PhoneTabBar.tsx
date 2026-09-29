'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cx } from '../ui/cx';

// Stroke icons as drawn in the phone mockups (24×24, stroke 2).
const TABS: { href: string; label: string; icon: ReactNode }[] = [
  { href: '/inbox', label: 'Inbox', icon: <><path d="M3 13l2-8h14l2 8v6H3z" /><path d="M3 13h5l2 3h4l2-3h5" /></> },
  { href: '/next', label: 'Next', icon: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></> },
  { href: '/projects', label: 'Projects', icon: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /> },
  { href: '/waiting', label: 'Waiting', icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  { href: '/review', label: 'Review', icon: <><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></> },
];

export function PhoneTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Lists"
      className="fixed inset-x-0 bottom-0 grid h-(--wb-tabbar-h) grid-cols-5 gap-1 border-t border-line bg-rail px-2 pt-2 pb-6"
    >
      {TABS.map(({ href, label, icon }) => {
        const current = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? 'page' : undefined}
            className={cx(
              'flex flex-col items-center justify-center gap-1 rounded text-meta no-underline',
              current ? 'bg-panel font-semibold text-ink' : 'text-muted',
            )}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {icon}
            </svg>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
