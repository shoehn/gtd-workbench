'use client';

import Link from 'next/link';
import { useOptimistic, useTransition, type ReactNode } from 'react';
import { completeAction, uncompleteAction } from '@/lib/actions';
import type { CalendarEntry } from '@/lib/api';
import { cx } from '../ui/cx';
import { KIND } from './blocks';

export interface AgendaDay {
  iso: string;
  /** `Saturday 26.09 · today` */
  title: string;
  /** `2 appointments · 1 deadline` */
  summary: string;
  entries: CalendarEntry[];
  /** Minutes since midnight on today's section: where the now line goes. */
  nowMin?: number;
}

const mono = 'font-mono text-meta text-muted';
const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const block = 'flex min-h-11 flex-col justify-center gap-0.5 rounded-chip px-2.5 py-2 text-ink no-underline';

/** Where a mirrored deadline comes from, by the list its link goes to. */
function origin(href: string): string {
  if (href.startsWith('/projects')) return 'from project';
  if (href.startsWith('/waiting')) return 'from Waiting For';
  if (href.startsWith('/next')) return 'from Next Actions';
  return 'from Calendar';
}

function length(start?: string, end?: string): string {
  if (!start || !end) return '';
  const m = toMin(end) - toMin(start);
  return m >= 60 && m % 60 === 0 ? `${m / 60} h` : m > 60 ? `${Math.floor(m / 60)} h ${m % 60}` : `${m} min`;
}

/** Phone calendar: day sections with "time | block" rows, drawn in the week grid's styles. */
export function Agenda({ days }: { days: AgendaDay[] }) {
  const [, startTransition] = useTransition();
  const [done, setDone] = useOptimistic(
    new Set(days.flatMap((d) => d.entries).filter((e) => 'done' in e && e.done).map((e) => e.id)) as ReadonlySet<string>,
    (cur, { id, on }: { id: string; on: boolean }) => {
      const next = new Set(cur);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    },
  );

  function toggle(e: Extract<CalendarEntry, { kind: 'dayaction' }>) {
    const on = !done.has(e.id);
    startTransition(async () => {
      setDone({ id: e.id, on });
      await (on ? completeAction(e.itemId) : uncompleteAction({ id: e.itemId, status: 'calendar' }));
    });
  }

  function body(e: CalendarEntry): ReactNode {
    switch (e.kind) {
      case 'appointment':
        return (
          <div className={cx(block, KIND.appointment)}>
            <span>{e.text}</span>
            <span className={mono}>{[length(e.start, e.end), `${e.calendar} calendar`].filter(Boolean).join(' · ')}</span>
          </div>
        );
      case 'timeblock': {
        const inner = (
          <>
            <span className={cx(e.done && 'text-muted line-through')}>
              {e.text}
              {e.recurring && ' ↻'}
            </span>
            <span className={mono}>time block{e.recurring ? ' · repeats weekly' : ` · ${length(e.start, e.end)}`}</span>
          </>
        );
        return e.href && !e.projected ? (
          <Link href={e.href} className={cx(block, KIND.timeblock)}>
            {inner}
          </Link>
        ) : (
          <div className={cx(block, KIND.timeblock)}>{inner}</div>
        );
      }
      case 'dayaction': {
        const ticked = done.has(e.id);
        return (
          <label className={cx(block, 'flex-row items-start justify-start gap-2', e.deadline ? KIND.deadline : KIND.dayaction)}>
            <input type="checkbox" checked={ticked} disabled={e.projected} onChange={() => toggle(e)} className="m-0 size-5 shrink-0" />
            <span className="flex flex-col gap-0.5">
              <span className={cx(ticked && 'text-muted line-through')}>
                {e.text}
                {e.recurring && ' ↻'}
              </span>
              <span className={cx('font-mono text-meta', e.deadline ? 'text-warn' : 'text-muted')}>
                {e.deadline ? 'DEADLINE · day action' : 'day action'}
              </span>
            </span>
          </label>
        );
      }
      case 'info':
        return <div className={cx(block, KIND.info)}>{e.text}</div>;
      case 'deadline':
        return (
          <Link href={e.href} className={cx(block, KIND.deadline)}>
            <span>{e.text}</span>
            <span className="font-mono text-meta text-warn">DEADLINE · {origin(e.href)}</span>
          </Link>
        );
    }
  }

  const time = (e: CalendarEntry) => ('start' in e && e.start ? e.start : undefined);

  return (
    <div className="flex min-h-full flex-col bg-panel lg:hidden">
      {days.map((d, n) => {
        // All-day entries first, then by time; the now line sits before the first entry after now.
        const rows = [...d.entries].sort((a, b) => (time(a) ?? '').localeCompare(time(b) ?? ''));
        const nowAt = d.nowMin === undefined ? -1 : rows.findIndex((e) => time(e) && toMin(time(e)!) > d.nowMin!);
        const nowLine = (
          <div key="now" aria-hidden="true" className="grid grid-cols-[52px_minmax(0,1fr)] gap-2.5 px-4">
            <span />
            <span className="h-0 border-t-2 border-warn" />
          </div>
        );
        return (
          <section key={d.iso} id={`day-${d.iso}`} aria-label={d.title}>
            <h2 className={cx('m-0 flex items-baseline gap-2 border-b border-line bg-ground px-4 pt-2.5 pb-1.5', n > 0 && 'border-t')}>
              <span className="text-sm font-semibold">{d.title}</span>
              <span className={cx(mono, 'font-normal')}>{d.summary}</span>
            </h2>
            {rows.map((e, i) => [
              i === nowAt && nowLine,
              <div key={e.id} className="grid grid-cols-[52px_minmax(0,1fr)] items-start gap-2.5 border-b border-line-soft px-4 py-3 last:border-b-0">
                <span className={cx(mono, 'pt-0.75')}>{time(e) ?? 'all day'}</span>
                {body(e)}
              </div>,
            ])}
            {d.nowMin !== undefined && nowAt === -1 && nowLine}
          </section>
        );
      })}
      {days.length === 0 && <p className={cx(mono, 'm-0 px-4 py-8 text-center')}>Nothing fixed in the next two weeks.</p>}
    </div>
  );
}
