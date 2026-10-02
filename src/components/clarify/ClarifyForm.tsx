'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { clarifyAction } from '@/lib/actions';
import type { Decision, Route, Similar } from '@/lib/api';
import { fmtDate, fmtDay, fmtTime } from '@/lib/format';
import type { Draft, Energy, Priority, Reference, Source, TimeBucket } from '@/lib/model';
import { URL_IN_TEXT, guessReference } from '@/lib/reference';
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
  /** What came with it: a mail's body, a shared URL (SPEC §3.1). */
  reference?: Reference;
  /** A project it carries in (e.g. back from Someday): step 3 starts with it, and may clear it. */
  projectId?: string;
  /** A proposed decision (MCP §3.4): the form starts from it. */
  draft?: Draft;
}

type Answer = 'yes' | 'trash' | 'someday' | 'reference';
type RouteTo = Route['to'];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const NOT_ACTIONABLE: { value: Exclude<Answer, 'yes'>; label: string; key: string; file: string }[] = [
  { value: 'trash', label: 'No → Trash', key: 't', file: 'Trash' },
  { value: 'someday', label: 'No → Someday / Maybe', key: 'm', file: 'Move to Someday' },
  { value: 'reference', label: 'No → Reference', key: 'r', file: 'File as reference' },
];
const ROUTES: { value: RouteTo; label: string; short: string; key: string }[] = [
  { value: 'done', label: 'Do it now (< 2 min)', short: 'Do now < 2 min', key: '2' },
  { value: 'waiting', label: 'Delegate → Waiting For', short: 'Delegate', key: 'w' },
  { value: 'next', label: 'Defer → Next Actions', short: 'Next Actions', key: 'n' },
  { value: 'calendar', label: 'Defer → Calendar', short: 'Calendar', key: 'k' },
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

function Toggle(props: { pressed: boolean; label: string; short?: string; k: string; onClick(): void; className?: string }) {
  const { pressed, label, short, k, onClick, className } = props;
  return (
    <Btn variant={pressed ? 'primary' : 'outline'} aria-pressed={pressed} onClick={onClick} className={cx('max-lg:h-11 lg:h-8 lg:px-3.5', className)}>
      {short ? (
        <>
          <span className="lg:hidden">{short}</span>
          <span className="max-lg:hidden lg:contents">
            {label} <Hot k={k} on={pressed} />
          </span>
        </>
      ) : (
        <>
          {label} <span className="max-lg:hidden lg:contents"><Hot k={k} on={pressed} /></span>
        </>
      )}
    </Btn>
  );
}

/** Phone: a finished step folded to one line, with a check and "Edit". */
function Folded({ text, onEdit }: { text: string; onEdit(): void }) {
  return (
    <div className="flex items-center gap-2 border-b border-line-soft px-3.5 py-1.5 text-muted lg:hidden">
      <span aria-hidden="true" className="inline-flex size-5 shrink-0 items-center justify-center rounded-chip bg-ok font-mono text-meta text-panel">✓</span>
      <span className="min-w-0 grow truncate text-sm">{text}</span>
      <button type="button" onClick={onEdit} className="h-11 shrink-0 px-2 text-accent">
        Edit
      </button>
    </div>
  );
}

/** One of the four steps. Dimmed steps keep their height and disable their controls. */
function Step(props: { n: number; title: string; hint?: string; dim?: boolean; top?: boolean; last?: boolean; className?: string; children: ReactNode }) {
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
        props.className,
      )}
    >
      <span className="hidden size-5.5 items-center justify-center rounded-chip bg-ink font-mono text-meta text-panel lg:inline-flex">
        {props.n}
      </span>
      <div className="flex flex-col gap-0.5">
        <span id={id} className="font-semibold">
          <span className="mr-2 inline-flex size-5 items-center justify-center rounded-chip bg-ink align-[2px] font-mono text-meta font-normal text-panel lg:hidden">
            {props.n}
          </span>
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
  // What the form starts with: an agent's draft if there is one (MCP §3.4), else the item itself.
  const d = item.draft;
  const toPicked = (p: PickerProject): Picked => ({ id: p.id, title: p.title, nextActions: p.nextActions, active: p.active });
  const carried = projects.find((p) => p.id === item.projectId);
  // A draft's project only if it can still be picked (it may have been completed since).
  const draftProject: Picked = !d?.project
    ? null
    : 'newTitle' in d.project
      ? { newTitle: d.project.newTitle }
      : (() => {
          const id = (d.project as { id: string }).id;
          const p = projects.find((x) => x.id === id);
          return p ? toPicked(p) : null;
        })();
  const startPicked: Picked = draftProject ?? (carried ? toPicked(carried) : null);
  const startAnswer: Answer | null = !d ? null : d.kind === 'action' || d.kind === 'project' ? 'yes' : d.kind;

  const [answer, setAnswer] = useState<Answer | null>(startAnswer);
  const [text, setText] = useState(d?.text ?? item.text);
  // The field shows a starting pick by its title, as a pick made by hand does.
  const [query, setQuery] = useState(startPicked ? ('id' in startPicked ? startPicked.title : startPicked.newTitle) : '');
  const [picked, setPicked] = useState<Picked>(startPicked);
  // As pick() would set it for the starting project, unless the draft says.
  const [asNext, setAsNext] = useState(d?.next ?? (startPicked && 'id' in startPicked ? startPicked.active && startPicked.nextActions === 0 : true));
  // A day captured with `^date` is an offer for the calendar (SPEC §3.2).
  const [routeTo, setRouteTo] = useState<RouteTo | null>(d?.route ?? (item.day ? 'calendar' : null));
  const [context, setContext] = useState(d?.context && contexts.includes(d.context) ? d.context : (item.context ?? contexts[0]));
  const [priority, setPriority] = useState<Priority>(d?.priority ?? item.priority ?? 'B');
  const [time, setTime] = useState<TimeBucket>(d?.time ?? 30);
  const [energy, setEnergy] = useState<Energy>(d?.energy ?? 'normal');
  const [deadline, setDeadline] = useState(d?.deadline ?? '');
  const [day, setDay] = useState(d?.day ?? item.day ?? '');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [who, setWho] = useState(d?.who ?? '');
  const [followUp, setFollowUp] = useState(d?.followUp ?? '');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "No → Reference": what came with the item, else the kind guessed from the text (a URL makes it a link).
  const guess = item.reference ?? guessReference(item.text);
  const [refKind, setRefKind] = useState<Reference['kind']>(guess.kind);
  const [refUrl, setRefUrl] = useState(guess.url ?? '');
  const [refBody, setRefBody] = useState('');
  // Phone: steps 1–2 fold once answered; "Edit" opens them again. Time / energy / deadline fold too.
  const [unfold, setUnfold] = useState<{ 1?: boolean; 2?: boolean }>({});
  const [moreFields, setMoreFields] = useState(false);

  const pickerRef = useRef<HTMLInputElement>(null);
  const whoRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);
  /** Required field to focus once the chosen route's fields have mounted. */
  const focusAfterRender = useRef<'who' | 'day' | null>(null);

  const notActionable = answer !== null && answer !== 'yes';
  // "No → Reference" may still name a project (step 3) and says what kind of entry it is.
  const asReference = answer === 'reference';
  const later = !notActionable && picked !== null && !asNext;
  const step4Dim = notActionable || later;
  const existing = picked && 'id' in picked ? picked : null;
  const projectTitle = picked ? ('id' in picked ? picked.title : picked.newTitle) : null;
  const edited = text !== item.text;
  const deadlineOk = !deadline || ISO_DATE.test(deadline);

  function pick(p: Picked) {
    setPicked(p);
    // A parked project takes no next action (SPEC §3.4): the item becomes one of its later steps.
    if (p) setAsNext('id' in p ? p.active && p.nextActions === 0 : true);
  }

  /** The decision the form currently describes, or why it can't be filed yet. */
  function decide(): Decision | string {
    if (!answer) return 'step 1: is it actionable?';
    if (answer === 'reference') {
      if (query.trim() && !picked) return 'step 3: pick a project (⏎) or clear it (esc)';
      if (refKind === 'link' && !URL_IN_TEXT.test(refUrl)) return 'reference: a link needs a URL (https://, obsidian://, …)';
      if (refKind === 'file' && !refBody.trim()) return 'reference: a file needs a path or file name';
      const project = existing ? { id: existing.id } : picked && 'newTitle' in picked ? { newTitle: picked.newTitle } : undefined;
      return {
        kind: 'reference',
        reference: refKind === 'link' ? { kind: 'link', url: refUrl } : refKind === 'file' ? { kind: 'file', body: refBody } : { kind: 'note' },
        ...(project && { project }),
      };
    }
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
    if (decision.kind === 'reference') return `will file: 1 reference ${refKind}${projectTitle ? ` · ${projectTitle}` : ''}`;
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
      if (answer === 'reference') return [['item', item.text], ['list', `Reference · ${refKind}`], ['project', projectTitle ?? '— loose']];
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
          if (notActionable && !asReference) return;
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

  const fold1 = answer !== null && !unfold[1];
  const fold2 = answer === 'yes' && !unfold[2];
  const step1Summary = answer === 'yes' ? (picked ? 'Actionable · project' : 'Actionable') : NOT_ACTIONABLE.find((n) => n.value === answer)?.label ?? '';
  const primaryLabel = notActionable ? `${NOT_ACTIONABLE.find((n) => n.value === answer)!.file} and next` : 'File it and next';
  const parked = existing !== null && !existing.active;
  const nextNote = !picked
    ? ''
    : parked
      ? 'project is on hold — this becomes a later step (activate it on Someday / Maybe)'
      : !existing
      ? 'new project, no next action yet'
      : existing.nextActions
        ? `project has ${existing.nextActions} next action${existing.nextActions === 1 ? '' : 's'} — this adds another`
        : 'no next action — this becomes it';

  return (
    <div className="grid min-h-full gap-4 max-lg:px-4 max-lg:pt-3 max-lg:pb-28 lg:grid-cols-[minmax(0,1fr)_360px]">
      <form onSubmit={onSubmit} aria-label="Decision flow" className="flex min-w-0 flex-col gap-3 max-lg:gap-2.5">
        <Card aria-label="Inbox item" className="flex flex-col gap-1.5 px-4 py-3.5 max-lg:gap-1 max-lg:px-3.5 max-lg:py-3">
          <SectionHead className="m-0">
            <span className="max-lg:hidden">Inbox item · </span>
            {item.source} · {item.when}
            {' · '}
            <Link href={`/activity?subject=${encodeURIComponent(item.id)}`} className="text-muted underline-offset-2 hover:text-ink">
              history
            </Link>
          </SectionHead>
          <div className="font-medium lg:text-[16px]">{item.text}</div>
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
          {item.reference?.url && (
            <a href={item.reference.url} target="_blank" rel="noopener noreferrer" className="w-fit font-mono text-meta break-all text-accent">
              {item.reference.url}
            </a>
          )}
          {item.reference?.body && (
            <p className="m-0 max-h-40 overflow-y-auto border-l-2 border-line pl-2.5 text-sm whitespace-pre-wrap text-muted">{item.reference.body}</p>
          )}
          {item.draft && (
            <p className="m-0 font-mono text-meta text-accent">
              drafted by {item.draft.by} · {item.draft.reason}
            </p>
          )}
        </Card>

        <Card aria-label="The four steps" className="flex flex-col">
          {fold1 && <Folded text={step1Summary} onEdit={() => setUnfold((u) => ({ ...u, 1: true }))} />}
          <Step n={1} title="Is it actionable?" className={cx(fold1 && 'max-lg:hidden')}>
            <div className="flex flex-wrap gap-2">
              <Toggle pressed={answer === 'yes'} label="Yes" k="y" onClick={() => setAnswer('yes')} />
              {NOT_ACTIONABLE.map((n) => (
                <Toggle key={n.value} pressed={answer === n.value} label={n.label} k={n.key} onClick={() => setAnswer(n.value)} />
              ))}
            </div>
            {asReference && (
              <div role="group" aria-label="Kind of reference" className="flex flex-wrap items-center gap-2">
                <span className={labelCls}>Kind</span>
                {(['note', 'link', 'file'] as const).map((k) => (
                  <Btn key={k} size="sm" variant={refKind === k ? 'primary' : 'outline'} aria-pressed={refKind === k} onClick={() => setRefKind(k)}>
                    {k}
                  </Btn>
                ))}
                {refKind === 'link' && (
                  <input
                    aria-label="URL"
                    value={refUrl}
                    placeholder="https://… or obsidian://…"
                    onChange={(e) => setRefUrl(e.target.value.trim())}
                    className={cx(controlCls, 'min-w-48 grow font-mono text-xs lg:h-7')}
                  />
                )}
                {refKind === 'file' && (
                  <input
                    aria-label="Path or file name"
                    value={refBody}
                    placeholder="path or file name"
                    onChange={(e) => setRefBody(e.target.value)}
                    className={cx(controlCls, 'min-w-48 grow font-mono text-xs lg:h-7')}
                  />
                )}
                <span className="text-meta text-muted">optional: a project in step 3</span>
              </div>
            )}
          </Step>

          {fold2 && <Folded text={text || '—'} onEdit={() => setUnfold((u) => ({ ...u, 2: true }))} />}
          <Step
            n={2}
            title="What is it?"
            hint="Prefilled with your capture. Rewrite only if the words don't say what it really is."
            dim={notActionable}
            className={cx((fold2 || notActionable) && 'max-lg:hidden')}
          >
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

          <Step
            n={3}
            title="Project"
            hint={asReference ? 'Optional: the project this reference belongs to.' : 'Leave empty for a single action.'}
            dim={notActionable && !asReference}
            top
            className={cx(notActionable && !asReference && 'max-lg:hidden')}
          >
            <ProjectPicker projects={projects} query={query} picked={picked} onQuery={setQuery} onPick={pick} inputRef={pickerRef} />
            <div className={cx('flex flex-wrap items-center gap-x-2.5 gap-y-1', asReference && 'hidden')}>
              <input
                id="isnext"
                type="checkbox"
                checked={picked ? asNext : true}
                disabled={!picked || parked}
                onChange={(e) => setAsNext(e.target.checked)}
                className="m-0 size-4"
              />
              <label htmlFor="isnext" className={cx((!picked || parked) && 'text-muted')}>Make this the project&apos;s next action</label>
              <span className="font-mono text-meta text-muted">{nextNote}</span>
            </div>
          </Step>

          <Step
            n={4}
            title="Do, delegate or defer?"
            hint="Only for a next action or a single action. Later steps skip this."
            dim={step4Dim}
            top
            last
            className={cx(step4Dim && 'max-lg:hidden')}
          >
            <div className="flex flex-wrap gap-2 max-lg:grid max-lg:grid-cols-2">
              {ROUTES.map((r) => (
                <Toggle key={r.value} pressed={routeTo === r.value} label={r.label} short={r.short} k={r.key} onClick={() => chooseRoute(r.value)} />
              ))}
            </div>

            {routeTo === 'next' && (
              <>
                <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                  <Select label="Context" value={context} options={contexts.map((c) => ({ value: c, label: c }))} onChange={setContext} />
                  <Select label="Priority" value={priority} options={PRIORITIES} onChange={(v) => setPriority(v as Priority)} />
                  <div className={cx('lg:contents', !moreFields && 'max-lg:hidden')}>
                    <Select label="Time" value={String(time)} options={TIMES.map((t) => ({ value: String(t), label: fmtTime(t) }))} onChange={(v) => setTime(Number(v) as TimeBucket)} />
                  </div>
                  <div className={cx('lg:contents', !moreFields && 'max-lg:hidden')}>
                    <Select label="Energy" value={energy} options={ENERGIES.map((v) => ({ value: v, label: v }))} onChange={(v) => setEnergy(v as Energy)} />
                  </div>
                </div>
                {!moreFields && (
                  <button
                    type="button"
                    onClick={() => setMoreFields(true)}
                    className="min-h-11 text-left font-mono text-meta text-muted lg:hidden"
                  >
                    time {fmtTime(time)} · energy {energy}
                    {deadline && deadlineOk ? ` · deadline ${fmtDate(deadline)}` : ''} — tap to change
                  </button>
                )}
                <div className={cx('flex flex-wrap items-center gap-2.5', !moreFields && 'max-lg:hidden')}>
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

        <p
          role="status"
          className={cx('m-0 px-0.5 font-mono text-meta lg:hidden', error || (tried && !ready) ? 'text-warn' : 'text-muted')}
        >
          {error ?? summary()}
        </p>
        <div className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-[56px_minmax(0,1fr)] gap-2 border-t border-line bg-panel px-4 pt-2.5 pb-[34px] lg:hidden">
          <button
            type="button"
            aria-label="Trash"
            disabled={pending || answer === 'trash'}
            onClick={() => commit({ kind: 'trash' })}
            className="inline-flex h-12 items-center justify-center rounded border border-control bg-panel text-ink disabled:opacity-50"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
            </svg>
          </button>
          <button type="submit" disabled={pending} className="h-12 rounded bg-accent font-medium text-panel disabled:opacity-50">
            {primaryLabel}
          </button>
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-2.5 max-lg:hidden">
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

      <aside aria-label="Context while clarifying" className="flex min-w-0 flex-col gap-3 max-lg:hidden">
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
