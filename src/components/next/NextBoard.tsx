'use client';

import Link from 'next/link';
import { useEffect, useOptimistic, useRef, useState, useTransition, type ReactNode } from 'react';
import { completeAction, editNextAction, reopenAction, toggleFocusAction, uncompleteAction } from '@/lib/actions';
import type { Completed, NextEdit } from '@/lib/api';
import type { Energy, Priority, TimeBucket } from '@/lib/model';
import { fmtMins } from '@/lib/format';
import { DRAG_ITEM } from '../calendar/blocks';
import { setPaletteTarget } from '../palette/target';
import { isTyping } from '../inbox/keys';
import { Card } from '../ui/Card';
import { cx } from '../ui/cx';
import { Kbd } from '../ui/Kbd';
import { PhoneToast } from '../ui/PhoneToast';
import { PrioChip } from '../ui/PrioChip';
import { ProjectEdit } from '../ui/ProjectEdit';
import type { PickerProject } from '../ui/ProjectPicker';
import { Row } from '../ui/Row';
import { SwipeRow } from '../ui/SwipeRow';

/** One next action, already formatted on the server. */
export interface NextRow {
  id: string;
  text: string;
  context: string;
  priority?: Priority;
  priorityNo?: number;
  project?: { id: string; title: string };
  time?: string; // `30m`
  /** The raw values, for the inline editors. */
  minutes?: TimeBucket;
  energy?: Energy;
  due?: string; // `03.10`
  deadline?: string; // ISO
  dueSoon: boolean; // ≤ 7 days
  focused: boolean;
}

export interface NextGroup {
  context: string;
  count: number;
  total: string; // `2 h 45`
  rows: NextRow[];
}

export interface FocusEntry {
  id: string;
  text: string;
  done: boolean;
}

interface NextBoardProps {
  groups: NextGroup[];
  hiddenByFilter: number;
  focus: FocusEntry[];
  contexts: string[];
  projects: PickerProject[];
  /** Row to put the cursor on at first, from `?highlight=<id>` (links from Projects). */
  highlight?: string;
  /** Server-rendered cards for the right column. */
  today: ReactNode;
  health: ReactNode;
  /** Phone: the one-line Today strip, `10:00 Dentist · 14:00 team lead · application deadline`. */
  todayLine: string;
}

type Editing = { id: string; field: 'text' | 'context' | 'project' | 'priority' | 'time' | 'energy' | 'deadline' };

const COLS = '24px 24px 36px minmax(0,1fr) 220px 52px 60px 76px';
const FADE_MS = 400;
const UNDO_MS = 5000;
const STAR = 'M12 3l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.4 6.3 20.5l1.2-6.4L2.8 9.7l6.4-.8z';
const mono = 'font-mono text-meta text-muted';

export function NextBoard({ groups, hiddenByFilter, focus, contexts, projects, highlight, today, health, todayLine }: NextBoardProps) {
  const [, startTransition] = useTransition();
  const [cursorId, setCursorId] = useState<string | null>(highlight ?? null);
  // The board stays mounted when ⌘K navigates to another `?highlight=`: follow it.
  const [shownHighlight, setShownHighlight] = useState(highlight);
  if (highlight !== shownHighlight) {
    setShownHighlight(highlight);
    if (highlight) setCursorId(highlight);
  }
  // Done rows fade for 400 ms, then hide until the server's list no longer has them.
  const [fading, setFading] = useState<ReadonlySet<string>>(new Set());
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [undo, setUndo] = useState<{ done: Completed; text: string } | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  // A completion still fading out; `u` cancels it before it reaches the server.
  const pending = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [starred, toggleStarred] = useOptimistic(
    new Set(groups.flatMap((g) => g.rows).filter((r) => r.focused).map((r) => r.id)) as ReadonlySet<string>,
    (cur, id: string) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    },
  );

  const visible = groups
    .map((g) => ({ ...g, rows: g.rows.filter((r) => !gone.has(r.id)) }))
    .filter((g) => g.rows.length > 0);
  const rows = visible.flatMap((g) => g.rows);
  const cursorIdx = rows.findIndex((r) => r.id === cursorId);
  const cursor = rows[cursorIdx];

  // The palette (⌘K) offers the cursor row's own actions.
  useEffect(() => {
    setPaletteTarget(
      cursor ? { kind: 'next', id: cursor.id, text: cursor.text, context: cursor.context, ...(cursor.project && { projectId: cursor.project.id }) } : null,
    );
  });
  useEffect(() => () => setPaletteTarget(null), []);

  function complete(id: string) {
    const row = rows.find((r) => r.id === id);
    const text = row?.text ?? focus.find((f) => f.id === id)?.text ?? '';
    if (fading.has(id) || gone.has(id)) return;
    if (id === cursorId) setCursorId((rows[cursorIdx + 1] ?? rows[cursorIdx - 1])?.id ?? null);
    setFading((prev) => new Set([...prev, id]));
    const timer = setTimeout(() => {
      if (pending.current?.id === id) pending.current = null;
      setGone((prev) => new Set([...prev, id]));
      startTransition(async () => setUndo({ done: await completeAction(id), text }));
    }, FADE_MS);
    pending.current = { id, timer };
  }

  function undoComplete() {
    if (pending.current) {
      const { id, timer } = pending.current;
      pending.current = null;
      clearTimeout(timer);
      setCursorId(id);
      setFading((prev) => new Set([...prev].filter((x) => x !== id)));
      return;
    }
    if (!undo) return;
    const { done } = undo;
    setUndo(null);
    const without = (prev: ReadonlySet<string>) => new Set([...prev].filter((x) => x !== done.id));
    setGone(without);
    setFading(without);
    setCursorId(done.id);
    startTransition(() => uncompleteAction(done));
  }

  /** Unticking a done focus item: the footer undo when it is that item, else reopen. */
  function reopen(id: string) {
    if (pending.current?.id === id || undo?.done.id === id) return undoComplete();
    const without = (prev: ReadonlySet<string>) => new Set([...prev].filter((x) => x !== id));
    setGone(without);
    setFading(without);
    startTransition(() => reopenAction(id));
  }

  function toggleFocus(id: string) {
    startTransition(async () => {
      toggleStarred(id);
      await toggleFocusAction(id);
    });
  }

  function save(id: string, edit: NextEdit) {
    setEditing(null);
    startTransition(() => editNextAction(id, edit));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e) || editing) return;
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'z' && (undo || pending.current)) {
          e.preventDefault();
          undoComplete();
        }
        return;
      }
      // `@` needs Alt on some layouts (Swiss: ⌥G / AltGr+2), so it is checked before the Alt guard.
      if (e.key === '@') {
        if (cursor) setEditing({ id: cursor.id, field: 'context' });
        e.preventDefault();
        return;
      }
      if (e.altKey) return;
      switch (e.key) {
        case 'j':
        case 'k': {
          const step = e.key === 'j' ? 1 : -1;
          const next = cursorIdx < 0 ? rows[step > 0 ? 0 : rows.length - 1] : rows[Math.min(rows.length - 1, Math.max(0, cursorIdx + step))];
          if (next) setCursorId(next.id);
          break;
        }
        case 'x':
          if (cursor) complete(cursor.id);
          break;
        case 'f':
          if (cursor) toggleFocus(cursor.id);
          break;
        case 'e':
          if (cursor) setEditing({ id: cursor.id, field: 'text' });
          break;
        case 'p':
          if (cursor) setEditing({ id: cursor.id, field: 'project' });
          break;
        case 'u':
          undoComplete();
          break;
        case 'Escape':
          setCursorId(null);
          break;
        default:
          return;
      }
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [undo]);

  useEffect(() => {
    if (cursorId) document.getElementById(`next-row-${cursorId}`)?.scrollIntoView({ block: 'nearest' });
  }, [cursorId]);

  // Focus card: the server's list, with stars and ticks applied at once.
  const focusList: FocusEntry[] = [
    ...focus.filter((f) => f.done || starred.has(f.id)),
    ...rows.filter((r) => starred.has(r.id) && !focus.some((f) => f.id === r.id)).map((r) => ({ id: r.id, text: r.text, done: false })),
  ].map((f) => ({ ...f, done: f.done || fading.has(f.id) || gone.has(f.id) }));
  const doneCount = focusList.filter((f) => f.done).length;

  return (
    <div className="grid min-h-full gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section aria-label="Actions by context" className="flex min-w-0 flex-col bg-panel lg:hidden">
        <Link href="/calendar" className="flex min-h-11 items-baseline gap-2 border-b border-line bg-ground px-4 pt-2.5 pb-1.5 text-ink no-underline">
          <span className="text-sm font-semibold">Today</span>
          <span className="min-w-0 truncate font-mono text-meta text-muted">{todayLine || 'nothing fixed today'}</span>
          <span aria-hidden="true" className="ml-auto text-muted">›</span>
        </Link>
        {visible.map((g) => (
          <div key={g.context}>
            <h2 className="m-0 flex items-center gap-2 px-4 pt-2.5 pb-1 font-mono text-xs font-medium">
              {g.context || 'no context'} <span className="font-normal text-muted">{g.count}</span>
            </h2>
            <ul className="m-0 list-none p-0">
              {g.rows.map((r) => (
                <li key={r.id} className="border-b border-line-soft">
                  <SwipeRow onRight={() => toggleFocus(r.id)} rightLabel={starred.has(r.id) ? '☆ unstar' : '★ focus today'}>
                    <label
                      className={cx(
                        'grid min-h-11 grid-cols-[20px_32px_minmax(0,1fr)] items-start gap-2.5 bg-panel px-4 py-2.5 transition-opacity duration-400',
                        fading.has(r.id) && 'opacity-0',
                      )}
                    >
                      <input type="checkbox" checked={fading.has(r.id)} onChange={() => complete(r.id)} className="m-0 size-5" />
                      <span className="pt-px">{r.priority ? <PrioChip priority={r.priority} no={r.priorityNo} /> : null}</span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span>{r.text}</span>
                        <span className="font-mono text-meta text-muted">
                          {starred.has(r.id) && <span className="text-accent">★ today · </span>}
                          {[r.project?.title ?? 'single action', r.time, r.energy].filter(Boolean).join(' · ')}
                          {r.due && <span className={r.dueSoon ? 'text-warn' : undefined}> · {r.due}</span>}
                        </span>
                      </span>
                    </label>
                  </SwipeRow>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {visible.length === 0 && (
          <p className={cx(mono, 'm-0 px-4 py-8 text-center')}>
            {hiddenByFilter ? 'Nothing matches this filter.' : 'No next actions — clarify the inbox or promote a later step.'}
          </p>
        )}
        <p className={cx(mono, 'm-0 px-4 py-2.5')}>tap to tick · swipe → focus today</p>
        {undo && <PhoneToast text={`Done: ${undo.text}`} onUndo={undoComplete} />}
      </section>
      <section aria-label="Actions grouped by context" className="flex min-w-0 flex-col gap-3 max-lg:hidden">
        {visible.map((g, gi) => (
          <Card key={g.context} aria-label={g.context || 'No context'}>
            <div className="flex items-center gap-2.5 border-b border-line px-3 py-2">
              <h2 className="m-0 font-mono text-body font-medium">{g.context || 'no context'}</h2>
              <span className={mono}>
                {g.count} · {g.total} total
              </span>
              {gi === 0 && (
                <span aria-hidden="true" className="ml-auto hidden font-mono text-label tracking-[0.1em] text-muted lg:inline">
                  PRIO · ACTION · PROJECT · TIME · ENERGY · DUE
                </span>
              )}
            </div>
            {g.rows.map((r) => (
              <ActionRow
                key={r.id}
                row={r}
                isCursor={r.id === cursorId}
                fading={fading.has(r.id)}
                starred={starred.has(r.id)}
                editing={editing?.id === r.id ? editing.field : null}
                contexts={contexts}
                projects={projects}
                onCursor={() => setCursorId(r.id)}
                onComplete={() => complete(r.id)}
                onFocus={() => toggleFocus(r.id)}
                onEdit={(field) => {
                  setCursorId(r.id);
                  setEditing({ id: r.id, field });
                }}
                onSave={(edit) => save(r.id, edit)}
                onCancel={() => setEditing(null)}
              />
            ))}
          </Card>
        ))}
        {visible.length === 0 && (
          <p className={cx(mono, 'm-0 py-8 text-center')}>
            {hiddenByFilter ? 'Nothing matches this filter.' : 'No next actions — clarify the inbox or promote a later step.'}
          </p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-meta text-muted">
          {hiddenByFilter > 0 && (
            <>
              <span>{hiddenByFilter} hidden by filter</span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span className="hidden gap-4 lg:flex">
            <span><Kbd>x</Kbd> done</span>
            <span><Kbd>f</Kbd> focus today</span>
            <span><Kbd>e</Kbd> edit</span>
            <span><Kbd>p</Kbd> project</span>
            <span><Kbd>@</Kbd> change context</span>
          </span>
          <span role="status" className="flex items-center gap-2">
            {undo && (
              <>
                <span className="max-w-72 truncate text-ink">Done: {undo.text}</span>
                <button
                  type="button"
                  onClick={undoComplete}
                  className="rounded border border-control bg-panel px-1.5 text-accent hover:text-accent-hover"
                >
                  Undo <Kbd>u</Kbd>
                </button>
              </>
            )}
          </span>
        </div>
      </section>

      <aside aria-label="Today" className="flex min-w-0 flex-col gap-3 max-lg:hidden">
        {today}
        <Card aria-labelledby="focus-head" className="flex flex-col">
          <div className="flex items-baseline gap-2 border-b border-line px-3 py-2.5">
            <h2 id="focus-head" className="m-0 text-body font-semibold">Focus for today</h2>
            <span className={mono}>
              {focusList.length} picked · {doneCount} done
            </span>
          </div>
          <div className="flex flex-col gap-1.5 px-3 pt-1.5 pb-2">
            {focusList.map((f) => (
              <label key={f.id} className="flex min-h-7 items-center gap-2">
                <input
                  type="checkbox"
                  checked={f.done}
                  onChange={() => (f.done ? reopen(f.id) : complete(f.id))}
                  className="m-0 size-4 shrink-0"
                />
                <span className={cx(f.done && 'text-muted line-through')}>{f.text}</span>
              </label>
            ))}
            {focusList.length === 0 && (
              <p className={cx(mono, 'm-0 py-1')}>
                Star an action with <Kbd>f</Kbd> to pick it for today.
              </p>
            )}
          </div>
        </Card>
        {health}
      </aside>
    </div>
  );
}

interface ActionRowProps {
  row: NextRow;
  isCursor: boolean;
  fading: boolean;
  starred: boolean;
  editing: Editing['field'] | null;
  contexts: string[];
  projects: PickerProject[];
  onCursor(): void;
  onComplete(): void;
  onFocus(): void;
  onEdit(field: Editing['field']): void;
  onSave(edit: NextEdit): void;
  onCancel(): void;
}

function ActionRow({ row: r, isCursor, fading, starred, editing, contexts, projects, onCursor, onComplete, onFocus, onEdit, onSave, onCancel }: ActionRowProps) {
  return (
    <Row
      id={`next-row-${r.id}`}
      cols={COLS}
      onClick={onCursor}
      // Drag source for time-blocking: drop the row on a slot in the Calendar (SPEC §3.6).
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_ITEM, r.id);
        e.dataTransfer.setData('text/plain', r.text);
      }}
      className={cx(
        'gap-2.5! transition-opacity duration-400 last:border-b-0',
        isCursor && 'bg-accent-tint',
        fading && 'opacity-0',
      )}
    >
      <input
        type="checkbox"
        aria-label={`Done: ${r.text}`}
        checked={fading}
        onChange={onComplete}
        className="m-0 size-4"
      />
      <button
        type="button"
        aria-label="Focus today"
        aria-pressed={starred}
        onClick={onFocus}
        className={cx('inline-flex size-6 items-center justify-center', starred ? 'text-accent' : 'text-control hover:text-muted')}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill={starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
          <path d={STAR} />
        </svg>
      </button>
      {editing === 'priority' ? (
        <ChoiceEdit
          label="Priority"
          value={r.priority ?? 'B'}
          options={PRIORITIES.map((p) => [p, p])}
          onSave={(priority) => (priority !== r.priority ? onSave({ priority }) : onCancel())}
          onCancel={onCancel}
        />
      ) : (
        <button type="button" aria-label={`Priority of “${r.text}”: ${r.priority ?? 'none'} — change`} onClick={() => onEdit('priority')} className={cellBtn}>
          {r.priority ? <PrioChip priority={r.priority} no={r.priorityNo} /> : '—'}
        </button>
      )}
      <span className="flex min-w-0 items-center gap-2" onDoubleClick={() => onEdit('text')}>
        {editing === 'text' ? (
          <TextEdit text={r.text} onSave={(text) => (text.trim() && text.trim() !== r.text ? onSave({ text }) : onCancel())} onCancel={onCancel} />
        ) : (
          <span className="min-w-0">{r.text}</span>
        )}
        {editing === 'context' && (
          <ContextEdit
            context={r.context}
            contexts={contexts}
            onSave={(context) => (context !== r.context ? onSave({ context }) : onCancel())}
            onCancel={onCancel}
          />
        )}
      </span>
      {editing === 'project' ? (
        <ProjectEdit
          projects={projects}
          current={r.project}
          onSave={(project) => onSave({ project })}
          onCancel={onCancel}
        />
      ) : r.project ? (
        <Link href={`/projects?p=${encodeURIComponent(r.project.id)}`} className="truncate text-xs text-muted no-underline hover:text-ink">
          {r.project.title}
        </Link>
      ) : (
        <span className="text-xs text-muted">— (single action)</span>
      )}
      {editing === 'time' ? (
        <ChoiceEdit
          label="Time"
          value={r.minutes ?? 30}
          options={TIMES.map((t) => [t, fmtMins(t)])}
          onSave={(time) => (time !== r.minutes ? onSave({ time }) : onCancel())}
          onCancel={onCancel}
        />
      ) : (
        <button type="button" aria-label={`Time of “${r.text}”: ${r.time ?? 'none'} — change`} onClick={() => onEdit('time')} className={cx(cellBtn, mono)}>
          {r.time ?? '—'}
        </button>
      )}
      {editing === 'energy' ? (
        <ChoiceEdit
          label="Energy"
          value={r.energy ?? 'normal'}
          options={ENERGIES.map((e) => [e, e])}
          onSave={(energy) => (energy !== r.energy ? onSave({ energy }) : onCancel())}
          onCancel={onCancel}
        />
      ) : (
        <button type="button" aria-label={`Energy of “${r.text}”: ${r.energy ?? 'none'} — change`} onClick={() => onEdit('energy')} className={cx(cellBtn, mono)}>
          {r.energy ?? '—'}
        </button>
      )}
      {editing === 'deadline' ? (
        <DateEdit
          value={r.deadline}
          onSave={(deadline) => (deadline !== (r.deadline ?? null) ? onSave({ deadline }) : onCancel())}
          onCancel={onCancel}
        />
      ) : (
        <button
          type="button"
          aria-label={`Deadline of “${r.text}”: ${r.due ?? 'none'} — change`}
          onClick={() => onEdit('deadline')}
          className={cx(cellBtn, 'font-mono text-meta', r.dueSoon ? 'text-warn' : 'text-muted')}
        >
          {r.due ?? '—'}
        </button>
      )}
    </Row>
  );
}

const editCls = 'h-7 min-w-0 rounded border border-accent bg-panel px-2 text-ink shadow-ring outline-none';
/** A cell that opens its inline editor: reads as the value, with a hover hint. */
const cellBtn = 'w-fit cursor-pointer rounded text-left hover:underline';
const PRIORITIES: Priority[] = ['A', 'B', 'C'];
const TIMES: TimeBucket[] = [15, 30, 60, 120];
const ENERGIES: Energy[] = ['focus', 'normal', 'low'];

/** One of a few values: picking saves; Esc or leaving cancels. */
function ChoiceEdit<T extends string | number>({ label, value, options, onSave, onCancel }: {
  label: string;
  value: T;
  options: [T, string][];
  onSave(value: T): void;
  onCancel(): void;
}) {
  const parse = (v: string) => options.find(([o]) => String(o) === v)![0];
  return (
    <select
      aria-label={label}
      defaultValue={String(value)}
      autoFocus
      onChange={(e) => onSave(parse(e.target.value))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSave(parse(e.currentTarget.value));
        else if (e.key === 'Escape') onCancel();
      }}
      onBlur={onCancel}
      className={cx(editCls, 'relative z-10 w-fit px-1 font-mono text-meta')}
    >
      {options.map(([o, text]) => (
        <option key={String(o)} value={String(o)}>{text}</option>
      ))}
    </select>
  );
}

/** A hard deadline: Enter or leaving saves, an emptied field removes it, Esc cancels. */
function DateEdit({ value, onSave, onCancel }: { value?: string; onSave(deadline: string | null): void; onCancel(): void }) {
  const cancelled = useRef(false);
  return (
    <input
      type="date"
      aria-label="Deadline"
      defaultValue={value ?? ''}
      autoFocus
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (e.key === 'Escape') {
          cancelled.current = true;
          onCancel();
        }
      }}
      onBlur={(e) => !cancelled.current && onSave(e.currentTarget.value || null)}
      className={cx(editCls, 'relative z-10 w-34 justify-self-end px-1 font-mono text-meta')}
    />
  );
}

/** Enter saves, Esc cancels; leaving the field saves too. */
function TextEdit({ text, onSave, onCancel }: { text: string; onSave(text: string): void; onCancel(): void }) {
  const cancelled = useRef(false);
  return (
    <input
      type="text"
      aria-label="Action text"
      defaultValue={text}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (e.key === 'Escape') {
          cancelled.current = true;
          onCancel();
        }
      }}
      onBlur={(e) => !cancelled.current && onSave(e.currentTarget.value)}
      className={cx(editCls, 'grow')}
    />
  );
}

/** Picking a context saves it; Esc or leaving cancels. */
function ContextEdit({ context, contexts, onSave, onCancel }: { context: string; contexts: string[]; onSave(context: string): void; onCancel(): void }) {
  return (
    <select
      aria-label="Context"
      defaultValue={context}
      autoFocus
      onChange={(e) => onSave(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSave(e.currentTarget.value);
        else if (e.key === 'Escape') onCancel();
      }}
      onBlur={onCancel}
      className={cx(editCls, 'shrink-0 font-mono text-meta')}
    >
      {contexts.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  );
}

/** Clarify's project picker in place: pick saves, Enter on an empty field makes it a single action. */
