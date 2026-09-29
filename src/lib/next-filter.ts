// Next Actions filters, kept in the URL: `?ctx=@computer,@calls&time=60&energy=low`.
import type { Energy, Item, Priority, TimeBucket } from './model';

export interface NextFilter {
  /** Any of these contexts; empty = all. */
  contexts: string[];
  /** Time ≤ this bucket. */
  time?: TimeBucket;
  energy?: Energy;
}

/** The time chips on the filter bar. */
export const TIME_FILTERS: TimeBucket[] = [15, 60];
/** The energy chips on the filter bar. */
export const ENERGY_FILTERS: Energy[] = ['focus', 'low'];

const TIMES: TimeBucket[] = [15, 30, 60, 120];
const ENERGIES: Energy[] = ['focus', 'normal', 'low'];

type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Read the filter from search params. Unknown values are dropped, never an error. */
export function parseFilter(params: Params, contexts: string[]): NextFilter {
  const ctx = (first(params.ctx) ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter((c) => contexts.includes(c));
  const time = Number(first(params.time));
  const energy = first(params.energy) as Energy | undefined;
  return {
    contexts: [...new Set(ctx)],
    ...(TIMES.includes(time as TimeBucket) && { time: time as TimeBucket }),
    ...(energy && ENERGIES.includes(energy) && { energy }),
  };
}

/** The query string for a filter, `@` and `,` left readable: `?ctx=@computer,@calls&time=60`. */
export function filterQuery(f: NextFilter): string {
  const parts: string[] = [];
  if (f.contexts.length) parts.push(`ctx=${f.contexts.map(encodeURIComponent).join(',').replaceAll('%40', '@')}`);
  if (f.time) parts.push(`time=${f.time}`);
  if (f.energy) parts.push(`energy=${f.energy}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export function isFiltered(f: NextFilter): boolean {
  return f.contexts.length > 0 || !!f.time || !!f.energy;
}

export function matches(item: Item, f: NextFilter): boolean {
  if (f.contexts.length && !(item.context && f.contexts.includes(item.context))) return false;
  if (f.time && !(item.time && item.time <= f.time)) return false;
  if (f.energy && item.energy !== f.energy) return false;
  return true;
}

const PRIO_RANK: Record<Priority, number> = { A: 0, B: 1, C: 2 };

/** A1, A2 … B1 … C, then by capture. */
export function byPriority(a: Item, b: Item): number {
  return (
    PRIO_RANK[a.priority ?? 'C'] - PRIO_RANK[b.priority ?? 'C'] ||
    (a.priorityNo ?? Infinity) - (b.priorityNo ?? Infinity) ||
    a.capturedAt.localeCompare(b.capturedAt)
  );
}

/**
 * One group per context in the order of the contexts list (unknown contexts after, then
 * items without one under ""). Rows by priority; empty groups are left out.
 */
export function groupByContext(items: Item[], contexts: string[]): { context: string; items: Item[] }[] {
  const order = [...contexts];
  for (const i of items) if (!order.includes(i.context ?? '')) order.push(i.context ?? '');
  return order
    .map((context) => ({ context, items: items.filter((i) => (i.context ?? '') === context).sort(byPriority) }))
    .filter((g) => g.items.length > 0);
}
