'use client';

import type { ReactNode } from 'react';
import { cx } from './cx';
import { useSwipe } from './useSwipe';

interface SwipeRowProps {
  /** Swipe → (finger moves right). */
  onRight?(): void;
  /** Swipe ←. */
  onLeft?(): void;
  /** What each direction does, shown behind the row while it moves. */
  rightLabel?: string;
  leftLabel?: string;
  className?: string;
  children: ReactNode;
}

/** A phone list row that can be swiped either way; the action shows underneath as it moves. */
export function SwipeRow({ onRight, onLeft, rightLabel, leftLabel, className, children }: SwipeRowProps) {
  const { dx, armed, bind } = useSwipe({ onLeft, onRight });
  return (
    <div className="relative overflow-hidden">
      {dx !== 0 && (
        <div aria-hidden="true" className="absolute inset-0 flex items-center justify-between bg-ground px-4 font-mono text-meta">
          <span className={armed === 'right' ? 'text-accent' : 'text-muted'}>{dx > 0 && rightLabel}</span>
          <span className={armed === 'left' ? 'text-warn' : 'text-muted'}>{dx < 0 && leftLabel}</span>
        </div>
      )}
      <div {...bind} className={cx('relative select-none', dx === 0 && 'transition-transform', className)}>
        {children}
      </div>
    </div>
  );
}
