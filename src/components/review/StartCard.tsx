'use client';

import { useTransition } from 'react';
import { startReviewAction } from '@/lib/actions';
import { Btn } from '../ui/Btn';
import { Card } from '../ui/Card';

interface StartCardProps {
  /** `Last review fri 18.09 · 8 d ago · 12 steps · usually ~45 min` */
  summary: string;
  /** `Last run abandoned at step 5 · yesterday` */
  abandoned?: string;
  phases: { name: string; steps: number }[];
}

/** No review in progress: what the last one was, and the button to begin. */
export function StartCard({ summary, abandoned, phases }: StartCardProps) {
  const [pending, startTransition] = useTransition();
  return (
    <Card aria-labelledby="start-head" className="mx-auto flex max-w-xl flex-col gap-3 px-4 py-4 max-lg:m-4">
      <h2 id="start-head" className="m-0 text-body font-semibold">Weekly Review</h2>
      <p className="m-0 font-mono text-meta text-muted">{summary}</p>
      {abandoned && <p className="m-0 font-mono text-meta text-warn">{abandoned}</p>}
      <ol className="m-0 flex list-none gap-4 p-0 font-mono text-meta text-muted">
        {phases.map((p, n) => (
          <li key={p.name}>
            {n + 1} · {p.name} · {p.steps}
          </li>
        ))}
      </ol>
      <Btn variant="primary" className="self-start" disabled={pending} onClick={() => startTransition(() => startReviewAction())}>
        Start review
      </Btn>
    </Card>
  );
}
