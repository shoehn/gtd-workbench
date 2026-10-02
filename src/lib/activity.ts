// The activity log (MCP design §3.2–3.3): every change to items, projects and tickler notes,
// by anyone, with before and after — and undo while nothing has touched them since.
// The store calls `record` inside every update; the edges say who acts with `runAs`.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Item, Project } from './model';
import type { ActivityChange, ActivityEntry, Actor, State, TicklerEntry } from './store/types';

export const KEEP_DAYS = 365;
const USER: Actor = { kind: 'user' };

interface Scope {
  actor: Actor;
  undoOf?: string;
  silent?: boolean;
}
const scope = new AsyncLocalStorage<Scope>();

/** Everything `fn` changes (also after awaits) is attributed to `actor`. Outside any scope: the user. */
export function runAs<T>(actor: Actor, fn: () => T): T {
  return scope.run({ actor }, fn);
}

/** Changes made in `fn` are not logged (test setup, maintenance). */
export function runSilently<T>(fn: () => T): T {
  return scope.run({ actor: { kind: 'system' }, silent: true }, fn);
}

/** The change made in `fn` undoes entry `undoOf`; the actor stays whoever is acting. */
export function runUndo<T>(undoOf: string, fn: () => T): T {
  return scope.run({ actor: scope.getStore()?.actor ?? USER, undoOf }, fn);
}

// api.ts hands in api.now at load, so entries follow the app's clock (the demo pin in tests).
let clock: () => Date = () => new Date();
export function setActivityClock(now: () => Date): void {
  clock = now;
}

export type Tracked = Pick<State, 'items' | 'projects' | 'tickler'>;
type Entity = Item | Project | TicklerEntry;
const KINDS = [
  ['item', 'items'],
  ['project', 'projects'],
  ['tickler', 'tickler'],
] as const;

export function snapshot(s: State): Tracked {
  return structuredClone({ items: s.items, projects: s.projects, tickler: s.tickler });
}

/** JSON with sorted keys: equal content compares equal whatever the key order. */
function canon(v: unknown): string {
  return JSON.stringify(v, (_, x) =>
    x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x,
  );
}

export function diff(before: Tracked, after: Tracked): ActivityChange[] {
  const out: ActivityChange[] = [];
  for (const [kind, key] of KINDS) {
    const was = new Map<string, Entity>(before[key].map((e: Entity) => [e.id, e]));
    const now = new Map<string, Entity>(after[key].map((e: Entity) => [e.id, e]));
    for (const [id, a] of now) {
      const b = was.get(id);
      if (!b || canon(b) !== canon(a)) out.push({ kind, id, before: b ? structuredClone(b) : null, after: structuredClone(a) });
    }
    for (const [id, b] of was) if (!now.has(id)) out.push({ kind, id, before: b, after: null });
  }
  return out;
}

const LIST: Record<Item['status'], string> = {
  inbox: 'Inbox',
  next: 'Next Actions',
  later: 'a later step',
  waiting: 'Waiting For',
  calendar: 'Calendar',
  someday: 'Someday / Maybe',
  reference: 'Reference',
  done: 'Done',
  trash: 'Trash',
};
const ITEM_FIELDS: [keyof Item, string][] = [
  ['text', 'text'], ['context', 'context'], ['priority', 'priority'], ['time', 'time'], ['energy', 'energy'],
  ['deadline', 'deadline'], ['day', 'day'], ['timeSlot', 'time block'], ['focusOn', 'focus'],
  ['projectId', 'project'], ['bucket', 'bucket'], ['waiting', 'waiting for'], ['reference', 'reference'],
];
const PROJECT_FIELDS: [keyof Project, string][] = [
  ['title', 'title'], ['successfulWhen', 'successful when'], ['area', 'area'], ['deadline', 'deadline'], ['notes', 'notes'],
];
const ddmm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

function phrase(c: ActivityChange): string | null {
  if (c.kind === 'item') {
    const b = c.before as Item | null;
    const a = c.after as Item | null;
    if (!b) return a!.status === 'inbox' ? `Captured “${a!.text}”` : `Added “${a!.text}” to ${LIST[a!.status]}`;
    if (!a) return `Deleted “${b.text}” for good`;
    if (a.status !== b.status) return `“${a.text}”: ${LIST[b.status]} → ${LIST[a.status]}${a.status === 'waiting' && a.waiting ? ` (${a.waiting.who})` : ''}`;
    const fields = ITEM_FIELDS.filter(([f]) => canon(a[f]) !== canon(b[f])).map(([, name]) => name);
    return fields.length ? `Edited “${a.text}”: ${fields.join(', ')}` : null; // priorityNo only: a renumbering
  }
  if (c.kind === 'project') {
    const b = c.before as Project | null;
    const a = c.after as Project | null;
    if (!b) return `New project “${a!.title}”`;
    if (!a) return `Deleted project “${b.title}”`;
    if (a.status !== b.status) return `Project “${a.title}”: ${b.status} → ${a.status}`;
    const fields = PROJECT_FIELDS.filter(([f]) => canon(a[f]) !== canon(b[f])).map(([, name]) => name);
    return fields.length ? `Edited project “${a.title}”: ${fields.join(', ')}` : null;
  }
  const b = c.before as TicklerEntry | null;
  const a = c.after as TicklerEntry | null;
  if (!b) return `Note on ${ddmm(a!.day)}: “${a!.text}”`;
  if (!a) return `Removed note “${b.text}”`;
  return `Edited note on ${ddmm(a.day)}: “${a.text}”`;
}

export function summarize(changes: ActivityChange[]): string {
  const phrases = changes.map(phrase).filter((p): p is string => !!p);
  if (!phrases.length) return 'Renumbered priorities';
  return phrases.slice(0, 3).join('; ') + (phrases.length > 3 ? ` (+${phrases.length - 3} more)` : '');
}

/** Called by the store inside every update, after the change: append the entry, prune old ones. */
export function record(s: State, before: Tracked): void {
  const ctx = scope.getStore();
  if (ctx?.silent) return;
  const changes = diff(before, s);
  if (!changes.length) return;
  const at = clock();
  const cutoff = new Date(at.getTime() - KEEP_DAYS * 86_400_000).toISOString();
  s.activity = s.activity.filter((e) => e.at >= cutoff);
  const undone = ctx?.undoOf ? s.activity.find((e) => e.id === ctx.undoOf) : undefined;
  s.activity.push({
    id: crypto.randomUUID(),
    at: at.toISOString(),
    actor: ctx?.actor ?? USER,
    summary: undone ? `Undid: ${undone.summary}` : summarize(changes),
    changes,
    ...(ctx?.undoOf && { undoOf: ctx.undoOf }),
  });
}

function collection(s: State, kind: ActivityChange['kind']): Entity[] {
  return kind === 'item' ? s.items : kind === 'project' ? s.projects : s.tickler;
}

export function actorLabel(a: Actor): string {
  return a.kind === 'user' ? 'you' : a.kind === 'client' ? a.name : a.kind === 'system' ? 'the app' : a.kind;
}

export function actorKey(a: Actor): string {
  return a.kind === 'user' ? 'you' : a.kind === 'client' ? a.id : a.kind;
}

/** Why `entry` can't be undone now — every entity must still be as the entry left it — or null. */
export function undoBlocker(s: State, entry: ActivityEntry): string | null {
  for (const c of entry.changes) {
    const current = collection(s, c.kind).find((e) => e.id === c.id) ?? null;
    if (canon(current) === canon(c.after)) continue;
    const by = s.activity.filter((e) => e.id !== entry.id && e.at >= entry.at && e.changes.some((x) => x.kind === c.kind && x.id === c.id)).at(-1);
    return `changed since${by ? ` by ${actorLabel(by.actor)}` : ''}`;
  }
  return null;
}

/** Put every entity of `entry` back as it was before (removed if it did not exist). */
export function applyUndo(s: State, entry: ActivityEntry): void {
  for (const c of entry.changes) {
    const list = collection(s, c.kind);
    const at = list.findIndex((e) => e.id === c.id);
    if (c.before === null) {
      if (at >= 0) list.splice(at, 1);
    } else if (at >= 0) list[at] = structuredClone(c.before);
    else list.push(structuredClone(c.before) as never);
  }
}
