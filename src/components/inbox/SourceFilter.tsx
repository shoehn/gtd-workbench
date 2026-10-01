'use client';

import { useRouter } from 'next/navigation';
import { SOURCE_FILTERS, type SourceFilterValue } from '@/lib/inbox-filter';
import { ContextChip } from '../ui/ContextChip';
import { PhoneChipLinks } from '../ui/PhoneChip';

const href = (s?: SourceFilterValue) => (s ? `/inbox?source=${s}` : '/inbox');
const label = 'mr-1.5 font-mono text-label tracking-[0.1em] text-muted';

/** The inbox's source filter on desktop: all · typed · email · share. Lives in the URL. */
export function SourceFilter({ value }: { value?: SourceFilterValue }) {
  const router = useRouter();
  const go = (s?: SourceFilterValue) => router.replace(href(s), { scroll: false });
  return (
    <div role="group" aria-label="Source" className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line bg-panel px-4 py-2.5 lg:px-5">
      <span className={label}>SOURCE</span>
      <ContextChip pressed={!value} onClick={() => go()}>
        all
      </ContextChip>
      {SOURCE_FILTERS.map((s) => (
        <ContextChip key={s} pressed={value === s} onClick={() => go(s)}>
          {s}
        </ContextChip>
      ))}
    </div>
  );
}

export function PhoneSourceFilter({ value }: { value?: SourceFilterValue }) {
  return (
    <PhoneChipLinks
      label="Source"
      chips={[{ label: 'all', href: href(), pressed: !value }, ...SOURCE_FILTERS.map((s) => ({ label: s, href: href(s), pressed: value === s }))]}
    />
  );
}
