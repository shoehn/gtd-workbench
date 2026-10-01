// The inbox's source filter (SPEC §3.1): all · typed · email · share, kept in `?source=`.
export const SOURCE_FILTERS = ['typed', 'email', 'share'] as const;
export type SourceFilterValue = (typeof SOURCE_FILTERS)[number];

/** `?source=` → a filter value, or undefined for all (unknown values included). */
export function sourceFilter(param: string | string[] | undefined): SourceFilterValue | undefined {
  return SOURCE_FILTERS.find((s) => s === param);
}
