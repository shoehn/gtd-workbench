'use client';

import Link from 'next/link';
import { useOptimistic, useRef, useState, useTransition, type DragEvent, type ReactNode } from 'react';
import {
  addTicklerAction,
  clearTimeSlotAction,
  completeAction,
  deleteTicklerAction,
  setDayAction,
  setTimeSlotAction,
  uncompleteAction,
  updateTicklerAction,
} from '@/lib/actions';
import type { CalendarEntry } from '@/lib/api';
import { Card } from '../ui/Card';
import { cx } from '../ui/cx';
import { BLOCK, DRAG_DAY_ONLY, DRAG_ITEM, DRAG_MINUTES, KIND } from './blocks';

export interface GridDay {
  iso: string;
  /** `MON` */
  weekday: string;
  /** Day of the month. */
  date: number;
  today: boolean;
}

interface WeekGridProps {
  days: GridDay[];
  entries: CalendarEntry[];
  /** Minutes since midnight when today is in this week; draws the now line. */
  nowMin?: number;
}

type Timed = Extract<CalendarEntry, { kind: 'appointment' | 'timeblock' }>;
type DayAction = Extract<CalendarEntry, { kind: 'dayaction' }>;

const FIRST_HOUR = 8;
const LAST_HOUR = 18;
const HOUR_PX = 48;
const SNAP_MIN = 15;
const MIN_BLOCK_PX = 44;
/** From this length on, a block shows its time range on a line of its own. */
const LONG_MIN = 90;
const GRID_COLS = 'grid-cols-[48px_repeat(7,minmax(0,1fr))]';

const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const toHm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const offset = (min: number) => ((min - FIRST_HOUR * 60) * HOUR_PX) / 60;
const hourLines = (color: string) =>
  `repeating-linear-gradient(to bottom, ${color} 0, ${color} 1px, transparent 1px, transparent ${HOUR_PX}px)`;
const label = 'font-mono text-label tracking-[0.1em]';
const cell = (last: boolean) => cx('border-b border-line', !last && 'border-r border-r-line-soft');

/** Overlapping blocks share the column side by side: each gets a lane out of its cluster's lanes. */
function layOut(timed: Timed[]): Map<string, { lane: number; lanes: number }> {
  const out = new Map<string, { lane: number; lanes: number }>();
  const sorted = [...timed].sort((a, b) => a.start!.localeCompare(b.start!) || b.end!.localeCompare(a.end!));
  let cluster: Timed[] = [];
  let laneEnds: string[] = [];
  let clusterEnd = '';
  const close = () => cluster.forEach((e) => (out.get(e.id)!.lanes = laneEnds.length));
  for (const e of sorted) {
    if (e.start! >= clusterEnd) {
      close();
      cluster = [];
      laneEnds = [];
    }
    let lane = laneEnds.findIndex((end) => end <= e.start!);
    if (lane < 0) lane = laneEnds.push(e.end!) - 1;
    else laneEnds[lane] = e.end!;
    out.set(e.id, { lane, lanes: 1 });
    cluster.push(e);
    if (e.end! > clusterEnd) clusterEnd = e.end!;
  }
  close();
  return out;
}

export function WeekGrid({ days, entries, nowMin }: WeekGridProps) {
  const [, startTransition] = useTransition();
  const [doneIds, setDone] = useOptimistic(
    new Set(entries.filter((e) => 'done' in e && e.done).map((e) => e.id)) as ReadonlySet<string>,
    (cur, { id, done }: { id: string; done: boolean }) => {
      const next = new Set(cur);
      if (done) next.add(id);
      else next.delete(id);
      return next;
    },
  );
  const [preview, setPreview] = useState<{ day: string; min: number; length?: number } | null>(null);
  const [stripOver, setStripOver] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // tickler id, or `new:<day>`
  // What is being dragged inside the grid; drags from Next Actions leave it empty.
  const dragging = useRef<{ minutes?: number } | null>(null);

  function toggleDone(e: DayAction) {
    const done = !doneIds.has(e.id);
    startTransition(async () => {
      setDone({ id: e.id, done });
      if (done) await completeAction(e.itemId);
      else await uncompleteAction({ id: e.itemId, status: 'calendar' });
    });
  }

  function startDrag(ev: DragEvent, e: Extract<CalendarEntry, { kind: 'timeblock' | 'dayaction' }>) {
    const minutes = e.kind === 'timeblock' ? toMin(e.end) - toMin(e.start) : undefined;
    ev.dataTransfer.setData(DRAG_ITEM, e.itemId);
    if (minutes) ev.dataTransfer.setData(DRAG_MINUTES, String(minutes));
    if (e.status === 'calendar') ev.dataTransfer.setData(DRAG_DAY_ONLY, '1');
    ev.dataTransfer.setData('text/plain', e.text);
    ev.dataTransfer.effectAllowed = 'move';
    dragging.current = { minutes };
  }

  /** The snapped start (minutes) under the pointer, keeping a block of `length` inside the grid. */
  function slotAt(ev: DragEvent<HTMLElement>, length = SNAP_MIN) {
    const y = ev.clientY - ev.currentTarget.getBoundingClientRect().top;
    const min = Math.round((FIRST_HOUR * 60 + (y / HOUR_PX) * 60) / SNAP_MIN) * SNAP_MIN;
    return Math.max(FIRST_HOUR * 60, Math.min(LAST_HOUR * 60 - length, min));
  }

  function overSlot(ev: DragEvent<HTMLElement>, day: string) {
    if (!ev.dataTransfer.types.includes(DRAG_ITEM)) return;
    ev.preventDefault();
    const length = dragging.current?.minutes;
    const min = slotAt(ev, length);
    if (preview?.day !== day || preview.min !== min) setPreview({ day, min, length });
  }

  function dropOnSlot(ev: DragEvent<HTMLElement>, day: string) {
    const id = ev.dataTransfer.getData(DRAG_ITEM);
    if (!id) return;
    ev.preventDefault();
    const minutes = Number(ev.dataTransfer.getData(DRAG_MINUTES)) || undefined;
    const min = slotAt(ev, minutes);
    setPreview(null);
    dragging.current = null;
    startTransition(() =>
      setTimeSlotAction(id, `${day}T${toHm(min)}`, minutes ? `${day}T${toHm(min + minutes)}` : undefined),
    );
  }

  function dropOnStrip(ev: DragEvent<HTMLElement>, day: string) {
    const id = ev.dataTransfer.getData(DRAG_ITEM);
    setStripOver(null);
    dragging.current = null;
    if (!id || !ev.dataTransfer.types.includes(DRAG_DAY_ONLY)) return;
    ev.preventDefault();
    startTransition(() => setDayAction(id, day));
  }

  /** Leaving for a child still counts as inside. */
  const left = (ev: DragEvent<HTMLElement>) => !ev.currentTarget.contains(ev.relatedTarget as Node | null);

  function saveNote(id: string | null, day: string, text: string | null) {
    setEditing(null);
    if (text === null) return;
    if (!id) {
      if (text.trim()) startTransition(() => addTicklerAction(day, text));
    } else if (!text.trim()) {
      startTransition(() => deleteTicklerAction(id));
    } else {
      startTransition(() => updateTicklerAction(id, text));
    }
  }

  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, n) => FIRST_HOUR + n);

  return (
    <Card aria-label="Week view" className={cx('grid min-h-0 grid-rows-[40px_96px_minmax(0,1fr)]', GRID_COLS)}>
      <div className={cell(false)} />
      {days.map((d, n) => (
        <div key={d.iso} className={cx(cell(n === 6), 'flex flex-col px-2 py-2', d.today && 'bg-accent-tint')}>
          <span className={cx(label, d.today ? 'text-accent' : 'text-muted')}>
            {d.weekday}
            {d.today && ' · TODAY'}
          </span>
          <span className={d.today ? 'font-semibold text-accent' : 'font-medium'}>{d.date}</span>
        </div>
      ))}

      <div className={cx(cell(false), label, 'flex flex-col gap-0.5 px-1 py-1.5 text-muted')}>
        <span>DAY</span>
        <span>ONLY</span>
      </div>
      {days.map((d, n) => {
        const allDay = entries.filter(
          (e) => e.day === d.iso && (e.kind === 'dayaction' || e.kind === 'info' || e.kind === 'deadline' || (e.kind === 'appointment' && !e.start)),
        );
        return (
          <div
            key={d.iso}
            aria-label={`${d.weekday} ${d.date}, day only`}
            onDragOver={(ev) => {
              if (!ev.dataTransfer.types.includes(DRAG_DAY_ONLY)) return;
              ev.preventDefault();
              setStripOver(d.iso);
            }}
            onDragLeave={(ev) => left(ev) && setStripOver(null)}
            onDrop={(ev) => dropOnStrip(ev, d.iso)}
            className={cx(
              cell(n === 6),
              'group flex min-h-0 flex-col gap-1 overflow-y-auto p-1.5',
              d.today && 'bg-accent-tint',
              stripOver === d.iso && 'shadow-[inset_0_0_0_2px_var(--wb-accent)]',
            )}
          >
            {allDay.map((e) => {
              switch (e.kind) {
                case 'dayaction': {
                  const done = doneIds.has(e.id);
                  return (
                    <div
                      key={e.id}
                      draggable={e.status === 'calendar' && !e.projected}
                      onDragStart={(ev) => startDrag(ev, e)}
                      className={cx(BLOCK, 'flex items-start gap-1.5', e.deadline ? KIND.deadline : KIND.dayaction)}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Done: ${e.text}`}
                        checked={done}
                        disabled={e.projected}
                        onChange={() => toggleDone(e)}
                        className="m-0 mt-px size-3.5 shrink-0"
                      />
                      <span className={cx('min-w-0', done && 'text-muted line-through')}>
                        {e.text}
                        {e.recurring && ' ↻'}
                        {e.deadline && <DeadlineTag />}
                      </span>
                    </div>
                  );
                }
                case 'deadline':
                  return (
                    <Link key={e.id} href={e.href} className={cx(BLOCK, KIND.deadline, 'block text-ink no-underline hover:underline')}>
                      {e.text}
                      <DeadlineTag />
                    </Link>
                  );
                case 'info':
                  return editing === e.ticklerId ? (
                    <NoteInput key={e.id} initial={e.text} onDone={(text) => saveNote(e.ticklerId, d.iso, text)} />
                  ) : (
                    <div key={e.id} className={cx(BLOCK, KIND.info, 'group/note relative')}>
                      <button
                        type="button"
                        aria-label={`Edit note: ${e.text}`}
                        onClick={() => setEditing(e.ticklerId)}
                        className="block w-full cursor-text pr-3 text-left"
                      >
                        {e.text}
                      </button>
                      <RemoveButton label={`Delete note: ${e.text}`} className="group-hover/note:inline-flex group-focus-within/note:inline-flex" onClick={() => saveNote(e.ticklerId, d.iso, '')} />
                    </div>
                  );
                case 'appointment':
                  return (
                    <div key={e.id} className={cx(BLOCK, KIND.appointment)}>
                      {e.text}
                    </div>
                  );
                default:
                  return null;
              }
            })}
            {editing === `new:${d.iso}` ? (
              <NoteInput initial="" onDone={(text) => saveNote(null, d.iso, text)} />
            ) : (
              <button
                type="button"
                onClick={() => setEditing(`new:${d.iso}`)}
                className="self-start rounded-chip px-1 font-mono text-meta text-muted opacity-0 group-hover:opacity-100 hover:text-ink focus:opacity-100"
              >
                + note
              </button>
            )}
          </div>
        );
      })}

      <div className="col-span-8 min-h-0 overflow-y-auto">
        <div className={cx('grid', GRID_COLS)} style={{ height: (LAST_HOUR - FIRST_HOUR) * HOUR_PX + 16 }}>
          <div aria-hidden="true" className="relative border-r border-line-soft font-mono text-label text-muted">
            {hours.map((h) => (
              <span key={h} className="absolute right-1.5" style={{ top: (h - FIRST_HOUR) * HOUR_PX }}>
                {String(h).padStart(2, '0')}
              </span>
            ))}
          </div>
          {days.map((d, n) => {
            const timed = entries.filter((e): e is Timed => e.day === d.iso && (e.kind === 'timeblock' || (e.kind === 'appointment' && !!e.start)));
            const lanes = layOut(timed);
            return (
              <div
                key={d.iso}
                aria-label={`${d.weekday} ${d.date}, ${toHm(FIRST_HOUR * 60)}–${toHm(LAST_HOUR * 60)}`}
                onDragOver={(ev) => overSlot(ev, d.iso)}
                onDragLeave={(ev) => left(ev) && setPreview(null)}
                onDrop={(ev) => dropOnSlot(ev, d.iso)}
                className={cx('relative', n < 6 && 'border-r border-line-soft')}
                style={{
                  backgroundImage: hourLines(d.today ? 'var(--wb-muted-bg)' : 'var(--wb-line-soft)'),
                  ...(d.today && { backgroundColor: 'color-mix(in srgb, var(--wb-accent-tint) 50%, var(--wb-panel))' }),
                }}
              >
                {timed.map((e) => (
                  <TimedBlock key={e.id} entry={e} {...lanes.get(e.id)!} onDragStart={(ev) => e.kind === 'timeblock' && startDrag(ev, e)} onRemove={() => startTransition(() => clearTimeSlotAction(e.id))} />
                ))}
                {preview?.day === d.iso && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-1 rounded-chip border border-dashed border-accent bg-accent-tint/70 px-1.5 font-mono text-label text-accent"
                    style={{ top: offset(preview.min), height: preview.length ? (preview.length * HOUR_PX) / 60 : 2 }}
                  >
                    {preview.length ? toHm(preview.min) : null}
                  </div>
                )}
                {d.today && nowMin !== undefined && nowMin >= FIRST_HOUR * 60 && nowMin <= LAST_HOUR * 60 && (
                  <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 h-0 border-t-2 border-warn" style={{ top: offset(nowMin) }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

interface TimedBlockProps {
  entry: Timed;
  lane: number;
  lanes: number;
  onDragStart(ev: DragEvent): void;
  onRemove(): void;
}

function TimedBlock({ entry: e, lane, lanes, onDragStart, onRemove }: TimedBlockProps) {
  const start = toMin(e.start!);
  const end = toMin(e.end!);
  const top = offset(Math.max(start, FIRST_HOUR * 60));
  const bottom = offset(Math.min(end, LAST_HOUR * 60));
  if (end <= FIRST_HOUR * 60 || start >= LAST_HOUR * 60) return null;
  const block = e.kind === 'timeblock';
  const open = block && !e.projected && !e.done;
  const time = (
    <span className={cx('font-mono text-label', block ? 'text-accent' : 'text-muted')}>
      {end - start >= LONG_MIN ? `${e.start}–${e.end}` : e.start}
    </span>
  );
  const content: ReactNode = (
    <>
      {time}
      {end - start >= LONG_MIN ? <br /> : ' '}
      <span className={cx(block && e.done && 'text-muted line-through')}>
        {e.text}
        {block && e.recurring && ' ↻'}
      </span>
    </>
  );
  return (
    <div
      draggable={open}
      onDragStart={onDragStart}
      className={cx(BLOCK, KIND[e.kind], 'group absolute overflow-hidden', open && 'cursor-grab')}
      style={{
        top,
        height: Math.max(MIN_BLOCK_PX, bottom - top - 4),
        // 4 px inset on both sides of the column, 2 px between lanes.
        left: `calc(4px + (100% - 8px) * ${lane / lanes}${lane ? ' + 1px' : ''})`,
        width: `calc((100% - 8px) / ${lanes}${lanes > 1 ? ' - 1px' : ''})`,
      }}
    >
      {block && e.href && !e.projected ? (
        <Link href={e.href} draggable={false} className="text-ink no-underline hover:underline">
          {content}
        </Link>
      ) : (
        content
      )}
      {open && <RemoveButton label={`Remove time block: ${e.text}`} className="group-hover:inline-flex group-focus-within:inline-flex" onClick={onRemove} />}
    </div>
  );
}

function DeadlineTag() {
  return <span className="ml-1 font-mono text-label tracking-[0.1em] text-warn">DEADLINE</span>;
}

/** × in the block's corner, shown on hover or keyboard focus. */
function RemoveButton({ label: name, className, onClick }: { label: string; className: string; onClick(): void }) {
  return (
    <button
      type="button"
      aria-label={name}
      onClick={onClick}
      className={cx(
        'absolute top-0.5 right-0.5 hidden size-5 items-center justify-center rounded-chip bg-panel text-muted hover:text-ink focus:inline-flex',
        className,
      )}
    >
      ×
    </button>
  );
}

/** Enter or leaving the field saves, Esc cancels (`null`). An emptied note is deleted. */
function NoteInput({ initial, onDone }: { initial: string; onDone(text: string | null): void }) {
  const cancelled = useRef(false);
  return (
    <input
      type="text"
      aria-label={initial ? 'Edit note' : 'New note'}
      defaultValue={initial}
      autoFocus
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (e.key === 'Escape') {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => onDone(cancelled.current ? null : e.currentTarget.value)}
      className="h-7 w-full min-w-0 rounded-chip border border-accent bg-panel px-1.5 text-xs text-ink shadow-ring outline-none"
    />
  );
}
