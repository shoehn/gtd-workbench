'use client';

import { cx } from '../ui/cx';
import { OPEN_PALETTE } from './target';

/** The phone header's way into the palette (desktop: ⌘K / Ctrl-K). */
export function PaletteButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      aria-label="Command palette"
      onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE))}
      className={cx(className, 'w-auto px-2 font-mono text-xs')}
    >
      ⌘K
    </button>
  );
}
