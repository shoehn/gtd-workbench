'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import {
  activateAction,
  activateProjectAction,
  addActionAction,
  dropAction,
  dropProjectAction,
  followUpAction,
  receivedAction,
  setBucketAction,
  uncompleteAction,
  undropProjectAction,
  untrashAction,
} from '@/lib/actions';
import type { NextFields as Fields } from '@/lib/api';
import { isTyping } from '../inbox/keys';
import { Btn } from '../ui/Btn';
import { Card } from '../ui/Card';
import { cx } from '../ui/cx';
import { Kbd } from '../ui/Kbd';
import { NextFields, defaultFields } from '../ui/NextFields';
import { PhoneToast } from '../ui/PhoneToast';
import { SwipeRow } from '../ui/SwipeRow';
import { useMoreBelow } from '../ui/useMoreBelow';

/** One waiting-for row, already formatted on the server. */
export interface WaitingRow {
  id: string;
  text: string;
  who: string;
  project?: { id: string; title: string };
  since: string; // `12 d`
  followUp: string; // `overdue 2 d` | `tue 29.09` | `12.10` | `no date`
  overdue: boolean;
}

export interface SomedayGroup {
  bucket: string;
  items: { id: string; text: string }[];
}

export interface OnHold {
  id: string;
  title: string;
  later: number;
}

interface WaitingBoardProps {
  waiting: WaitingRow[];
  waitingTotal: number;
  overdueCount: number;
  /** `?filter=overdue`: only overdue rows are listed. */
  overdueOnly: boolean;
  onHold: OnHold[];
  someday: SomedayGroup[];
  somedayTotal: number;
  buckets: string[];
  contexts: string[];
  /** Where `f` files the follow-up (Settings). */
  followUpContext: string;
  /** `?tab=someday` starts with the cursor pane on Someday/Maybe; on the phone it picks the tab. */
  initialPane: Pane;
}

type Pane = 'waiting' | 'someday';
type Entry = { kind: 'waiting' | 'item' | 'project'; id: string; text: string };

const UNDO_MS = 5000;
const COLS = 'grid grid-cols-[minmax(0,1fr)_90px_60px_76px] gap-2.5';
const mono = 'font-mono text-meta text-muted';
const label = 'font-mono text-label tracking-[0.1em] text-muted';
// Phone: the same small buttons, with a 44 px touch area.
const rowBtn =
  'relative h-6 shrink-0 rounded border border-control bg-panel text-xs hover:border-muted max-lg:after:absolute max-lg:after:-inset-y-2.5 max-lg:after:-inset-x-0.5';

export function WaitingBoard(props: WaitingBoardProps) {
  const { waiting, onHold, someday, buckets, contexts } = props;
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pane, setPane] = useState<Pane>(props.initialPane);
  const [cursor, setCursor] = useState<Record<Pane, string | null>>({ waiting: null, someday: null });
  // Hidden at once, before the server round trip removes them.
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [undo, setUndo] = useState<{ pane: Pane; label: string; run(): Promise<void>; ids: string[] } | null>(null);
  const [askNext, setAskNext] = useState<{ projectId: string; title: string } | null>(null);
  const somedayPane = useRef<HTMLElement>(null);
  const { scroller: waitingScroller, list: waitingList, moreBelow: waitingMore } = useMoreBelow();
  const { scroller: somedayScroller, list: somedayList, moreBelow: somedayMore } = useMoreBelow();

  useEffect(() => {
    if (props.initialPane === 'someday') somedayPane.current?.scrollIntoView({ block: 'nearest' });
  }, [props.initialPane]);

  const waitingRows = waiting.filter((w) => !gone.has(w.id));
  const holdRows = onHold.filter((p) => !gone.has(p.id));
  const groups = someday.map((g) => ({ ...g, items: g.items.filter((i) => !gone.has(i.id)) })).filter((g) => g.items.length);
  const entries: Record<Pane, Entry[]> = {
    waiting: waitingRows.map((w) => ({ kind: 'waiting', id: w.id, text: w.text })),
    someday: [
      ...holdRows.map((p) => ({ kind: 'project' as const, id: p.id, text: p.title })),
      ...groups.flatMap((g) => g.items.map((i) => ({ kind: 'item' as const, id: i.id, text: i.text }))),
    ],
  };
  const current = entries[pane].find((e) => e.id === cursor[pane]);

  function hide(id: string) {
    const list = entries[pane];
    const at = list.findIndex((e) => e.id === id);
    if (cursor[pane] === id) setCursor((c) => ({ ...c, [pane]: (list[at + 1] ?? list[at - 1])?.id ?? null }));
    setGone((prev) => new Set([...prev, id]));
  }

  function offerUndo(where: Pane, labelText: string, ids: string[], run: () => Promise<void>) {
    setUndo({ pane: where, label: labelText, ids, run });
  }

  function undoLast() {
    if (!undo) return;
    const { run, ids } = undo;
    setUndo(null);
    setGone((prev) => new Set([...prev].filter((x) => !ids.includes(x))));
    startTransition(run);
  }

  function followUp(id: string) {
    startTransition(() => followUpAction(id));
  }

  function received(row: WaitingRow) {
    hide(row.id);
    startTransition(async () => {
      const done = await receivedAction(row.id);
      offerUndo('waiting', `Received: ${row.text}`, [row.id], () => uncompleteAction(done));
      if (done.askNextFor && row.project) setAskNext({ projectId: done.askNextFor, title: row.project.title });
    });
  }

  function activate(e: Entry) {
    startTransition(async () => {
      if (e.kind === 'project') {
        await activateProjectAction(e.id);
        router.push(`/projects?p=${encodeURIComponent(e.id)}`);
      } else {
        await activateAction(e.id);
        router.push(`/clarify?item=${encodeURIComponent(e.id)}`);
      }
    });
  }

  function drop(e: Entry) {
    hide(e.id);
    startTransition(async () => {
      if (e.kind === 'project') {
        await dropProjectAction(e.id);
        offerUndo('someday', `Dropped project: ${e.text}`, [e.id], () => undropProjectAction(e.id));
      } else {
        const moved = await dropAction(e.id);
        offerUndo('someday', `Dropped: ${e.text}`, [e.id], () => untrashAction(moved));
      }
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e) || e.altKey || askNext) return;
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'z' && undo) {
          e.preventDefault();
          undoLast();
        }
        return;
      }
      const list = entries[pane];
      const idx = list.findIndex((x) => x.id === cursor[pane]);
      switch (e.key) {
        case 'j':
        case 'k': {
          const step = e.key === 'j' ? 1 : -1;
          const next = idx < 0 ? list[step > 0 ? 0 : list.length - 1] : list[Math.min(list.length - 1, Math.max(0, idx + step))];
          if (next) setCursor((c) => ({ ...c, [pane]: next.id }));
          break;
        }
        case 'Tab': {
          // Only while a list cursor is active; otherwise Tab moves focus as usual (Esc drops it).
          if (!cursor[pane]) return;
          const other: Pane = pane === 'waiting' ? 'someday' : 'waiting';
          setPane(other);
          if (!cursor[other] && entries[other][0]) setCursor((c) => ({ ...c, [other]: entries[other][0].id }));
          break;
        }
        case 'Escape':
          if (!cursor[pane]) return;
          setCursor((c) => ({ ...c, [pane]: null }));
          break;
        case 'f':
          if (pane === 'waiting' && current) followUp(current.id);
          break;
        case 'x':
          if (!current) break;
          if (pane === 'waiting') received(waitingRows.find((w) => w.id === current.id)!);
          else activate(current);
          break;
        case 'Backspace':
        case 'Delete':
          if (pane === 'someday' && current) drop(current);
          break;
        case 'u':
          undoLast();
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
    const id = cursor[pane];
    if (id) document.getElementById(`wb-row-${id}`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor, pane]);

  const isCursor = (p: Pane, id: string) => pane === p && cursor[p] === id;
  const pick = (p: Pane, id: string) => {
    setPane(p);
    setCursor((c) => ({ ...c, [p]: id }));
  };

  const undoStrip = undo && (
    <span role="status" className="flex min-w-0 items-center gap-2">
      <span className="truncate text-ink">{undo.label}</span>
      <button type="button" onClick={undoLast} className="shrink-0 rounded border border-control bg-panel px-1.5 text-accent hover:text-accent-hover">
        Undo <Kbd>u</Kbd>
      </button>
    </span>
  );

  const phoneSomeday = props.initialPane === 'someday';

  return (
    <div className="grid gap-4 lg:h-full lg:grid-cols-2">
      {!phoneSomeday && (
        <section aria-label="Waiting For" className="flex min-h-full flex-col bg-panel lg:hidden">
          {askNext && (
            <AskNext
              {...askNext}
              contexts={contexts}
              onFile={(text, fields) => {
                const { projectId } = askNext;
                setAskNext(null);
                startTransition(() => addActionAction(projectId, text, fields));
              }}
              onSkip={() => setAskNext(null)}
            />
          )}
          <ul className="m-0 list-none p-0">
            {waitingRows.map((w) => (
              <li key={w.id} className="border-b border-line-soft">
                <SwipeRow onRight={() => received(w)} onLeft={() => followUp(w.id)} rightLabel="received →" leftLabel="← follow up">
                  <div className={cx('grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2.5 px-4 py-3', w.overdue ? 'bg-warn-tint' : 'bg-panel')}>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span>{w.text}</span>
                      <span className="text-sm text-muted">{[w.who, w.project?.title, `since ${w.since}`].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="flex flex-col items-end gap-1.5">
                      <span className={cx('font-mono text-meta', w.overdue ? 'text-warn' : 'text-muted')}>{w.followUp}</span>
                      {w.overdue && (
                        <button
                          type="button"
                          onClick={() => followUp(w.id)}
                          className="relative h-8 rounded border border-warn bg-panel px-2.5 text-sm text-warn after:absolute after:-inset-1.5"
                        >
                          Follow up
                        </button>
                      )}
                    </span>
                  </div>
                </SwipeRow>
              </li>
            ))}
          </ul>
          {waitingRows.length === 0 ? (
            <p className={cx(mono, 'm-0 py-8 text-center')}>{props.overdueOnly ? 'Nothing overdue.' : 'Nothing delegated.'}</p>
          ) : (
            <p className={cx(mono, 'm-0 px-4 py-2.5')}>swipe → received · swipe ← follow up</p>
          )}
          {props.overdueOnly && (
            <Link href="/waiting" className="mx-4 flex min-h-11 items-center font-mono text-meta no-underline">
              Show all {props.waitingTotal}
            </Link>
          )}
          {undo?.pane === 'waiting' && <PhoneToast text={undo.label} onUndo={undoLast} />}
        </section>
      )}
      <Card aria-labelledby="waiting-head" className={cx('flex min-h-0 flex-col max-lg:hidden', pane === 'waiting' && cursor.waiting && 'border-muted')}>
        <div className="flex items-center gap-2.5 border-b border-line px-3 py-2.5">
          <h2 id="waiting-head" className="m-0 text-body font-semibold">Waiting For</h2>
          <span className={mono}>
            {props.overdueOnly ? (
              <>
                <span className="text-warn">{props.overdueCount} overdue</span> of {props.waitingTotal} ·{' '}
                <Link href="/waiting" className="no-underline">Show all</Link>
              </>
            ) : (
              <>
                {props.waitingTotal}
                {props.overdueCount > 0 && (
                  <>
                    {' · '}
                    <Link href="/waiting?filter=overdue" className="text-warn no-underline hover:underline">
                      {props.overdueCount} overdue
                    </Link>
                  </>
                )}
              </>
            )}
          </span>
          <span className={cx(mono, 'ml-auto hidden xl:inline')}>by follow-up</span>
        </div>
        {askNext && (
          <AskNext
            {...askNext}
            contexts={contexts}
            onFile={(text, fields) => {
              const { projectId } = askNext;
              setAskNext(null);
              startTransition(() => addActionAction(projectId, text, fields));
            }}
            onSkip={() => setAskNext(null)}
          />
        )}
        <div aria-hidden="true" className={cx(COLS, 'border-b border-line-soft px-3 py-1.5', label)}>
          <span>WHAT · FROM WHOM</span>
          <span>PROJECT</span>
          <span>SINCE</span>
          <span>FOLLOW UP</span>
        </div>
        <div ref={waitingScroller} className="min-h-0 grow overflow-y-auto">
          <div ref={waitingList}>
            {waitingRows.map((w) => (
              <div
                key={w.id}
                id={`wb-row-${w.id}`}
                onClick={() => pick('waiting', w.id)}
                className={cx(
                  COLS,
                  'items-start border-b border-line-soft px-3 py-2.25',
                  isCursor('waiting', w.id) ? 'bg-accent-tint' : w.overdue && 'bg-warn-tint',
                )}
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span>{w.text}</span>
                  <span className="text-xs text-muted">{w.who}</span>
                </span>
                {w.project ? (
                  <Link href={`/projects?p=${encodeURIComponent(w.project.id)}`} className="truncate text-xs text-muted no-underline hover:text-ink">
                    {w.project.title}
                  </Link>
                ) : (
                  <span className="text-xs text-muted">—</span>
                )}
                <span className={mono}>{w.since}</span>
                <span className={cx('font-mono text-meta', w.overdue ? 'text-warn' : 'text-muted')}>{w.followUp}</span>
              </div>
            ))}
          </div>
          {waitingRows.length === 0 && (
            <p className={cx(mono, 'm-0 py-8 text-center')}>{props.overdueOnly ? 'Nothing overdue.' : 'Nothing delegated.'}</p>
          )}
        </div>
        <Footer more={waitingMore}>
          <button type="button" disabled={pane !== 'waiting' || !current} onClick={() => current && followUp(current.id)} className="text-left disabled:cursor-default enabled:hover:text-ink">
            <Kbd>f</Kbd> follow up → creates {props.followUpContext} / @computer action
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            disabled={pane !== 'waiting' || !current}
            onClick={() => current && received(waitingRows.find((w) => w.id === current.id)!)}
            className="disabled:cursor-default enabled:hover:text-ink"
          >
            <Kbd>x</Kbd> received
          </button>
          {undo?.pane === 'waiting' && undoStrip}
        </Footer>
      </Card>

      <Card
        ref={somedayPane}
        aria-labelledby="someday-head"
        className={cx(
          'flex min-h-0 flex-col',
          phoneSomeday ? 'max-lg:min-h-full max-lg:rounded-none max-lg:border-0' : 'max-lg:hidden',
          pane === 'someday' && cursor.someday && 'border-muted',
        )}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-3 py-2.5 max-lg:sr-only">
          <h2 id="someday-head" className="m-0 text-body font-semibold">Someday / Maybe</h2>
          <span className={mono}>{props.somedayTotal} · reviewed weekly, activated rarely</span>
          <span className={cx(mono, 'ml-auto hidden xl:inline')}>by bucket</span>
        </div>
        <div ref={somedayScroller} className="min-h-0 grow overflow-y-auto">
          <div ref={somedayList}>
            {holdRows.length > 0 && <SectionTitle title="PROJECTS ON HOLD" count={holdRows.length} />}
            {holdRows.map((p) => (
              <SomedayRow
                key={p.id}
                id={p.id}
                cursor={isCursor('someday', p.id)}
                onPick={() => pick('someday', p.id)}
                onActivate={() => activate({ kind: 'project', id: p.id, text: p.title })}
                onDrop={() => drop({ kind: 'project', id: p.id, text: p.title })}
                label={p.title}
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <Link href={`/projects?p=${encodeURIComponent(p.id)}`} className="text-ink no-underline hover:text-accent">
                    {p.title}
                  </Link>
                  <span className="text-xs text-muted">
                    {p.later} later step{p.later === 1 ? '' : 's'}
                  </span>
                </span>
              </SomedayRow>
            ))}
            {groups.map((g) => [
              <SectionTitle key={`h-${g.bucket}`} title={(g.bucket || 'No bucket').toUpperCase()} count={g.items.length} />,
              ...g.items.map((i) => (
                <SomedayRow
                  key={i.id}
                  id={i.id}
                  cursor={isCursor('someday', i.id)}
                  onPick={() => pick('someday', i.id)}
                  onActivate={() => activate({ kind: 'item', id: i.id, text: i.text })}
                  onDrop={() => drop({ kind: 'item', id: i.id, text: i.text })}
                  label={i.text}
                  bucket={
                    <select
                      aria-label={`Bucket for “${i.text}”`}
                      value={g.bucket}
                      onChange={(e) => startTransition(() => setBucketAction(i.id, e.target.value))}
                      className="h-6 max-w-36 rounded border border-control bg-panel px-1 font-mono text-meta text-muted max-lg:h-11 max-lg:max-w-none max-lg:grow lg:opacity-0 lg:group-hover:opacity-100 lg:focus:opacity-100"
                    >
                      {buckets.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                      <option value="">no bucket</option>
                    </select>
                  }
                >
                  <span className="min-w-0">{i.text}</span>
                </SomedayRow>
              )),
            ])}
          </div>
          {holdRows.length + groups.length === 0 && <p className={cx(mono, 'm-0 py-8 text-center')}>Someday / Maybe is empty.</p>}
        </div>
        <Footer more={somedayMore}>
          <span>Activate → becomes a project or a next action, via Clarify</span>
          {undo?.pane === 'someday' && undoStrip}
        </Footer>
      </Card>
    </div>
  );
}

function Footer({ more, children }: { more: number; children: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3.5 gap-y-1 border-t border-line px-3 py-2 font-mono text-meta text-muted">
      {children}
      <span className="grow" />
      {more > 0 && <span>{more} more</span>}
    </div>
  );
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <h3 className={cx(label, 'm-0 px-3 pt-2.5 pb-1 font-normal max-lg:px-4')}>
      {title} · {count}
    </h3>
  );
}

function SomedayRow({
  id,
  cursor,
  label: text,
  bucket,
  children,
  onPick,
  onActivate,
  onDrop,
}: {
  id: string;
  cursor: boolean;
  label: string;
  bucket?: ReactNode;
  children: ReactNode;
  onPick(): void;
  onActivate(): void;
  onDrop(): void;
}) {
  return (
    <div
      id={`wb-row-${id}`}
      onClick={onPick}
      className={cx(
        'group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 border-b border-line-soft px-3 py-1.75 max-lg:grid-cols-1 max-lg:gap-2 max-lg:px-4 max-lg:py-3',
        cursor && 'bg-accent-tint',
      )}
    >
      {children}
      <div className="flex items-center gap-1.5 max-lg:gap-2.5">
        {bucket}
        <button type="button" className={cx(rowBtn, 'px-2 text-ink max-lg:h-11 max-lg:px-4')} onClick={onActivate}>
          Activate
        </button>
        <button type="button" aria-label={`Drop “${text}”`} className={cx(rowBtn, 'w-7 text-muted max-lg:h-11 max-lg:w-11')} onClick={onDrop}>
          ×
        </button>
      </div>
    </div>
  );
}

/** After "received" leaves a project without a next action: ask for one (skip allowed). */
function AskNext({
  title,
  contexts,
  onFile,
  onSkip,
}: {
  title: string;
  contexts: string[];
  onFile(text: string, fields: Fields): void;
  onSkip(): void;
}) {
  const [text, setText] = useState('');
  const [fields, setFields] = useState<Fields>(() => defaultFields(contexts));
  const file = () => text.trim() && onFile(text, fields);
  return (
    <div
      role="group"
      aria-label={`Next action for ${title}`}
      className="flex flex-col gap-1.5 border-b border-line bg-warn-tint px-3 py-2.5"
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          file();
        } else if (e.key === 'Escape') onSkip();
      }}
    >
      <span className="text-xs">
        Next action for <span className="font-semibold">{title}</span>? It has none now.
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="text"
          aria-label="Next action"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-(--wb-hit-phone) min-w-0 grow basis-48 rounded border border-control bg-panel px-2 outline-none focus:border-accent focus:shadow-ring lg:h-7"
        />
        <NextFields contexts={contexts} value={fields} onChange={setFields} />
        <Btn size="sm" variant="primary" disabled={!text.trim()} onClick={file}>File</Btn>
        <Btn size="sm" variant="ghost" onClick={onSkip}>Skip</Btn>
      </div>
    </div>
  );
}
