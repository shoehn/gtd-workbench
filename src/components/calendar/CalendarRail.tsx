import Link from 'next/link';
import type { CalendarEntry } from '@/lib/api';
import { Card } from '../ui/Card';
import { cx } from '../ui/cx';
import { KIND } from './blocks';

export interface RailDeadline {
  id: string;
  date: string; // `03.10`
  soon: boolean;
  text: string;
  href: string;
}

interface CalendarRailProps {
  deadlines: RailDeadline[];
  /** `09:14`; absent when never synced. */
  syncedAt?: string;
  calendars: { name: string; via: string }[];
  /** `Work: sync failed 3 h ago` — never a modal, never blocking. */
  failures: string[];
}

const LEGEND: [CalendarEntry['kind'], string][] = [
  ['appointment', 'Appointments — synced from your external calendars, read-only'],
  ['timeblock', 'Time blocks you set here — a next action given a slot'],
  ['dayaction', 'Day-specific actions — must happen that day, any time'],
  ['info', 'Day-specific information — tickler notes, nothing to do'],
  ['deadline', 'Hard deadlines — mirrored from actions and projects'],
];

const HOW: [string, string?][] = [
  ['Clarify → Defer → Calendar, with a day or a day + time', '/clarify'],
  ['A next action with a deadline shows on its day automatically', '/next'],
  ['Drag an action from Next Actions onto a slot to time-block it', '/next'],
  ['External calendars sync in; nothing is written back to them'],
  ['Recurring checklists (weekly review, bins) repeat here'],
];

const head = 'font-mono text-label tracking-[0.1em] text-muted';

export function CalendarRail({ deadlines, syncedAt, calendars, failures }: CalendarRailProps) {
  return (
    <aside aria-label="Calendar sources" className="flex min-w-0 flex-col gap-3">
      <Card className="flex flex-col gap-2 px-3 py-2.5">
        <h2 className={cx(head, 'm-0 font-normal')}>WHAT LIVES HERE</h2>
        <ul className="m-0 grid list-none grid-cols-[18px_minmax(0,1fr)] items-start gap-x-2 gap-y-1.5 p-0 text-xs">
          {LEGEND.map(([kind, text]) => (
            <li key={kind} className="contents">
              <span aria-hidden="true" className={cx('mt-0.5 box-border size-3.5 rounded-chip', KIND[kind])} />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="flex flex-col gap-2 px-3 py-2.5">
        <h2 className={cx(head, 'm-0 font-normal')}>HOW ITEMS GET HERE</h2>
        <ol className="m-0 grid list-none grid-cols-[16px_minmax(0,1fr)] items-start gap-x-2 gap-y-1.5 p-0 text-xs">
          {HOW.map(([text, href], n) => (
            <li key={text} className="contents">
              <span className="font-mono text-meta text-muted">{n + 1}</span>
              {href ? (
                <Link href={href} className="text-ink no-underline hover:underline">
                  {text}
                </Link>
              ) : (
                <span>{text}</span>
              )}
            </li>
          ))}
        </ol>
      </Card>

      <Card className="flex flex-col gap-2 px-3 py-2.5">
        <h2 className={cx(head, 'm-0 font-normal')}>UPCOMING HARD DEADLINES</h2>
        {deadlines.length > 0 ? (
          <ul className="m-0 grid list-none grid-cols-[44px_minmax(0,1fr)] gap-x-2 gap-y-1 p-0 text-xs">
            {deadlines.map((d) => (
              <li key={d.id} className="contents">
                <span className={cx('font-mono text-meta', d.soon ? 'text-warn' : 'text-muted')}>{d.date}</span>
                <Link href={d.href} className="text-ink no-underline hover:underline">
                  {d.text}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 font-mono text-meta text-muted">None in the next 30 days.</p>
        )}
      </Card>

      <p className="m-0 mt-auto font-mono text-meta leading-normal text-muted">
        {syncedAt ? `synced ${syncedAt}` : 'not synced yet'} · {calendars.length} calendars
        <br />
        {calendars.map((c) => `${c.name} (${c.via})`).join(' · ')}
        {failures.map((f) => (
          <span key={f} className="block text-warn">
            {f}
          </span>
        ))}
      </p>
    </aside>
  );
}
