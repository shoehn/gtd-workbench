'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import {
  captureAction,
  completeAction,
  cycleThemeAction,
  demoteAction,
  editNextAction,
  followUpAction,
  receivedAction,
  startReviewAction,
  syncCalendarsAction,
  toReferenceAction,
  toSomedayAction,
  toggleFocusAction,
} from '@/lib/actions';
import type { PaletteData } from '@/lib/api';
import { parse } from '@/lib/capture-syntax';
import { fmtDay } from '@/lib/format';
import { rank } from '@/lib/fuzzy';
import { cx } from '../ui/cx';
import { Kbd } from '../ui/Kbd';
import { OPEN_PALETTE, usePaletteTarget, type PaletteTarget } from './target';

/** One line in the list: a place to go or something to do. */
interface Option {
  id: string;
  label: string;
  /** The list or kind, shown as a tag on the right. */
  tag: string;
  group: string;
  run(): void | Promise<void>;
  /** Navigation and target-free commands are remembered in "Recent". */
  recent?: boolean;
}

type Sub = { kind: 'context' | 'project'; target: Extract<PaletteTarget, { kind: 'next' }> };

const MAX_RESULTS = 30;
const MAX_RECENT = 8;
/** Last selections, kept in memory only (SPEC §3.10). */
const recentOptions: Option[] = [];

const SCREENS: [string, string][] = [
  ['Inbox', '/inbox'],
  ['Clarify inbox', '/clarify'],
  ['Next Actions', '/next'],
  ['Calendar', '/calendar'],
  ['Waiting For', '/waiting'],
  ['Someday / Maybe', '/waiting?tab=someday'],
  ['Projects', '/projects'],
  ['Weekly Review', '/review'],
  ['Settings', '/settings'],
];

/** "→ inbox · @calls · B · fri 02.10 · #tag" — what `+` will capture, before ⏎. */
function readBack(line: string, data: PaletteData): string {
  const p = parse(line, data.today, data.contexts.map((c) => c.name));
  return ['→ inbox', p.context, p.priority, p.date && fmtDay(p.date), ...p.tags.map((t) => `#${t}`)].filter(Boolean).join(' · ');
}

export function CommandPalette({ data }: { data: PaletteData }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const target = usePaletteTarget();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [sub, setSub] = useState<Sub | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  function show() {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setQuery('');
    setActive(0);
    setSub(null);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setSub(null);
    returnFocus.current?.focus?.();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (open) close();
        else show();
      }
    }
    const onOpen = () => show();
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_PALETTE, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_PALETTE, onOpen);
    };
  });

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open, sub]);

  if (!open) return null;

  const go = (href: string) => () => router.push(href);
  const act = (fn: () => Promise<unknown>, then?: string) => () =>
    startTransition(async () => {
      await fn();
      if (then) router.push(then);
    });

  function options(): Option[] {
    const q = query.trim();
    if (sub?.kind === 'context') {
      return (q ? rank(q, data.contexts, (c) => c.name) : data.contexts).map((c) => ({
          id: `ctx-${c.name}`,
          label: c.name,
          tag: `${c.open} open`,
          group: `Move “${sub.target.text}” to`,
          run: act(() => editNextAction(sub.target.id, { context: c.name })),
        }));
    }
    if (sub?.kind === 'project') {
      const projects = data.projects.filter((p) => p.status !== 'completed');
      const listed = q ? rank(q, projects, (p) => p.title) : projects;
      return [
        ...(q ? [] : [{ id: 'proj-none', label: 'No project (single action)', tag: '', group: `Move “${sub.target.text}” to`, run: act(() => editNextAction(sub.target.id, { project: null })) }]),
        ...listed.map((p) => ({
          id: `proj-${p.id}`,
          label: p.title,
          tag: p.status,
          group: `Move “${sub.target.text}” to`,
          run: act(() => editNextAction(sub.target.id, { project: { id: p.id } })),
        })),
      ];
    }

    if (!q) return recentOptions.map((o) => ({ ...o, group: 'Recent' }));

    const head = q[0];
    const rest = q.slice(1).trim();
    if (head === '+') {
      return rest
        ? [{ id: 'capture', label: `Capture “${rest}”`, tag: readBack(rest, data), group: 'Capture to inbox', run: act(() => captureAction(rest)) }]
        : [];
    }
    if (head === '@') {
      const listed = rest ? rank(rest.replace(/^@/, ''), data.contexts, (c) => c.name) : data.contexts;
      return listed.map((c) => ({
        id: `goctx-${c.name}`,
        label: c.name,
        tag: `${c.open} open`,
        group: 'Contexts',
        run: go(`/next?ctx=${c.name}`),
        recent: true,
      }));
    }
    if (head === '#') {
      const listed = rest ? rank(rest, data.projects, (p) => p.title) : data.projects.filter((p) => p.status === 'active');
      return listed.map((p) => ({ id: `goproj-${p.id}`, label: p.title, tag: p.status, group: 'Projects', run: go(p.href), recent: true }));
    }
    if (head === '>') return (rest ? rank(rest, commands(), (o) => `${o.label} ${o.tag}`) : commands()).slice(0, MAX_RESULTS);

    const items = rank(q, data.items, (i) => `${i.text} ${i.detail}`).map((i) => ({
      id: `item-${i.id}`,
      label: i.text,
      tag: i.detail ? `${i.list} · ${i.detail}` : i.list,
      group: i.list,
      run: go(i.href),
      recent: true,
    }));
    const projects = rank(q, data.projects, (p) => p.title).map((p) => ({
      id: `proj-${p.id}`,
      label: p.title,
      tag: `project · ${p.status}`,
      group: 'Projects',
      run: go(p.href),
      recent: true,
    }));
    // Grouped by list, best match first inside a group, groups in order of their best match.
    const all = [...items, ...projects];
    const groups = [...new Set(all.map((o) => o.group))];
    return groups.flatMap((g) => all.filter((o) => o.group === g)).slice(0, MAX_RESULTS);
  }

  /** `>`: the app's own operations and routes — nothing the api does not already do. */
  function commands(): Option[] {
    const list: Option[] = [];
    if (target?.kind === 'next') {
      const t = target;
      list.push(
        { id: 'row-done', label: `Done: ${t.text}`, tag: 'this row', group: 'This action', run: act(() => completeAction(t.id)) },
        { id: 'row-focus', label: `Focus today: ${t.text}`, tag: 'this row', group: 'This action', run: act(() => toggleFocusAction(t.id)) },
        ...(t.projectId
          ? [{ id: 'row-later', label: `Later — make “${t.text}” a later step`, tag: 'this row', group: 'This action', run: act(() => demoteAction(t.id)) }]
          : []),
        { id: 'row-context', label: `Change context of “${t.text}”…`, tag: t.context, group: 'This action', run: () => openSub('context', t) },
        { id: 'row-project', label: `Move “${t.text}” to a project…`, tag: 'this row', group: 'This action', run: () => openSub('project', t) },
      );
    }
    if (target?.kind === 'waiting') {
      const t = target;
      list.push(
        { id: 'row-follow', label: `Follow up: ${t.text}`, tag: 'this row', group: 'This waiting-for', run: act(() => followUpAction(t.id)) },
        { id: 'row-received', label: `Received: ${t.text}`, tag: 'this row', group: 'This waiting-for', run: act(() => receivedAction(t.id)) },
      );
    }
    if (target?.kind === 'someday') {
      const t = target;
      list.push({ id: 'row-toref', label: `→ Reference: ${t.text}`, tag: 'this row', group: 'This idea', run: act(() => toReferenceAction(t.id)) });
    }
    if (target?.kind === 'reference') {
      const t = target;
      list.push({ id: 'row-tosomeday', label: `→ Someday: ${t.text}`, tag: 'this row', group: 'This reference', run: act(() => toSomedayAction(t.id)) });
    }
    list.push(
      data.reviewOpen
        ? { id: 'cmd-review', label: 'Open the weekly review', tag: 'in progress', group: 'Commands', run: go('/review'), recent: true }
        : { id: 'cmd-review', label: 'Start weekly review', tag: 'command', group: 'Commands', run: act(() => startReviewAction(), '/review'), recent: true },
      ...(data.canSync
        ? [{ id: 'cmd-sync', label: 'Sync calendars', tag: 'command', group: 'Commands', run: act(() => syncCalendarsAction()), recent: true }]
        : []),
      { id: 'cmd-theme', label: 'Toggle dark theme', tag: 'system → dark → light', group: 'Commands', run: act(() => cycleThemeAction()), recent: true },
      ...SCREENS.map(([label, href]) => ({ id: `go-${href}`, label: `Go to ${label}`, tag: href, group: 'Go to', run: go(href), recent: true })),
    );
    return list;
  }

  function openSub(kind: Sub['kind'], t: Extract<PaletteTarget, { kind: 'next' }>) {
    setSub({ kind, target: t });
    setQuery('');
    setActive(0);
  }

  const list = options();
  const current = Math.min(active, Math.max(0, list.length - 1));

  function run(o: Option | undefined) {
    if (!o) return;
    if (o.recent) {
      const at = recentOptions.findIndex((r) => r.id === o.id);
      if (at >= 0) recentOptions.splice(at, 1);
      recentOptions.unshift({ ...o });
      recentOptions.splice(MAX_RECENT);
    }
    const staysOpen = o.id === 'row-context' || o.id === 'row-project';
    o.run();
    if (!staysOpen) close();
  }

  const hint = sub
    ? sub.kind === 'context'
      ? 'pick a context · esc back'
      : 'pick a project · esc back'
    : 'text search · > commands · + capture · @ context · # project';

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center bg-scrim pt-[12vh] max-lg:px-3 max-lg:pt-16" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded border border-line bg-panel shadow-popover"
      >
        <div className="flex items-center gap-2 border-b border-line px-3">
          <span aria-hidden="true" className="font-mono text-accent">
            {sub ? '↳' : '⌘'}
          </span>
          <input
            ref={input}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={list[current] ? `palette-opt-${current}` : undefined}
            aria-label={sub ? hint : 'Search, or > for commands, + to capture, @ for a context, # for a project'}
            value={query}
            placeholder={sub ? (sub.kind === 'context' ? 'Context…' : 'Project…') : 'Search everything…'}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') setActive((n) => Math.min(list.length - 1, n + 1));
              else if (e.key === 'ArrowUp') setActive((n) => Math.max(0, n - 1));
              else if (e.key === 'Enter') run(list[current]);
              else if (e.key === 'Escape') {
                if (sub) {
                  setSub(null);
                  setQuery('>');
                } else close();
              } else return;
              e.preventDefault();
            }}
            className="h-12 min-w-0 grow border-0 bg-transparent text-base text-ink outline-none placeholder:text-muted"
          />
          <Kbd>esc</Kbd>
        </div>
        <p className="m-0 border-b border-line-soft px-3 py-1.5 font-mono text-meta text-muted">{hint}</p>
        <ul id="palette-list" role="listbox" aria-label="Results" className="m-0 min-h-0 list-none overflow-y-auto p-0 py-1">
          {list.map((o, n) => (
            <li key={o.id} role="presentation">
              {(n === 0 || list[n - 1].group !== o.group) && (
                <div aria-hidden="true" className="px-3 pt-2 pb-0.5 font-mono text-label tracking-[0.1em] text-muted uppercase">
                  {o.group}
                </div>
              )}
              <div
                id={`palette-opt-${n}`}
                role="option"
                aria-selected={n === current}
                onMouseMove={() => n !== current && setActive(n)}
                onClick={() => run(o)}
                className={cx('flex min-h-9 cursor-pointer items-center gap-3 px-3 py-1.5 max-lg:min-h-11', n === current && 'bg-accent-tint')}
              >
                <span className="min-w-0 grow truncate">{o.label}</span>
                {o.tag && <span className="max-w-[45%] shrink-0 truncate font-mono text-meta text-muted">{o.tag}</span>}
              </div>
            </li>
          ))}
          {list.length === 0 && (
            <li role="presentation" className="px-3 py-3 font-mono text-meta text-muted">
              {query.trim() ? 'Nothing matches.' : 'Type to search everything.'}
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
