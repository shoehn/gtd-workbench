'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import {
  activateProjectAction,
  addActionAction,
  addStepAction,
  completeProjectAction,
  demoteAction,
  moveProjectToSomedayAction,
  promoteAction,
  updateProjectAction,
} from '@/lib/actions';
import type { NextFields as Fields, ProjectPatch } from '@/lib/api';
import type { Priority, Project } from '@/lib/model';
import { projectsHref, type ProjectFilter } from '@/lib/project-filter';
import { Btn } from '../ui/Btn';
import { Card } from '../ui/Card';
import { cx } from '../ui/cx';
import { NextFields, defaultFields } from '../ui/NextFields';
import { PrioChip } from '../ui/PrioChip';
import { Row } from '../ui/Row';
import { ReferenceBox, type ProjectReference } from './ReferenceBox';
import { SectionHead } from '../ui/SectionHead';

/** A project's detail, already formatted on the server. */
export interface DetailData {
  id: string;
  title: string;
  status: Project['status'];
  dropped?: boolean;
  /** `HOME & WORKSHOP · CREATED SAT 26.09 · FROM INBOX` */
  headline: string;
  successfulWhen?: string;
  deadline?: string; // `03.10`
  area?: string;
  goal?: string;
  notes: string;
  lastReviewed: string; // `3 d ago` | `never`
  /** Next actions and later steps still open: completing is blocked while > 0. */
  open: number;
  next: { id: string; text: string; priority?: Priority; priorityNo?: number; context?: string; time?: string; today: boolean }[];
  later: { id: string; text: string }[];
  done: { id: string; text: string; context?: string }[];
  waiting: { id: string; text: string; who: string; since: string; followUp?: string; overdue: boolean }[];
  /** `/waiting?filter=overdue` when one of them is overdue, else `/waiting`. */
  waitingHref: string;
  references: ProjectReference[];
}

type Drag = { kind: 'next' | 'later'; id: string } | null;

// Phone keeps chip · text · button; context, time and "today" move under the text.
const NEXT_COLS = 'var(--next-cols)';
const NEXT_COLS_VAR = '[--next-cols:36px_minmax(0,1fr)_auto] lg:[--next-cols:36px_minmax(0,1fr)_84px_44px_44px_64px]';
/** Phone: small buttons keep their look and get a 44 px touch area. */
const TOUCH = 'relative max-lg:after:absolute max-lg:after:-inset-x-1 max-lg:after:-inset-y-3';
const mono = 'font-mono text-meta text-muted';
const smallBtn = TOUCH + ' h-5.5 shrink-0 whitespace-nowrap rounded border border-control bg-panel px-1.5 font-mono text-meta text-muted hover:border-muted hover:text-ink';
const addBtn = TOUCH + ' h-6 rounded px-2 text-xs text-accent hover:text-accent-hover';
const inputCls = 'h-(--wb-hit-phone) min-w-0 rounded border border-control bg-panel px-2 text-ink outline-none focus:border-accent focus:shadow-ring lg:h-7';

export function ProjectDetail({ project: p, contexts }: { project: DetailData; contexts: string[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [adding, setAdding] = useState<'action' | 'step' | null>(null);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [dropOn, setDropOn] = useState<'next' | 'later' | null>(null);
  const blockId = useId();
  const active = p.status === 'active';

  const run = (fn: () => Promise<void>) => startTransition(fn);
  const update = (patch: ProjectPatch) => run(() => updateProjectAction(p.id, patch));
  /** A status change follows the project to the list it now belongs to, still selected. */
  const move = (action: (id: string) => Promise<void>, to: ProjectFilter) =>
    run(async () => {
      await action(p.id);
      router.replace(projectsHref(to, p.id), { scroll: false });
    });

  function dropZone(zone: 'next' | 'later') {
    // A parked project takes no next action: nothing is dropped into its next actions.
    const accepts = drag && drag.kind !== zone && (zone === 'later' || active);
    return {
      onDragOver(e: DragEvent) {
        if (!accepts) return;
        e.preventDefault();
        setDropOn(zone);
      },
      onDragLeave(e: DragEvent) {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropOn(null);
      },
      onDrop(e: DragEvent) {
        e.preventDefault();
        setDropOn(null);
        if (!drag || !accepts) return;
        // Next → later demotes at once; later → next asks for the step-4 fields first.
        if (zone === 'later') run(() => demoteAction(drag.id));
        else setPromoting(drag.id);
        setDrag(null);
      },
    };
  }

  const dragHandlers = (kind: 'next' | 'later', id: string) => ({
    draggable: active,
    onDragStart(e: DragEvent) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
      setDrag({ kind, id });
    },
    onDragEnd() {
      setDrag(null);
      setDropOn(null);
    },
  });

  return (
    <section aria-label="Project detail" className="flex min-w-0 flex-col gap-3 px-4 py-4 lg:min-h-0 lg:overflow-y-auto lg:px-5">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-label tracking-[0.1em] text-muted">{p.headline}</span>
          <span className="grow" />
          {active && (
            <>
              {p.open > 0 && (
                <span id={blockId} className={mono}>
                  {p.open} open — finish, demote or drop them first
                </span>
              )}
              <Btn size="sm" disabled={p.open > 0} aria-describedby={p.open > 0 ? blockId : undefined} onClick={() => move(completeProjectAction, 'completed')}>
                Complete
              </Btn>
              <Btn size="sm" onClick={() => move(moveProjectToSomedayAction, 'someday')}>→ Someday</Btn>
            </>
          )}
          {p.status === 'someday' && (
            <>
              <span className={mono}>someday</span>
              <Btn size="sm" onClick={() => move(activateProjectAction, 'active')}>→ Active</Btn>
            </>
          )}
          {p.status === 'completed' && (
            <span className={cx('font-mono text-meta', p.dropped ? 'text-muted' : 'text-ok')}>{p.dropped ? 'dropped' : 'completed'}</span>
          )}
        </div>
        <h2 className="m-0 text-(length:--wb-text-detail-h2) leading-tight font-semibold">
          <InlineText key={p.id} value={p.title} label="Project title" required onSave={(title) => update({ title })} />
        </h2>
        <dl className="m-0 grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1">
          <dt className={cx(mono, 'pt-0.5')}>successful when</dt>
          <dd className="m-0">
            <InlineText key={p.id} value={p.successfulWhen ?? ''} label="Successful when" placeholder="describe done" onSave={(successfulWhen) => update({ successfulWhen })} />
          </dd>
          <dt className={cx(mono, 'pt-0.5')}>deadline</dt>
          <dd className="m-0">{p.deadline ?? <span className="text-muted">—</span>}</dd>
        </dl>
      </div>

      <Card
        aria-labelledby={`${blockId}-next`}
        {...dropZone('next')}
        className={cx(dropOn === 'next' && 'border-accent shadow-ring')}
      >
        <CardHead
          id={`${blockId}-next`}
          title="Next actions"
          meta={`${p.next.length} open · ${p.done.length} done · complete them from the lists`}
          action={active && <button type="button" className={addBtn} onClick={() => setAdding('action')}>+ action</button>}
        />
        {p.next.map((n) => (
          <Row key={n.id} cols={NEXT_COLS} className={cx('gap-2.5! last:border-b-0', NEXT_COLS_VAR)} {...dragHandlers('next', n.id)}>
            {n.priority ? <PrioChip priority={n.priority} no={n.priorityNo} /> : <span />}
            <span className="flex min-w-0 flex-col gap-0.5 lg:contents">
              <Link href={`/next?highlight=${encodeURIComponent(n.id)}`} className="min-w-0 text-ink no-underline hover:text-accent">
                {n.text}
              </Link>
              <span className={cx(mono, 'lg:hidden')}>
                {[n.context, n.time].filter(Boolean).join(' · ')}
                {n.today && <span className="text-accent"> · today</span>}
              </span>
            </span>
            <span className={cx(mono, 'truncate max-lg:hidden')}>{n.context}</span>
            <span className={cx(mono, 'max-lg:hidden')}>{n.time}</span>
            <span className="font-mono text-meta text-accent max-lg:hidden">{n.today && 'today'}</span>
            <button type="button" className={smallBtn} aria-label={`Make “${n.text}” a later step`} onClick={() => run(() => demoteAction(n.id))}>
              ↓ later
            </button>
          </Row>
        ))}
        {p.next.length === 0 && adding !== 'action' && (
          <p className={cx('m-0 px-3 py-2 text-xs', active ? 'text-warn' : 'text-muted')}>
            {active
              ? 'No next action — the project is stalled. Promote a later step or add one.'
              : p.status === 'someday'
                ? 'On hold — nothing of it is on Next Actions. → Active to resume.'
                : p.dropped ? 'Dropped from Someday / Maybe.' : 'Completed.'}
          </p>
        )}
        {adding === 'action' && (
          <AddAction
            contexts={contexts}
            onFile={(text, fields) => {
              setAdding(null);
              run(() => addActionAction(p.id, text, fields));
            }}
            onCancel={() => setAdding(null)}
          />
        )}
      </Card>

      <Card
        aria-labelledby={`${blockId}-later`}
        {...dropZone('later')}
        className={cx(dropOn === 'later' && 'border-accent shadow-ring')}
      >
        <CardHead
          id={`${blockId}-later`}
          title="Later steps"
          meta="not on any list yet — promote with ↑ next, or drag above the line"
          action={<button type="button" className={addBtn} onClick={() => setAdding('step')}>+ step</button>}
        />
        <div className="flex flex-col gap-1 px-3 pt-1.5 pb-2 text-muted">
          {p.later.map((l) =>
            promoting === l.id ? (
              <Promote
                key={l.id}
                text={l.text}
                contexts={contexts}
                onFile={(fields) => {
                  setPromoting(null);
                  run(() => promoteAction(l.id, fields));
                }}
                onCancel={() => setPromoting(null)}
              />
            ) : (
              <div key={l.id} className="flex min-h-6.5 items-center gap-2.5" {...dragHandlers('later', l.id)}>
                <span className="grow">{l.text}</span>
                {active && (
                  <button type="button" className={smallBtn} aria-label={`Make “${l.text}” a next action`} onClick={() => setPromoting(l.id)}>
                    ↑ next
                  </button>
                )}
              </div>
            ),
          )}
          {adding === 'step' && (
            <AddStep
              onAdd={(text) => run(() => addStepAction(p.id, text))}
              onDone={() => setAdding(null)}
            />
          )}
          {p.done.map((d) => (
            <div key={d.id} className="flex min-h-6.5 items-center gap-2.5">
              <span className="grow line-through">{d.text}</span>
              <span className={mono}>done{d.context && ` · ${d.context}`}</span>
            </div>
          ))}
          {p.later.length + p.done.length === 0 && adding !== 'step' && <p className="m-0 text-xs">No later steps.</p>}
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="flex flex-col gap-2 px-3 py-2.5">
          <SectionHead className="m-0">Waiting for</SectionHead>
          {p.waiting.map((w) => (
            <div key={w.id} className="flex flex-col gap-0.5">
              <span className="text-xs">
                {w.who} — {w.text}
              </span>
              <span className={cx('font-mono text-meta', w.overdue ? 'text-warn' : 'text-muted')}>
                since {w.since}
                {w.followUp && ` · follow up ${w.followUp}`}
              </span>
            </div>
          ))}
          {p.waiting.length === 0 && <span className="text-xs text-muted">Nothing delegated.</span>}
          <Link href={p.waitingHref} className="mt-auto text-xs no-underline">
            {p.waitingHref.includes('overdue') ? 'Overdue waiting-for →' : 'All waiting-for →'}
          </Link>
        </Card>
        <ReferenceBox projectId={p.id} entries={p.references} />
        <Card className="flex flex-col gap-1.5 px-3 py-2.5">
          <SectionHead className="m-0">Horizon</SectionHead>
          <dl className="m-0 grid grid-cols-[40px_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
            <dt className={mono}>area</dt>
            <dd className="m-0">
              <InlineText key={p.id} value={p.area ?? ''} label="Area" placeholder="add area" onSave={(area) => update({ area })} />
            </dd>
            <dt className={mono}>goal</dt>
            <dd className="m-0">
              <InlineText key={p.id} value={p.goal ?? ''} label="Goal" placeholder="add goal" onSave={(goal) => update({ goal })} />
            </dd>
          </dl>
        </Card>
      </div>

      <Card className="flex min-h-40 grow flex-col">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <h3 className="m-0 text-body font-semibold">Support notes</h3>
          <span className={cx(mono, 'ml-auto')}>last reviewed {p.lastReviewed}</span>
        </div>
        <textarea
          key={p.id}
          aria-label="Project support notes"
          defaultValue={p.notes}
          onBlur={(e) => e.currentTarget.value !== p.notes && update({ notes: e.currentTarget.value })}
          className="min-h-32 grow resize-none border-0 bg-panel px-3 py-2.5 leading-normal text-ink outline-none"
        />
      </Card>
    </section>
  );
}

function CardHead({ id, title, meta, action }: { id: string; title: string; meta: string; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-line px-3 py-2">
      <h3 id={id} className="m-0 shrink-0 text-body font-semibold">{title}</h3>
      <span className={cx(mono, 'min-w-0 truncate')} title={meta}>{meta}</span>
      <span className="grow" />
      <span className="shrink-0">{action}</span>
    </div>
  );
}

/** Enter files, Esc cancels — for the inline forms below. */
function keys(onEnter: () => void, onEscape: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onEnter();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      onEscape();
    }
  };
}

function AddAction({ contexts, onFile, onCancel }: { contexts: string[]; onFile(text: string, fields: Fields): void; onCancel(): void }) {
  const [text, setText] = useState('');
  const [fields, setFields] = useState<Fields>(() => defaultFields(contexts));
  const file = () => text.trim() && onFile(text, fields);
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-line-soft px-3 py-2" onKeyDown={keys(file, onCancel)}>
      <input
        type="text"
        aria-label="New next action"
        placeholder="What is the next physical action?"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        className={cx(inputCls, 'grow basis-60')}
      />
      <NextFields contexts={contexts} value={fields} onChange={setFields} />
      <Btn size="sm" variant="primary" disabled={!text.trim()} onClick={file}>File</Btn>
      <Btn size="sm" variant="ghost" onClick={onCancel}>Cancel</Btn>
    </div>
  );
}

function Promote({ text, contexts, onFile, onCancel }: { text: string; contexts: string[]; onFile(fields: Fields): void; onCancel(): void }) {
  const [fields, setFields] = useState<Fields>(() => defaultFields(contexts));
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => box.current?.querySelector('select')?.focus(), []);
  return (
    <div ref={box} role="group" aria-label={`Promote “${text}”`} className="flex flex-wrap items-center gap-1.5 py-1 text-ink" onKeyDown={keys(() => onFile(fields), onCancel)}>
      <span className="grow basis-48">{text}</span>
      <NextFields contexts={contexts} value={fields} onChange={setFields} />
      <Btn size="sm" variant="primary" onClick={() => onFile(fields)}>File</Btn>
      <Btn size="sm" variant="ghost" onClick={onCancel}>Cancel</Btn>
    </div>
  );
}

/** Enter adds and stays open for the next step; Esc (or leaving an empty field) closes. */
function AddStep({ onAdd, onDone }: { onAdd(text: string): void; onDone(): void }) {
  const [text, setText] = useState('');
  return (
    <input
      type="text"
      aria-label="New later step"
      placeholder="Next step after that…"
      autoFocus
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={keys(() => {
        if (!text.trim()) return onDone();
        onAdd(text);
        setText('');
      }, onDone)}
      onBlur={() => !text.trim() && onDone()}
      className={cx(inputCls, 'text-ink')}
    />
  );
}

/** Click to edit in place: Enter or leaving saves, Esc cancels. */
function InlineText({
  value,
  label,
  placeholder,
  required,
  onSave,
}: {
  value: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  onSave(value: string): void;
}) {
  const [editing, setEditing] = useState(false);
  const cancelled = useRef(false);
  if (editing) {
    return (
      <input
        type="text"
        aria-label={label}
        defaultValue={value}
        autoFocus
        onFocus={(e) => {
          cancelled.current = false;
          e.currentTarget.select();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          else if (e.key === 'Escape') {
            cancelled.current = true;
            setEditing(false);
          }
        }}
        onBlur={(e) => {
          setEditing(false);
          const v = e.currentTarget.value.trim();
          if (cancelled.current || v === value || (required && !v)) return;
          onSave(v);
        }}
        className={cx(inputCls, 'w-full font-[inherit] text-[length:inherit]')}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="block w-full cursor-text rounded text-left font-[inherit] hover:bg-panel/70"
    >
      {value || <span className="text-muted">{placeholder ?? '—'}</span>}
      <span className="sr-only">, edit {label.toLowerCase()}</span>
    </button>
  );
}
