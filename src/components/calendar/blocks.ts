import type { CalendarEntry } from '@/lib/api';

/** How each of the five kinds is drawn (SPEC §3.6); the legend's swatches use the same classes. */
export const KIND: Record<CalendarEntry['kind'], string> = {
  appointment: 'bg-muted-bg border-l-3 border-l-muted',
  timeblock: 'bg-panel border border-accent border-l-3',
  dayaction: 'bg-panel border border-ink',
  info: 'bg-ground border border-dashed border-control text-muted',
  deadline: 'bg-panel border border-warn',
};

/** Shared box of every block on the grid. */
export const BLOCK = 'box-border rounded-chip px-1.5 py-1 text-xs leading-[1.3]';

// Drag payloads. Next Actions rows set DRAG_ITEM; blocks on the grid add the other two.
/** The item id. */
export const DRAG_ITEM = 'application/x-gtd-item';
/** Length in minutes of a block being moved; absent for a new block (the action's time estimate applies). */
export const DRAG_MINUTES = 'application/x-gtd-minutes';
/** Present when the item may also land in the day-only strip (calendar items). */
export const DRAG_DAY_ONLY = 'application/x-gtd-day-only';
