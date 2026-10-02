'use client';

import { useState, useTransition } from 'react';
import { undoActivityAction } from '@/lib/actions';
import { Btn } from '../ui/Btn';
import { Card } from '../ui/Card';

export interface ActivityListRow {
  id: string;
  when: string;
  actor: string;
  summary: string;
  /** Why it can't be undone now, or null. */
  blocker: string | null;
  /** This entry is itself an undo. */
  undo: boolean;
}

const mono = 'font-mono text-meta text-muted';

export function ActivityList({ rows }: { rows: ActivityListRow[] }) {
  const [pending, startTransition] = useTransition();
  const [refused, setRefused] = useState<{ id: string; message: string } | null>(null);

  function undo(id: string) {
    startTransition(async () => {
      const { error } = await undoActivityAction(id);
      setRefused(error ? { id, message: error } : null);
    });
  }

  if (!rows.length) return <p className={`${mono} m-0 py-8 text-center`}>Nothing yet.</p>;
  return (
    <Card aria-label="Activity" className="flex flex-col">
      <ul className="m-0 list-none p-0">
        {rows.map((r) => (
          <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 border-b border-line-soft px-3 py-2 last:border-b-0">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span>{r.summary}</span>
              <span className={mono}>
                {r.when} · {r.actor}
              </span>
            </span>
            {r.blocker ? (
              <span className={mono}>{r.blocker}</span>
            ) : (
              <Btn size="sm" disabled={pending} onClick={() => undo(r.id)} aria-label={`Undo: ${r.summary}`}>
                {r.undo ? 'Redo' : 'Undo'}
              </Btn>
            )}
            {refused?.id === r.id && <span className="col-span-2 text-xs text-warn">{refused.message}</span>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
