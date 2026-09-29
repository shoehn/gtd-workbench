'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { PROJECT_FILTERS, projectsHref, type ProjectFilter } from '@/lib/project-filter';
import { ContextChip } from '../ui/ContextChip';
import { cx } from '../ui/cx';

/** One list row, already formatted on the server. */
export interface ProjectRow {
  id: string;
  title: string;
  href: string;
  stalled: boolean;
  /** `→ first next action`, or the reason it is stalled. */
  line?: string;
  nextActions: number;
  reviewed: string; // `3 d ago` | `—`
  reviewWarn: boolean; // > 14 d
}

const COLS = 'grid grid-cols-[10px_minmax(0,1fr)_40px_56px] gap-2.5';

export function ProjectList({
  rows,
  selectedId,
  filter,
  completed,
}: {
  rows: ProjectRow[];
  selectedId?: string;
  filter: ProjectFilter;
  completed: number;
}) {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(0);
  const go = (f: ProjectFilter) => router.replace(projectsHref(f), { scroll: false });

  // "n more": rows not fully visible under the scroll viewport.
  useEffect(() => {
    const box = scroller.current;
    const inner = list.current;
    if (!box || !inner) return;
    const measure = () => {
      const bottom = box.scrollTop + box.clientHeight + 1;
      const kids = Array.from(inner.children) as HTMLElement[];
      setMoreBelow(kids.filter((el) => el.offsetTop + el.offsetHeight > bottom).length);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    ro.observe(inner);
    box.addEventListener('scroll', measure, { passive: true });
    return () => {
      ro.disconnect();
      box.removeEventListener('scroll', measure);
    };
  }, []);

  return (
    <section aria-label="Project list" className="flex min-h-0 flex-col border-line bg-panel lg:border-r">
      <div role="group" aria-label="Filter projects" className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2.5">
        {PROJECT_FILTERS.map((f) => (
          <ContextChip key={f} pressed={filter === f} onClick={() => go(f)}>
            {f}
          </ContextChip>
        ))}
        <span className="grow" />
        <button
          type="button"
          aria-pressed={filter === 'completed'}
          onClick={() => go(filter === 'completed' ? 'active' : 'completed')}
          className={cx(
            'h-(--wb-hit-desktop) rounded px-2 font-mono text-xs',
            filter === 'completed' ? 'bg-ink text-panel' : 'text-muted hover:text-ink',
          )}
        >
          completed {completed}
        </button>
      </div>
      <div aria-hidden="true" className={cx(COLS, 'border-b border-line-soft px-3 py-1.5 font-mono text-label tracking-[0.1em] text-muted')}>
        <span />
        <span>PROJECT · NEXT ACTION</span>
        <span>NA</span>
        <span>REVIEW</span>
      </div>
      <div ref={scroller} className="relative min-h-0 grow overflow-y-auto">
        <div ref={list}>
          {rows.map((r) => {
            const selected = r.id === selectedId;
            return (
              <Link
                key={r.id}
                href={r.href}
                scroll={false}
                aria-current={selected ? 'true' : undefined}
                className={cx(COLS, 'items-start border-b border-line-soft px-3 py-2.25 text-ink no-underline', selected ? 'bg-accent-tint' : 'hover:bg-ground/60')}
              >
                <span className={cx('mt-1.25 size-2 rounded-full', r.stalled ? 'bg-warn' : 'bg-ok')}>
                  <span className="sr-only">{r.stalled ? 'stalled' : 'has next action'}</span>
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className={selected ? 'font-semibold' : 'font-medium'}>{r.title}</span>
                  {r.line && <span className={cx('truncate text-xs', r.stalled ? 'text-warn' : 'text-muted')}>{r.line}</span>}
                </span>
                <span className={cx('font-mono text-meta', r.nextActions ? 'text-muted' : 'text-warn')}>{r.nextActions}</span>
                <span className={cx('font-mono text-meta', r.reviewWarn ? 'text-warn' : 'text-muted')}>{r.reviewed}</span>
              </Link>
            );
          })}
        </div>
        {rows.length === 0 && (
          <p className="m-0 px-3 py-8 text-center font-mono text-meta text-muted">
            {filter === 'stalled' ? 'No stalled projects — every one has a next action.' : 'No projects here.'}
          </p>
        )}
      </div>
      <div className="mt-auto flex shrink-0 gap-1.5 border-t border-line px-3 py-2 font-mono text-meta text-muted">
        {moreBelow > 0 && <span>{moreBelow} more ·</span>}
        <span><span className="text-ok">●</span> has next action ·</span>
        <span><span className="text-warn">●</span> stalled</span>
      </div>
    </section>
  );
}
