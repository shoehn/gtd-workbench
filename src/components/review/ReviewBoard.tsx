'use client';

import Link from 'next/link';
import { useEffect, useOptimistic, useState, useTransition } from 'react';
import { finishReviewAction, openStepAction, pauseReviewAction, resumeReviewAction, setReviewNotesAction, tickStepAction, untickStepAction } from '@/lib/actions';
import type { LiveLine } from '@/lib/review-notes';
import { isTyping } from '../inbox/keys';
import { Card } from '../ui/Card';
import { cx } from '../ui/cx';
import { Kbd } from '../ui/Kbd';

export interface ReviewStepRow {
  id: string;
  text: string;
  done: boolean;
  /** Measured note of a ticked step. */
  note?: string;
  /** Live figure of an open step. */
  live?: LiveLine;
  /** `3 min`, or `—`. */
  took: string;
}

export interface ReviewPhase {
  id: string;
  no: number;
  name: string;
  done: number;
  total: number;
  /** ok: all ticked; warn: an open step's list needs attention. */
  state: 'ok' | 'warn' | 'plain';
  steps: ReviewStepRow[];
}

interface ReviewBoardProps {
  phases: ReviewPhase[];
  /** First unticked step: where the cursor starts. */
  current?: string;
  notes: string;
  paused: boolean;
  stats: { value: number; label: string; warn?: boolean }[];
}

const mono = 'font-mono text-meta text-muted';

export function ReviewBoard({ phases, current, notes, paused, stats }: ReviewBoardProps) {
  const [, startTransition] = useTransition();
  const steps = phases.flatMap((p) => p.steps);
  const [cursor, setCursor] = useState(current);
  const [done, setDone] = useOptimistic(
    new Set(steps.filter((s) => s.done).map((s) => s.id)) as ReadonlySet<string>,
    (cur, { id, on }: { id: string; on: boolean }) => {
      const next = new Set(cur);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    },
  );

  // After a tick the server moves "current" on; the cursor follows.
  const [seen, setSeen] = useState(current);
  if (seen !== current) {
    setSeen(current);
    setCursor(current);
  }

  function toggle(id: string) {
    const on = !done.has(id);
    if (on && id === cursor) {
      // Ticking the step under the cursor moves it on to the next open step.
      const at = steps.findIndex((s) => s.id === id);
      const open = (s: ReviewStepRow) => s.id !== id && !done.has(s.id);
      setCursor((steps.slice(at + 1).find(open) ?? steps.find(open))?.id);
    }
    startTransition(async () => {
      setDone({ id, on });
      await (on ? tickStepAction(id) : untickStepAction(id));
    });
  }

  function moveTo(id: string) {
    setCursor(id);
    if (!done.has(id)) startTransition(() => openStepAction(id));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e)) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        startTransition(() => finishReviewAction());
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const at = steps.findIndex((s) => s.id === cursor);
      switch (e.key) {
        case ' ':
          // A focused checkbox toggles itself.
          if (e.target instanceof HTMLInputElement) return;
          if (cursor) toggle(cursor);
          break;
        case 'j':
        case 'k': {
          const next = steps[Math.min(steps.length - 1, Math.max(0, at + (e.key === 'j' ? 1 : -1)))];
          if (next) moveTo(next.id);
          break;
        }
        case 'p':
          startTransition(() => (paused ? resumeReviewAction() : pauseReviewAction()));
          break;
        default:
          return;
      }
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="grid min-h-full gap-4 lg:grid-cols-3">
      <div className="flex min-h-full flex-col bg-panel lg:hidden">
        {phases.map((ph) => (
          <section key={ph.id} aria-label={ph.name}>
            <h2 className="m-0 flex items-center gap-2 px-4 pt-3 pb-1 font-mono text-meta font-normal tracking-[0.1em] text-muted">
              {ph.no} · {ph.name.toUpperCase()}
              <span className={ph.state === 'ok' ? 'text-ok' : ph.state === 'warn' ? 'text-warn' : undefined}>
                {ph.done}/{ph.total}
              </span>
            </h2>
            {ph.steps.map((s) => {
              const ticked = done.has(s.id);
              const here = s.id === cursor && !ticked;
              return (
                <label
                  key={s.id}
                  className={cx(
                    'grid min-h-11 grid-cols-[20px_minmax(0,1fr)] items-start gap-3 border-b border-line-soft px-4 py-2.5',
                    here && 'bg-accent-tint',
                    ticked && 'text-muted',
                  )}
                >
                  <input type="checkbox" checked={ticked} onChange={() => toggle(s.id)} className="m-0 size-5" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className={cx(ticked ? 'line-through' : here && 'font-medium')}>{s.text}</span>
                    {!ticked &&
                      s.live &&
                      (s.live.href ? (
                        <Link
                          href={s.live.href}
                          onClick={() => startTransition(() => openStepAction(s.id))}
                          className={cx('self-start text-sm no-underline', s.live.warn ? 'text-warn' : 'text-accent')}
                        >
                          {s.live.text}
                        </Link>
                      ) : (
                        <span className="text-sm text-muted">{s.live.text}</span>
                      ))}
                  </span>
                </label>
              );
            })}
          </section>
        ))}
      </div>
      {phases.map((ph, n) => (
        <div key={ph.id} className="flex min-w-0 flex-col gap-3 max-lg:hidden">
          <Card aria-label={ph.name} className="flex flex-col">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
              <span className="rounded-chip bg-ink px-1.5 font-mono text-meta text-panel">{ph.no}</span>
              <h2 className="m-0 text-body font-semibold">{ph.name}</h2>
              <span className={cx('font-mono text-meta', ph.state === 'ok' ? 'text-ok' : ph.state === 'warn' ? 'text-warn' : 'text-muted')}>
                {ph.done} / {ph.total}
              </span>
            </div>
            <div className="flex flex-col py-1.5">
              {ph.steps.map((s) => {
                const ticked = done.has(s.id);
                const here = s.id === cursor;
                return (
                  <label
                    key={s.id}
                    className={cx(
                      'grid grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-2.5 border-b border-line-soft px-3 py-2 last:border-b-0',
                      here && 'bg-accent-tint',
                    )}
                  >
                    <input type="checkbox" checked={ticked} onChange={() => toggle(s.id)} className="m-0 mt-0.5 size-4" />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className={cx(ticked ? 'text-muted line-through' : here && 'font-medium')}>{s.text}</span>
                      {ticked
                        ? s.note && <span className="text-xs text-muted">{s.note}</span>
                        : s.live &&
                          (s.live.href ? (
                            <Link
                              href={s.live.href}
                              onClick={() => startTransition(() => openStepAction(s.id))}
                              className={cx('text-xs no-underline hover:underline', s.live.warn ? 'text-warn' : 'text-accent')}
                            >
                              {s.live.text}
                            </Link>
                          ) : (
                            <span className="text-xs text-muted">{s.live.text}</span>
                          ))}
                    </span>
                    <span className={cx('font-mono text-meta', here && !ticked ? 'text-accent' : 'text-muted')}>
                      {ticked ? s.took : here ? 'now' : '—'}
                    </span>
                  </label>
                );
              })}
            </div>
          </Card>
          {n === phases.length - 1 && (
            <>
              <Card aria-labelledby="review-notes-head" className="flex min-h-40 grow flex-col">
                <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
                  <h2 id="review-notes-head" className="m-0 text-body font-semibold">Review notes</h2>
                  <span className={mono}>saved with this review</span>
                </div>
                <textarea
                  aria-labelledby="review-notes-head"
                  defaultValue={notes}
                  onBlur={(e) => {
                    const text = e.currentTarget.value;
                    if (text !== notes) startTransition(() => setReviewNotesAction(text));
                  }}
                  className="grow resize-none border-0 bg-panel px-3 py-2.5 leading-normal text-ink outline-none"
                />
              </Card>
              <Card aria-labelledby="week-head" className="flex flex-col gap-1.5 px-3 py-2.5">
                <h2 id="week-head" className="m-0 font-mono text-label font-normal tracking-[0.1em] text-muted">THIS WEEK, SO FAR</h2>
                <dl className="m-0 grid grid-cols-4 gap-2 font-mono text-meta text-muted">
                  {stats.map((t) => (
                    <div key={t.label} className="flex flex-col-reverse justify-end gap-0.5">
                      <dt>{t.label}</dt>
                      <dd className={cx('m-0 text-lg', t.warn ? 'text-warn' : 'text-ink')}>{t.value}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            </>
          )}
        </div>
      ))}
      <p className={cx(mono, 'm-0 hidden gap-4 lg:col-span-3 lg:flex')}>
        <span><Kbd>space</Kbd> tick current step</span>
        <span><Kbd>j</Kbd> <Kbd>k</Kbd> move</span>
        <span><Kbd>p</Kbd> pause / resume</span>
        <span><Kbd>⌘⏎</Kbd> finish</span>
      </p>
    </div>
  );
}
