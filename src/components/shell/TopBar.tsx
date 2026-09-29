import Link from 'next/link';
import type { ReactNode } from 'react';
import { CaptureField } from './CaptureField';

interface TopBarProps {
  title: ReactNode;
  meta?: ReactNode;
  /** Right slot; defaults to the "Capture to inbox" field. Pass `null` for none. */
  right?: ReactNode;
  /** Mono link before the title, e.g. `← Inbox`. */
  back?: { href: string; label: string };
}

export function TopBar({ title, meta, right = <CaptureField />, back }: TopBarProps) {
  return (
    <header className="flex h-(--wb-topbar-h) shrink-0 items-center gap-4 border-b border-line bg-panel px-4 lg:px-5">
      {back && (
        <Link href={back.href} className="shrink-0 font-mono text-meta text-muted no-underline hover:text-ink">
          ← {back.label}
        </Link>
      )}
      <h1 className="m-0 shrink-0 text-(length:--wb-text-title-phone) font-semibold lg:text-title">{title}</h1>
      {meta && <span className="hidden font-mono text-meta text-muted sm:inline">{meta}</span>}
      <div className="hidden grow lg:block" />
      {right}
    </header>
  );
}
