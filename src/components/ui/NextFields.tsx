'use client';

import type { NextFields as Fields } from '@/lib/api';
import { fmtTime } from '@/lib/format';
import type { Energy, Priority, TimeBucket } from '@/lib/model';
import { cx } from './cx';

export const TIMES: TimeBucket[] = [15, 30, 60, 120];
export const ENERGIES: Energy[] = ['focus', 'normal', 'low'];
export const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'A', label: 'A — must this week' },
  { value: 'B', label: 'B — should' },
  { value: 'C', label: 'C — could' },
];

/** The same defaults Clarify step 4 starts from. */
export function defaultFields(contexts: string[]): Fields {
  return { context: contexts[0], priority: 'B', time: 30, energy: 'normal' };
}

const selectCls =
  'h-(--wb-hit-phone) rounded border border-control bg-panel px-1.5 font-mono text-meta text-ink outline-none focus:border-accent focus:shadow-ring lg:h-7';

/** Step-4 fields for a next action (context, priority, time, energy) in one compact row. */
export function NextFields({
  contexts,
  value,
  onChange,
  className,
}: {
  contexts: string[];
  value: Fields;
  onChange(value: Fields): void;
  className?: string;
}) {
  const set = <K extends keyof Fields>(key: K, v: Fields[K]) => onChange({ ...value, [key]: v });
  return (
    <div className={cx('flex flex-wrap items-center gap-1.5', className)}>
      <select aria-label="Context" value={value.context} onChange={(e) => set('context', e.target.value)} className={selectCls}>
        {contexts.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <select aria-label="Priority" value={value.priority} onChange={(e) => set('priority', e.target.value as Priority)} className={selectCls}>
        {PRIORITIES.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>
      <select aria-label="Time" value={value.time} onChange={(e) => set('time', Number(e.target.value) as TimeBucket)} className={selectCls}>
        {TIMES.map((t) => (
          <option key={t} value={t}>{fmtTime(t)}</option>
        ))}
      </select>
      <select aria-label="Energy" value={value.energy} onChange={(e) => set('energy', e.target.value as Energy)} className={selectCls}>
        {ENERGIES.map((v) => (
          <option key={v} value={v}>{v}</option>
        ))}
      </select>
    </div>
  );
}
