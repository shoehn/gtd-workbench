'use client';

import { useRef, useState, type PointerEvent, type MouseEvent } from 'react';

const SWIPE_PX = 80;
const DECIDE_PX = 8;

/**
 * Horizontal swipe on a row with pointer events (no library). Vertical drags scroll as usual.
 * Past 80 px the row fires `onRight` / `onLeft` on release; a swipe never also counts as a tap.
 */
export function useSwipe({ onLeft, onRight }: { onLeft?(): void; onRight?(): void }) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const horizontal = useRef<boolean | null>(null);
  const swiped = useRef(false);

  function reset() {
    start.current = null;
    horizontal.current = null;
    setDx(0);
  }

  const clamp = (x: number) => Math.max(onLeft ? -120 : 0, Math.min(onRight ? 120 : 0, x));

  return {
    dx,
    /** Which action a release would fire now. */
    armed: dx >= SWIPE_PX ? ('right' as const) : dx <= -SWIPE_PX ? ('left' as const) : null,
    bind: {
      onPointerDown(e: PointerEvent<HTMLElement>) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        start.current = { x: e.clientX, y: e.clientY };
        horizontal.current = null;
        swiped.current = false;
      },
      onPointerMove(e: PointerEvent<HTMLElement>) {
        if (!start.current) return;
        const x = e.clientX - start.current.x;
        const y = e.clientY - start.current.y;
        if (horizontal.current === null && Math.max(Math.abs(x), Math.abs(y)) > DECIDE_PX) {
          horizontal.current = Math.abs(x) > Math.abs(y);
          // Keep the row when the finger leaves it; a pointer that already ended cannot be captured.
          if (horizontal.current && e.currentTarget.hasPointerCapture?.(e.pointerId) === false) {
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {}
          }
        }
        if (horizontal.current) {
          swiped.current = true;
          setDx(clamp(x));
        }
      },
      onPointerUp() {
        if (horizontal.current) {
          if (dx >= SWIPE_PX) onRight?.();
          else if (dx <= -SWIPE_PX) onLeft?.();
        }
        reset();
      },
      onPointerCancel: reset,
      onClickCapture(e: MouseEvent<HTMLElement>) {
        if (!swiped.current) return;
        swiped.current = false;
        e.preventDefault();
        e.stopPropagation();
      },
      style: { transform: dx ? `translateX(${dx}px)` : undefined, touchAction: 'pan-y' as const },
    },
  };
}
