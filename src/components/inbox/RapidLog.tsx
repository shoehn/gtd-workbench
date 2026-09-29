'use client';

import { useEffect, useRef, useTransition, type FormEvent } from 'react';
import { captureAction } from '@/lib/actions';
import { isTyping } from './keys';

/** The Inbox capture field. Enter captures and keeps focus; `/` or `›` jumps here, Esc leaves. */
export function RapidLog() {
  const input = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/' || e.key === '›') {
        e.preventDefault();
        input.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
    <section aria-label="Rapid log" className="flex flex-col gap-1.5">
      <label htmlFor="rapid-log" className="font-mono text-label tracking-[0.1em] text-muted">
        RAPID LOG — ONE THOUGHT PER LINE, ENTER TO CAPTURE
      </label>
      <form
        onSubmit={onSubmit}
        className="flex h-(--wb-hit-phone) items-center gap-2.5 rounded border border-accent bg-panel px-3 focus-within:shadow-ring"
      >
        <span aria-hidden="true" className="font-mono text-accent">›</span>
        <input
          ref={input}
          id="rapid-log"
          type="text"
          autoComplete="off"
          placeholder="Call the dentist about the invoice…"
          onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
          className="min-w-0 grow border-0 bg-transparent text-title text-ink outline-none placeholder:text-muted"
        />
        <span className="hidden font-mono text-meta whitespace-pre text-muted sm:inline">#tag  @context  !prio  ^date</span>
      </form>
      <div className="pt-0.5 pl-0.5 font-mono text-meta text-muted">capture never asks questions</div>
    </section>
  );
}
