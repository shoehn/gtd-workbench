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

/** The review clock: counts on each second from the server's figure while running. */
export function ReviewTimer({ elapsedMs, paused }: { elapsedMs: number; paused: boolean }) {
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
    <span className="inline-flex items-center gap-2 font-mono text-xs max-lg:text-sm" role="timer" aria-label={paused ? 'Review paused' : 'Review time'}>
      <span aria-hidden="true" className={cx('size-2 rounded-full', paused ? 'bg-control' : 'bg-warn')} />
      {clock(shown)}
    </span>
  );
}

/** Pause / Resume and Finish review. */
export function ReviewButtons({ paused, className }: { paused: boolean; className?: string }) {
  const [, startTransition] = useTransition();
  return (
    <>
      <Btn className={className} onClick={() => startTransition(() => (paused ? resumeReviewAction() : pauseReviewAction()))}>
        {paused ? 'Resume' : 'Pause'}
      </Btn>
      <Btn variant="primary" className={className} onClick={() => startTransition(() => finishReviewAction())}>
        Finish review
      </Btn>
    </>
  );
}

/** Timer, Pause / Resume and Finish in the desktop top bar. */
export function ReviewControls({ elapsedMs, paused }: { elapsedMs: number; paused: boolean }) {
  return (
    <div className="flex items-center gap-2 lg:gap-3">
      <ReviewTimer elapsedMs={elapsedMs} paused={paused} />
      <ReviewButtons paused={paused} />
    </div>
  );
}
