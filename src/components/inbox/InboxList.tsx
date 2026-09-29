'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { trashAction, untrashAction } from '@/lib/actions';
import type { Item, Priority } from '@/lib/model';
import { Card } from '../ui/Card';
import { cx } from '../ui/cx';
import { Kbd } from '../ui/Kbd';
import { PrioChip } from '../ui/PrioChip';
import { Row } from '../ui/Row';
import { Tag } from '../ui/Tag';
import { isTyping } from './keys';

/** One inbox row, already formatted on the server. */
export interface InboxRow {
  id: string;
  text: string;
  source: string;
  captured: string; // `sat 09:12`
  age: string; // `2 h` | `1 d`
  aging: boolean; // ≥ 3 d
  context?: string;
  priority?: Priority;
  day?: string; // `fri 02.10`
  tags: string[];
}

type Trashed = { id: string; status: Item['status'] }[];

const COLS = '32px minmax(0,1fr) 96px 90px 72px';
const UNDO_MS = 5000;

export function InboxList({ rows: allRows }: { rows: InboxRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  // Hidden right away on ⌫, before the server round trip removes them from `rows`.
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [undo, setUndo] = useState<Trashed | null>(null);
  const [moreBelow, setMoreBelow] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const rows = allRows.filter((r) => !gone.has(r.id));
  const cursorIdx = Math.max(0, rows.findIndex((r) => r.id === cursorId));
  const cursor = rows[cursorIdx]?.id;
  const selected = rows.filter((r) => checked.has(r.id)).map((r) => r.id);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function trashSelected() {
    const ids = selected.length ? selected : cursor ? [cursor] : [];
    if (!ids.length) return;
    // Cursor lands on the first surviving row at or after the old position, else the last one.
    const survivors = rows.filter((r) => !ids.includes(r.id));
    const after = rows.slice(cursorIdx).find((r) => !ids.includes(r.id));
    setCursorId((after ?? survivors.at(-1))?.id ?? null);
    setChecked(new Set());
    setGone((prev) => new Set([...prev, ...ids]));
    startTransition(async () => setUndo(await trashAction(ids)));
  }

  function undoTrash() {
    if (!undo) return;
    const entries = undo;
    setUndo(null);
    setGone((prev) => new Set([...prev].filter((id) => !entries.some((e) => e.id === id))));
    startTransition(() => untrashAction(entries));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e) || e.altKey) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod) {
        if (e.key === 'z' && undo) {
          e.preventDefault();
          undoTrash();
        }
        return;
      }
      switch (e.key) {
        case 'j':
        case 'k': {
          const next = rows[Math.min(rows.length - 1, Math.max(0, cursorIdx + (e.key === 'j' ? 1 : -1)))];
          if (next) setCursorId(next.id);
          break;
        }
        case 'x':
          if (cursor) toggle(cursor);
          break;
        case 'c': {
          const target = selected[0] ?? cursor;
          if (!target) break;
          setChecked(new Set()); // the selection must not survive into the next visit
          router.push(`/clarify?item=${encodeURIComponent(target)}`);
          break;
        }
        case 'Backspace':
        case 'Delete':
          trashSelected();
          break;
        case 'u':
          undoTrash();
          break;
        default:
          return;
      }
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // The toast lives for 5 s; a newer trash replaces it (and its timer).
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [undo]);

  useEffect(() => {
    if (cursor) document.getElementById(`inbox-row-${cursor}`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  // "n more below": rows not fully visible under the scroll viewport.
  useEffect(() => {
    const box = scroller.current;
    const inner = list.current;
    if (!box || !inner) return;
    const measure = () => {
      const bottom = box.scrollTop + box.clientHeight + 1;
      const kids = Array.from(inner.children) as HTMLElement[];
      setMoreBelow(kids.filter((el) => el.offsetTop + el.offsetHeight > bottom).length);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    ro.observe(inner);
    box.addEventListener('scroll', measure, { passive: true });
    return () => {
      ro.disconnect();
      box.removeEventListener('scroll', measure);
    };
  }, []);

  return (
    <Card aria-label="Unprocessed items" className="flex min-h-0 grow flex-col">
      {rows.length > 0 && (
        <Row cols={COLS} aria-hidden="true" className="border-line! font-mono text-label tracking-[0.1em] text-muted">
          <span />
          <span>ITEM</span>
          <span>SOURCE</span>
          <span>CAPTURED</span>
          <span className="text-right">AGE</span>
        </Row>
      )}
      <div ref={scroller} className="relative min-h-0 grow overflow-y-auto">
        <div ref={list}>
          {rows.map((r) => (
            <Row
              key={r.id}
              id={`inbox-row-${r.id}`}
              cols={COLS}
              onClick={() => setCursorId(r.id)}
              className={cx(
                checked.has(r.id) && 'bg-accent-tint',
                r.id === cursor && 'shadow-[inset_2px_0_0_var(--wb-accent)]',
              )}
            >
              <input
                type="checkbox"
                aria-label={`Select “${r.text}”`}
                checked={checked.has(r.id)}
                onChange={() => toggle(r.id)}
                className="m-0 size-4"
              />
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{r.text}</span>
                {r.context && <Tag>{r.context}</Tag>}
                {r.priority && <PrioChip priority={r.priority} />}
                {r.day && <Tag>{r.day}</Tag>}
                {r.tags.map((t) => (
                  <Tag key={t}>#{t}</Tag>
                ))}
              </span>
              <span className="font-mono text-meta text-muted">{r.source}</span>
              <span className="font-mono text-meta text-muted">{r.captured}</span>
              <span className={cx('text-right font-mono text-meta', r.aging ? 'text-warn' : 'text-muted')}>
                {r.age}
              </span>
            </Row>
          ))}
        </div>
        {rows.length === 0 && (
          <p className="absolute inset-0 m-0 flex items-center justify-center font-mono text-meta text-muted">
            Inbox is empty — nice.
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-3 py-2 font-mono text-meta text-muted">
        <span>{selected.length} selected</span>
        <span className="hidden gap-4 lg:flex">
          <span><Kbd>j/k</Kbd> move</span>
          <span><Kbd>c</Kbd> clarify</span>
          <span><Kbd>x</Kbd> select</span>
          <span><Kbd>⌫</Kbd> trash</span>
        </span>
        <span role="status" className="flex items-center gap-2">
          {undo && (
            <>
              <span className="text-ink">
                {undo.length} moved to trash
              </span>
              <button
                type="button"
                onClick={undoTrash}
                className="rounded border border-control bg-panel px-1.5 text-accent hover:text-accent-hover"
              >
                Undo <Kbd>u</Kbd>
              </button>
            </>
          )}
        </span>
        <span className="grow" />
        {moreBelow > 0 && <span>{moreBelow} more below</span>}
      </div>
    </Card>
  );
}
