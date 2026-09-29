'use client';

import { useRouter } from 'next/navigation';
import { fmtMins } from '@/lib/format';
import type { Energy, TimeBucket } from '@/lib/model';
import { ENERGY_FILTERS, TIME_FILTERS, filterQuery, isFiltered, type NextFilter } from '@/lib/next-filter';
import { ContextChip } from '../ui/ContextChip';

const label = 'mr-1.5 font-mono text-label tracking-[0.1em] text-muted';
const divider = <span aria-hidden="true" className="mx-1.5 h-4.5 w-px bg-line" />;

/** Context (multi), time ≤ bucket, energy. The state lives in the URL, so it is shareable. */
export function FilterBar({ contexts, filter }: { contexts: string[]; filter: NextFilter }) {
  const router = useRouter();
  const go = (f: NextFilter) => router.replace(`/next${filterQuery(f)}`, { scroll: false });

  const toggleContext = (c: string) =>
    go({ ...filter, contexts: filter.contexts.includes(c) ? filter.contexts.filter((x) => x !== c) : [...filter.contexts, c] });
  const toggleTime = (t: TimeBucket) => go({ ...filter, time: filter.time === t ? undefined : t });
  const toggleEnergy = (e: Energy) => go({ ...filter, energy: filter.energy === e ? undefined : e });

  return (
    <div
      role="group"
      aria-label="Filters"
      className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line bg-panel px-4 py-2.5 lg:px-5"
    >
      <span className={label}>CONTEXT</span>
      {contexts.map((c) => (
        <ContextChip key={c} pressed={filter.contexts.includes(c)} onClick={() => toggleContext(c)}>
          {c}
        </ContextChip>
      ))}
      {divider}
      <span className={label}>TIME</span>
      {TIME_FILTERS.map((t) => (
        <ContextChip key={t} pressed={filter.time === t} onClick={() => toggleTime(t)}>
          ≤{fmtMins(t)}
        </ContextChip>
      ))}
      {divider}
      <span className={label}>ENERGY</span>
      {ENERGY_FILTERS.map((e) => (
        <ContextChip key={e} pressed={filter.energy === e} onClick={() => toggleEnergy(e)}>
          {e}
        </ContextChip>
      ))}
      <span className="grow" />
      <button
        type="button"
        disabled={!isFiltered(filter)}
        onClick={() => go({ contexts: [] })}
        className="h-(--wb-hit-desktop) rounded px-2 text-xs text-accent hover:text-accent-hover disabled:text-muted"
      >
        Clear
      </button>
    </div>
  );
}
