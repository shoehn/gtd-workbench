'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { captureAction, trashAction, untrashAction } from '@/lib/actions';
import type { Item } from '@/lib/model';
import { cx } from '../ui/cx';
import { PhoneToast } from '../ui/PhoneToast';
import { SwipeRow } from '../ui/SwipeRow';
import type { InboxRow } from './InboxList';

const UNDO_MS = 5000;

/** Phone rapid log in the header: 48 px, Enter captures and keeps focus. */
export function PhoneRapidLog({ focus }: { focus: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const field = input.current!;
    const line = field.value;
    if (!line.trim()) return;
    field.value = '';
    field.focus();
    startTransition(() => captureAction(line));
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex h-12 items-center gap-2.5 rounded border border-accent bg-panel px-3 shadow-ring"
    >
      <span aria-hidden="true" className="font-mono text-accent">›</span>
      <input
        ref={input}
        type="text"
        aria-label="Rapid log"
        autoComplete="off"
        autoFocus={focus}
        enterKeyHint="done"
        placeholder="Rapid log…"
        className="min-w-0 grow border-0 bg-transparent text-base text-ink outline-none placeholder:text-muted"
      />
      {/* Voice capture comes later (SPEC §3.1: only `typed` exists in v1). */}
      <button
        type="button"
        aria-label="Voice capture"
        disabled
        className="inline-flex size-9 shrink-0 items-center justify-center rounded border border-control bg-panel text-ink disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0" />
          <path d="M12 18v3" />
        </svg>
      </button>
    </form>
  );
}

type Trashed = { id: string; status: Item['status'] }[];

/** Phone inbox: two-line rows; tap or swipe → to clarify, swipe ← to trash (with undo). */
export function PhoneInbox({ rows: allRows }: { rows: InboxRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [undo, setUndo] = useState<{ entries: Trashed; text: string } | null>(null);
  const rows = allRows.filter((r) => !gone.has(r.id));

  function trash(row: InboxRow) {
    setGone((prev) => new Set([...prev, row.id]));
    startTransition(async () => setUndo({ entries: await trashAction([row.id]), text: row.text }));
  }

  function undoTrash() {
    if (!undo) return;
    const { entries } = undo;
    setUndo(null);
    setGone((prev) => new Set([...prev].filter((id) => !entries.some((e) => e.id === id))));
    startTransition(() => untrashAction(entries));
  }

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [undo]);

  const clarify = (id: string) => `/clarify?item=${encodeURIComponent(id)}`;

  return (
    <section aria-label="Unprocessed items" className="flex min-h-full flex-col bg-panel lg:hidden">
      <ul className="m-0 list-none p-0">
        {rows.map((r) => (
          <li key={r.id} className="border-b border-line-soft">
            <SwipeRow onRight={() => router.push(clarify(r.id))} onLeft={() => trash(r)} rightLabel="clarify →" leftLabel="← trash">
              <Link href={clarify(r.id)} className="flex min-h-14 flex-col justify-center gap-1 bg-panel px-4 py-3 text-ink no-underline">
                <span>{r.text}</span>
                <span className={cx('font-mono text-meta', r.aging ? 'text-warn' : 'text-muted')}>
                  {r.source} · {r.captured} · {r.age}
                </span>
              </Link>
            </SwipeRow>
          </li>
        ))}
      </ul>
      {rows.length === 0 ? (
        <p className="m-0 px-4 py-8 text-center font-mono text-meta text-muted">Inbox zero.</p>
      ) : (
        <p className="m-0 px-4 py-2.5 font-mono text-meta text-muted">swipe → clarify · swipe ← trash</p>
      )}
      {undo && <PhoneToast text={`Trashed: ${undo.text}`} onUndo={undoTrash} />}
    </section>
  );
}
