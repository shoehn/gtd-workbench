'use client';

import { useEffect, useState, useTransition } from 'react';
import { finishReviewAction, pauseReviewAction, resumeReviewAction } from '@/lib/actions';
import { Btn } from '../ui/Btn';
import { cx } from '../ui/cx';

const pad = (n: number) => String(n).padStart(2, '0');

/** `00:23:41` */
function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

/** Timer, Pause / Resume and Finish in the top bar. The timer counts on from the server's figure. */
export function ReviewControls({ elapsedMs, paused }: { elapsedMs: number; paused: boolean }) {
  const [, startTransition] = useTransition();
  const [shown, setShown] = useState(elapsedMs);
  // A new figure from the server (after pause, resume or any change) restarts the count.
  const [base, setBase] = useState(elapsedMs);
  if (base !== elapsedMs) {
    setBase(elapsedMs);
    setShown(elapsedMs);
  }

  useEffect(() => {
    if (paused) return;
    const from = Date.now();
    const t = setInterval(() => setShown(elapsedMs + Date.now() - from), 1000);
    return () => clearInterval(t);
  }, [elapsedMs, paused]);

  return (
    <div className="flex items-center gap-2 lg:gap-3">
      <span className="inline-flex items-center gap-2 font-mono text-xs" role="timer" aria-label={paused ? 'Review paused' : 'Review time'}>
        <span aria-hidden="true" className={cx('size-2 rounded-full', paused ? 'bg-control' : 'bg-warn')} />
        {clock(shown)}
      </span>
      <Btn onClick={() => startTransition(() => (paused ? resumeReviewAction() : pauseReviewAction()))}>
        {paused ? 'Resume' : 'Pause'}
      </Btn>
      <Btn variant="primary" onClick={() => startTransition(() => finishReviewAction())}>
        Finish review
      </Btn>
    </div>
  );
}
