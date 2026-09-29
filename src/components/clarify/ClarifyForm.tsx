'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { clarifyAction } from '@/lib/actions';
import type { Decision, Route, Similar } from '@/lib/api';
import { fmtDate, fmtDay, fmtTime } from '@/lib/format';
import type { Energy, Priority, Source, TimeBucket } from '@/lib/model';
import { isTyping } from '../inbox/keys';
import { Btn } from '../ui/Btn';
import { Card } from '../ui/Card';
import { cx } from '../ui/cx';
import { Kbd } from '../ui/Kbd';
import { PrioChip } from '../ui/PrioChip';
import { SectionHead } from '../ui/SectionHead';
import { Tag } from '../ui/Tag';
import { ENERGIES, PRIORITIES, TIMES } from '../ui/NextFields';
import { ProjectPicker, type Picked, type PickerProject } from '../ui/ProjectPicker';

export interface ClarifyItem {
  id: string;
  text: string;
  captured: string;
  source: Source;
  when: string; // `fri 17:02`
  context?: string;
  priority?: Priority;
  day?: string; // ISO, from `^date` at capture
  tags: string[];
}

type Answer = 'yes' | 'trash' | 'someday' | 'reference';
type RouteTo = Route['to'];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const NOT_ACTIONABLE: { value: Exclude<Answer, 'yes'>; label: string; key: string; file: string }[] = [
  { value: 'trash', label: 'No → Trash', key: 't', file: 'Trash' },
  { value: 'someday', label: 'No → Someday / Maybe', key: 'm', file: 'Move to Someday' },
  { value: 'reference', label: 'No → Reference', key: 'r', file: 'File as reference' },
];
const ROUTES: { value: RouteTo; label: string; key: string }[] = [
  { value: 'done', label: 'Do it now (< 2 min)', key: '2' },
  { value: 'waiting', label: 'Delegate → Waiting For', key: 'w' },
  { value: 'next', label: 'Defer → Next Actions', key: 'n' },
  { value: 'calendar', label: 'Defer → Calendar', key: 'k' },
];
const SIMILAR_HREF: Partial<Record<string, string>> = {
  next: '/next',
  done: '/next',
  waiting: '/waiting',
  someday: '/waiting',
  calendar: '/calendar',
};

const labelCls = 'font-mono text-label uppercase tracking-[0.1em] text-muted';
const controlCls =
  'h-(--wb-hit-phone) rounded border border-control bg-panel px-2 text-ink outline-none focus:border-accent focus:shadow-ring lg:h-(--wb-hit-input)';

/** Key hint inside a button: white-ish on primary, muted on outline. */
function Hot({ k, on }: { k: string; on?: boolean }) {
  return on ? <span className="font-mono text-meta opacity-80">{k}</span> : <Kbd>{k}</Kbd>;
}

function Toggle({ pressed, label, k, onClick }: { pressed: boolean; label: string; k: string; onClick(): void }) {
  return (
    <Btn variant={pressed ? 'primary' : 'outline'} aria-pressed={pressed} onClick={onClick} className="lg:h-8 lg:px-3.5">
      {label} <Hot k={k} on={pressed} />
    </Btn>
  );
}

/** One of the four steps. Dimmed steps keep their height and disable their controls. */
function Step(props: { n: number; title: string; hint?: string; dim?: boolean; top?: boolean; last?: boolean; children: ReactNode }) {
  const id = `step-${props.n}`;
  return (
    <fieldset
      disabled={props.dim}
      aria-labelledby={id}
      className={cx(
        'm-0 grid min-w-0 gap-3 border-0 px-4 py-3 lg:grid-cols-[28px_200px_minmax(0,1fr)]',
        props.top ? 'items-start' : 'items-center',
        !props.last && 'border-b border-line-soft',
        props.dim && 'opacity-40',
      )}
    >
      <span className="hidden size-5.5 items-center justify-center rounded-chip bg-ink font-mono text-meta text-panel lg:inline-flex">
        {props.n}
      </span>
      <div className="flex flex-col gap-0.5">
        <span id={id} className="font-semibold">
          <span className="font-mono lg:hidden">{props.n} · </span>
          {props.title}
        </span>
        {props.hint && <span className="text-meta text-muted">{props.hint}</span>}
      </div>
      <div className="flex min-w-0 flex-col gap-2">{props.children}</div>
    </fieldset>
  );
}

function Select(props: { label: string; value: string; options: { value: string; label: string }[]; onChange(v: string): void }) {
  const id = `sel-${props.label.toLowerCase()}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelCls}>{props.label}</label>
      <select id={id} value={props.value} onChange={(e) => props.onChange(e.target.value)} className={controlCls}>
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

interface ClarifyFormProps {
  item: ClarifyItem;
  /** Remaining inbox ids in processing order, starting after this item. */
  after: string[];
  contexts: string[];
  projects: PickerProject[];
  similar: Similar[];
}

export function ClarifyForm({ item, after, contexts, projects, similar }: ClarifyFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [text, setText] = useState(item.text);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Picked>(null);
  const [asNext, setAsNext] = useState(true);
  // A day captured with `^date` is an offer for the calendar (SPEC §3.2).
  const [routeTo, setRouteTo] = useState<RouteTo | null>(item.day ? 'calendar' : null);
  const [context, setContext] = useState(item.context ?? contexts[0]);
  const [priority, setPriority] = useState<Priority>(item.priority ?? 'B');
  const [time, setTime] = useState<TimeBucket>(30);
  const [energy, setEnergy] = useState<Energy>('normal');
  const [deadline, setDeadline] = useState('');
  const [day, setDay] = useState(item.day ?? '');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [who, setWho] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickerRef = useRef<HTMLInputElement>(null);
  const whoRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);
  /** Required field to focus once the chosen route's fields have mounted. */
  const focusAfterRender = useRef<'who' | 'day' | null>(null);

  const notActionable = answer !== null && answer !== 'yes';
  const later = !notActionable && picked !== null && !asNext;
  const step4Dim = notActionable || later;
  const existing = picked && 'id' in picked ? picked : null;
  const projectTitle = picked ? ('id' in picked ? picked.title : picked.newTitle) : null;
  const edited = text !== item.text;
  const deadlineOk = !deadline || ISO_DATE.test(deadline);

  function pick(p: Picked) {
    setPicked(p);
    if (p) setAsNext('id' in p ? p.nextActions === 0 : true);
  }

  /** The decision the form currently describes, or why it can't be filed yet. */
  function decide(): Decision | string {
    if (!answer) return 'step 1: is it actionable?';
    if (answer !== 'yes') return { kind: answer };
    if (!text.trim()) return 'step 2: outcome is empty';
    if (query.trim() && !picked) return 'step 3: pick a project (⏎) or clear it (esc)';
    const project = existing ? { id: existing.id } : picked && 'newTitle' in picked ? { newTitle: picked.newTitle } : undefined;
    if (later && project) return { kind: 'later', text, project };
    let route: Route;
    switch (routeTo) {
      case null:
        return 'step 4: do, delegate or defer?';
      case 'done':
        route = { to: 'done' };
        break;
      case 'waiting':
        if (!who.trim()) return 'step 4: waiting for whom?';
        route = { to: 'waiting', who, ...(followUp && { followUp }) };
        break;
      case 'calendar':
        if (!day) return 'step 4: calendar needs a day';
        if (!start !== !end || (start && end <= start)) return 'step 4: time needs from and to';
        route = { to: 'calendar', day, ...(start && { start, end }) };
        break;
      case 'next':
        if (!deadlineOk) return 'deadline: use yyyy-mm-dd';
        route = { to: 'next', context, priority, time, energy, ...(deadline && { deadline }) };
        break;
    }
    return { kind: 'action', text, project, route };
  }

  const decision = decide();
  const ready = typeof decision !== 'string';

  function summary(): string {
    if (typeof decision === 'string') return decision;
    if (decision.kind === 'trash') return 'will move to trash';
    if (decision.kind === 'someday') return 'will create: 1 someday / maybe item';
    if (decision.kind === 'reference') return 'will file: 1 reference item';
    const parts = picked && 'newTitle' in picked ? ['1 project'] : [];
    if (decision.kind === 'later') {
      parts.push('1 later step');
    } else {
      const r = decision.route;
      if (r.to === 'done') parts.push('1 done action');
      if (r.to === 'waiting') parts.push(`1 waiting for · ${r.who.trim()}`);
      if (r.to === 'calendar') parts.push(`1 calendar entry ${fmtDay(r.day)}${r.start ? ` ${r.start}–${r.end}` : ''}`);
      if (r.to === 'next') parts.push(`1 next action ${r.context} · ${r.priority} · ${fmtTime(r.time)}`);
    }
    return `will create: ${parts.join(' · ')}`;
  }

  /** "Result of this clarify" rows. */
  function resultRows(): [string, ReactNode][] {
    if (notActionable) {
      const list = { trash: 'Trash', someday: 'Someday / Maybe', reference: 'Reference' }[answer];
      return [['item', item.text], ['list', list]];
    }
    const rows: [string, ReactNode][] = [];
    rows.push([
      'project',
      projectTitle ? (
        <>
          {projectTitle} {picked && 'newTitle' in picked && <span className="font-mono text-meta text-accent">new</span>}
        </>
      ) : (
        <span className="text-muted">— single action</span>
      ),
    ]);
    rows.push([later ? 'later' : picked ? 'next' : 'action', text || '—']);
    const list: Record<RouteTo, string> = {
      done: 'Done now',
      waiting: `Waiting For · ${who.trim() || '…'}${followUp ? ` · follow up ${fmtDate(followUp)}` : ''}`,
      calendar: `Calendar · ${day ? fmtDay(day) : '…'}${start && end ? ` · ${start}–${end}` : ''}`,
      next: `Next Actions · ${context} · ${priority} · ${fmtTime(time)} · ${energy}`,
    };
    rows.push(['list', later ? `Later steps · ${projectTitle}` : routeTo ? list[routeTo] : '—']);
    if (!step4Dim && routeTo === 'next' && deadline && deadlineOk) rows.push(['deadline', `${fmtDate(deadline)} → calendar`]);
    return rows;
  }

  function goNext() {
    router.push(after.length ? `/clarify?item=${encodeURIComponent(after[0])}` : '/inbox');
  }

  function commit(d: Decision) {
    setError(null);
    startTransition(async () => {
      try {
        await clarifyAction(item.id, d);
        goNext();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function file() {
    if (pending) return;
    setTried(true);
    if (typeof decision !== 'string') commit(decision);
  }

  function chooseRoute(r: RouteTo) {
    setRouteTo(r);
    focusAfterRender.current = r === 'waiting' ? 'who' : r === 'calendar' ? 'day' : null;
  }

  useEffect(() => {
    const want = focusAfterRender.current;
    if (!want) return;
    focusAfterRender.current = null;
    (want === 'who' ? whoRef : dayRef).current?.focus();
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      switch (e.key) {
        case 'y':
          setAnswer('yes');
          break;
        case 't':
          setAnswer('trash');
          break;
        case 'm':
          setAnswer('someday');
          break;
        case 'r':
          setAnswer('reference');
          break;
        case 'p':
          if (notActionable) return;
          pickerRef.current?.focus();
          break;
        case 'a':
          if (notActionable || !picked) return;
          setAsNext((v) => !v);
          break;
        case '2':
        case 'w':
        case 'n':
        case 'k':
          if (step4Dim) return;
          chooseRoute(ROUTES.find((r) => r.key === e.key)!.value);
          break;
        case 'Enter':
          if (target.closest('button, a')) return; // let the focused control act
          file();
          break;
        case 's':
          if (after.length) goNext();
          break;
        case 'Backspace':
        case 'Delete':
          if (!pending) commit({ kind: 'trash' });
          break;
        default:
          return;
      }
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    file();
  }

  const primaryLabel = notActionable ? `${NOT_ACTIONABLE.find((n) => n.value === answer)!.file} and next` : 'File it and next';
  const nextNote = !picked
    ? ''
    : !existing
      ? 'new project, no next action yet'
      : existing.nextActions
        ? `project has ${existing.nextActions} next action${existing.nextActions === 1 ? '' : 's'} — this adds another`
        : 'no next action — this becomes it';

  return (
    <div className="grid min-h-full gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <form onSubmit={onSubmit} aria-label="Decision flow" className="flex min-w-0 flex-col gap-3">
        <Card aria-label="Inbox item" className="flex flex-col gap-1.5 px-4 py-3.5">
          <SectionHead className="m-0">
            Inbox item · {item.source} · {item.when}
          </SectionHead>
          <div className="text-[16px] font-medium">{item.text}</div>
          {(item.context || item.priority || item.day || item.tags.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {item.context && <Tag>{item.context}</Tag>}
              {item.priority && <PrioChip priority={item.priority} />}
              {item.day && <Tag>{fmtDay(item.day)}</Tag>}
              {item.tags.map((t) => (
                <Tag key={t}>#{t}</Tag>
              ))}
            </div>
          )}
        </Card>

        <Card aria-label="The four steps" className="flex flex-col">
          <Step n={1} title="Is it actionable?">
            <div className="flex flex-wrap gap-2">
              <Toggle pressed={answer === 'yes'} label="Yes" k="y" onClick={() => setAnswer('yes')} />
              {NOT_ACTIONABLE.map((n) => (
                <Toggle key={n.value} pressed={answer === n.value} label={n.label} k={n.key} onClick={() => setAnswer(n.value)} />
              ))}
            </div>
          </Step>

          <Step n={2} title="What is it?" hint="Prefilled with your capture. Rewrite only if the words don't say what it really is." dim={notActionable}>
            <div className="flex items-center gap-2">
              <label htmlFor="outcome" className="font-mono text-meta text-muted">outcome</label>
              <input
                id="outcome"
                type="text"
                autoComplete="off"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
                className={cx(controlCls, 'min-w-0 grow px-2.5 lg:h-8')}
              />
            </div>
            <span className="min-h-[1.4em] truncate font-mono text-meta text-muted" aria-live="polite">
              {edited && `edited — original kept on the item: "${item.captured}"`}
            </span>
          </Step>

          <Step n={3} title="Project" hint="Leave empty for a single action." dim={notActionable} top>
            <ProjectPicker projects={projects} query={query} picked={picked} onQuery={setQuery} onPick={pick} inputRef={pickerRef} />
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <input
                id="isnext"
                type="checkbox"
                checked={picked ? asNext : true}
                disabled={!picked}
                onChange={(e) => setAsNext(e.target.checked)}
                className="m-0 size-4"
              />
              <label htmlFor="isnext" className={cx(!picked && 'text-muted')}>Make this the project&apos;s next action</label>
              <span className="font-mono text-meta text-muted">{nextNote}</span>
            </div>
          </Step>

          <Step n={4} title="Do, delegate or defer?" hint="Only for a next action or a single action. Later steps skip this." dim={step4Dim} top last>
            <div className="flex flex-wrap gap-2">
              {ROUTES.map((r) => (
                <Toggle key={r.value} pressed={routeTo === r.value} label={r.label} k={r.key} onClick={() => chooseRoute(r.value)} />
              ))}
            </div>

            {routeTo === 'next' && (
              <>
                <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                  <Select label="Context" value={context} options={contexts.map((c) => ({ value: c, label: c }))} onChange={setContext} />
                  <Select label="Priority" value={priority} options={PRIORITIES} onChange={(v) => setPriority(v as Priority)} />
                  <Select label="Time" value={String(time)} options={TIMES.map((t) => ({ value: String(t), label: fmtTime(t) }))} onChange={(v) => setTime(Number(v) as TimeBucket)} />
                  <Select label="Energy" value={energy} options={ENERGIES.map((v) => ({ value: v, label: v }))} onChange={(v) => setEnergy(v as Energy)} />
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <label htmlFor="due" className={labelCls}>Deadline</label>
                  <input
                    id="due"
                    type="text"
                    inputMode="numeric"
                    placeholder="yyyy-mm-dd"
                    autoComplete="off"
                    value={deadline}
                    aria-invalid={!deadlineOk}
                    onChange={(e) => setDeadline(e.target.value.trim())}
                    onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
                    className={cx(controlCls, 'w-30 font-mono text-xs', !deadlineOk && 'border-warn')}
                  />
                  <span className="text-meta text-muted">Hard deadline only. Wishes go on the action, not the calendar.</span>
                </div>
              </>
            )}

            {routeTo === 'calendar' && (
              <div className="flex flex-wrap items-end gap-2.5">
                <div className="flex flex-col gap-1">
                  <label htmlFor="cal-day" className={labelCls}>Day</label>
                  <input id="cal-day" ref={dayRef} type="date" required value={day} onChange={(e) => setDay(e.target.value)} className={cx(controlCls, 'font-mono text-xs')} />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="cal-from" className={labelCls}>From</label>
                  <input id="cal-from" type="time" value={start} onChange={(e) => setStart(e.target.value)} className={cx(controlCls, 'font-mono text-xs')} />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="cal-to" className={labelCls}>To</label>
                  <input id="cal-to" type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={cx(controlCls, 'font-mono text-xs')} />
                </div>
                <span className="pb-1.5 text-meta text-muted">Time is optional: without it, it is a day-specific action.</span>
              </div>
            )}

            {routeTo === 'waiting' && (
              <div className="flex flex-wrap items-end gap-2.5">
                <div className="flex min-w-48 grow flex-col gap-1">
                  <label htmlFor="who" className={labelCls}>Waiting for whom</label>
                  <input
                    id="who"
                    ref={whoRef}
                    type="text"
                    required
                    autoComplete="off"
                    value={who}
                    onChange={(e) => setWho(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
                    className={controlCls}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="follow-up" className={labelCls}>Follow up</label>
                  <input id="follow-up" type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className={cx(controlCls, 'font-mono text-xs')} />
                </div>
              </div>
            )}
          </Step>
        </Card>

        <div className="mt-auto flex flex-wrap items-center gap-2.5">
          <Btn type="submit" variant="primary" disabled={pending} className="lg:h-9 lg:px-4">
            {primaryLabel} <Hot k="⏎" on />
          </Btn>
          {answer !== 'trash' && (
            <Btn disabled={pending} onClick={() => commit({ kind: 'trash' })} className="lg:h-9 lg:px-3.5">
              Trash <Kbd>⌫</Kbd>
            </Btn>
          )}
          <span className="grow" />
          <span
            role="status"
            className={cx('font-mono text-meta', error || (tried && !ready) ? 'text-warn' : 'text-muted')}
          >
            {error ?? summary()}
          </span>
        </div>
      </form>

      <aside aria-label="Context while clarifying" className="flex min-w-0 flex-col gap-3">
        <Card className="flex flex-col gap-2 px-3.5 py-3">
          <SectionHead className="m-0">Similar already on your lists</SectionHead>
          {similar.length ? (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {similar.map((s) => (
                <li key={s.id}>
                  <Link
                    href={s.kind === 'project' ? '/projects' : (SIMILAR_HREF[s.status] ?? '/projects')}
                    className="flex justify-between gap-2 text-ink no-underline hover:text-accent"
                  >
                    <span className="truncate">{s.title}</span>
                    <span className="shrink-0 font-mono text-meta text-muted">
                      {s.kind === 'project' ? 'project' : [s.context, s.status].filter(Boolean).join(' · ')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <span className="font-mono text-meta text-muted">nothing similar</span>
          )}
        </Card>

        <Card className="flex flex-col gap-2 px-3.5 py-3">
          <SectionHead className="m-0">Result of this clarify</SectionHead>
          <dl className="m-0 grid grid-cols-[64px_minmax(0,1fr)] gap-x-2.5 gap-y-1 text-xs">
            {resultRows().map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-mono text-meta text-muted">{k}</dt>
                <dd className="m-0">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="mt-auto hidden flex-col gap-1.5 px-3.5 py-3 lg:flex">
          <SectionHead className="m-0">Keys</SectionHead>
          <dl className="m-0 grid grid-cols-[72px_minmax(0,1fr)] gap-x-2.5 gap-y-1 font-mono text-meta text-muted">
            {[
              ['y / t m r', 'actionable / trash · someday · reference'],
              ['p / a', 'project picker · toggle next action'],
              ['2 w n k', 'do now · waiting · next · calendar'],
              ['⏎ / s', 'file and next · skip'],
              ['⌫', 'trash'],
            ].map(([k, v]) => (
              <div key={k} className="contents">
                <dt>{k}</dt>
                <dd className="m-0">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </aside>
    </div>
  );
}
