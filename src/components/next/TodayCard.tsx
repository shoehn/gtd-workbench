import Link from 'next/link';
import type { LandscapeEntry } from '@/lib/api';
import { Card } from '../ui/Card';
import { cx } from '../ui/cx';

/** Today's hard landscape, read-only; the calendar owns it. */
export function TodayCard({ day, entries }: { day: string; entries: LandscapeEntry[] }) {
  return (
    <Card aria-labelledby="today-head" className="flex flex-col">
      <div className="flex items-baseline gap-2 border-b border-line px-3 py-2.5">
        <h2 id="today-head" className="m-0 text-body font-semibold">Today</h2>
        <span className="font-mono text-meta text-muted">{day} · hard landscape</span>
        <Link href="/calendar" className="ml-auto text-xs no-underline">
          Week →
        </Link>
      </div>
      {entries.length > 0 ? (
        <ul className="m-0 grid list-none grid-cols-[52px_minmax(0,1fr)] gap-x-2.5 gap-y-1 px-3 py-2.5">
          {entries.map((e) => (
            <li key={e.id} className="contents">
              <span className="pt-0.5 font-mono text-meta text-muted">{e.time ?? 'all day'}</span>
              <span className={cx(e.done && 'text-muted line-through')}>
                {e.text}
                {e.deadline && <span className="ml-1 font-mono text-meta text-warn">deadline</span>}
                {e.kind === 'tickler' && <span className="ml-1 font-mono text-meta text-muted">info</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 px-3 py-2.5 font-mono text-meta text-muted">Nothing fixed today.</p>
      )}
      <p className="m-0 border-t border-line-soft px-3 py-2 font-mono text-meta text-muted">
        Calendar holds only what must happen today. Everything else lives on the lists.
      </p>
    </Card>
  );
}
