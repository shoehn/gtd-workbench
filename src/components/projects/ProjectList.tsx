'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PROJECT_FILTERS, projectsHref, type ProjectFilter } from '@/lib/project-filter';
import { ContextChip } from '../ui/ContextChip';
import { cx } from '../ui/cx';
import { useMoreBelow } from '../ui/useMoreBelow';
import { Tag } from '../ui/Tag';

const DOT = { ok: 'bg-ok', stalled: 'bg-warn', someday: 'bg-control', completed: 'bg-control' };
const DOT_LABEL = { ok: 'has next action', stalled: 'stalled', someday: 'someday', completed: 'completed' };

/** One list row, already formatted on the server. */
export interface ProjectRow {
  id: string;
  title: string;
  href: string;
  /** ok = has next action; someday / completed projects are not judged. */
  state: 'ok' | 'stalled' | 'someday' | 'completed';
  /** Completed by Drop on Someday/Maybe rather than finished. */
  dropped?: boolean;
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
  const { scroller, list, moreBelow } = useMoreBelow();
  const go = (f: ProjectFilter) => router.replace(projectsHref(f), { scroll: false });


  return (
    <section aria-label="Project list" className="flex min-h-0 flex-col border-line bg-panel lg:border-r">
      <div role="group" aria-label="Filter projects" className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-2.5">
        {PROJECT_FILTERS.map((f) => (
          <ContextChip key={f} pressed={filter === f} onClick={() => go(f)} className="px-1.5!">
            {f}
          </ContextChip>
        ))}
        <span className="grow" />
        <button
          type="button"
          aria-pressed={filter === 'completed'}
          onClick={() => go(filter === 'completed' ? 'active' : 'completed')}
          className={cx(
            'h-(--wb-hit-desktop) whitespace-nowrap rounded px-1.5 font-mono text-xs',
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
                <span className={cx('mt-1.25 size-2 rounded-full', DOT[r.state])}>
                  <span className="sr-only">{DOT_LABEL[r.state]}</span>
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className={selected ? 'font-semibold' : 'font-medium'}>
                    {r.title}
                    {(r.state === 'someday' || r.state === 'completed') && (
                      <Tag className="ml-1.5 align-[1px]">{r.dropped ? 'dropped' : r.state}</Tag>
                    )}
                  </span>
                  {r.line && <span className={cx('truncate text-xs', r.state === 'stalled' ? 'text-warn' : 'text-muted')}>{r.line}</span>}
                </span>
                <span className={cx('font-mono text-meta', r.state === 'stalled' ? 'text-warn' : 'text-muted')}>{r.nextActions}</span>
                <span className={cx('font-mono text-meta', r.reviewWarn ? 'text-warn' : 'text-muted')}>{r.reviewed}</span>
              </Link>
            );
          })}
        </div>
        {rows.length === 0 && (
          <p className="m-0 px-3 py-8 text-center font-mono text-meta text-muted">
            {filter === 'stalled'
              ? 'No stalled projects — every one has a next action.'
              : filter === 'someday'
                ? 'No projects on hold.'
                : 'No projects here.'}
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
