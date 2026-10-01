'use client';

import { useSyncExternalStore } from 'react';

/** The row under a board's cursor: the palette offers that row's own actions. */
export type PaletteTarget =
  | { kind: 'next'; id: string; text: string; context: string; projectId?: string }
  | { kind: 'waiting'; id: string; text: string };

let target: PaletteTarget | null = null;
const listeners = new Set<() => void>();

/** Boards call this when their cursor moves (null when it leaves). */
export function setPaletteTarget(next: PaletteTarget | null): void {
  if (target?.kind === next?.kind && target?.id === next?.id && target?.text === next?.text) return;
  target = next;
  listeners.forEach((l) => l());
}

export function usePaletteTarget(): PaletteTarget | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => target,
    () => null,
  );
}

/** Opens the palette from anywhere (the phone header's ⌘K button). */
export const OPEN_PALETTE = 'gtd:open-palette';
