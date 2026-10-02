'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import {
  addListEntryAction,
  deleteListEntryAction,
  moveListEntryAction,
  renameListEntryAction,
  resetTemplateAction,
  pollMailAction,
  syncCalendarsAction,
  updateSettingsAction,
  type SettingsResult,
} from '@/lib/actions';
import type { SettingsList } from '@/lib/api';
import type { ReviewTemplate, Theme } from '@/lib/model';
import { isTyping } from '../inbox/keys';
import { Btn } from '../ui/Btn';
import { Card } from '../ui/Card';
import { ClientsCard, type ClientsCardRow } from './ClientsCard';
import { cx } from '../ui/cx';
import { Kbd } from '../ui/Kbd';
import { PhoneToast } from '../ui/PhoneToast';
import { SectionHead } from '../ui/SectionHead';
import { Tag } from '../ui/Tag';

interface SettingsBoardProps {
  contexts: { name: string; used: number }[];
  /** Where `f` on a waiting-for files the follow-up action. */
  followUpContext: string;
  buckets: { name: string; used: number }[];
  calendars: {
    /** Unique: the source id, or `demo:<name>` (two calendars may share a name). */
    key: string;
    name: string;
    via: string;
    /** Configured source (env); demo calendars have none and are never synced. */
    host?: string;
    /** `wed 09:14`, or absent. */
    lastSync?: string;
    error?: string;
  }[];
  /** Any calendar configured in the environment. */
  canSync: boolean;
  mailbox: {
    /** `imap.example.com · INBOX → Processed`; absent = no mailbox configured. */
    where?: string;
    /** Why a configured mailbox is not polled (no allowed sender, no password). */
    problem?: string;
    lastPoll?: string;
    error?: string;
    captured: number;
    ignored: number;
  };
  timezone: string;
  /** The server's zone, shown for the empty choice. */
  serverZone: string;
  zones: string[];
  clients: ClientsCardRow[];
  theme: Theme;
  template: ReviewTemplate;
  stepLinks: readonly string[];
}

type Undo = { label: string; run: () => Promise<SettingsResult> };
type Problem = { where: string; message: string; href?: string };

const UNDO_MS = 5000;
const mono = 'font-mono text-meta text-muted';
const input =
  'h-(--wb-hit-phone) min-w-0 grow rounded border border-transparent bg-transparent px-2 text-ink outline-none hover:border-control focus:border-accent focus:bg-panel focus:shadow-ring lg:h-7';
const iconBtn =
  'relative inline-flex size-7 shrink-0 items-center justify-center rounded border border-control bg-panel text-muted hover:text-ink disabled:opacity-30 max-lg:after:absolute max-lg:after:-inset-2';

export function SettingsBoard(props: SettingsBoardProps) {
  const [, startTransition] = useTransition();
  const [undo, setUndo] = useState<Undo | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [polling, setPolling] = useState(false);

  function pollNow() {
    setPolling(true);
    startTransition(async () => {
      await pollMailAction();
      setPolling(false);
    });
  }

  function syncNow() {
    setSyncing(true);
    startTransition(async () => {
      await syncCalendarsAction();
      setSyncing(false);
    });
  }

  /** Run a change; on success offer its inverse for 5 s, on refusal show why next to `where`. */
  function change(where: string, run: () => Promise<SettingsResult>, inverse?: Undo, href?: string) {
    startTransition(async () => {
      const { error } = await run();
      if (error) {
        setProblem({ where, message: error, href });
        return;
      }
      setProblem(null);
      setUndo(inverse ?? null);
    });
  }

  function undoLast() {
    if (!undo) return;
    const { run } = undo;
    setUndo(null);
    startTransition(async () => {
      await run();
    });
  }

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [undo]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e) || !undo) return;
      if (e.key === 'u' || ((e.metaKey || e.ctrlKey) && e.key === 'z')) {
        e.preventDefault();
        undoLast();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const list = (kind: SettingsList, rows: { name: string; used: number }[]) => ({
    kind,
    rows,
    problem,
    onRename: (from: string, to: string) =>
      change(`${kind}:${from}`, () => renameListEntryAction(kind, from, to), {
        label: `Renamed ${from} → ${to.trim()}`,
        run: () => renameListEntryAction(kind, to.trim(), from),
      }),
    onDelete: (name: string, at: number) =>
      change(
        `${kind}:${name}`,
        () => deleteListEntryAction(kind, name),
        { label: `Deleted ${name}`, run: () => addListEntryAction(kind, name, at) },
        kind === 'context' ? `/next?ctx=${name}` : '/waiting?tab=someday',
      ),
    onMove: (name: string, from: number, to: number) =>
      change(`${kind}:${name}`, () => moveListEntryAction(kind, name, to), {
        label: `Moved ${name}`,
        run: () => moveListEntryAction(kind, name, from),
      }),
    onAdd: (name: string) =>
      change(`${kind}:+`, () => addListEntryAction(kind, name), {
        label: `Added ${name.trim()}`,
        run: () => deleteListEntryAction(kind, name.trim()),
      }),
  });

  function saveTemplate(next: ReviewTemplate, label: string) {
    const before = props.template;
    change('template', () => updateSettingsAction({ reviewTemplate: next }), {
      label,
      run: () => updateSettingsAction({ reviewTemplate: before }),
    });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3 max-lg:p-4 max-lg:pb-8">
      <ListCard
        title="Contexts"
        hint="where or with what an action can be done · order = order on Next Actions"
        placeholder="+ context, e.g. @garden"
        {...list('context', props.contexts)}
        footer={
          <div className="flex flex-wrap items-center gap-2.5 border-t border-line-soft px-3 py-2">
            <label htmlFor="follow-up-context" className="text-sm">
              Follow-ups go to
            </label>
            <select
              id="follow-up-context"
              value={props.followUpContext}
              onChange={(e) => {
                const before = props.followUpContext;
                const next = e.target.value;
                change('followUp', () => updateSettingsAction({ followUpContext: next }), {
                  label: `Follow-ups go to ${next}`,
                  run: () => updateSettingsAction({ followUpContext: before }),
                });
              }}
              className="h-(--wb-hit-phone) rounded border border-control bg-panel px-1.5 font-mono text-meta text-ink lg:h-7"
            >
              {props.contexts.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <span className={mono}>
              the action <Kbd>f</Kbd> creates on a waiting-for (desks, support and committees: @computer)
            </span>
          </div>
        }
      />
      <ListCard title="Someday / Maybe buckets" hint="groups on Someday / Maybe, in this order" placeholder="+ bucket" {...list('bucket', props.buckets)} />

      <Card aria-labelledby="calendars-head" className="flex flex-col">
        <CardTitle
          id="calendars-head"
          title="Calendars"
          hint="appointments come in read-only; nothing is written back · synced every 15 min"
          right={
            <Btn size="sm" disabled={!props.canSync || syncing} onClick={syncNow}>
              {syncing ? 'Syncing…' : 'Sync now'}
            </Btn>
          }
        />
        {props.calendars.length ? (
          <ul className="m-0 list-none p-0">
            {props.calendars.map((c) => (
              <li key={c.key} className="flex min-h-9 flex-wrap items-center gap-x-2.5 gap-y-0.5 border-b border-line-soft px-3 py-1.5 last:border-b-0">
                <span className="grow">{c.name}</span>
                <span className={mono}>{c.via}</span>
                {c.host && <span className={mono}>{c.host}</span>}
                <span className={mono}>{c.host ? (c.lastSync ? `synced ${c.lastSync}` : 'never synced') : 'demo data'}</span>
                {c.error ? <Tag variant="warn">sync failed</Tag> : <Tag>read-only</Tag>}
                {c.error && <span className="basis-full text-xs text-warn">{c.error}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className={cx(mono, 'm-0 px-3 py-2.5')}>No external calendars.</p>
        )}
        {!props.canSync && (
          <p className={cx(mono, 'm-0 border-t border-line-soft px-3 py-2')}>
            Add one with CAL_&lt;NAME&gt;_URL (an .ics link, or CalDAV with _USER / _PASS) in the environment — see docs/OPERATIONS.md.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2.5 border-t border-line-soft px-3 py-2">
          <label htmlFor="timezone" className="text-sm">
            Time zone
          </label>
          <select
            id="timezone"
            value={props.timezone}
            onChange={(e) => {
              const before = props.timezone;
              const next = e.target.value;
              change('timezone', () => updateSettingsAction({ timezone: next }), {
                label: `Time zone ${next || 'of the server'}`,
                run: () => updateSettingsAction({ timezone: before }),
              });
            }}
            className="h-(--wb-hit-phone) max-w-64 rounded border border-control bg-panel px-1.5 font-mono text-meta text-ink lg:h-7"
          >
            <option value="">server default ({props.serverZone})</option>
            {props.zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          <span className={mono}>“today”, midnight and overdue count in this zone · weeks start on Monday</span>
        </div>
      </Card>

      <Card aria-labelledby="mailbox-head" className="flex flex-col">
        <CardTitle
          id="mailbox-head"
          title="Mailbox"
          hint="mail from allowed senders lands in the inbox; the mail moves to Processed · polled every 2 min"
          right={
            <Btn size="sm" disabled={!props.mailbox.where || polling} onClick={pollNow}>
              {polling ? 'Polling…' : 'Poll now'}
            </Btn>
          }
        />
        {props.mailbox.where ? (
          <div className="flex min-h-9 flex-wrap items-center gap-x-2.5 gap-y-0.5 px-3 py-1.5">
            <span className="grow font-mono text-meta">{props.mailbox.where}</span>
            <span className={mono}>{props.mailbox.lastPoll ? `polled ${props.mailbox.lastPoll}` : 'never polled'}</span>
            <span className={mono}>
              {props.mailbox.captured} captured · {props.mailbox.ignored} ignored
            </span>
            {props.mailbox.error ? <Tag variant="warn">poll failed</Tag> : <Tag>read · move</Tag>}
            {props.mailbox.error && <span className="basis-full text-xs text-warn">{props.mailbox.error}</span>}
          </div>
        ) : (
          <p className={cx('m-0 px-3 py-2.5 font-mono text-meta', props.mailbox.problem ? 'text-warn' : 'text-muted')}>
            {props.mailbox.problem ??
              'No capture mailbox. Set CAPTURE_MAIL_HOST, _USER, _PASS and CAPTURE_MAIL_FROM in the environment — see docs/OPERATIONS.md.'}
          </p>
        )}
      </Card>

      <ClientsCard rows={props.clients} />

      <Card aria-labelledby="appearance-head" className="flex flex-col">
        <CardTitle id="appearance-head" title="Appearance" hint="also from the palette: Toggle dark theme" />
        <div className="flex flex-wrap items-center gap-2.5 px-3 py-2">
          <label htmlFor="theme" className="text-sm">
            Theme
          </label>
          <select
            id="theme"
            value={props.theme}
            onChange={(e) => {
              const before = props.theme;
              const next = e.target.value as Theme;
              change('theme', () => updateSettingsAction({ theme: next }), {
                label: `Theme ${next}`,
                run: () => updateSettingsAction({ theme: before }),
              });
            }}
            className="h-(--wb-hit-phone) rounded border border-control bg-panel px-1.5 font-mono text-meta text-ink lg:h-7"
          >
            <option value="system">system</option>
            <option value="light">light</option>
            <option value="dark">dark</option>
          </select>
          <span className={mono}>system follows the device</span>
        </div>
      </Card>

      <TemplateCard
        template={props.template}
        stepLinks={props.stepLinks}
        problem={problem?.where === 'template' ? problem.message : undefined}
        onSave={saveTemplate}
        onReset={() => {
          const before = props.template;
          change('template', () => resetTemplateAction(), {
            label: 'Checklist reset to the GTD default',
            run: () => updateSettingsAction({ reviewTemplate: before }),
          });
        }}
      />

      <div className="flex min-h-7 items-center gap-3 font-mono text-meta text-muted">
        <span>Changes save on ⏎ or when you leave a field.</span>
        {undo && (
          <span role="status" className="flex items-center gap-2 max-lg:hidden">
            <span className="text-ink">{undo.label}</span>
            <button type="button" onClick={undoLast} className="rounded border border-control bg-panel px-1.5 text-accent hover:text-accent-hover">
              Undo <Kbd>u</Kbd>
            </button>
          </span>
        )}
      </div>
      {undo && <PhoneToast text={undo.label} onUndo={undoLast} />}
    </div>
  );
}

function CardTitle({ id, title, hint, right }: { id: string; title: string; hint: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-b border-line px-3 py-2.5">
      <h2 id={id} className="m-0 text-body font-semibold">
        {title}
      </h2>
      <span className={mono}>{hint}</span>
      {right && <span className="ml-auto">{right}</span>}
    </div>
  );
}

/** A text field that commits on ⏎ or blur, and goes back on Esc. */
function CommitField({ value, label, placeholder, clearOnCommit, onCommit }: {
  value: string;
  label: string;
  placeholder?: string;
  clearOnCommit?: boolean;
  onCommit(next: string): void;
}) {
  const cancelled = useRef(false);
  return (
    <input
      type="text"
      aria-label={label}
      defaultValue={value}
      placeholder={placeholder}
      autoComplete="off"
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          cancelled.current = true;
          e.currentTarget.value = value;
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => {
        const next = e.currentTarget.value;
        if (!cancelled.current && next.trim() && next.trim() !== value) {
          onCommit(next);
          if (clearOnCommit) e.currentTarget.value = '';
        } else if (!next.trim() && !clearOnCommit) {
          e.currentTarget.value = value; // emptying is not deleting: × deletes
        }
        cancelled.current = false;
      }}
      className={input}
    />
  );
}

function ListCard(props: {
  title: string;
  hint: string;
  placeholder: string;
  kind: SettingsList;
  rows: { name: string; used: number }[];
  problem: Problem | null;
  onRename(from: string, to: string): void;
  onDelete(name: string, at: number): void;
  onMove(name: string, from: number, to: number): void;
  onAdd(name: string): void;
  footer?: ReactNode;
}) {
  const { kind, rows, problem } = props;
  const id = `${kind}-head`;
  const showProblem = (where: string) =>
    problem?.where === where && (
      <p className="m-0 px-3 pb-2 text-xs text-warn">
        {problem.message}
        {problem.href && (
          <>
            {' · '}
            <Link href={problem.href} className="text-warn">
              show them →
            </Link>
          </>
        )}
      </p>
    );
  return (
    <Card aria-labelledby={id} className="flex flex-col">
      <CardTitle id={id} title={props.title} hint={props.hint} />
      <ul className="m-0 list-none p-0">
        {rows.map((r, n) => (
          <li key={r.name} className="border-b border-line-soft">
            <div className="flex min-h-9 items-center gap-1.5 px-2 max-lg:min-h-12">
              <CommitField value={r.name} label={`Rename ${r.name}`} onCommit={(to) => props.onRename(r.name, to)} />
              <span className={cx(mono, 'w-16 shrink-0 text-right')}>{r.used ? `${r.used} open` : 'unused'}</span>
              <button type="button" aria-label={`Move ${r.name} up`} disabled={n === 0} onClick={() => props.onMove(r.name, n, n - 1)} className={iconBtn}>
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move ${r.name} down`}
                disabled={n === rows.length - 1}
                onClick={() => props.onMove(r.name, n, n + 1)}
                className={iconBtn}
              >
                ↓
              </button>
              <button type="button" aria-label={`Delete ${r.name}`} onClick={() => props.onDelete(r.name, n)} className={iconBtn}>
                ×
              </button>
            </div>
            {showProblem(`${kind}:${r.name}`)}
          </li>
        ))}
      </ul>
      <div className="flex min-h-9 items-center px-2 max-lg:min-h-12">
        <CommitField value="" label={`Add a ${kind}`} placeholder={props.placeholder} clearOnCommit onCommit={props.onAdd} />
      </div>
      {showProblem(`${kind}:+`)}
      {props.footer}
    </Card>
  );
}

function TemplateCard({ template, stepLinks, problem, onSave, onReset }: {
  template: ReviewTemplate;
  stepLinks: readonly string[];
  problem?: string;
  onSave(next: ReviewTemplate, label: string): void;
  onReset(): void;
}) {
  const edit = (label: string, fn: (t: ReviewTemplate) => void) => {
    const next = structuredClone(template);
    fn(next);
    onSave(next, label);
  };
  return (
    <Card aria-labelledby="template-head" className="flex flex-col">
      <CardTitle
        id="template-head"
        title="Weekly review checklist"
        hint="the three phases are fixed; a review under way keeps the checklist it started with"
        right={
          <Btn size="sm" onClick={onReset}>
            Reset to GTD default
          </Btn>
        }
      />
      {problem && <p className="m-0 px-3 pt-2 text-xs text-warn">{problem}</p>}
      {template.phases.map((phase, p) => (
        <section key={phase.id} aria-label={phase.name} className="border-b border-line-soft last:border-b-0">
          <SectionHead className="m-0 px-3 pt-2.5 pb-1">
            {p + 1} · {phase.name}
          </SectionHead>
          <ul className="m-0 list-none p-0">
            {phase.steps.map((step, n) => (
              <li key={step.id} className="flex min-h-9 flex-wrap items-center gap-1.5 px-2 max-lg:min-h-12">
                <CommitField
                  value={step.text}
                  label={`Step: ${step.text}`}
                  onCommit={(text) => edit(`Step renamed`, (t) => void (t.phases[p].steps[n].text = text.trim()))}
                />
                <select
                  aria-label={`Link of “${step.text}”`}
                  value={step.link ?? ''}
                  onChange={(e) =>
                    edit('Step link changed', (t) => {
                      const s = t.phases[p].steps[n];
                      if (e.target.value) s.link = e.target.value;
                      else delete s.link;
                    })
                  }
                  className="h-(--wb-hit-phone) w-44 rounded border border-control bg-panel px-1 font-mono text-meta text-muted lg:h-7"
                >
                  <option value="">no link</option>
                  {stepLinks.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label={`Move “${step.text}” up`}
                  disabled={n === 0}
                  onClick={() => edit('Step moved', (t) => t.phases[p].steps.splice(n - 1, 0, ...t.phases[p].steps.splice(n, 1)))}
                  className={iconBtn}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move “${step.text}” down`}
                  disabled={n === phase.steps.length - 1}
                  onClick={() => edit('Step moved', (t) => t.phases[p].steps.splice(n + 1, 0, ...t.phases[p].steps.splice(n, 1)))}
                  className={iconBtn}
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Remove “${step.text}”`}
                  onClick={() => edit(`Removed “${step.text}”`, (t) => void t.phases[p].steps.splice(n, 1))}
                  className={iconBtn}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="flex min-h-9 items-center px-2 pb-1.5 max-lg:min-h-12">
            <CommitField
              value=""
              label={`Add a step to ${phase.name}`}
              placeholder="+ step"
              clearOnCommit
              onCommit={(text) =>
                edit(`Added “${text.trim()}”`, (t) => void t.phases[p].steps.push({ id: `st-${crypto.randomUUID().slice(0, 8)}`, text: text.trim() }))
              }
            />
          </div>
        </section>
      ))}
    </Card>
  );
}
