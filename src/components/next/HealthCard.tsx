import Link from 'next/link';
import type { Health } from '@/lib/api';
import { Card } from '../ui/Card';
import { cx } from '../ui/cx';
import { SectionHead } from '../ui/SectionHead';

const num = 'font-mono text-meta no-underline';

/** Derived warnings: stalled projects, overdue waiting-for, stale actions. */
export function HealthCard({ health }: { health: Health }) {
  return (
    <Card aria-labelledby="health-head" className="mt-auto flex flex-col gap-1.5 px-3 py-2.5">
      <SectionHead id="health-head" className="m-0">Health</SectionHead>
      <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-1 text-xs">
        <dt>Projects without a next action</dt>
        <dd className="m-0">
          <Link href="/projects?filter=stalled" aria-label={`${health.stalled} projects without a next action`} className={cx(num, health.stalled ? 'text-warn' : 'text-muted')}>
            {health.stalled}
          </Link>
        </dd>
        <dt>Waiting-for overdue</dt>
        <dd className="m-0">
          <Link href="/waiting?filter=overdue" aria-label={`${health.waitingOverdue} waiting-for overdue`} className={cx(num, health.waitingOverdue ? 'text-warn' : 'text-muted')}>
            {health.waitingOverdue}
          </Link>
        </dd>
        <dt>Actions older than 30 d</dt>
        <dd className={cx(num, 'm-0 text-muted')}>{health.oldActions}</dd>
      </dl>
    </Card>
  );
}
