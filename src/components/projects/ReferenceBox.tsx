'use client';

import Link from 'next/link';
import { useRef, useState, useTransition } from 'react';
import { addReferenceAction } from '@/lib/actions';
import type { Reference } from '@/lib/model';
import { Card } from '../ui/Card';
import { cx } from '../ui/cx';
import { SectionHead } from '../ui/SectionHead';

export interface ProjectReference {
  id: string;
  text: string;
  reference: Reference;
  line: string;
}

const tagOf = (r: Reference) => (r.kind === 'file' ? (r.body?.split('.').pop()?.slice(0, 4).toLowerCase() ?? 'file') : r.kind);

/** What the project relies on (SPEC §3.11): links open, notes expand, files are named. */
export function ReferenceBox({ projectId, entries }: { projectId: string; entries: ProjectReference[] }) {
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function add() {
    const text = input.current?.value.trim();
    setAdding(false);
    if (text) startTransition(() => addReferenceAction(text, { kind: 'note' }, projectId));
  }

  return (
    <Card className="flex flex-col gap-2 px-3 py-2.5">
      <div className="flex items-baseline gap-2">
        <SectionHead className="m-0">Reference</SectionHead>
        <button type="button" onClick={() => setAdding(true)} className="ml-auto h-6 rounded px-1 text-xs text-accent hover:text-accent-hover max-lg:h-11">
          + reference
        </button>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {entries.map((e) => (
          <li key={e.id} className="flex min-w-0 flex-col">
            <span className="flex min-w-0 items-baseline gap-2 text-xs">
              <span className="w-7 shrink-0 font-mono text-meta text-muted">{tagOf(e.reference)}</span>
              {e.reference.kind === 'link' && e.reference.url ? (
                <a href={e.reference.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-ink no-underline hover:text-accent">
                  {e.text}
                </a>
              ) : (
                <button
                  type="button"
                  aria-expanded={open === e.id}
                  onClick={() => setOpen(open === e.id ? null : e.id)}
                  className="min-w-0 truncate text-left text-ink hover:text-accent"
                  title={e.line}
                >
                  {e.text}
                </button>
              )}
            </span>
            {open === e.id && (e.reference.body || e.line) && (
              <span className={cx('pl-9 text-xs whitespace-pre-wrap', e.reference.kind === 'file' ? 'font-mono text-muted' : 'text-ink')}>
                {e.reference.body ?? e.line}
              </span>
            )}
          </li>
        ))}
      </ul>
      {adding ? (
        <input
          ref={input}
          autoFocus
          aria-label="New reference note"
          placeholder="A note to keep with the project — ⏎"
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
            if (e.key === 'Escape') setAdding(false);
          }}
          onBlur={add}
          className="h-(--wb-hit-phone) rounded border border-accent bg-panel px-2 text-xs text-ink shadow-ring outline-none lg:h-7"
        />
      ) : (
        entries.length === 0 && <span className="text-xs text-muted">nothing filed yet</span>
      )}
      <Link href="/reference?scope=project" className="mt-auto text-xs no-underline">
        All reference →
      </Link>
    </Card>
  );
}
