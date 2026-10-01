# MCP Stage 1 — Foundation (activity log, undo, clients) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every change to items, projects and tickler notes is logged with its actor (you, a named client, mail, share, the app) and can be undone while nothing touched it since; named API clients with presets replace the single capture token.

**Architecture:** The store's `update()` is wrapped once: it snapshots items/projects/tickler, runs the change, diffs, and appends an activity entry in the same write (same SQLite transaction). The actor comes from an `AsyncLocalStorage` scope set at the edges (routes, mail poller); server actions run without a scope and count as "you". Clients are stored with a SHA-256 hash of their token; a preset maps to capabilities (`capture`, `read`, `write`) that later stages check per tool.

**Tech Stack:** Next.js 16 (app router), TypeScript strict, Drizzle + better-sqlite3, vitest (memory and sqlite projects), Tailwind v4 tokens.

**Spec:** `docs/superpowers/specs/2026-10-01-mcp-tools-design.md` (§3.1 clients and presets, §3.2 activity log, §3.3 undo). Stages 2–4 are outlined at the end and get their own plans.

## Global Constraints

- Read `node_modules/next/dist/docs/` before using a Next.js API you have not used in this repo (AGENTS.md).
- Colours only from `docs/handoff/design/tokens.css` via Tailwind tokens; `rg '#[0-9a-f]{6}' src --glob '!**/tokens.css'` stays empty.
- Time from `api.now()` / `api.today()`; the activity log receives `api.now` through `setActivityClock` (no other `new Date()` in new code).
- Writes from the UI go through server actions in `src/lib/actions.ts`; server components read the api.
- Public repo: no personal data, no secrets, no real host names in code, docs, tests or commit messages.
- Before every commit: `pnpm lint && pnpm typecheck && pnpm test` pass; `pnpm build` at the end of each UI task.
- Checks that run the app use `STORE=memory CAL_WORK_URL= CAPTURE_MAIL_HOST=` (never the user's `data/gtd.db`).
- Commit author `sebastian.hoehn@gmail.com`; never push.
- Spec values: activity kept **365 days**; presets **capture** (capture, tickler), **read-only**, **assistant**; the env `CAPTURE_TOKEN` keeps working as client **"capture (env)"** with the capture preset; a new token is shown **once**, stored hashed.

## Review Focus

- Undoing an entry whose items were changed since (also by renumbering) must be refused with "changed since by …", never half-applied — Task 3 test `undo is refused …`.
- A revoked client's token must stop working on the very next request — Task 4 test `revoke takes effect at once`.
- A year of entries must not make every write slow: activity rows are immutable and written append-only — Task 1 test `activity rows are only inserted, never rewritten`, Task 3 test `listActivity is newest first and limited`.
- Undoing "deleted for good" (trash purge) must bring the item back — Task 3 test `undo of a purge restores the item`.
- No token ever appears in the log, the client list or the UI after creation — Task 4 test `the token is shown once and never stored`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/store/types.ts` (modify) | `Actor`, `ActivityChange`, `ActivityEntry`, `StoredClient`; `State.activity`, `State.clients` |
| `src/lib/store/schema.ts` (modify), `drizzle/0006_activity_clients.sql` (generated) | tables `activity`, `clients` |
| `src/lib/store/sqlite.ts` (modify) | persist both; activity rows append-only |
| `src/lib/store/seed.base.json` + `docs/handoff/data/seed.base.json` (modify) | `"activity": []`, `"clients": []` |
| `src/lib/activity.ts` (create) | scope (`runAs`, `runSilently`, `runUndo`), `diff`, `summarize`, `record`, `undoBlocker`, `applyUndo`, `actorLabel` |
| `src/lib/store/index.ts` (modify) | wrap `update` with snapshot → fn → `record` |
| `src/lib/api.ts` (modify) | `setActivityClock(now)`, `listActivity`, `undoActivity`, `ActivityRow` |
| `src/lib/clients.ts` (create) | presets, create / list / revoke, `authenticate`, `can`, `actorOf`, `captureEnabled` |
| `src/app/api/capture/route.ts`, `src/app/share/route.ts`, `src/lib/mail/poller.ts`, `src/lib/calendar/scheduler.ts` (modify) | set the actor |
| `src/lib/actions.ts` (modify) | `undoActivityAction`, `createClientAction`, `revokeClientAction` |
| `src/app/activity/page.tsx`, `src/components/activity/ActivityList.tsx`, `src/components/activity/ActorFilter.tsx` (create) | the Activity view |
| `src/components/shell/Sidebar.tsx`, `src/components/clarify/ClarifyForm.tsx`, `src/app/clarify/page.tsx`, `src/components/projects/ProjectDetail.tsx` (modify) | links to history |
| `src/components/settings/ClientsCard.tsx` (create), `src/components/settings/SettingsBoard.tsx`, `src/app/settings/page.tsx` (modify) | Clients card |
| Tests: `src/lib/activity.test.ts`, `src/lib/clients.test.ts` (create), `src/lib/store/store.test.ts`, `src/lib/capture-in.test.ts` (modify) | |
| `docs/handoff/SPEC.md`, `docs/OPERATIONS.md`, `.env.example` (modify) | docs |

---

### Task 1: State, schema and persistence for activity and clients

**Files:**
- Modify: `src/lib/store/types.ts`, `src/lib/store/schema.ts`, `src/lib/store/sqlite.ts`, `src/lib/store/seed.base.json`, `docs/handoff/data/seed.base.json`
- Create: `drizzle/0006_activity_clients.sql` (via `pnpm db:generate`)
- Test: `src/lib/store/store.test.ts`

**Interfaces:**
- Produces (types.ts):
  ```ts
  export type Actor =
    | { kind: 'user' }
    | { kind: 'client'; id: string; name: string }
    | { kind: 'mail' }
    | { kind: 'share' }
    | { kind: 'system' };
  export interface ActivityChange {
    kind: 'item' | 'project' | 'tickler';
    id: string;
    before: Item | Project | TicklerEntry | null;
    after: Item | Project | TicklerEntry | null;
  }
  export interface ActivityEntry { id: string; at: string; actor: Actor; summary: string; changes: ActivityChange[]; undoOf?: string }
  export interface StoredClient { id: string; name: string; preset: 'capture' | 'read-only' | 'assistant'; tokenHash: string; createdAt: string; lastUsedAt?: string; revokedAt?: string }
  // State gains: activity: ActivityEntry[]; clients: StoredClient[];
  ```

- [ ] **Step 1: Write the failing test** — append to `src/lib/store/store.test.ts` (it already imports `createSqliteStore`, `seed`, `State`, and builds a temp `file`; reuse its helpers):

```ts
describe('activity and clients persist (MCP stage 1)', () => {
  const entry = (n: number) => ({
    id: `a${n}`,
    at: `2026-10-01T10:00:0${n}.000Z`,
    actor: { kind: 'client' as const, id: 'c1', name: 'Claude Desktop' },
    summary: `Captured “x${n}”`,
    changes: [{ kind: 'item' as const, id: `i${n}`, before: null, after: { id: `i${n}`, text: `x${n}`, captured: `x${n}`, source: 'typed' as const, capturedAt: '2026-10-01T10:00:00.000Z', status: 'inbox' as const, tags: [] } }],
  });

  it('activity entries and clients survive a reopen', () => {
    const a = createSqliteStore(file, seed as State);
    a.update((s) => {
      s.activity.push(entry(1));
      s.clients.push({ id: 'c1', name: 'Claude Desktop', preset: 'assistant', tokenHash: 'ab'.repeat(32), createdAt: '2026-10-01T09:00:00.000Z' });
    });
    const b = createSqliteStore(file, seed as State).getState();
    expect(b.activity).toEqual([entry(1)]);
    expect(b.clients).toEqual(a.getState().clients);
  });

  it('activity rows are only inserted, never rewritten', () => {
    const a = createSqliteStore(file, seed as State);
    a.update((s) => s.activity.push(entry(1)));
    // a later write that leaves the entry alone must not touch its row
    a.update((s) => {
      s.activity[0].summary = 'tampered in memory';
      s.activity.push(entry(2));
    });
    const b = createSqliteStore(file, seed as State).getState();
    expect(b.activity.map((e) => e.summary)).toEqual(['Captured “x1”', 'Captured “x2”']);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run --project sqlite src/lib/store/store.test.ts`
Expected: FAIL — `s.activity` is undefined (TypeError) / type errors.

- [ ] **Step 3: Types and seeds**

In `src/lib/store/types.ts` add the `Actor`, `ActivityChange`, `ActivityEntry`, `StoredClient` declarations from **Interfaces** (import `Item`, `Project` from `../model`; `TicklerEntry` is declared in this file) and add to `interface State`, after `mailbox?`:

```ts
  /** Every change to items, projects and tickler notes, oldest first (kept 365 days). */
  activity: ActivityEntry[];
  /** API clients (MCP, scripts): a name, a preset and the hash of their token. */
  clients: StoredClient[];
```

In both `src/lib/store/seed.base.json` and `docs/handoff/data/seed.base.json`, after `"mailSeen": [],` add:

```json
  "activity": [],
  "clients": [],
```

- [ ] **Step 4: Schema**

Append to `src/lib/store/schema.ts` (before the `settings` table comment):

```ts
/** The activity log: append-only; `actor` and `changes` are JSON, read whole. */
export const activity = sqliteTable('activity', {
  id: text().primaryKey(),
  seq: integer().notNull(),
  at: text().notNull(),
  actor: text({ mode: 'json' }).$type<Actor>().notNull(),
  summary: text().notNull(),
  changes: text({ mode: 'json' }).$type<ActivityChange[]>().notNull(),
  undoOf: text('undo_of'),
});

/** API clients; only the SHA-256 of a token is stored. */
export const clients = sqliteTable('clients', {
  id: text().primaryKey(),
  seq: integer().notNull(),
  name: text().notNull(),
  preset: text().notNull(),
  tokenHash: text('token_hash').notNull(),
  createdAt: text('created_at').notNull(),
  lastUsedAt: text('last_used_at'),
  revokedAt: text('revoked_at'),
});
```

with `import type { Actor, ActivityChange } from './types';` at the top. Then:

Run: `pnpm db:generate --name activity_clients`
Expected: `drizzle/0006_activity_clients.sql` with two `CREATE TABLE` statements.

- [ ] **Step 5: Persist in `src/lib/store/sqlite.ts`**

a) Extend the row list type and `write()` so a table can be append-only. Change `tablesOf`'s return type to
`{ table: SQLiteTable; pk: SQLiteColumn; key: string; rows: Row[]; appendOnly?: boolean }[]` and add two entries before `areaKinds`:

```ts
    {
      table: t.activity,
      pk: t.activity.id,
      key: 'id',
      appendOnly: true,
      rows: s.activity.map((e, seq) => ({ id: e.id, seq, at: e.at, actor: e.actor, summary: e.summary, changes: e.changes, undoOf: e.undoOf ?? null })),
    },
    {
      table: t.clients,
      pk: t.clients.id,
      key: 'id',
      rows: s.clients.map((c, seq) => ({ id: c.id, seq, name: c.name, preset: c.preset, tokenHash: c.tokenHash, createdAt: c.createdAt, lastUsedAt: c.lastUsedAt ?? null, revokedAt: c.revokedAt ?? null })),
    },
```

In `write()`, inside the `forEach`, branch before the generic path:

```ts
      if (appendOnly) {
        // Entries never change: insert the new ones, delete the pruned ones, never compare JSON.
        const had = new Set((old?.[n].rows ?? []).map((r) => String(r[key])));
        const keep = new Set(rows.map((r) => String(r[key])));
        for (const row of rows) if (!had.has(String(row[key]))) tx.insert(table).values(row).run();
        const gone = [...had].filter((k) => !keep.has(k));
        if (gone.length) tx.delete(table).where(inArray(pk, gone)).run();
        return;
      }
```

(destructure `appendOnly` alongside `table, pk, key, rows`).

b) In `load()`, add to the returned object:

```ts
    activity: bySeq(db.select().from(t.activity).all()).map((e) => compact(unseq(e)) as unknown as ActivityEntry),
    clients: bySeq(db.select().from(t.clients).all()).map((c) => compact(unseq(c)) as unknown as StoredClient),
```

and import `ActivityEntry, StoredClient` from `./types`.

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run src/lib/store/store.test.ts && pnpm typecheck`
Expected: PASS (both projects), no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/store drizzle docs/handoff/data/seed.base.json
git commit -m "feat(mcp-1): state and persistence for the activity log and API clients"
```

---

### Task 2: The activity core (pure)

**Files:**
- Create: `src/lib/activity.ts`
- Test: `src/lib/activity.test.ts`

**Interfaces:**
- Consumes: `State`, `Actor`, `ActivityEntry`, `ActivityChange` (Task 1).
- Produces:
  ```ts
  export function runAs<T>(actor: Actor, fn: () => T): T;
  export function runSilently<T>(fn: () => T): T;
  export function runUndo<T>(undoOf: string, fn: () => T): T;
  export function setActivityClock(now: () => Date): void;
  export type Tracked = Pick<State, 'items' | 'projects' | 'tickler'>;
  export function snapshot(s: State): Tracked;
  export function diff(before: Tracked, after: Tracked): ActivityChange[];
  export function summarize(changes: ActivityChange[]): string;
  export function record(s: State, before: Tracked): void;
  export function undoBlocker(s: State, entry: ActivityEntry): string | null;
  export function applyUndo(s: State, entry: ActivityEntry): void;
  export function actorLabel(a: Actor): string;   // 'you' | client name | 'mail' | 'share' | 'the app'
  export function actorKey(a: Actor): string;     // 'you' | client id | 'mail' | 'share' | 'system'
  export const KEEP_DAYS = 365;
  ```

- [ ] **Step 1: Write the failing tests** — `src/lib/activity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyUndo, diff, record, runAs, runSilently, runUndo, setActivityClock, snapshot, summarize, undoBlocker } from './activity';
import type { Item } from './model';
import type { State } from './store/types';

const item = (id: string, over: Partial<Item> = {}): Item => ({ id, text: `Item ${id}`, captured: `Item ${id}`, source: 'typed', capturedAt: '2026-10-01T08:00:00.000Z', status: 'inbox', tags: [], ...over });
const state = (items: Item[] = []): State => ({ items, projects: [], tickler: [], activity: [], clients: [] }) as unknown as State;
const change = (s: State, fn: (s: State) => void) => {
  const before = snapshot(s);
  fn(s);
  record(s, before);
};

setActivityClock(() => new Date('2026-10-01T12:00:00.000Z'));

describe('diff and summary', () => {
  it('created, moved, edited and deleted items read as one would say them', () => {
    const s = state([item('a'), item('b', { status: 'next', context: '@calls', priority: 'B', priorityNo: 1 })]);
    const before = snapshot(s);
    s.items.push(item('c'));
    s.items[0].status = 'waiting';
    s.items[0].waiting = { who: 'Alice', since: '2026-10-01' };
    s.items[1].priority = 'A';
    const changes = diff(before, s);
    expect(changes.map((c) => c.id).sort()).toEqual(['a', 'b', 'c']);
    expect(summarize(changes)).toBe('“Item a”: Inbox → Waiting For (Alice); Edited “Item b”: priority; Captured “Item c”');
  });

  it('a renumbering alone is recorded but not news', () => {
    const s = state([item('b', { status: 'next', priority: 'B', priorityNo: 2 })]);
    const before = snapshot(s);
    s.items[0].priorityNo = 1;
    expect(summarize(diff(before, s))).toBe('Renumbered priorities');
  });

  it('key order does not count as a change', () => {
    const s = state([item('a', { context: '@calls' })]);
    const before = snapshot(s);
    const { context, ...rest } = s.items[0];
    s.items[0] = { ...rest, context } as Item;
    expect(diff(before, s)).toEqual([]);
  });

  it('more than three phrases are cut with a count', () => {
    const s = state();
    const before = snapshot(s);
    for (const id of ['a', 'b', 'c', 'd', 'e']) s.items.push(item(id));
    expect(summarize(diff(before, s))).toBe('Captured “Item a”; Captured “Item b”; Captured “Item c” (+2 more)');
  });
});

describe('record', () => {
  it('outside any scope the actor is the user; runAs names the client', () => {
    const s = state();
    change(s, (x) => x.items.push(item('a')));
    runAs({ kind: 'client', id: 'c1', name: 'Claude Desktop' }, () => change(s, (x) => x.items.push(item('b'))));
    expect(s.activity.map((e) => e.actor)).toEqual([{ kind: 'user' }, { kind: 'client', id: 'c1', name: 'Claude Desktop' }]);
    expect(s.activity[0]).toMatchObject({ at: '2026-10-01T12:00:00.000Z', summary: 'Captured “Item a”' });
  });

  it('nothing changed, nothing logged; silent scopes are not logged', () => {
    const s = state([item('a')]);
    change(s, () => {});
    runSilently(() => change(s, (x) => x.items.push(item('b'))));
    expect(s.activity).toEqual([]);
  });

  it('entries older than 365 days are pruned on the next write', () => {
    const s = state();
    s.activity.push({ id: 'old', at: '2025-09-30T11:00:00.000Z', actor: { kind: 'user' }, summary: 'x', changes: [] });
    s.activity.push({ id: 'young', at: '2025-10-02T11:00:00.000Z', actor: { kind: 'user' }, summary: 'y', changes: [] });
    change(s, (x) => x.items.push(item('a')));
    expect(s.activity.map((e) => e.id)).toEqual(['young', s.activity[1].id]);
  });
});

describe('undo', () => {
  it('restores the before of every change; the undo is an entry of its own', () => {
    const s = state([item('a')]);
    change(s, (x) => {
      x.items[0].status = 'trash';
      x.items.push(item('b'));
    });
    const e = s.activity[0];
    expect(undoBlocker(s, e)).toBeNull();
    runUndo(e.id, () => change(s, (x) => applyUndo(x, e)));
    expect(s.items.map((i) => [i.id, i.status])).toEqual([['a', 'inbox']]);
    expect(s.activity[1]).toMatchObject({ undoOf: e.id, summary: `Undid: ${e.summary}` });
  });

  it('is refused once something touched those items since, naming who', () => {
    const s = state([item('a')]);
    change(s, (x) => (x.items[0].text = 'First'));
    const e = s.activity[0];
    runAs({ kind: 'client', id: 'c1', name: 'Phone agent' }, () => change(s, (x) => (x.items[0].text = 'Second')));
    expect(undoBlocker(s, e)).toBe('changed since by Phone agent');
  });

  it('undoing the undo brings the change back', () => {
    const s = state([item('a')]);
    change(s, (x) => (x.items[0].text = 'New'));
    const e = s.activity[0];
    runUndo(e.id, () => change(s, (x) => applyUndo(x, e)));
    const u = s.activity[1];
    expect(undoBlocker(s, e)).toBe('changed since by you');
    runUndo(u.id, () => change(s, (x) => applyUndo(x, u)));
    expect(s.items[0].text).toBe('New');
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vitest run --project memory src/lib/activity.test.ts`
Expected: FAIL — `Cannot find module './activity'`.

- [ ] **Step 3: Implement `src/lib/activity.ts`**

```ts
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
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/lib/activity.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS. If `summarize`'s first test fails only on phrase order, the order follows `KINDS` and array order (a, b, then the new c) — fix the code, not the expectation.

- [ ] **Step 5: Commit**

```bash
git add src/lib/activity.ts src/lib/activity.test.ts
git commit -m "feat(mcp-1): activity core — diff, summary in words, record, undo"
```

---

### Task 3: Log every store write; activity in the api

**Files:**
- Modify: `src/lib/store/index.ts`, `src/lib/api.ts`
- Test: `src/lib/activity-api.test.ts` (create)

**Interfaces:**
- Consumes: `snapshot`, `record`, `runAs`, `runSilently`, `runUndo`, `undoBlocker`, `applyUndo`, `actorKey`, `actorLabel`, `setActivityClock` (Task 2).
- Produces (api.ts):
  ```ts
  export interface ActivityRow extends ActivityEntry { actorLabel: string; actorKey: string; blocker: string | null }
  export function listActivity(filter?: { actor?: string; subject?: string; limit?: number }): ActivityRow[];
  // newest first; `subject` matches an entry touching that id, or an item of that project; limit default 200
  export function getActivityEntry(id: string): ActivityEntry | undefined;
  export function undoActivity(id: string): string; // the new entry's id; throws 'undo: changed since by …'
  ```

- [ ] **Step 1: Write the failing tests** — `src/lib/activity-api.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { runAs, runSilently } from './activity';
import * as api from './api';
import { store } from './store';
import { demoSeed as seed } from './store/seed';
import type { State } from './store/types';

beforeEach(() =>
  runSilently(() =>
    store.update((s) => {
      for (const key of Object.keys(s) as (keyof State)[]) delete s[key];
      Object.assign(s, structuredClone(seed));
    }),
  ),
);

const latest = () => api.listActivity({ limit: 1 })[0];

describe('the api logs every write', () => {
  it('a capture from the UI is yours; one through a client carries its name', () => {
    api.capture('Call Alice @calls');
    expect(latest()).toMatchObject({ actorLabel: 'you', summary: 'Captured “Call Alice”', blocker: null });
    runAs({ kind: 'client', id: 'c1', name: 'Phone agent' }, () => api.capture('Buy clay'));
    expect(latest()).toMatchObject({ actorLabel: 'Phone agent', actorKey: 'c1' });
  });

  it('clarify reads as a move between lists', () => {
    api.clarify('i1', { kind: 'action', text: 'Ask about the invoice', route: { to: 'waiting', who: 'Dentist' } });
    expect(latest().summary).toBe('“Ask about the invoice”: Inbox → Waiting For (Dentist)');
  });

  it('listActivity is newest first and limited; filters by actor and by subject', () => {
    for (let n = 0; n < 5; n++) api.capture(`x${n}`);
    runAs({ kind: 'mail' }, () => api.capture('from mail'));
    expect(api.listActivity({ limit: 3 }).map((e) => e.summary)).toEqual(['Captured “from mail”', 'Captured “x4”', 'Captured “x3”']);
    expect(api.listActivity({ actor: 'mail' })).toHaveLength(1);
    api.editNext('n1', { priority: 'C' });
    expect(api.listActivity({ subject: 'p-table' }).some((e) => e.summary.startsWith('Edited “Compare'))).toBe(true);
  });
});

describe('undo through the api', () => {
  it('undoes a clarify; the undo is logged as yours', () => {
    api.clarify('i1', { kind: 'trash' });
    const id = latest().id;
    api.undoActivity(id);
    expect(api.getItem('i1')!.status).toBe('inbox');
    expect(latest()).toMatchObject({ undoOf: id, actorLabel: 'you' });
  });

  it('undo is refused once a renumbering touched an item since', () => {
    api.editNext('n3', { priority: 'A' }); // renumbers the B and A actions
    const id = latest().id;
    runAs({ kind: 'client', id: 'c1', name: 'Phone agent' }, () => api.complete('n1')); // renumbers the As again
    expect(() => api.undoActivity(id)).toThrow('undo: changed since by Phone agent');
    expect(api.getItem('n3')!.priority).toBe('A'); // nothing half-applied
  });

  it('undo of a purge restores the item', () => {
    api.trash(['i1']);
    api.purgeTrash(); // "empty trash": deleted for good
    const purge = latest();
    // other trashed seed items may be purged in the same go: check this one's phrase is there
    expect(purge.summary).toContain('Deleted “Call the dentist about the invoice” for good');
    api.undoActivity(purge.id);
    expect(api.getItem('i1')!.status).toBe('trash');
  });

  it('an unknown entry is refused', () => {
    expect(() => api.undoActivity('nope')).toThrow('undo: unknown entry nope');
  });
});
```

(`i1`'s text is "Call the dentist about the invoice" in `seed.demo.json`; check it and adapt the expected string if it differs.)

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vitest run --project memory src/lib/activity-api.test.ts`
Expected: FAIL — `api.listActivity is not a function`.

- [ ] **Step 3: Wrap the store** — in `src/lib/store/index.ts`:

```ts
import { record, snapshot } from '../activity';
…
export const store: Store = {
  getState: () => open().getState(),
  // Every change is logged with its actor in the same write (lib/activity.ts).
  update: (fn) =>
    open().update((s) => {
      const before = snapshot(s);
      fn(s);
      record(s, before);
    }),
  subscribe: (listener) => open().subscribe(listener),
};
```

- [ ] **Step 4: Api functions** — in `src/lib/api.ts`:

Imports: `import { actorKey, actorLabel, applyUndo, runUndo, setActivityClock, undoBlocker } from './activity';` and `ActivityEntry` from `./store/types`.

Right after `export function now(): Date { … }` add:

```ts
setActivityClock(now);
```

Add a section at the end of the file:

```ts
// ── Activity ────────────────────────────────────────────────────────────────

export interface ActivityRow extends ActivityEntry {
  actorLabel: string;
  actorKey: string;
  /** Why it can't be undone now, or null. */
  blocker: string | null;
}

/** Newest first. `actor`: 'you' | a client id | 'mail' | 'share' | 'system'. `subject`: an item or project id. */
export function listActivity(filter: { actor?: string; subject?: string; limit?: number } = {}): ActivityRow[] {
  const s = store.getState();
  const touches = (e: ActivityEntry, id: string) =>
    e.changes.some((c) => c.id === id || (c.kind === 'item' && [c.before, c.after].some((x) => (x as Item | null)?.projectId === id)));
  const out: ActivityRow[] = [];
  for (let n = s.activity.length - 1; n >= 0 && out.length < (filter.limit ?? 200); n--) {
    const e = s.activity[n];
    if (filter.actor && actorKey(e.actor) !== filter.actor) continue;
    if (filter.subject && !touches(e, filter.subject)) continue;
    out.push({ ...e, actorLabel: actorLabel(e.actor), actorKey: actorKey(e.actor), blocker: undoBlocker(s, e) });
  }
  return out;
}

export function getActivityEntry(id: string): ActivityEntry | undefined {
  return store.getState().activity.find((e) => e.id === id);
}

/** Undo an entry while nothing has touched its items since; returns the undo's own entry id. */
export function undoActivity(id: string): string {
  const entry = getActivityEntry(id);
  check(entry, `unknown entry ${id}`, 'undo');
  const blocker = undoBlocker(store.getState(), entry);
  check(!blocker, blocker ?? '', 'undo');
  runUndo(id, () => store.update((s) => applyUndo(s, entry)));
  return store.getState().activity.at(-1)!.id;
}
```

- [ ] **Step 5: Run the whole suite**

Run: `pnpm test`
Expected: all PASS. Tests that reset state with `store.update(Object.assign…)` now also write an entry — harmless; only fix a test if it asserts on the whole state.

- [ ] **Step 6: Commit**

```bash
git add src/lib/store/index.ts src/lib/api.ts src/lib/activity-api.test.ts
git commit -m "feat(mcp-1): every store write is logged with its actor; undo in the api"
```

---

### Task 4: Clients and presets

**Files:**
- Create: `src/lib/clients.ts`
- Test: `src/lib/clients.test.ts`

**Interfaces:**
- Consumes: `store`, `now()` from api, `Actor`, `StoredClient`.
- Produces:
  ```ts
  export type Preset = 'capture' | 'read-only' | 'assistant';
  export type Capability = 'capture' | 'read' | 'write';
  export const PRESETS: Record<Preset, readonly Capability[]>;
  export interface ClientIdentity { id: string; name: string; preset: Preset }
  export interface ClientRow extends ClientIdentity { createdAt: string; lastUsedAt?: string; revokedAt?: string; builtIn?: boolean }
  export function createClient(name: string, preset: Preset): { client: ClientIdentity; token: string };
  export function listClients(): ClientRow[];          // active first, then revoked; never a hash or token
  export function revokeClient(id: string): void;
  export function authenticate(authorization: string | null): ClientIdentity | null;
  export function can(client: ClientIdentity, capability: Capability): boolean;
  export function actorOf(client: ClientIdentity): Actor;
  export function captureEnabled(): boolean;           // env token set, or any active client that may capture
  export const ENV_CLIENT: ClientIdentity;            // { id: 'env-capture', name: 'capture (env)', preset: 'capture' }
  ```

- [ ] **Step 1: Write the failing tests** — `src/lib/clients.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runSilently } from './activity';
import { ENV_CLIENT, authenticate, can, captureEnabled, createClient, listClients, revokeClient } from './clients';
import { store } from './store';
import { demoSeed as seed } from './store/seed';
import type { State } from './store/types';

beforeEach(() =>
  runSilently(() =>
    store.update((s) => {
      for (const key of Object.keys(s) as (keyof State)[]) delete s[key];
      Object.assign(s, structuredClone(seed));
    }),
  ),
);
afterEach(() => {
  delete process.env.CAPTURE_TOKEN;
});

describe('clients', () => {
  it('the token is shown once and never stored', () => {
    const { client, token } = createClient('Claude Desktop', 'assistant');
    expect(token).toMatch(/^gtd_[A-Za-z0-9_-]{32,}$/);
    const stored = JSON.stringify(store.getState().clients);
    expect(stored).not.toContain(token);
    expect(JSON.stringify(listClients())).not.toMatch(/tokenHash|gtd_/);
    expect(authenticate(`Bearer ${token}`)).toEqual(client);
    expect(JSON.stringify(store.getState().activity)).not.toContain(token);
  });

  it('presets: capture may only capture; read-only only read; assistant all three', () => {
    const cap = createClient('n8n scan', 'capture').client;
    const ro = createClient('Report', 'read-only').client;
    const all = createClient('Phone agent', 'assistant').client;
    expect([can(cap, 'capture'), can(cap, 'read'), can(cap, 'write')]).toEqual([true, false, false]);
    expect([can(ro, 'capture'), can(ro, 'read'), can(ro, 'write')]).toEqual([false, true, false]);
    expect([can(all, 'capture'), can(all, 'read'), can(all, 'write')]).toEqual([true, true, true]);
  });

  it('revoke takes effect at once; the client stays listed as revoked', () => {
    const { client, token } = createClient('Phone agent', 'assistant');
    revokeClient(client.id);
    expect(authenticate(`Bearer ${token}`)).toBeNull();
    expect(listClients().find((c) => c.id === client.id)).toMatchObject({ revokedAt: expect.any(String) });
  });

  it('names are required and unique among active clients; presets are checked', () => {
    createClient('Phone agent', 'assistant');
    expect(() => createClient('  ', 'capture')).toThrow(/name/);
    expect(() => createClient('phone AGENT', 'capture')).toThrow(/already/);
    expect(() => createClient('X', 'admin' as never)).toThrow(/preset/);
  });

  it('wrong, missing or malformed headers are nobody', () => {
    createClient('Phone agent', 'assistant');
    expect(authenticate(null)).toBeNull();
    expect(authenticate('Bearer gtd_wrong')).toBeNull();
    expect(authenticate('Basic abc')).toBeNull();
  });

  it('CAPTURE_TOKEN from the environment is the built-in capture client', () => {
    expect(captureEnabled()).toBe(false);
    process.env.CAPTURE_TOKEN = 'env-token-not-a-secret';
    expect(captureEnabled()).toBe(true);
    expect(authenticate('Bearer env-token-not-a-secret')).toEqual(ENV_CLIENT);
    expect(listClients()[0]).toMatchObject({ id: 'env-capture', builtIn: true });
  });

  it('last use is recorded, at most once a minute', () => {
    const { client, token } = createClient('Phone agent', 'assistant');
    authenticate(`Bearer ${token}`);
    const first = listClients().find((c) => c.id === client.id)!.lastUsedAt;
    expect(first).toBeDefined();
    authenticate(`Bearer ${token}`);
    expect(listClients().find((c) => c.id === client.id)!.lastUsedAt).toBe(first);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vitest run --project memory src/lib/clients.test.ts`
Expected: FAIL — `Cannot find module './clients'`.

- [ ] **Step 3: Implement `src/lib/clients.ts`**

```ts
// API clients (MCP design §3.1): a name, a preset, a token shown once and stored as its
// SHA-256. The env CAPTURE_TOKEN keeps working as the built-in client "capture (env)".
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { now } from './api';
import { store } from './store';
import type { Actor } from './store/types';

export type Preset = 'capture' | 'read-only' | 'assistant';
export type Capability = 'capture' | 'read' | 'write';
export const PRESETS: Record<Preset, readonly Capability[]> = {
  capture: ['capture'],
  'read-only': ['read'],
  assistant: ['capture', 'read', 'write'],
};

export interface ClientIdentity {
  id: string;
  name: string;
  preset: Preset;
}
export interface ClientRow extends ClientIdentity {
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
  builtIn?: boolean;
}

export const ENV_CLIENT: ClientIdentity = { id: 'env-capture', name: 'capture (env)', preset: 'capture' };
const LAST_USED_EVERY_MS = 60_000;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const sameText = (a: string, b: string) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

function fail(message: string): never {
  throw new Error(`clients: ${message}`);
}

export function createClient(name: string, preset: Preset): { client: ClientIdentity; token: string } {
  const clean = name.trim();
  if (!clean) fail('a client needs a name');
  if (!(preset in PRESETS)) fail(`unknown preset ${preset}`);
  const twin = store.getState().clients.find((c) => !c.revokedAt && c.name.toLowerCase() === clean.toLowerCase());
  if (twin || clean.toLowerCase() === ENV_CLIENT.name) fail(`a client named "${clean}" exists already`);
  const token = `gtd_${randomBytes(32).toString('base64url')}`;
  const client: ClientIdentity = { id: `c-${crypto.randomUUID()}`, name: clean, preset };
  store.update((s) => {
    s.clients.push({ ...client, tokenHash: sha256(token), createdAt: now().toISOString() });
  });
  return { client, token };
}

export function listClients(): ClientRow[] {
  const rows: ClientRow[] = store.getState().clients.map(({ tokenHash: _hash, ...c }) => ({ ...c }));
  const builtIn: ClientRow[] = process.env.CAPTURE_TOKEN ? [{ ...ENV_CLIENT, createdAt: '', builtIn: true }] : [];
  return [...builtIn, ...rows.filter((c) => !c.revokedAt), ...rows.filter((c) => c.revokedAt)];
}

export function revokeClient(id: string): void {
  const c = store.getState().clients.find((x) => x.id === id);
  if (!c) fail(`unknown client ${id}`);
  if (c.revokedAt) return;
  store.update((s) => {
    s.clients.find((x) => x.id === id)!.revokedAt = now().toISOString();
  });
}

/** The client a request's `Authorization: Bearer …` belongs to, or null. */
export function authenticate(authorization: string | null): ClientIdentity | null {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  const env = process.env.CAPTURE_TOKEN;
  if (env && sameText(token, env)) return ENV_CLIENT;
  const hash = sha256(token);
  const c = store.getState().clients.find((x) => !x.revokedAt && x.tokenHash === hash);
  if (!c) return null;
  const at = now();
  if (!c.lastUsedAt || at.getTime() - Date.parse(c.lastUsedAt) >= LAST_USED_EVERY_MS) {
    store.update((s) => {
      s.clients.find((x) => x.id === c.id)!.lastUsedAt = at.toISOString();
    });
  }
  return { id: c.id, name: c.name, preset: c.preset };
}

export function can(client: ClientIdentity, capability: Capability): boolean {
  return PRESETS[client.preset].includes(capability);
}

export function actorOf(client: ClientIdentity): Actor {
  return { kind: 'client', id: client.id, name: client.name };
}

/** The capture endpoint is on when anyone may use it. */
export function captureEnabled(): boolean {
  return !!process.env.CAPTURE_TOKEN || store.getState().clients.some((c) => !c.revokedAt && can(c, 'capture'));
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/lib/clients.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS (both store projects). If eslint flags `_hash` as unused, use `const { tokenHash, ...c } = x; void tokenHash;` — the hash must not leave this module.

- [ ] **Step 5: Commit**

```bash
git add src/lib/clients.ts src/lib/clients.test.ts
git commit -m "feat(mcp-1): named API clients with presets; tokens stored hashed"
```

---

### Task 5: Actors at the edges

**Files:**
- Modify: `src/app/api/capture/route.ts`, `src/app/share/route.ts`, `src/lib/mail/poller.ts`, `src/lib/calendar/scheduler.ts`
- Test: `src/lib/capture-in.test.ts` (modify), `src/lib/mail-in.test.ts` (no change expected)

**Interfaces:**
- Consumes: `authenticate`, `can`, `actorOf`, `captureEnabled` (Task 4); `runAs` (Task 2); `listActivity` (Task 3).

- [ ] **Step 1: Write the failing tests** — add to `src/lib/capture-in.test.ts` (import `createClient`, `revokeClient` from `./clients`; `listActivity` is `api.listActivity`):

```ts
describe('clients on the capture endpoint (MCP stage 1)', () => {
  beforeEach(() => {
    delete process.env.CAPTURE_TOKEN;
  });

  it('a capture through a named client is logged under its name', async () => {
    const { token } = createClient('n8n scan', 'capture');
    expect((await capture({ text: 'Warranty card' }, `Bearer ${token}`)).status).toBe(201);
    expect(api.listActivity({ limit: 1 })[0]).toMatchObject({ actorLabel: 'n8n scan', summary: 'Captured “Warranty card”' });
  });

  it('a revoked client gets 401; a read-only client gets 403', async () => {
    const a = createClient('Old script', 'capture');
    revokeClient(a.client.id);
    expect((await capture({ text: 'x' }, `Bearer ${a.token}`)).status).toBe(401);
    const ro = createClient('Report', 'read-only');
    expect((await capture({ text: 'x' }, `Bearer ${ro.token}`)).status).toBe(403);
  });

  it('the env token is logged as "capture (env)"', async () => {
    process.env.CAPTURE_TOKEN = TOKEN;
    await capture({ text: 'From the shell' });
    expect(api.listActivity({ limit: 1 })[0].actorLabel).toBe('capture (env)');
  });

  it('a share is logged as share', async () => {
    await share({ title: 'Glaze recipes', url: 'https://example.com/glaze' });
    expect(api.listActivity({ limit: 1 })[0].actorLabel).toBe('share');
  });
});
```

The existing test "auth: … off without CAPTURE_TOKEN → 404" stays valid: the seed has no clients.

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vitest run --project memory src/lib/capture-in.test.ts`
Expected: FAIL — named client token gets 401; actor is "you".

- [ ] **Step 3: The capture route** — replace the token handling in `src/app/api/capture/route.ts`:

```ts
import { runAs } from '@/lib/activity';
import { captureRequest, limiters, readBody } from '@/lib/capture-in';
import { actorOf, authenticate, can, captureEnabled } from '@/lib/clients';

export async function POST(req: Request) {
  if (!captureEnabled()) return Response.json({ error: 'the capture endpoint is off: create a client in Settings or set CAPTURE_TOKEN' }, { status: 404 });
  const tooMany = (limiter: typeof limiters.capture, error: string) =>
    Response.json({ error }, { status: 429, headers: { 'Retry-After': String(limiter.retryAfter()) } });
  const client = authenticate(req.headers.get('authorization'));
  // Wrong tokens are throttled on their own quota: they can't use up the real captures'.
  if (!client) {
    if (!limiters.badToken.take()) return tooMany(limiters.badToken, 'too many requests without a valid token');
    return Response.json({ error: 'missing, wrong or revoked bearer token' }, { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
  }
  if (!can(client, 'capture')) return Response.json({ error: `client "${client.name}" may not capture` }, { status: 403 });
  if (!limiters.capture.take()) return tooMany(limiters.capture, 'too many requests: 60 a minute');
  const raw = await readBody(req);
  if (raw === null) return Response.json({ error: 'body is too large' }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'body is not JSON' }, { status: 400 });
  }
  const result = runAs(actorOf(client), () => captureRequest(body));
  if ('error' in result) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result.item, { status: 201 });
}
```

Keep the existing doc comment above `POST`, updated: "`Authorization: Bearer <client token>` (Settings → Clients, or `CAPTURE_TOKEN`)". Remove the now unused `bearerOk` export from `src/lib/capture-in.ts` only if nothing else imports it (`rg bearerOk src`).

- [ ] **Step 4: Share, mail, calendar**

`src/app/share/route.ts`: `import { runAs } from '@/lib/activity';` and change the capture line to
`const result = runAs({ kind: 'share' }, () => captureRequest(request));`

`src/lib/mail/poller.ts`, in `pollMailbox`: `const result = await runAs({ kind: 'mail' }, () => pollOnce(config));` and wrap both `api.recordMailPoll(…)` calls the same way (`runAs({ kind: 'mail' }, () => api.recordMailPoll())`). AsyncLocalStorage carries the scope across the awaits inside `pollOnce`.

`src/lib/calendar/scheduler.ts`, in `runOnce`: `for (const r of await runAs({ kind: 'system' }, () => api.syncCalendars()))`.

- [ ] **Step 5: Run the suite**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/capture/route.ts src/app/share/route.ts src/lib/mail/poller.ts src/lib/calendar/scheduler.ts src/lib/capture-in.ts src/lib/capture-in.test.ts
git commit -m "feat(mcp-1): the capture endpoint takes named clients; edges say who acts"
```

---

### Task 6: The Activity view, history links, undo in the UI

**Files:**
- Create: `src/app/activity/page.tsx`, `src/components/activity/ActivityList.tsx`, `src/components/activity/ActorFilter.tsx`
- Modify: `src/lib/actions.ts`, `src/components/shell/Sidebar.tsx`, `src/app/clarify/page.tsx`, `src/components/clarify/ClarifyForm.tsx`, `src/components/projects/ProjectDetail.tsx`

**Interfaces:**
- Consumes: `listActivity`, `undoActivity`, `getItem`, `getProject` (api); `fmtDate`, `fmtWeekdayTime` (format); `ContextChip`, `Card`, `Btn`, `Page`.
- Produces: `undoActivityAction(id: string): Promise<{ error?: string }>`; route `/activity?actor=&subject=`.

- [ ] **Step 1: Server action** — append to `src/lib/actions.ts`:

```ts
/** Activity → Undo: refused with the reason when something touched those items since. */
export async function undoActivityAction(id: string): Promise<{ error?: string }> {
  try {
    api.undoActivity(id);
  } catch (e) {
    return { error: (e instanceof Error ? e.message : String(e)).replace(/^undo: /, '') };
  }
  revalidatePath('/', 'layout');
  return {};
}
```

- [ ] **Step 2: The page** — `src/app/activity/page.tsx`:

```tsx
import Link from 'next/link';
import { ActivityList } from '@/components/activity/ActivityList';
import { ActorFilter } from '@/components/activity/ActorFilter';
import { Page } from '@/components/shell/Page';
import * as api from '@/lib/api';
import { fmtDate, fmtWeekdayTime } from '@/lib/format';

/** Every change, by anyone (MCP design §3.2), newest first; undo while nothing changed since. */
export default async function ActivityPage({ searchParams }: PageProps<'/activity'>) {
  const { actor, subject } = await searchParams;
  const a = typeof actor === 'string' ? actor : undefined;
  const s = typeof subject === 'string' ? subject : undefined;
  const all = api.listActivity({ limit: 1000 });
  const actors = [...new Map(all.map((e) => [e.actorKey, e.actorLabel])).entries()].map(([key, label]) => ({ key, label }));
  const rows = api.listActivity({ actor: a, subject: s, limit: 200 }).map((e) => ({
    id: e.id,
    when: `${fmtWeekdayTime(e.at, api.timeZone())} · ${fmtDate(e.at.slice(0, 10))}`,
    actor: e.actorLabel,
    summary: e.summary,
    blocker: e.blocker,
    undo: !!e.undoOf,
  }));
  const named = s && (api.getItem(s)?.text ?? api.getProject(s)?.title);
  return (
    <Page
      title="Activity"
      meta={named ? `history of “${named}”` : 'every change, by anyone · undo while nothing changed since'}
      toolbar={<ActorFilter actors={actors} value={a} subject={s} />}
      phone={{ meta: null }}
    >
      {s && (
        <p className="m-0 mb-3 font-mono text-meta text-muted">
          <Link href="/activity" className="text-accent">
            ← all activity
          </Link>
        </p>
      )}
      <ActivityList rows={rows} />
    </Page>
  );
}
```

- [ ] **Step 3: The actor filter** — `src/components/activity/ActorFilter.tsx` (same pattern as `components/inbox/SourceFilter.tsx`):

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { ContextChip } from '../ui/ContextChip';

const label = 'mr-1.5 font-mono text-label tracking-[0.1em] text-muted';

/** all · you · each client · mail · share · the app — the actors seen in the log. Lives in the URL. */
export function ActorFilter({ actors, value, subject }: { actors: { key: string; label: string }[]; value?: string; subject?: string }) {
  const router = useRouter();
  const go = (actor?: string) => {
    const q = new URLSearchParams({ ...(actor && { actor }), ...(subject && { subject }) }).toString();
    router.replace(q ? `/activity?${q}` : '/activity', { scroll: false });
  };
  return (
    <div role="group" aria-label="Who" className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line bg-panel px-4 py-2.5 lg:px-5">
      <span className={label}>WHO</span>
      <ContextChip pressed={!value} onClick={() => go()}>
        all
      </ContextChip>
      {actors.map((a) => (
        <ContextChip key={a.key} pressed={value === a.key} onClick={() => go(a.key)}>
          {a.label}
        </ContextChip>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: The list** — `src/components/activity/ActivityList.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { undoActivityAction } from '@/lib/actions';
import { Btn } from '../ui/Btn';
import { Card } from '../ui/Card';

export interface ActivityListRow {
  id: string;
  when: string;
  actor: string;
  summary: string;
  /** Why it can't be undone now, or null. */
  blocker: string | null;
  /** This entry is itself an undo. */
  undo: boolean;
}

const mono = 'font-mono text-meta text-muted';

export function ActivityList({ rows }: { rows: ActivityListRow[] }) {
  const [pending, startTransition] = useTransition();
  const [refused, setRefused] = useState<{ id: string; message: string } | null>(null);

  function undo(id: string) {
    startTransition(async () => {
      const { error } = await undoActivityAction(id);
      setRefused(error ? { id, message: error } : null);
    });
  }

  if (!rows.length) return <p className={`${mono} m-0 py-8 text-center`}>Nothing yet.</p>;
  return (
    <Card aria-label="Activity" className="flex flex-col">
      <ul className="m-0 list-none p-0">
        {rows.map((r) => (
          <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 border-b border-line-soft px-3 py-2 last:border-b-0">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span>{r.summary}</span>
              <span className={mono}>
                {r.when} · {r.actor}
              </span>
            </span>
            {r.blocker ? (
              <span className={mono}>{r.blocker}</span>
            ) : (
              <Btn size="sm" disabled={pending} onClick={() => undo(r.id)} aria-label={`Undo: ${r.summary}`}>
                {r.undo ? 'Redo' : 'Undo'}
              </Btn>
            )}
            {refused?.id === r.id && <span className="col-span-2 text-xs text-warn">{refused.message}</span>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

- [ ] **Step 5: Links**

`src/components/shell/Sidebar.tsx` — replace the single settings `<Link>` with:

```tsx
      <div className="flex gap-1">
        {[
          ['/settings', 'settings'],
          ['/activity', 'activity'],
        ].map(([href, text]) => (
          <Link key={href} href={href} className="self-start rounded px-2.5 pt-1.5 font-mono text-meta text-muted no-underline hover:text-ink">
            {text}
          </Link>
        ))}
      </div>
```

`src/components/clarify/ClarifyForm.tsx` — inside the item card's `SectionHead`, after `{item.source} · {item.when}`:

```tsx
            {' · '}
            <Link href={`/activity?subject=${encodeURIComponent(item.id)}`} className="text-muted underline-offset-2 hover:text-ink">
              history
            </Link>
```

(`Link` from `next/link`; add the import if missing.)

`src/components/projects/ProjectDetail.tsx` — after the headline `<span>` (line with `{p.headline}`):

```tsx
          <Link href={`/activity?subject=${encodeURIComponent(p.id)}`} className="font-mono text-label tracking-[0.1em] text-muted no-underline hover:text-ink">
            HISTORY
          </Link>
```

- [ ] **Step 6: Build and check in the browser**

Run: `pnpm lint && pnpm typecheck && pnpm test && STORE=memory CAL_WORK_URL= CAPTURE_MAIL_HOST= pnpm build`
Then start the built server on an isolated port and, with playwright-core (the pattern used in earlier steps: `node .next/standalone/server.js` after copying `.next/static` and `public`):
1. capture "Call Alice" on /inbox → /activity shows "Captured “Call Alice” · … · you" with **Undo**;
2. press Undo → the item is gone from /inbox; the new top row reads "Undid: Captured “Call Alice”" with **Redo**; the first row now shows "changed since by you";
3. open /clarify on an item → "history" opens /activity?subject=… with its capture entry;
4. the WHO chips filter (all · you · …).
Expected: all four as described; no console errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/activity src/components/activity src/lib/actions.ts src/components/shell/Sidebar.tsx src/components/clarify/ClarifyForm.tsx src/components/projects/ProjectDetail.tsx
git commit -m "feat(mcp-1): the Activity view — every change, who did it, undo"
```

---

### Task 7: Settings → Clients

**Files:**
- Create: `src/components/settings/ClientsCard.tsx`
- Modify: `src/lib/actions.ts`, `src/app/settings/page.tsx`, `src/components/settings/SettingsBoard.tsx`

**Interfaces:**
- Consumes: `createClient`, `listClients`, `revokeClient`, `ClientRow`, `Preset` (Task 4); `fmtWeekdayTime`.
- Produces: `createClientAction(name: string, preset: Preset): Promise<{ token?: string; error?: string }>`, `revokeClientAction(id: string): Promise<void>`.

- [ ] **Step 1: Actions** — append to `src/lib/actions.ts` (import `* as clients from './clients'`):

```ts
/** Settings → Clients → Create: the token is returned once, here, and never again. */
export async function createClientAction(name: string, preset: clients.Preset): Promise<{ token?: string; error?: string }> {
  try {
    const { token } = clients.createClient(name, preset);
    revalidatePath('/settings');
    return { token };
  } catch (e) {
    return { error: (e instanceof Error ? e.message : String(e)).replace(/^clients: /, '') };
  }
}

export async function revokeClientAction(id: string): Promise<void> {
  clients.revokeClient(id);
  revalidatePath('/settings');
}
```

- [ ] **Step 2: The card** — `src/components/settings/ClientsCard.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { createClientAction, revokeClientAction } from '@/lib/actions';
import type { Preset } from '@/lib/clients';
import { Btn } from '../ui/Btn';
import { Card } from '../ui/Card';
import { Tag } from '../ui/Tag';

export interface ClientsCardRow {
  id: string;
  name: string;
  preset: Preset;
  /** `wed 09:14`, or absent. */
  lastUsed?: string;
  revoked: boolean;
  builtIn: boolean;
}

const mono = 'font-mono text-meta text-muted';
const PRESET_HINT: Record<Preset, string> = {
  capture: 'inbox and tickler notes only',
  'read-only': 'reads everything, changes nothing',
  assistant: 'reads, captures, drafts and acts — logged',
};

/** API clients (MCP, scripts): name + preset; the token is shown once. */
export function ClientsCard({ rows }: { rows: ClientsCardRow[] }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [preset, setPreset] = useState<Preset>('assistant');
  const [shown, setShown] = useState<{ name: string; token: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function create() {
    startTransition(async () => {
      const r = await createClientAction(name, preset);
      if (r.error) return setError(r.error);
      setError(null);
      setShown({ name: name.trim(), token: r.token! });
      setName('');
    });
  }

  return (
    <Card aria-labelledby="clients-head" className="flex flex-col">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-b border-line px-3 py-2.5">
        <h2 id="clients-head" className="m-0 text-body font-semibold">Clients</h2>
        <span className={mono}>agents and scripts with their own token · everything they change is in Activity</span>
      </div>
      <ul className="m-0 list-none p-0">
        {rows.map((c) => (
          <li key={c.id} className="flex min-h-9 flex-wrap items-center gap-x-2.5 border-b border-line-soft px-3 py-1.5">
            <span className={c.revoked ? 'grow text-muted line-through' : 'grow'}>{c.name}</span>
            <Tag>{c.preset}</Tag>
            <span className={mono}>{c.builtIn ? 'CAPTURE_TOKEN' : c.revoked ? 'revoked' : c.lastUsed ? `used ${c.lastUsed}` : 'never used'}</span>
            {!c.builtIn && !c.revoked && (
              <Btn size="sm" disabled={pending} onClick={() => startTransition(() => revokeClientAction(c.id))} aria-label={`Revoke ${c.name}`}>
                Revoke
              </Btn>
            )}
          </li>
        ))}
      </ul>
      {shown && (
        <div role="status" className="flex flex-col gap-1 border-b border-line-soft bg-warn-tint px-3 py-2">
          <span className="text-sm">
            Token for <b>{shown.name}</b> — copy it now, it is not shown again:
          </span>
          <code className="font-mono text-meta break-all select-all">{shown.token}</code>
          <button type="button" className="w-fit text-xs text-accent" onClick={() => setShown(null)}>
            Done, I copied it
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2.5 px-3 py-2">
        <input
          aria-label="New client name"
          placeholder="+ client, e.g. Claude Desktop"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && create()}
          className="h-(--wb-hit-phone) min-w-0 grow rounded border border-control bg-panel px-2 text-ink lg:h-7"
        />
        <select
          aria-label="Preset"
          value={preset}
          onChange={(e) => setPreset(e.target.value as Preset)}
          className="h-(--wb-hit-phone) rounded border border-control bg-panel px-1.5 font-mono text-meta text-ink lg:h-7"
        >
          {(Object.keys(PRESET_HINT) as Preset[]).map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <Btn size="sm" disabled={pending || !name.trim()} onClick={create}>
          Create
        </Btn>
        <span className={`${mono} basis-full`}>{PRESET_HINT[preset]}</span>
        {error && <span className="basis-full text-xs text-warn">{error}</span>}
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: Wire it in** — `src/app/settings/page.tsx`: `import { listClients } from '@/lib/clients';` and pass

```tsx
        clients={listClients().map((c) => ({
          id: c.id,
          name: c.name,
          preset: c.preset,
          ...(c.lastUsedAt && { lastUsed: fmtWeekdayTime(c.lastUsedAt, api.timeZone()) }),
          revoked: !!c.revokedAt,
          builtIn: !!c.builtIn,
        }))}
```

`SettingsBoard.tsx`: add `clients: ClientsCardRow[]` to `SettingsBoardProps`, import `ClientsCard, type ClientsCardRow`, render `<ClientsCard rows={props.clients} />` right after the Mailbox card.

- [ ] **Step 4: Build and check in the browser** (isolated memory server as in Task 6):
1. Settings → Clients: create "Phone agent" (assistant) → the token box appears once; reload → box gone, row shows "never used";
2. `curl -H "Authorization: Bearer <token>" -d '{"text":"From the phone"}' localhost:<port>/api/capture` → 201; Settings row → "used …"; /activity → "Captured “From the phone” · Phone agent";
3. Revoke → the same curl → 401; the row is struck through and listed last.
Expected: as described.

Run: `pnpm lint && pnpm typecheck && pnpm test && STORE=memory CAL_WORK_URL= CAPTURE_MAIL_HOST= pnpm build`

- [ ] **Step 5: Commit**

```bash
git add src/components/settings src/app/settings/page.tsx src/lib/actions.ts
git commit -m "feat(mcp-1): Settings → Clients — create with a preset, token shown once, revoke"
```

---

### Task 8: Docs and the stage check

**Files:**
- Modify: `docs/handoff/SPEC.md`, `docs/OPERATIONS.md`, `.env.example`, `AGENTS.md`

- [ ] **Step 1: SPEC**
- §2 routes table: add `| /activity | — (built from the primitives) | Every change by anyone, with undo (§3.12) |`.
- §3.9 Settings: add a bullet "Clients: name + preset (capture / read-only / assistant); the token is shown once and stored as a hash; revoke; last use. `CAPTURE_TOKEN` is the built-in client "capture (env)"."
- New §3.12 Activity: the log covers items, projects and tickler notes (not settings, review runs, calendar sync or mail bookkeeping); entries in words with actor (you / client name / mail / share / the app); kept 365 days; per item and per project via "history"; undo any entry while every entity is as the entry left it, else "changed since by …"; an undo is an entry (Redo).
- §5 domain model: `ActivityEntry`, `StoredClient` as in Task 1.

- [ ] **Step 2: OPERATIONS** — in "Capture from outside → Endpoint": a client from Settings → Clients is the normal way; `CAPTURE_TOKEN` still works ("capture (env)"); 403 for a client whose preset may not capture. In "Reachable from outside": unchanged bypass list. `.env.example`: the `CAPTURE_TOKEN` comment says "optional; prefer Settings → Clients".

- [ ] **Step 3: AGENTS.md** — layout block: add `lib/activity.ts    the activity log: who changed what, undo` and `lib/clients.ts     API clients and presets`.

- [ ] **Step 4: Stage check**

Run: `pnpm lint && pnpm typecheck && pnpm test && STORE=memory CAL_WORK_URL= CAPTURE_MAIL_HOST= pnpm build && pnpm smoke`
Expected: all pass; `rg '#[0-9a-f]{6}' src --glob '!**/tokens.css'` empty; `git grep -n -i <the deployment domain>` empty.

- [ ] **Step 5: Commit**

```bash
git add docs/handoff/SPEC.md docs/OPERATIONS.md .env.example AGENTS.md
git commit -m "docs(mcp-1): activity log, undo and clients in SPEC and OPERATIONS"
```

---

## Roadmap: the later stages (each gets its own plan when the previous one has landed)

**Stage 2 — App operations the tools need, and Clarify drafts.** `file(text, decision)` (capture + clarify in one entry), `editWaiting(id, who?, followUp?)`, `overview()`, `freeTime(from, to, minMinutes, dayHours?)`, `prepareWeeklyReview()`, drafts on inbox items (`Item.draft` + `draftClarification`), Clarify prefilled from a draft with "drafted by … · reason", a draft marker in the inbox list. Pure api + UI; tested like the rest.

**Stage 3 — REST API `/api/v1`.** One route per tool group, a tool registry (name, description, JSON schema, capability) served at `GET /api/v1/tools`, bearer auth via `authenticate` + `can`, every write answered with its activity entry id, the app's refusal reasons passed through, `/api/capture` kept as an alias. OPERATIONS: the Authelia bypass for `/api/v1/*`.

**Stage 4 — The stdio MCP binary and the workflows.** A small package in this repo (`packages/gtd-mcp`): reads `GTD_URL` and `GTD_TOKEN`, fetches `/api/v1/tools`, registers them with the MCP SDK, forwards calls; the seven guided workflows as MCP prompts; setup notes for Claude Desktop, Claude Code, Codex and a server-side agent.
