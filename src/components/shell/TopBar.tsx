import type { ReactNode } from 'react';
import { CaptureField } from './CaptureField';

interface TopBarProps {
  title: ReactNode;
  meta?: ReactNode;
  /** Right slot; defaults to the "Capture to inbox" field. Pass `null` for none. */
  right?: ReactNode;
}

export function TopBar({ title, meta, right = <CaptureField /> }: TopBarProps) {
  return (
    <header className="flex h-(--wb-topbar-h) shrink-0 items-center gap-4 border-b border-line bg-panel px-4 lg:px-5">
      <h1 className="m-0 shrink-0 text-(length:--wb-text-title-phone) font-semibold lg:text-title">{title}</h1>
      {meta && <span className="hidden font-mono text-meta text-muted sm:inline">{meta}</span>}
      <div className="hidden grow lg:block" />
      {right}
    </header>
  );
}
