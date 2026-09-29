'use client';

import { useRef, useTransition, type FormEvent } from 'react';
import { captureAction } from '@/lib/actions';

/** Top-bar quick capture: Enter captures to the inbox and clears. Nothing else happens. */
export function CaptureField() {
  const input = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const line = input.current?.value ?? '';
    if (!line.trim()) return;
    input.current!.value = '';
    startTransition(() => captureAction(line));
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex h-(--wb-hit-input) min-w-0 flex-1 items-center gap-2 rounded border border-control bg-panel px-2.5 focus-within:border-accent focus-within:shadow-ring lg:w-65 lg:flex-none"
    >
      <span aria-hidden="true" className="font-mono text-muted">›</span>
      <label htmlFor="quick-capture" className="sr-only">Capture to inbox</label>
      <input
        ref={input}
        id="quick-capture"
        type="text"
        autoComplete="off"
        placeholder="Capture to inbox"
        className="min-w-0 grow border-0 bg-transparent text-ink outline-none placeholder:text-muted"
      />
    </form>
  );
}
