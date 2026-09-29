'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { cx } from './cx';

/** Phone chip: 32 px (28 px in the second row) drawn, 44 px to the touch. */
export function PhoneChip({ pressed, small, onClick, children }: { pressed: boolean; small?: boolean; onClick(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cx(
        'relative shrink-0 rounded border px-2.5 font-mono text-xs whitespace-nowrap after:absolute after:-inset-x-0.5',
        small ? 'h-7 after:-inset-y-2' : 'h-8 after:-inset-y-1.5',
        pressed ? 'border-ink bg-ink text-panel' : 'border-control bg-panel text-ink',
      )}
    >
      {children}
    </button>
  );
}

/** A row of filter chips that each replace the URL (the filter lives there). */
export function PhoneChipLinks({ label, chips }: { label: string; chips: { label: ReactNode; href: string; pressed: boolean }[] }) {
  const router = useRouter();
  return (
    <div role="group" aria-label={label} className="-mx-4 -my-1.5 flex gap-1.5 overflow-x-auto px-4 py-1.5 [scrollbar-width:none]">
      {chips.map((c) => (
        <PhoneChip key={c.href} pressed={c.pressed} onClick={() => router.replace(c.href, { scroll: false })}>
          {c.label}
        </PhoneChip>
      ))}
    </div>
  );
}
