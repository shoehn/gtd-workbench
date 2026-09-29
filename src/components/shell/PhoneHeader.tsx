import Link from 'next/link';
import type { ReactNode } from 'react';
import { cx } from '../ui/cx';

/** 36 px square header button; the ::after grows the touch target to 44 px. */
export const PHONE_ICON_BTN =
  'relative inline-flex size-9 shrink-0 items-center justify-center rounded border border-control bg-panel text-ink no-underline after:absolute after:-inset-1';

/** Top-bar "›" on phone: to the Inbox with the rapid log focused. */
export function CaptureLink() {
  return (
    <Link href="/inbox?capture=1" aria-label="Capture to inbox" className={cx(PHONE_ICON_BTN, 'font-mono text-lg')}>
      ›
    </Link>
  );
}

interface PhoneHeaderProps {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  /** Rows under the title: chips, tabs, the rapid log. */
  children?: ReactNode;
}

/**
 * Phone header: 58 px left empty for the status bar (never drawn), then the title row and
 * whatever the screen stacks under it.
 */
export function PhoneHeader({ title, meta, actions, back, children }: PhoneHeaderProps) {
  return (
    <header className="flex shrink-0 flex-col gap-2.5 border-b border-line bg-panel px-4 pt-[58px] pb-2.5 lg:hidden">
      <div className="flex min-h-9 items-center gap-2.5">
        {back && (
          <Link href={back.href} aria-label={`Back to ${back.label}`} className={cx(PHONE_ICON_BTN, 'text-lg')}>
            ←
          </Link>
        )}
        <h1 className="m-0 min-w-0 truncate text-(length:--wb-text-title-phone) font-semibold">{title}</h1>
        {meta && <span className="min-w-0 truncate font-mono text-xs text-muted">{meta}</span>}
        <div className="grow" />
        {actions}
      </div>
      {children}
    </header>
  );
}
