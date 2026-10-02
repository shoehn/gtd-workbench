# MCP Stage 3 — REST API `/api/v1` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every MCP tool of the spec exists as a typed, validated, permission-checked call over HTTP: `GET /api/v1/tools` lists what a client may call (with JSON Schemas), `POST /api/v1/tools/<name>` runs one call as that client, `GET /api/v1/prompts` serves the guided workflows. The Go binary (Stage 4) only translates.

**Architecture:** A tool is a plain object — name, description, capability (`read` / `capture` / `write` / `any`), a zod `strictObject` input schema and a `run` function that calls `src/lib/api.ts`. One registry lists all tools; the JSON Schema each client sees is generated from the same zod schema. One dynamic route handler authenticates (Stage 1 `authenticate`), checks the capability (`can`), rate-limits, reads the body with the streaming limit, validates, runs the tool inside `runAs(actorOf(client))`, and answers `{ result, activity }` — the ids of the log entries the call produced. Refusals from the api become 422 with the app's reason.

**Tech Stack:** Next.js 16 route handlers (`RouteContext` typed params), TypeScript strict, zod 4 (`z.strictObject`, `z.toJSONSchema`), vitest.

**Spec:** `docs/superpowers/specs/2026-10-01-mcp-tools-design.md` — §2 architecture, §3.1 presets, §4 conventions, §5 tools, §6 workflows. Stages 1 and 2 are on `main`.

## Global Constraints

- Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` before writing the route handlers (Next 16 `RouteContext`).
- zod 4 is already in `node_modules` (4.6.5) as a transitive dependency; add it as a direct dependency (`pnpm add zod@^4`), do not rely on the transitive copy.
- The api (`src/lib/api.ts`) stays the only data access; tools call it and never touch the store directly, except to group several api calls into one write (`store.update(() => …)`) where a tool says so.
- Tool names, arguments and semantics as in spec §5 (snake_case names, e.g. `find_free_time`); spec §4: items carry `id`, `text`, `list`, the fields that matter, and a link (`href`, a path — the binary makes it absolute); refusals carry the app's reason; every write returns its activity entry ids.
- Presets (spec §3.1): capture → `capture`, `add_tickler`, `whoami`; read-only → every read tool, `get_activity`, `whoami`; assistant → all.
- Public repo rules, time from `api.now()`, colours via tokens (no UI in this stage), commit author `sebastian.hoehn@gmail.com`, never push, no release.
- Before every commit: `pnpm lint && pnpm typecheck && pnpm test`; `pnpm build` at the end of Task 2 and Task 9 (routes are only type-checked after `next build`/`next typegen`).

## Review Focus

- A tool call that the api refuses half-way (e.g. `complete` with two ids, the second unknown) must not leave the first one done without saying so — Task 5 test `complete refuses unknown ids before changing anything`.
- A client must never see or call a tool its preset forbids, also when it guesses the name — Task 2 test `a capture client gets 403 for a write tool and does not see it listed`.
- Unknown argument keys (a typo like `follow_up_date`) must be refused, not silently ignored — Task 2 test `unknown keys are refused with the key named`.
- An internal error (a bug, not a refusal) must answer 500 without leaking a stack trace, and be logged — Task 2 test `a bug in a tool is a 500 with a generic message`.
- The automatic trash purge stays "the app", not the client, when a client trashes through the API — Task 5 test `trash through the API: the purge is still the app's`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/tools/define.ts` | `ToolDef`, `tool()` helper, `toolError` |
| `src/lib/tools/schemas.ts` | shared zod pieces: ISO date, hh:mm, priority, time, energy, project choice, decision |
| `src/lib/tools/shape.ts` | `itemOut`, `projectOut` — what tools answer with |
| `src/lib/tools/read.ts` | read tools |
| `src/lib/tools/collect.ts` | capture, tickler, drafts, clarify, file |
| `src/lib/tools/act.ts` | do, waiting, projects, someday, reference tools |
| `src/lib/tools/review.ts` | review and trust tools, `whoami` |
| `src/lib/tools/index.ts` | `TOOLS`, `toolNamed`, `listToolsFor(client)`, `runTool(client, name, args)` |
| `src/lib/tools/prompts.ts` | the seven guided workflows |
| `src/app/api/v1/tools/route.ts` | `GET` — the client's tools |
| `src/app/api/v1/tools/[name]/route.ts` | `POST` — run one |
| `src/app/api/v1/prompts/route.ts` | `GET` — the workflows |
| `src/lib/api.ts` (modify) | export `itemHref` (was `paletteHref`) and `LIST_NAMES` |
| `src/lib/capture-in.ts` (modify) | `limiters.api` |
| Tests: `src/lib/tools/*.test.ts` | |
| `docs/OPERATIONS.md`, `docs/handoff/SPEC.md`, the design doc | docs |

---

### Task 1: Tool definitions, output shapes, the registry and `whoami`

**Files:**
- Create: `src/lib/tools/define.ts`, `src/lib/tools/schemas.ts`, `src/lib/tools/shape.ts`, `src/lib/tools/review.ts` (only `whoami` for now), `src/lib/tools/index.ts`
- Modify: `package.json` (zod), `src/lib/api.ts` (export `itemHref`, `LIST_NAMES`)
- Test: `src/lib/tools/registry.test.ts`

**Interfaces:**
- Produces (define.ts):
  ```ts
  export type ToolCapability = Capability | 'any';
  export interface ToolDef<S extends z.ZodType = z.ZodType> {
    name: string; description: string; capability: ToolCapability; input: S;
    run(args: z.output<S>, ctx: { client: ClientIdentity }): unknown;
  }
  export function tool<S extends z.ZodType>(def: ToolDef<S>): ToolDef;
  ```
- Produces (shape.ts):
  ```ts
  export interface ItemOut { id: string; text: string; list: string; status: Item['status']; source: Item['source']; capturedAt: string;
    context?: string; priority?: string; time?: number; energy?: string; deadline?: string; day?: string;
    timeSlot?: { start: string; end: string }; focus?: true; project?: { id: string; title: string };
    waiting?: { who: string; since: string; followUp?: string }; reference?: Reference;
    draft?: { by: string; reason: string; kind: Draft['kind'] }; href?: string }
  export function itemOut(i: Item): ItemOut;
  export interface ProjectOut { id: string; title: string; status: Project['status']; area?: string; deadline?: string;
    successfulWhen?: string; nextActions: number; stalled: boolean; href: string }
  export function projectOut(p: Project): ProjectOut;
  ```
- Produces (index.ts): `TOOLS: ToolDef[]`, `toolNamed(name): ToolDef | undefined`, `listToolsFor(client): { name; description; inputSchema: object }[]`, `mayCall(client, tool): boolean`.
- Produces (api.ts): `export function itemHref(i: Item): string | undefined` (the former private `paletteHref`, renamed and exported) and `export const LIST_NAMES` (the former `PALETTE_LISTS`, plus `trash: 'Trash'`).

- [ ] **Step 1: Add zod**

Run: `pnpm add zod@^4`
Expected: `zod` under `dependencies` in `package.json` (4.x).

- [ ] **Step 2: Write the failing tests** — `src/lib/tools/registry.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { runSilently } from '../activity';
import * as api from '../api';
import type { ClientIdentity } from '../clients';
import { store } from '../store';
import { demoSeed as seed } from '../store/seed';
import type { State } from '../store/types';
import { itemOut } from './shape';
import { TOOLS, listToolsFor, toolNamed } from './index';

beforeEach(() =>
  runSilently(() =>
    store.update((s) => {
      for (const key of Object.keys(s) as (keyof State)[]) delete s[key];
      Object.assign(s, structuredClone(seed));
    }),
  ),
);
const client = (preset: ClientIdentity['preset']): ClientIdentity => ({ id: 'c1', name: 'Test', preset });

describe('tool registry', () => {
  it('names are unique snake_case; every tool has a description and a strict object schema', () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of TOOLS) {
      expect(t.name).toMatch(/^[a-z]+(_[a-z]+)*$/);
      expect(t.description.length).toBeGreaterThan(20);
    }
  });

  it('a client lists only what its preset allows, with JSON Schemas', () => {
    const cap = listToolsFor(client('capture')).map((t) => t.name);
    expect(cap.sort()).toEqual(['whoami']); // capture and add_tickler join in Task 4
    const whoami = listToolsFor(client('assistant')).find((t) => t.name === 'whoami')!;
    expect(whoami.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
  });

  it('whoami says who the client is and what it may call', () => {
    const r = toolNamed('whoami')!.run({}, { client: client('capture') }) as { name: string; preset: string; tools: string[] };
    expect(r).toMatchObject({ name: 'Test', preset: 'capture' });
    expect(r.tools).toContain('whoami');
  });
});

describe('itemOut', () => {
  it('an item as tools answer with it: list name, priority A1, project title, link', () => {
    const n1 = itemOut(api.getItem('n1')!);
    expect(n1).toMatchObject({ id: 'n1', list: 'Next Actions', status: 'next', priority: 'A1', project: { id: 'p-table' }, href: '/next?highlight=n1' });
    expect(n1).not.toHaveProperty('tags');
    expect(itemOut(api.getItem('i1')!)).toMatchObject({ list: 'Inbox', href: '/clarify?item=i1' });
  });
});
```

- [ ] **Step 3: Run to see them fail**

Run: `pnpm vitest run --project memory src/lib/tools/registry.test.ts`
Expected: FAIL — cannot find `./shape` / `./index`.

- [ ] **Step 4: api exports** — in `src/lib/api.ts` rename `PALETTE_LISTS` to `LIST_NAMES` (export it, add `trash: 'Trash'` as the last entry and change its type to `Record<Item['status'], string>`) and `paletteHref` to `itemHref` (export it). Update their uses in `paletteData` (`LIST_NAMES[i.status]` — keep skipping trash there: `if (!href || i.status === 'trash') return [];`).

- [ ] **Step 5: `src/lib/tools/define.ts`**

```ts
// A tool of the MCP (design §5): one intent, a strict input schema, the capability a client's
// preset must allow, and a run function over the api. Tools never touch the store directly.
import type * as z from 'zod';
import type { Capability, ClientIdentity } from '../clients';

export type ToolCapability = Capability | 'any';

export interface ToolDef<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  capability: ToolCapability;
  input: S;
  run(args: z.output<S>, ctx: { client: ClientIdentity }): unknown;
}

/** Keeps the args typed by the schema inside `run`, and erases it for the registry. */
export function tool<S extends z.ZodType>(def: ToolDef<S>): ToolDef {
  return def as unknown as ToolDef;
}
```

- [ ] **Step 6: `src/lib/tools/schemas.ts`**

```ts
// Shared pieces of the tool schemas. Descriptions end up in the JSON Schema the agent reads.
import * as z from 'zod';

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'yyyy-mm-dd');
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'hh:mm');
export const slot = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'yyyy-mm-ddThh:mm');
export const id = z.string().min(1);
export const ids = z.array(id).min(1).max(50);
export const priority = z.enum(['A', 'B', 'C']);
export const time = z.union([z.literal(15), z.literal(30), z.literal(60), z.literal(120)]).describe('minutes: 15, 30, 60 or 120 (= 2 h or more)');
export const energy = z.enum(['focus', 'normal', 'low']);
export const context = z.string().regex(/^@/, 'a context starts with @').describe('one of the contexts from get_settings, e.g. @calls');
export const projectChoice = z
  .union([z.strictObject({ id }), z.strictObject({ new: z.string().min(1).describe('title of a new project — the outcome, e.g. "Studio shelves built"') })])
  .describe('an existing project by id, or { new: title } to create one');
export const nextFields = z.strictObject({ context, priority, time, energy });

const route = z.discriminatedUnion('to', [
  z.strictObject({ to: z.literal('done') }),
  z.strictObject({ to: z.literal('waiting'), who: z.string().min(1), follow_up: isoDate.optional() }),
  z.strictObject({ to: z.literal('next'), context, priority, time, energy, deadline: isoDate.optional() }),
  z.strictObject({ to: z.literal('calendar'), day: isoDate, start: hhmm.optional(), end: hhmm.optional() }),
]);

/** Clarify's four steps as one value (spec §5.3). */
export const decision = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('trash') }),
  z.strictObject({ kind: z.literal('someday'), bucket: z.string().optional() }),
  z.strictObject({ kind: z.literal('reference'), reference_kind: z.enum(['note', 'link', 'file']).optional(), url: z.string().optional(), body: z.string().optional(), project: projectChoice.optional() }),
  z.strictObject({ kind: z.literal('later'), text: z.string().min(1), project: projectChoice }),
  z.strictObject({ kind: z.literal('action'), text: z.string().min(1).describe('the outcome, verb first'), project: projectChoice.optional(), route }),
]);
export type DecisionIn = z.output<typeof decision>;
```

- [ ] **Step 7: `src/lib/tools/shape.ts`**

```ts
// What tools answer with (spec §4): compact, with the list it is on and a link into the app.
import * as api from '../api';
import type { Draft, Item, Project, Reference } from '../model';

export interface ItemOut {
  id: string; text: string; list: string; status: Item['status']; source: Item['source']; capturedAt: string;
  context?: string; priority?: string; time?: number; energy?: string; deadline?: string; day?: string;
  timeSlot?: { start: string; end: string }; focus?: true; project?: { id: string; title: string };
  waiting?: { who: string; since: string; followUp?: string }; reference?: Reference;
  draft?: { by: string; reason: string; kind: Draft['kind'] }; href?: string;
}

export function itemOut(i: Item): ItemOut {
  const project = i.projectId ? api.getProject(i.projectId) : undefined;
  const href = api.itemHref(i);
  return {
    id: i.id,
    text: i.text,
    list: api.LIST_NAMES[i.status],
    status: i.status,
    source: i.source,
    capturedAt: i.capturedAt,
    ...(i.context && { context: i.context }),
    ...(i.priority && { priority: `${i.priority}${i.priorityNo ?? ''}` }),
    ...(i.time && { time: i.time }),
    ...(i.energy && { energy: i.energy }),
    ...(i.deadline && { deadline: i.deadline }),
    ...(i.day && { day: i.day }),
    ...(i.timeSlot && { timeSlot: i.timeSlot }),
    ...(api.isFocused(i) && { focus: true as const }),
    ...(project && { project: { id: project.id, title: project.title } }),
    ...(i.waiting && { waiting: i.waiting }),
    ...(i.reference && { reference: i.reference }),
    ...(i.draft && { draft: { by: i.draft.by, reason: i.draft.reason, kind: i.draft.kind } }),
    ...(href && { href }),
  };
}

export interface ProjectOut {
  id: string; title: string; status: Project['status']; area?: string; deadline?: string;
  successfulWhen?: string; nextActions: number; stalled: boolean; href: string;
}

export function projectOut(p: Project): ProjectOut {
  return {
    id: p.id,
    title: p.title,
    status: p.status,
    ...(p.area && { area: p.area }),
    ...(p.deadline && { deadline: p.deadline }),
    ...(p.successfulWhen && { successfulWhen: p.successfulWhen }),
    nextActions: api.nextActionCount(p.id),
    stalled: api.projectStalled(p),
    href: `/projects?${p.status === 'completed' ? 'filter=completed&' : ''}p=${encodeURIComponent(p.id)}`,
  };
}
```

(`nextActionCount` is exported from api.ts already; if not, export it.)

- [ ] **Step 8: `src/lib/tools/review.ts` (whoami only for now)**

```ts
// Weekly review, activity and trust tools (spec §5.7, §5.8).
import * as z from 'zod';
import { tool } from './define';
import { listToolsFor } from './index';

export const whoami = tool({
  name: 'whoami',
  description: 'Who this client is, its preset, and the tools it may call. Call once at the start to know what you may do.',
  capability: 'any',
  input: z.strictObject({}),
  run: (_args, { client }) => ({ name: client.name, preset: client.preset, tools: listToolsFor(client).map((t) => t.name) }),
});

export const REVIEW_TOOLS = [whoami];
```

- [ ] **Step 9: `src/lib/tools/index.ts`**

```ts
// The registry: every tool, what a client may see and call, and how a call runs.
import * as z from 'zod';
import { can, type ClientIdentity } from '../clients';
import type { ToolDef } from './define';
import { REVIEW_TOOLS } from './review';

export const TOOLS: ToolDef[] = [...REVIEW_TOOLS];

export function toolNamed(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}

export function mayCall(client: ClientIdentity, t: ToolDef): boolean {
  return t.capability === 'any' || can(client, t.capability);
}

/** What a client sees in tools/list: name, description, JSON Schema of the input. */
export function listToolsFor(client: ClientIdentity): { name: string; description: string; inputSchema: object }[] {
  return TOOLS.filter((t) => mayCall(client, t)).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: z.toJSONSchema(t.input, { target: 'draft-2020-12' }) as object,
  }));
}
```

Note: `review.ts` imports `listToolsFor` from `./index`, and `index.ts` imports `REVIEW_TOOLS` from `./review` — a cycle. It is safe because `whoami.run` only calls `listToolsFor` at call time, not at import time; if vitest/Next complain at import, move `listToolsFor`/`mayCall` into `src/lib/tools/access.ts` that takes the tool list as a parameter.

- [ ] **Step 10: Run the tests**

Run: `pnpm vitest run src/lib/tools/registry.test.ts && pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/tools src/lib/api.ts
git commit -m "feat(mcp-3): tool definitions, output shapes, registry, whoami"
```

---

### Task 2: The HTTP surface — `GET /api/v1/tools`, `POST /api/v1/tools/<name>`

**Files:**
- Create: `src/app/api/v1/tools/route.ts`, `src/app/api/v1/tools/[name]/route.ts`
- Modify: `src/lib/tools/index.ts` (`runTool`), `src/lib/capture-in.ts` (`limiters.api`)
- Test: `src/lib/tools/http.test.ts`

**Interfaces:**
- Produces (index.ts):
  ```ts
  export type ToolOutcome =
    | { status: 200; body: { result: unknown; activity: string[] } }
    | { status: 400 | 403 | 404 | 422 | 500; body: { error: string } };
  export function runTool(client: ClientIdentity, name: string, rawArgs: unknown): ToolOutcome;
  ```
  400 = arguments don't match the schema (message from `z.prettifyError`, naming the key); 403 = preset forbids; 404 = no such tool; 422 = the api refused (its message, scope prefix kept: `"complete: item x cannot be completed"`); 500 = anything else (`"internal error"`, logged).
- Produces (capture-in.ts): `limiters.api` — 120 calls a minute for authenticated API calls.
- HTTP: both routes answer 401 (+ bad-token throttle) without a valid client; `POST` bodies ≤ 64 KB (`readLimited`), JSON, `{}` when empty.

- [ ] **Step 1: Write the failing tests** — `src/lib/tools/http.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { GET as listTools } from '../../app/api/v1/tools/route';
import { POST as callTool } from '../../app/api/v1/tools/[name]/route';
import { runSilently } from '../activity';
import { limiters } from '../capture-in';
import { createClient } from '../clients';
import { store } from '../store';
import { demoSeed as seed } from '../store/seed';
import type { State } from '../store/types';
import { TOOLS } from './index';
import { tool } from './define';
import * as z from 'zod';

beforeEach(() => {
  runSilently(() =>
    store.update((s) => {
      for (const key of Object.keys(s) as (keyof State)[]) delete s[key];
      Object.assign(s, structuredClone(seed));
    }),
  );
  for (const l of Object.values(limiters)) l.reset();
});

const call = (name: string, token: string | null, body?: unknown) =>
  callTool(
    new Request(`http://localhost/api/v1/tools/${name}`, {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      ...(body !== undefined && { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    }),
    { params: Promise.resolve({ name }) },
  );
const list = (token: string | null) => listTools(new Request('http://localhost/api/v1/tools', { headers: token ? { authorization: `Bearer ${token}` } : {} }));

describe('/api/v1/tools', () => {
  it('no or a wrong token: 401 on both routes', async () => {
    expect((await list(null)).status).toBe(401);
    expect((await call('whoami', 'gtd_wrong')).status).toBe(401);
  });

  it('lists the client’s tools and runs whoami', async () => {
    const { token } = createClient('Claude Desktop', 'assistant');
    const tools = (await (await list(token)).json()) as { tools: { name: string; inputSchema: object }[] };
    expect(tools.tools.map((t) => t.name)).toContain('whoami');
    const res = await call('whoami', token);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ result: { name: 'Claude Desktop', preset: 'assistant' }, activity: [] });
  });

  it('a capture client gets 403 for a write tool and does not see it listed', async () => {
    TOOLS.push(tool({ name: 'zz_write_probe', description: 'probe tool for the permission test', capability: 'write', input: z.strictObject({}), run: () => 'ran' }));
    try {
      const { token } = createClient('n8n scan', 'capture');
      const names = ((await (await list(token)).json()) as { tools: { name: string }[] }).tools.map((t) => t.name);
      expect(names).not.toContain('zz_write_probe');
      const res = await call('zz_write_probe', token);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'client "n8n scan" may not call zz_write_probe' });
    } finally {
      TOOLS.pop();
    }
  });

  it('unknown tool 404; bad JSON 400; unknown keys are refused with the key named', async () => {
    const { token } = createClient('Claude Desktop', 'assistant');
    expect((await call('no_such_tool', token)).status).toBe(404);
    expect((await call('whoami', token, '{not json')).status).toBe(400);
    const res = await call('whoami', token, { follow_up_date: '2026-10-09' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('follow_up_date');
  });

  it('a refusal from the api is a 422 with its reason; a bug in a tool is a 500 with a generic message', async () => {
    TOOLS.push(
      tool({ name: 'zz_refuse', description: 'probe tool that the api refuses', capability: 'read', input: z.strictObject({}), run: () => { throw new Error('complete: item x cannot be completed'); } }),
      tool({ name: 'zz_bug', description: 'probe tool with a bug in it', capability: 'read', input: z.strictObject({}), run: () => (undefined as unknown as { x: () => void }).x() }),
    );
    try {
      const { token } = createClient('Claude Desktop', 'assistant');
      const refused = await call('zz_refuse', token);
      expect(refused.status).toBe(422);
      expect(await refused.json()).toEqual({ error: 'complete: item x cannot be completed' });
      const bug = await call('zz_bug', token);
      expect(bug.status).toBe(500);
      expect(await bug.json()).toEqual({ error: 'internal error' });
    } finally {
      TOOLS.splice(-2);
    }
  });

  it('a write answers with the ids of the log entries it made, under the client’s name', async () => {
    TOOLS.push(tool({ name: 'zz_capture', description: 'probe tool that captures one line', capability: 'capture', input: z.strictObject({ text: z.string() }), run: ({ text }) => api.capture(text)!.id }));
    try {
      const { token } = createClient('Phone agent', 'assistant');
      const res = await call('zz_capture', token, { text: 'Buy clay' });
      const body = (await res.json()) as { activity: string[] };
      expect(body.activity).toHaveLength(1);
      expect(store.getState().activity.find((e) => e.id === body.activity[0])).toMatchObject({ actor: { kind: 'client', name: 'Phone agent' } });
    } finally {
      TOOLS.pop();
    }
  });

  it('120 calls a minute, then 429', async () => {
    const { token } = createClient('Claude Desktop', 'assistant');
    for (let n = 0; n < 120; n++) await call('whoami', token);
    expect((await call('whoami', token)).status).toBe(429);
  });
});
```

(Add `import * as api from '../api';` to the test's imports for the `zz_capture` probe.)

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vitest run --project memory src/lib/tools/http.test.ts`
Expected: FAIL — cannot find the route modules.

- [ ] **Step 3: `runTool`** — append to `src/lib/tools/index.ts`:

```ts
import { runAs } from '../activity';
import { store } from '../store';
import { actorOf } from '../clients';
import { log } from '../log';

export type ToolOutcome =
  | { status: 200; body: { result: unknown; activity: string[] } }
  | { status: 400 | 403 | 404 | 422 | 500; body: { error: string } };

/** Errors the api throws on purpose carry their scope: "complete: item x cannot be completed". */
const REFUSAL = /^[a-zA-Z]+: /;

export function runTool(client: ClientIdentity, name: string, rawArgs: unknown): ToolOutcome {
  const t = toolNamed(name);
  if (!t) return { status: 404, body: { error: `no tool named ${name}` } };
  if (!mayCall(client, t)) return { status: 403, body: { error: `client "${client.name}" may not call ${name}` } };
  const parsed = t.input.safeParse(rawArgs ?? {});
  if (!parsed.success) return { status: 400, body: { error: z.prettifyError(parsed.error) } };
  const before = store.getState().activity.at(-1)?.id;
  try {
    const result = runAs(actorOf(client), () => t.run(parsed.data, { client }));
    const log_ = store.getState().activity;
    const from = before === undefined ? 0 : log_.findLastIndex((e) => e.id === before) + 1;
    return { status: 200, body: { result: result ?? null, activity: log_.slice(from).map((e) => e.id) } };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (e instanceof Error && e.constructor === Error && REFUSAL.test(message)) return { status: 422, body: { error: message } };
    log.error(`tool ${name}: ${e instanceof Error ? (e.stack ?? message) : message}`);
    return { status: 500, body: { error: 'internal error' } };
  }
}
```

(merge the new imports with the existing ones at the top of the file.)

- [ ] **Step 4: Limiter** — in `src/lib/capture-in.ts`, add `api: createLimiter(120, 60_000),` to `limiters` and extend its type in the `g` declaration.

- [ ] **Step 5: Routes**

`src/app/api/v1/tools/route.ts`:

```ts
import { limiters } from '@/lib/capture-in';
import { authenticate } from '@/lib/clients';
import { listToolsFor } from '@/lib/tools';

/** GET /api/v1/tools — the tools this client may call, with the JSON Schema of their input. */
export async function GET(req: Request) {
  const client = authenticate(req.headers.get('authorization'));
  if (!client) {
    if (!limiters.badToken.take()) return Response.json({ error: 'too many requests without a valid token' }, { status: 429 });
    return Response.json({ error: 'missing, wrong or revoked bearer token' }, { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
  }
  return Response.json({ client: { name: client.name, preset: client.preset }, tools: listToolsFor(client) });
}
```

`src/app/api/v1/tools/[name]/route.ts`:

```ts
import { limiters, readLimited } from '@/lib/capture-in';
import { authenticate } from '@/lib/clients';
import { runTool } from '@/lib/tools';

const BODY_MAX = 64 * 1024;

/**
 * POST /api/v1/tools/<name> — run one tool as the client the bearer token belongs to.
 * Body: the tool's arguments as JSON ({} or empty for none). 200 { result, activity } — the ids
 * of the log entries the call made; 400 bad arguments, 401, 403 preset, 404, 413, 422 refused
 * by the app (its reason), 429, 500.
 */
export async function POST(req: Request, ctx: RouteContext<'/api/v1/tools/[name]'>) {
  const { name } = await ctx.params;
  const client = authenticate(req.headers.get('authorization'));
  if (!client) {
    if (!limiters.badToken.take()) return Response.json({ error: 'too many requests without a valid token' }, { status: 429 });
    return Response.json({ error: 'missing, wrong or revoked bearer token' }, { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
  }
  if (!limiters.api.take()) {
    return Response.json({ error: 'too many requests: 120 a minute' }, { status: 429, headers: { 'Retry-After': String(limiters.api.retryAfter()) } });
  }
  const bytes = await readLimited(req, BODY_MAX);
  if (!bytes) return Response.json({ error: 'body is larger than 64 KB' }, { status: 413 });
  const text = new TextDecoder().decode(bytes).trim();
  let args: unknown = {};
  if (text) {
    try {
      args = JSON.parse(text);
    } catch {
      return Response.json({ error: 'body is not JSON' }, { status: 400 });
    }
  }
  const { status, body } = runTool(client, decodeURIComponent(name), args);
  return Response.json(body, { status });
}
```

In tests `RouteContext` is a global type generated by Next; vitest does not type-check, and `pnpm typecheck` after `pnpm build` (Step 7) knows it.

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run src/lib/tools/http.test.ts`
Expected: PASS (both projects).

- [ ] **Step 7: Build, full suite, commit**

Run: `STORE=memory CAL_WORK_URL= CAPTURE_MAIL_HOST= pnpm build && pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass; the build lists `ƒ /api/v1/tools` and `ƒ /api/v1/tools/[name]`.

```bash
git add src/app/api/v1 src/lib/tools src/lib/capture-in.ts
git commit -m "feat(mcp-3): /api/v1/tools — list and call tools as a client"
```

---

### Task 3: Read tools

**Files:**
- Create: `src/lib/tools/read.ts`
- Modify: `src/lib/tools/index.ts` (add `READ_TOOLS`)
- Test: `src/lib/tools/read.test.ts`

**Interfaces:**
- Produces: tools `get_overview`, `search`, `get_item`, `list_inbox`, `list_next_actions`, `list_waiting`, `list_someday`, `list_reference`, `list_projects`, `get_project`, `get_calendar`, `find_free_time`, `get_settings`, `get_activity`, `get_review_state`, `prepare_weekly_review` — all capability `read`.

- [ ] **Step 1: Write the failing tests** — `src/lib/tools/read.test.ts` (same `beforeEach` reset as `registry.test.ts`; `const run = (name: string, args: unknown = {}) => runTool({ id: 'c1', name: 'Test', preset: 'read-only' }, name, args);`):

```ts
describe('read tools', () => {
  it('get_overview', () => {
    const r = run('get_overview');
    expect(r.status).toBe(200);
    expect((r.body as { result: { today: string } }).result.today).toBe('2026-09-26');
  });

  it('search finds items and projects by words, with links', () => {
    const r = run('search', { query: 'dining table' }) as { status: 200; body: { result: { items: { href?: string }[]; projects: { id: string }[] } } };
    expect(r.body.result.projects.map((p) => p.id)).toContain('p-table');
    expect(r.body.result.items.every((i) => i.href)).toBe(true);
  });

  it('get_item: the full item; an unknown id is a 422 with the reason', () => {
    expect(run('get_item', { id: 'n1' })).toMatchObject({ status: 200, body: { result: { id: 'n1', list: 'Next Actions' } } });
    expect(run('get_item', { id: 'nope' })).toEqual({ status: 422, body: { error: 'get_item: unknown item nope' } });
  });

  it('list_next_actions filters by context, time and energy', () => {
    const r = run('list_next_actions', { context: '@calls', max_minutes: 15, energy: 'low' }) as { status: 200; body: { result: { context: string; time: number; energy: string }[] } };
    expect(r.body.result.length).toBeGreaterThan(0);
    expect(r.body.result.every((i) => i.context === '@calls' && i.time <= 15 && i.energy === 'low')).toBe(true);
  });

  it('list_inbox, list_waiting(overdue_only), list_someday(bucket), list_reference(query)', () => {
    expect((run('list_inbox') as { body: { result: unknown[] } }).body.result.length).toBe(8);
    const overdue = (run('list_waiting', { overdue_only: true }) as { body: { result: { waiting: { followUp: string } }[] } }).body.result;
    expect(overdue.every((w) => w.waiting.followUp < '2026-09-26')).toBe(true);
    expect(run('list_someday', { bucket: 'Nope' })).toMatchObject({ status: 422 });
    expect((run('list_reference', { query: 'quote' }) as { body: { result: { text: string }[] } }).body.result.length).toBeGreaterThan(0);
  });

  it('list_projects(stalled_only) and get_project with its items by list', () => {
    expect(run('list_projects', { stalled_only: true })).toMatchObject({ status: 200 });
    const p = run('get_project', { id: 'p-table' }) as { body: { result: { project: { id: string }; next: unknown[]; later: unknown[] } } };
    expect(p.body.result.project.id).toBe('p-table');
    expect(p.body.result.next.length).toBe(2);
    expect(p.body.result.later.length).toBe(3);
  });

  it('get_calendar and find_free_time take a range; ranges over 62 days are refused', () => {
    expect(run('get_calendar', { from: '2026-09-21', to: '2026-09-27' })).toMatchObject({ status: 200 });
    expect(run('get_calendar', { from: '2026-09-01', to: '2026-12-31' })).toMatchObject({ status: 422 });
    expect(run('find_free_time', { from: '2026-09-28', to: '2026-09-28', min_minutes: 60 })).toMatchObject({ status: 200 });
    expect(run('find_free_time', { from: '28.09', to: '2026-09-28' })).toMatchObject({ status: 400 });
  });

  it('get_settings, get_activity, get_review_state, prepare_weekly_review', () => {
    expect((run('get_settings') as { body: { result: { contexts: string[] } } }).body.result.contexts).toContain('@calls');
    expect(run('get_activity', { limit: 5 })).toMatchObject({ status: 200 });
    expect(run('get_review_state')).toMatchObject({ status: 200, body: { result: { open: false } } });
    expect(run('prepare_weekly_review')).toMatchObject({ status: 200 });
  });

  it('a read-only client sees every read tool and none that write', () => {
    const names = listToolsFor({ id: 'c1', name: 'Test', preset: 'read-only' }).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['get_overview', 'search', 'get_activity', 'whoami']));
    expect(names.every((n) => toolNamed(n)!.capability === 'read' || toolNamed(n)!.capability === 'any')).toBe(true);
  });
});
```

(Imports: `runTool`, `listToolsFor`, `toolNamed` from `./index`, plus the reset helpers.)

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vitest run --project memory src/lib/tools/read.test.ts`
Expected: FAIL — 404 "no tool named get_overview".

- [ ] **Step 3: Implement `src/lib/tools/read.ts`**

```ts
// Read tools (spec §5.1): orientation and the lists. Nothing here changes anything.
import * as z from 'zod';
import * as api from '../api';
import { rank } from '../fuzzy';
import { tool } from './define';
import { context, energy, id, isoDate, hhmm } from './schemas';
import { itemOut, projectOut } from './shape';

const refuse = (scope: string, message: string): never => {
  throw new Error(`${scope}: ${message}`);
};
const MAX_RANGE_DAYS = 62;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export const READ_TOOLS = [
  tool({
    name: 'get_overview',
    description: 'The situation right now: inbox count and oldest item, focus today, today\'s hard landscape, stalled projects, overdue waiting-fors, deadlines in the next 7 days, weekly review due or open. Read this first.',
    capability: 'read',
    input: z.strictObject({}),
    run: () => api.overview(),
  }),
  tool({
    name: 'search',
    description: 'Search all open lists, Reference and done items, and projects, by words. Before capturing or filing something, search for its key words and judge the hits yourself — there is no automatic duplicate detection.',
    capability: 'read',
    input: z.strictObject({ query: z.string().min(1), limit: z.number().int().min(1).max(50).optional() }),
    run: ({ query, limit = 20 }) => {
      const data = api.paletteData();
      const items = rank(query, data.items, (i) => `${i.text} ${i.detail}`).slice(0, limit);
      const projects = rank(query, data.projects, (p) => p.title).slice(0, limit);
      return {
        items: items.map((i) => itemOut(api.getItem(i.id)!)),
        projects: projects.map((p) => projectOut(api.getProject(p.id)!)),
      };
    },
  }),
  tool({
    name: 'get_item',
    description: 'One item in full: captured text, source, the context it came with (a mail body, a URL), project, draft, and its history (latest log entries).',
    capability: 'read',
    input: z.strictObject({ id }),
    run: ({ id: itemId }) => {
      const i = api.getItem(itemId) ?? refuse('get_item', `unknown item ${itemId}`);
      return { ...itemOut(i), captured: i.captured, history: api.listActivity({ subject: itemId, limit: 10 }).map((e) => ({ at: e.at, by: e.actorLabel, summary: e.summary })) };
    },
  }),
  tool({
    name: 'list_inbox',
    description: 'Unprocessed inbox items, newest first, with draft markers. Filter by source (typed, email, share, voice, scan) or by age.',
    capability: 'read',
    input: z.strictObject({ source: z.enum(['typed', 'voice', 'email', 'share', 'scan']).optional(), older_than_days: z.number().int().min(0).optional() }),
    run: ({ source, older_than_days }) =>
      api
        .listInbox()
        .filter((i) => (!source || i.source === source) && (older_than_days === undefined || api.ageDays(i) > older_than_days))
        .map(itemOut),
  }),
  tool({
    name: 'list_next_actions',
    description: 'Next actions — "what can I do now". Filter by context (where I am), max_minutes (time I have), energy, project, or focus_only (starred for today).',
    capability: 'read',
    input: z.strictObject({ context: context.optional(), max_minutes: z.number().int().min(1).optional(), energy: energy.optional(), project: id.optional(), focus_only: z.boolean().optional() }),
    run: (f) =>
      api
        .listNext()
        .filter(
          (i) =>
            (!f.context || i.context === f.context) &&
            (f.max_minutes === undefined || (i.time ?? 0) <= f.max_minutes) &&
            (!f.energy || i.energy === f.energy) &&
            (!f.project || i.projectId === f.project) &&
            (!f.focus_only || api.isFocused(i)),
        )
        .map(itemOut),
  }),
  tool({
    name: 'list_waiting',
    description: 'Waiting-for items: what, from whom, since when, follow-up date. overdue_only = follow-up date passed.',
    capability: 'read',
    input: z.strictObject({ overdue_only: z.boolean().optional() }),
    run: ({ overdue_only }) => api.listWaiting().filter((i) => !overdue_only || api.isOverdue(i)).map(itemOut),
  }),
  tool({
    name: 'list_someday',
    description: 'Someday / Maybe, grouped by bucket; optionally one bucket.',
    capability: 'read',
    input: z.strictObject({ bucket: z.string().optional() }),
    run: ({ bucket }) => {
      if (bucket && !api.listBuckets().includes(bucket)) refuse('list_someday', `unknown bucket ${bucket}`);
      return api
        .listSomeday()
        .filter((g) => !bucket || g.bucket === bucket)
        .map((g) => ({ bucket: g.bucket, items: g.items.map(itemOut) }));
    },
  }),
  tool({
    name: 'list_reference',
    description: 'Reference entries (notes, links, file names), optionally matching words or of one kind.',
    capability: 'read',
    input: z.strictObject({ query: z.string().optional(), kind: z.enum(['note', 'link', 'file']).optional() }),
    run: ({ query, kind }) =>
      api
        .listReference()
        .filter((i) => (!query || api.matchesReference(i, query)) && (!kind || i.reference?.kind === kind))
        .map(itemOut),
  }),
  tool({
    name: 'list_projects',
    description: 'Projects by status (active default, someday, completed); stalled_only = active projects without a next action.',
    capability: 'read',
    input: z.strictObject({ status: z.enum(['active', 'someday', 'completed']).optional(), stalled_only: z.boolean().optional() }),
    run: ({ status = 'active', stalled_only }) => api.listProjects(status).filter((p) => !stalled_only || api.projectStalled(p)).map(projectOut),
  }),
  tool({
    name: 'get_project',
    description: 'One project with its next actions, later steps, waiting-fors, reference, done items, deadline and notes.',
    capability: 'read',
    input: z.strictObject({ id }),
    run: ({ id: projectId }) => {
      const p = api.getProject(projectId) ?? refuse('get_project', `unknown project ${projectId}`);
      const items = api.projectItems(projectId);
      const of = (status: string) => items.filter((i) => i.status === status).map(itemOut);
      return { project: { ...projectOut(p), notes: p.notes }, next: of('next'), later: of('later'), waiting: of('waiting'), reference: of('reference'), calendar: of('calendar'), done: of('done') };
    },
  }),
  tool({
    name: 'get_calendar',
    description: 'The hard landscape between two dates (inclusive, at most 62 days): appointments (read-only, external), time blocks, day actions, tickler notes, deadlines.',
    capability: 'read',
    input: z.strictObject({ from: isoDate, to: isoDate }),
    run: ({ from, to }) => {
      if (from > to) refuse('get_calendar', 'from is after to');
      if (days(from, to) > MAX_RANGE_DAYS) refuse('get_calendar', `at most ${MAX_RANGE_DAYS} days`);
      return api.landscapeBetween(from, to);
    },
  }),
  tool({
    name: 'find_free_time',
    description: 'Free time between appointments and time blocks, within day hours (default 08:00–18:00), gaps of at least min_minutes (default 30). Today starts now; past days have none.',
    capability: 'read',
    input: z.strictObject({ from: isoDate, to: isoDate, min_minutes: z.number().int().min(5).max(24 * 60).optional(), day_start: hhmm.optional(), day_end: hhmm.optional() }),
    run: ({ from, to, min_minutes, day_start = '08:00', day_end = '18:00' }) => api.freeTime(from, to, min_minutes, { start: day_start, end: day_end }),
  }),
  tool({
    name: 'get_settings',
    description: 'Contexts, Someday buckets, the follow-up context, time zone and the weekly review checklist — use these exact names.',
    capability: 'read',
    input: z.strictObject({}),
    run: () => {
      const s = api.getSettings();
      return { contexts: s.contexts, buckets: s.buckets, followUpContext: s.followUpContext, timezone: api.timeZone() ?? '', reviewTemplate: s.reviewTemplate };
    },
  }),
  tool({
    name: 'get_activity',
    description: 'The activity log, newest first: who changed what, in words, and whether it can still be undone. Filter by actor ("you", a client id, "mail", "share", "system"), by item or project id, or since a time.',
    capability: 'read',
    input: z.strictObject({ since: z.string().optional(), actor: z.string().optional(), item: id.optional(), limit: z.number().int().min(1).max(200).optional() }),
    run: ({ since, actor, item, limit = 50 }) =>
      api
        .listActivity({ actor, subject: item, limit })
        .filter((e) => !since || e.at >= since)
        .map((e) => ({ id: e.id, at: e.at, by: e.actorLabel, summary: e.summary, undoable: e.blocker === null, ...(e.blocker && { why_not: e.blocker }), ...(e.undoOf && { undoes: e.undoOf }) })),
  }),
  tool({
    name: 'get_review_state',
    description: 'The weekly review in progress (if any): its steps with ticked ones, the current step, elapsed minutes, paused or not, notes.',
    capability: 'read',
    input: z.strictObject({}),
    run: () => {
      const run = api.openRun();
      if (!run) return { open: false, badge: api.reviewBadge() };
      const done = new Set(run.steps.filter((s) => s.doneAt).map((s) => s.stepId));
      return {
        open: true,
        startedAt: run.startedAt,
        elapsedMinutes: Math.round(api.reviewElapsedMs(run) / 60_000),
        paused: !!run.pausedAt,
        current: api.currentStep(run) ?? null,
        steps: api.reviewSteps(run).map((s) => ({ id: s.id, phase: s.phaseId, text: s.text, ticked: done.has(s.id) })),
        notes: run.notes,
      };
    },
  }),
  tool({
    name: 'prepare_weekly_review',
    description: 'Findings for each step of the weekly review (inbox and age, stalled projects, overdue waiting-fors, deadlines in 14 days, someday items untouched for 90+ days, past calendar), last week\'s numbers, and what clients did this week. Use it to guide the review, one step at a time.',
    capability: 'read',
    input: z.strictObject({}),
    run: () => api.prepareWeeklyReview(),
  }),
];
```

Add `READ_TOOLS` to `TOOLS` in `index.ts` (`[...READ_TOOLS, ...REVIEW_TOOLS]`). Check first that `api.ts` exports `listBuckets`, `matchesReference`, `projectStalled`, `reviewElapsedMs`, `currentStep`, `reviewBadge`, `landscapeBetween`, `listWaiting`, `isOverdue` (all do) and that `fuzzy.ts` exports `rank(query, entries, text)` (it does).

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/lib/tools && pnpm typecheck && pnpm lint`
Expected: PASS. If `list_inbox` is not 8 in the seed, use `api.listInbox().length` in the assertion — the seed is the source of truth.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools
git commit -m "feat(mcp-3): read tools — overview, search, lists, calendar, free time, activity, review"
```

---

### Task 4: Collect and clarify tools

**Files:**
- Create: `src/lib/tools/collect.ts`
- Modify: `src/lib/tools/index.ts`
- Test: `src/lib/tools/collect.test.ts`

**Interfaces:**
- Consumes: `decision`, `DecisionIn`, `projectChoice`, schemas (Task 1); `api.capture`, `addTickler`, `updateTickler`, `deleteTickler`, `setDraft`, `clarify`, `file`, `setBucket`.
- Produces: tools `capture` (capture), `add_tickler` (capture), `edit_tickler`, `delete_tickler`, `draft_clarification`, `clarify`, `file` (write); `toDecision(d: DecisionIn): api.Decision` (exported for tests).

- [ ] **Step 1: Write the failing tests** — `src/lib/tools/collect.test.ts` (reset as before; `const as = (preset) => (name, args) => runTool({ id: 'c1', name: 'Phone agent', preset }, name, args);`):

```ts
describe('collect and clarify tools', () => {
  const assistant = as('assistant');
  const capture = as('capture');

  it('the capture preset may capture and add tickler notes, nothing else', () => {
    expect(listToolsFor({ id: 'c1', name: 'x', preset: 'capture' }).map((t) => t.name).sort()).toEqual(['add_tickler', 'capture', 'whoami']);
    const r = capture('capture', { items: [{ text: 'Buy clay @errands' }, { text: 'Read the glaze article', url: 'https://example.com/glaze' }] }) as { status: 200; body: { result: { text: string }[]; activity: string[] } };
    expect(r.body.result.map((i) => i.text)).toEqual(['Buy clay', 'Read the glaze article']);
    expect(r.body.activity).toHaveLength(2);
    expect(capture('add_tickler', { day: '2026-09-29', text: 'Tiles fired' })).toMatchObject({ status: 200 });
    expect(capture('clarify', { item: 'i1', decision: { kind: 'trash' } })).toMatchObject({ status: 403 });
  });

  it('clarify with the four steps as one value; a new project is { new: title }', () => {
    const r = assistant('clarify', { item: 'i1', decision: { kind: 'action', text: 'Get three quotes', project: { new: 'New kiln installed' }, route: { to: 'next', context: '@calls', priority: 'B', time: 30, energy: 'normal' } } }) as { status: 200; body: { result: { projectId: string; projectCreated: boolean } } };
    expect(r.body.result.projectCreated).toBe(true);
    expect(api.getItem('i1')).toMatchObject({ status: 'next', text: 'Get three quotes' });
  });

  it('someday with a bucket files and sorts in one entry', () => {
    const bucket = api.listBuckets()[0];
    const r = assistant('clarify', { item: 'i2', decision: { kind: 'someday', bucket } }) as { body: { activity: string[] } };
    expect(api.getItem('i2')).toMatchObject({ status: 'someday', bucket });
    expect(r.body.activity).toHaveLength(1);
  });

  it('file: "waiting on Alice for the video" in one call', () => {
    const r = assistant('file', { text: 'Video from Alice', decision: { kind: 'action', text: 'Video from Alice', route: { to: 'waiting', who: 'Alice', follow_up: '2026-10-05' } } }) as { status: 200; body: { result: { itemId: string } } };
    expect(api.getItem(r.body.result.itemId)!.waiting).toMatchObject({ who: 'Alice', followUp: '2026-10-05' });
  });

  it('draft_clarification stores a draft by the client; null removes it', () => {
    assistant('draft_clarification', { item: 'i1', draft: { kind: 'action', text: 'Call the dentist', route: 'next', context: '@calls', priority: 'B', time: 15, energy: 'low' }, reason: 'a short call' });
    expect(api.getItem('i1')!.draft).toMatchObject({ by: 'Phone agent', reason: 'a short call' });
    assistant('draft_clarification', { item: 'i1', draft: null, reason: 'withdrawn' });
    expect(api.getItem('i1')!.draft).toBeUndefined();
  });

  it('refusals keep their reason; a parked project refuses a next action', () => {
    api.moveProjectToSomeday('p-table');
    expect(assistant('clarify', { item: 'i1', decision: { kind: 'action', text: 'x', project: { id: 'p-table' }, route: { to: 'next', context: '@calls', priority: 'B', time: 15, energy: 'low' } } })).toMatchObject({ status: 422, body: { error: expect.stringMatching(/on hold/) } });
  });

  it('tickler notes: edit and delete', () => {
    const t = (assistant('add_tickler', { day: '2026-09-29', text: 'Tiles fired' }) as { body: { result: { id: string } } }).body.result;
    expect(assistant('edit_tickler', { id: t.id, text: 'Tiles out of the kiln' })).toMatchObject({ status: 200 });
    expect(assistant('delete_tickler', { id: t.id })).toMatchObject({ status: 200 });
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vitest run --project memory src/lib/tools/collect.test.ts`
Expected: FAIL — 404 for `capture`.

- [ ] **Step 3: Implement `src/lib/tools/collect.ts`**

```ts
// Collect and clarify tools (spec §5.2, §5.3).
import * as z from 'zod';
import * as api from '../api';
import { captureRequest } from '../capture-in';
import { store } from '../store';
import { tool } from './define';
import { context, decision, energy, id, isoDate, priority, projectChoice, time, type DecisionIn } from './schemas';
import { itemOut } from './shape';

type Choice = z.output<typeof projectChoice>;
const toChoice = (p: Choice): api.ProjectChoice => ('id' in p ? { id: p.id } : { newTitle: p.new });

/** The tool's decision (snake_case, `{ new }`) → the api's (`{ newTitle }`, camelCase). */
export function toDecision(d: DecisionIn): api.Decision {
  switch (d.kind) {
    case 'trash':
    case 'someday':
      return { kind: d.kind };
    case 'reference':
      return {
        kind: 'reference',
        ...(d.reference_kind && { reference: { kind: d.reference_kind, ...(d.url && { url: d.url }), ...(d.body && { body: d.body }) } }),
        ...(d.project && { project: toChoice(d.project) }),
      };
    case 'later':
      return { kind: 'later', text: d.text, project: toChoice(d.project) };
    case 'action': {
      const r = d.route;
      const route: api.Route =
        r.to === 'waiting' ? { to: 'waiting', who: r.who, ...(r.follow_up && { followUp: r.follow_up }) }
        : r.to === 'next' ? { to: 'next', context: r.context, priority: r.priority, time: r.time, energy: r.energy, ...(r.deadline && { deadline: r.deadline }) }
        : r.to === 'calendar' ? { to: 'calendar', day: r.day, ...(r.start && { start: r.start }), ...(r.end && { end: r.end }) }
        : { to: 'done' };
      return { kind: 'action', text: d.text, ...(d.project && { project: toChoice(d.project) }), route };
    }
  }
}

/** Clarify, plus the Someday bucket when one is named — one write, one log entry. */
function clarifyWithBucket(itemId: string, d: DecisionIn, file?: string): api.ClarifyResult {
  let result: api.ClarifyResult | undefined;
  if (d.kind === 'someday' && d.bucket && !api.listBuckets().includes(d.bucket)) throw new Error(`clarify: unknown bucket ${d.bucket}`);
  store.update(() => {
    result = file !== undefined ? api.file(file, toDecision(d)) : api.clarify(itemId, toDecision(d));
    if (d.kind === 'someday' && d.bucket) api.setBucket(result.itemId, d.bucket);
  });
  return result!;
}

const draftShape = z.strictObject({
  kind: z.enum(['action', 'project', 'someday', 'reference', 'trash']).describe('project = a project with this as its first action (project.new required)'),
  text: z.string().optional().describe('the outcome, rewritten by the GTD rules: verb first, concrete, done-when'),
  project: projectChoice.optional(),
  next: z.boolean().optional(),
  route: z.enum(['next', 'waiting', 'calendar', 'done']).optional(),
  context: context.optional(),
  priority: priority.optional(),
  time: time.optional(),
  energy: energy.optional(),
  deadline: isoDate.optional(),
  who: z.string().optional(),
  follow_up: isoDate.optional(),
  day: isoDate.optional(),
});

export const COLLECT_TOOLS = [
  tool({
    name: 'capture',
    description: 'Put one or more lines into the inbox (shorthand works: #tag @context !A ^fri). Each item may carry a url and a note as context. Capture never decides anything; the user clarifies later.',
    capability: 'capture',
    input: z.strictObject({
      items: z.array(z.strictObject({ text: z.string().min(1), source: z.enum(['typed', 'voice', 'email', 'share', 'scan']).optional(), url: z.string().optional(), note: z.string().optional() })).min(1).max(50),
    }),
    run: ({ items }) =>
      items.map((it) => {
        const r = captureRequest(it);
        if ('error' in r) throw new Error(`capture: ${r.error}`);
        return itemOut(r.item);
      }),
  }),
  tool({
    name: 'add_tickler',
    description: 'A note on a day of the calendar — information, nothing to do ("Tiles are fired, check them"). For reminders on a day.',
    capability: 'capture',
    input: z.strictObject({ day: isoDate, text: z.string().min(1) }),
    run: ({ day, text }) => api.addTickler(day, text),
  }),
  tool({
    name: 'edit_tickler',
    description: 'Change the text of a tickler note.',
    capability: 'write',
    input: z.strictObject({ id, text: z.string().min(1) }),
    run: ({ id: t, text }) => api.updateTickler(t, text),
  }),
  tool({
    name: 'delete_tickler',
    description: 'Remove a tickler note.',
    capability: 'write',
    input: z.strictObject({ id }),
    run: ({ id: t }) => api.deleteTickler(t),
  }),
  tool({
    name: 'draft_clarification',
    description: 'Prepare the clarify decision of an inbox item for the user: a rewritten outcome, kind, project and fields, with a one-line reason. The user files it in Clarify with one key. Use this when you would be deciding yourself; use clarify only when the user told you the decision. draft: null removes a draft.',
    capability: 'write',
    input: z.strictObject({ item: id, draft: draftShape.nullable(), reason: z.string().min(1).max(280) }),
    run: ({ item, draft, reason }) => {
      if (!draft) return api.setDraft(item, null);
      const { follow_up, project, ...rest } = draft;
      api.setDraft(item, { ...rest, reason, ...(follow_up && { followUp: follow_up }), ...(project && { project: 'id' in project ? { id: project.id } : { newTitle: project.new } }) });
    },
  }),
  tool({
    name: 'clarify',
    description: 'File an inbox item with the decision the user stated (Clarify\'s four steps as one value). Projects are born here: project: { new: "outcome" }.',
    capability: 'write',
    input: z.strictObject({ item: id, decision }),
    run: ({ item, decision: d }) => clarifyWithBucket(item, d),
  }),
  tool({
    name: 'file',
    description: 'Capture and clarify in one step, for something the user already decided ("I am waiting on Alice for the video — add it"). One log entry.',
    capability: 'write',
    input: z.strictObject({ text: z.string().min(1), decision }),
    run: ({ text, decision: d }) => clarifyWithBucket('', d, text),
  }),
];
```

Add to `TOOLS`. Check `api.ProjectChoice` and `api.Route` are exported types (they are); `captureRequest` returns `{ item } | { error, status }`.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/lib/tools && pnpm typecheck && pnpm lint`
Expected: PASS; `registry.test.ts`'s capture-preset list from Task 1 now has to read `['add_tickler', 'capture', 'whoami']` — update that expectation (it said "join in Task 4").

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools
git commit -m "feat(mcp-3): collect and clarify tools — capture, tickler, drafts, clarify, file"
```

---

### Task 5: Do and waiting tools

**Files:**
- Create: `src/lib/tools/act.ts`
- Modify: `src/lib/tools/index.ts`
- Test: `src/lib/tools/act.test.ts`

**Interfaces:**
- Produces: tools `complete`, `reopen`, `set_focus`, `edit_next_action`, `time_block`, `clear_time_block`, `trash`, `follow_up`, `received`, `edit_waiting` (write). Array tools check every id before changing anything.

- [ ] **Step 1: Write the failing tests** — `src/lib/tools/act.test.ts` (reset as before; `const run = (name, args) => runTool({ id: 'c1', name: 'Phone agent', preset: 'assistant' }, name, args);`):

```ts
describe('do and waiting tools', () => {
  it('complete refuses unknown ids before changing anything', () => {
    expect(run('complete', { ids: ['n2', 'nope'] })).toMatchObject({ status: 422, body: { error: 'complete: item nope cannot be completed' } });
    expect(api.getItem('n2')!.status).toBe('next');
    expect(run('complete', { ids: ['n2', 'n3'] })).toMatchObject({ status: 200 });
    expect(['n2', 'n3'].map((i) => api.getItem(i)!.status)).toEqual(['done', 'done']);
  });

  it('set_focus sets, never toggles', () => {
    run('set_focus', { ids: ['n2'], on: true });
    run('set_focus', { ids: ['n2'], on: true });
    expect(api.isFocused(api.getItem('n2')!)).toBe(true);
    run('set_focus', { ids: ['n2'], on: false });
    expect(api.isFocused(api.getItem('n2')!)).toBe(false);
  });

  it('edit_next_action: fields, deadline null removes, project null = single action', () => {
    run('edit_next_action', { id: 'n2', priority: 'A', time: 60, deadline: '2026-10-09' });
    expect(api.getItem('n2')).toMatchObject({ priority: 'A', time: 60, deadline: '2026-10-09' });
    run('edit_next_action', { id: 'n2', deadline: null, project: null });
    expect(api.getItem('n2')!.deadline).toBeUndefined();
    expect(api.getItem('n2')!.projectId).toBeUndefined();
  });

  it('time_block and clear_time_block', () => {
    run('time_block', { id: 'n2', start: '2026-09-28T09:00', end: '2026-09-28T10:30' });
    expect(api.getItem('n2')!.timeSlot).toEqual({ start: '2026-09-28T09:00', end: '2026-09-28T10:30' });
    run('clear_time_block', { id: 'n2' });
    expect(api.getItem('n2')!.timeSlot).toBeUndefined();
  });

  it('trash through the API: the purge is still the app’s', () => {
    runSilently(() =>
      store.update((s) => {
        const i = s.items.find((x) => x.id === 'i2')!;
        i.status = 'trash';
        i.trashedAt = '2026-07-01T10:00:00.000Z';
      }),
    );
    const r = run('trash', { ids: ['i1'] }) as { body: { activity: string[] } };
    const entries = r.body.activity.map((a) => store.getState().activity.find((e) => e.id === a)!);
    expect(entries.map((e) => e.actor.kind)).toEqual(['client', 'system']);
  });

  it('waiting: follow_up, edit_waiting, received', () => {
    const w = api.listWaiting()[0].id;
    expect(run('edit_waiting', { id: w, follow_up: '2026-10-09' })).toMatchObject({ status: 200 });
    expect(api.getItem(w)!.waiting!.followUp).toBe('2026-10-09');
    expect((run('follow_up', { id: w }) as { body: { result: { list: string } } }).body.result.list).toBe('Next Actions');
    expect(run('received', { id: w })).toMatchObject({ status: 200 });
    expect(api.getItem(w)!.status).toBe('done');
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vitest run --project memory src/lib/tools/act.test.ts`
Expected: FAIL — 404.

- [ ] **Step 3: Implement `src/lib/tools/act.ts`** (the projects/someday/reference tools join this file in Task 6):

```ts
// Tools that act on items (spec §5.4–5.6). Array tools check every id first, then change all
// of them in one write, so a refusal never leaves half of them done.
import * as z from 'zod';
import * as api from '../api';
import { store } from '../store';
import { tool } from './define';
import { context, energy, id, ids, isoDate, priority, projectChoice, slot, time } from './schemas';
import { itemOut } from './shape';

const all = <T>(list: string[], checkOne: (id: string) => void, each: (id: string) => T): T[] => {
  list.forEach(checkOne);
  let out: T[] = [];
  store.update(() => {
    out = list.map(each);
  });
  return out;
};
const statusIs = (scope: string, ok: (i: ReturnType<typeof api.getItem>) => boolean, what: string) => (itemId: string) => {
  if (!ok(api.getItem(itemId))) throw new Error(`${scope}: item ${itemId} ${what}`);
};

export const DO_TOOLS = [
  tool({
    name: 'complete',
    description: 'Mark next actions (or calendar items) done. All ids are checked first; nothing changes if one is refused.',
    capability: 'write',
    input: z.strictObject({ ids }),
    run: ({ ids: list }) => {
      all(list, statusIs('complete', (i) => i?.status === 'next' || i?.status === 'calendar', 'cannot be completed'), (x) => api.complete(x));
      return list.map((x) => itemOut(api.getItem(x)!));
    },
  }),
  tool({
    name: 'reopen',
    description: 'Put a done item back on Next Actions.',
    capability: 'write',
    input: z.strictObject({ id }),
    run: ({ id: x }) => (api.reopen(x), itemOut(api.getItem(x)!)),
  }),
  tool({
    name: 'set_focus',
    description: 'Star next actions for today ("my three for today"), or remove the star. Sets the state; calling twice does not toggle it back.',
    capability: 'write',
    input: z.strictObject({ ids, on: z.boolean() }),
    run: ({ ids: list, on }) =>
      all(list, statusIs('set_focus', (i) => i?.status === 'next', 'is not a next action'), (x) => {
        if (api.isFocused(api.getItem(x)!) !== on) api.toggleFocus(x);
        return x;
      }),
  }),
  tool({
    name: 'edit_next_action',
    description: 'Change a next action: text, context, priority, time, energy, deadline (null removes it), project (null = single action, or { new: title }).',
    capability: 'write',
    input: z.strictObject({ id, text: z.string().min(1).optional(), context: context.optional(), priority: priority.optional(), time: time.optional(), energy: energy.optional(), deadline: isoDate.nullable().optional(), project: projectChoice.nullable().optional() }),
    run: ({ id: x, project, ...edit }) => {
      api.editNext(x, { ...edit, ...(project !== undefined && { project: project === null ? null : 'id' in project ? { id: project.id } : { newTitle: project.new } }) });
      return itemOut(api.getItem(x)!);
    },
  }),
  tool({
    name: 'time_block',
    description: 'Give a next action or calendar item a time slot (yyyy-mm-ddThh:mm). Without end it lasts the action\'s time estimate. A block today stars a next action for today.',
    capability: 'write',
    input: z.strictObject({ id, start: slot, end: slot.optional() }),
    run: ({ id: x, start, end }) => (api.setTimeSlot(x, start, end), itemOut(api.getItem(x)!)),
  }),
  tool({
    name: 'clear_time_block',
    description: 'Remove an item\'s time slot (a calendar item stays on its day; stars are not touched).',
    capability: 'write',
    input: z.strictObject({ id }),
    run: ({ id: x }) => (api.clearTimeSlot(x), itemOut(api.getItem(x)!)),
  }),
  tool({
    name: 'trash',
    description: 'Move open items to the trash (kept 30 days, undoable).',
    capability: 'write',
    input: z.strictObject({ ids }),
    run: ({ ids: list }) => {
      list.forEach(statusIs('trash', (i) => !!i && i.status !== 'trash' && i.status !== 'done', 'is not an open item'));
      return api.trash(list);
    },
  }),
  tool({
    name: 'follow_up',
    description: 'For a waiting-for: create the chase action ("Follow up with <who>: <what>") and move the follow-up date a week on — as the f key does.',
    capability: 'write',
    input: z.strictObject({ id }),
    run: ({ id: x }) => itemOut(api.followUp(x)),
  }),
  tool({
    name: 'received',
    description: 'A waiting-for came in: close it. Answers whether its project is now without a next action.',
    capability: 'write',
    input: z.strictObject({ id }),
    run: ({ id: x }) => {
      const r = api.received(x);
      return { item: itemOut(api.getItem(x)!), ...(r.askNextFor && { project_needs_next_action: r.askNextFor }) };
    },
  }),
  tool({
    name: 'edit_waiting',
    description: 'Change who a waiting-for waits on, or its follow-up date ("she said next week"); follow_up null or "" removes the date.',
    capability: 'write',
    input: z.strictObject({ id, who: z.string().min(1).optional(), follow_up: isoDate.or(z.literal('')).nullable().optional() }),
    run: ({ id: x, who, follow_up }) => (api.editWaiting(x, { ...(who !== undefined && { who }), ...(follow_up !== undefined && { followUp: follow_up }) }), itemOut(api.getItem(x)!)),
  }),
];
```

Note `trash` runs **outside** any grouping write: `api.trash` itself runs the 30-day purge as the app afterwards (Stage 1), and a grouping `store.update` would fold the purge into the client's entry.

Add `DO_TOOLS` to `TOOLS`.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/lib/tools && pnpm typecheck && pnpm lint`
Expected: PASS. If `complete` inside the grouping write changes the log shape (one entry for both ids) — that is intended: one call, one entry.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools
git commit -m "feat(mcp-3): do and waiting tools — complete, focus, edit, time blocks, trash, follow up"
```

---

### Task 6: Projects, Someday and Reference tools

**Files:**
- Modify: `src/lib/tools/act.ts`, `src/lib/tools/index.ts`
- Test: `src/lib/tools/act.test.ts`

**Interfaces:**
- Produces: tools `add_action`, `add_step`, `promote`, `demote`, `update_project`, `move_project`, `activate`, `drop`, `set_bucket`, `add_reference`, `edit_reference` (write).

- [ ] **Step 1: Write the failing tests** — append to `src/lib/tools/act.test.ts`:

```ts
describe('project, someday and reference tools', () => {
  const fields = { context: '@home', priority: 'B', time: 30, energy: 'low' } as const;

  it('add_action, add_step, promote, demote', () => {
    const a = (run('add_action', { project: 'p-table', text: 'Measure the alcove', ...fields }) as { body: { result: { id: string; list: string } } }).body.result;
    expect(a.list).toBe('Next Actions');
    const s = (run('add_step', { project: 'p-table', text: 'Book the van' }) as { body: { result: { id: string } } }).body.result;
    expect(run('promote', { id: s.id, ...fields })).toMatchObject({ status: 200 });
    expect(run('demote', { id: s.id })).toMatchObject({ status: 200 });
    expect(api.getItem(s.id)!.status).toBe('later');
  });

  it('update_project and move_project (someday, active, completed with its refusal)', () => {
    run('update_project', { id: 'p-table', deadline: '2026-10-20', successful_when: 'table delivered' });
    expect(api.getProject('p-table')).toMatchObject({ deadline: '2026-10-20', successfulWhen: 'table delivered' });
    run('move_project', { id: 'p-table', to: 'someday' });
    expect(api.getProject('p-table')!.status).toBe('someday');
    run('move_project', { id: 'p-table', to: 'active' });
    expect(run('move_project', { id: 'p-table', to: 'completed' })).toMatchObject({ status: 422, body: { error: expect.stringMatching(/open/) } });
  });

  it('someday: set_bucket, activate (back to the inbox), drop', () => {
    const [g] = api.listSomeday();
    const item = g.items[0].id;
    const other = api.listBuckets().find((b) => b !== g.bucket)!;
    run('set_bucket', { id: item, bucket: other });
    expect(api.getItem(item)!.bucket).toBe(other);
    run('activate', { id: item });
    expect(api.getItem(item)!.status).toBe('inbox');
    const next = api.listSomeday()[0].items[0].id;
    run('drop', { id: next });
    expect(api.getItem(next)!.status).toBe('trash');
  });

  it('reference: add_reference to a project, edit_reference', () => {
    const r = (run('add_reference', { text: 'Oak samples', kind: 'link', url: 'https://example.com/oak', project: 'p-table' }) as { body: { result: { id: string; list: string } } }).body.result;
    expect(r.list).toBe('Reference');
    run('edit_reference', { id: r.id, text: 'Oak and ash samples', project: null });
    expect(api.getItem(r.id)).toMatchObject({ text: 'Oak and ash samples' });
    expect(api.getItem(r.id)!.projectId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vitest run --project memory src/lib/tools/act.test.ts -t "project, someday"`
Expected: FAIL — 404.

- [ ] **Step 3: Implement** — append to `src/lib/tools/act.ts`:

```ts
const fields = { context, priority, time, energy };

export const PROJECT_TOOLS = [
  tool({
    name: 'add_action',
    description: 'A new next action in an active project (a parked project takes none — activate it first).',
    capability: 'write',
    input: z.strictObject({ project: id, text: z.string().min(1), ...fields }),
    run: ({ project, text, ...f }) => itemOut(api.addAction(project, text, f)),
  }),
  tool({
    name: 'add_step',
    description: 'A later step in a project (not yet a next action).',
    capability: 'write',
    input: z.strictObject({ project: id, text: z.string().min(1) }),
    run: ({ project, text }) => itemOut(api.addStep(project, text)),
  }),
  tool({
    name: 'promote',
    description: 'Make a later step a next action, with its context, priority, time and energy.',
    capability: 'write',
    input: z.strictObject({ id, ...fields }),
    run: ({ id: x, ...f }) => (api.promote(x, f), itemOut(api.getItem(x)!)),
  }),
  tool({
    name: 'demote',
    description: 'Make a next action a later step again (drops its context, priority, time, energy, day, block, star).',
    capability: 'write',
    input: z.strictObject({ id }),
    run: ({ id: x }) => (api.demote(x), itemOut(api.getItem(x)!)),
  }),
  tool({
    name: 'update_project',
    description: 'Change a project\'s own fields: title (the outcome), successful_when, area, deadline, goal, notes. An empty string removes an optional field.',
    capability: 'write',
    input: z.strictObject({ id, title: z.string().min(1).optional(), successful_when: z.string().optional(), area: z.string().optional(), deadline: isoDate.or(z.literal('')).optional(), goal: z.string().optional(), notes: z.string().optional() }),
    run: ({ id: x, successful_when, ...rest }) => {
      api.updateProject(x, { ...rest, ...(successful_when !== undefined && { successfulWhen: successful_when }) });
      return api.getProject(x);
    },
  }),
  tool({
    name: 'move_project',
    description: 'Park a project on Someday / Maybe, make it active again, or complete it (refused while it has open next actions or later steps).',
    capability: 'write',
    input: z.strictObject({ id, to: z.enum(['someday', 'active', 'completed']) }),
    run: ({ id: x, to }) => {
      if (to === 'someday') api.moveProjectToSomeday(x);
      else if (to === 'active') api.activateProject(x);
      else api.completeProject(x);
      return api.getProject(x);
    },
  }),
  tool({
    name: 'activate',
    description: 'Take a Someday / Maybe item back into the inbox, to be clarified as something to do now.',
    capability: 'write',
    input: z.strictObject({ id }),
    run: ({ id: x }) => (api.activate(x), itemOut(api.getItem(x)!)),
  }),
  tool({
    name: 'drop',
    description: 'Drop a Someday / Maybe item (to the trash, undoable).',
    capability: 'write',
    input: z.strictObject({ id }),
    run: ({ id: x }) => api.drop(x),
  }),
  tool({
    name: 'set_bucket',
    description: 'Move a Someday / Maybe item to another bucket (see get_settings for the names).',
    capability: 'write',
    input: z.strictObject({ id, bucket: z.string().min(1) }),
    run: ({ id: x, bucket }) => (api.setBucket(x, bucket), itemOut(api.getItem(x)!)),
  }),
  tool({
    name: 'add_reference',
    description: 'File something to keep, not to do: a note (body), a link (url) or a file (its name or path), optionally on a project. The app is the index, not the archive.',
    capability: 'write',
    input: z.strictObject({ text: z.string().min(1), kind: z.enum(['note', 'link', 'file']), url: z.string().optional(), body: z.string().optional(), project: id.optional() }),
    run: ({ text, kind, url, body, project }) => itemOut(api.addReference(text, { kind, ...(url && { url }), ...(body && { body }) }, project)),
  }),
  tool({
    name: 'edit_reference',
    description: 'Change a reference entry: text, kind with url/body, or project (null = loose).',
    capability: 'write',
    input: z.strictObject({ id, text: z.string().min(1).optional(), kind: z.enum(['note', 'link', 'file']).optional(), url: z.string().optional(), body: z.string().optional(), project: id.nullable().optional() }),
    run: ({ id: x, text, kind, url, body, project }) => {
      api.editReference(x, {
        ...(text !== undefined && { text }),
        ...(kind && { reference: { kind, ...(url && { url }), ...(body && { body }) } }),
        ...(project !== undefined && { project: project === null ? null : { id: project } }),
      });
      return itemOut(api.getItem(x)!);
    },
  }),
];
```

Add `PROJECT_TOOLS` to `TOOLS`. Use `projectChoice` only where `{ new }` makes sense (it does not for references — they name existing projects).

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/lib/tools && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools
git commit -m "feat(mcp-3): project, someday and reference tools"
```

---

### Task 7: Review and trust tools

**Files:**
- Modify: `src/lib/tools/review.ts`
- Test: `src/lib/tools/review.test.ts`

**Interfaces:**
- Produces: tools `start_review`, `tick_step`, `set_review_notes`, `finish_review`, `undo` (write).
- `set_review_notes(step?, text)` appends a line to the run's notes: `"<step text>: <text>"` (the app keeps one notes field per run; per-step notes are the app's own measured figures).

- [ ] **Step 1: Write the failing tests** — `src/lib/tools/review.test.ts`:

```ts
describe('review and trust tools', () => {
  it('walk a review: start, tick, notes, finish', () => {
    expect(run('start_review', {})).toMatchObject({ status: 200 });
    const first = api.reviewSteps(api.openRun())[0].id;
    run('tick_step', { step: first, on: true });
    expect(run('get_review_state', {})).toMatchObject({ body: { result: { open: true } } });
    run('set_review_notes', { step: first, text: 'two loose papers left' });
    run('set_review_notes', { text: 'good week' });
    expect(api.openRun()!.notes).toBe(`${api.reviewSteps(api.openRun())[0].text}: two loose papers left\ngood week`);
    run('tick_step', { step: first, on: false });
    expect(run('finish_review', {})).toMatchObject({ status: 200 });
    expect(api.openRun()).toBeUndefined();
  });

  it('undo through the API: refused with the reason once something changed since', () => {
    const r = run('capture', { items: [{ text: 'Buy clay' }] }) as { body: { activity: string[]; result: { id: string }[] } };
    const entry = r.body.activity[0];
    expect(run('undo', { entry })).toMatchObject({ status: 200 });
    expect(api.getItem(r.body.result[0].id)).toBeUndefined();
    expect(run('undo', { entry })).toMatchObject({ status: 422, body: { error: 'undo: changed since by Phone agent' } });
  });
});
```

(`run` as in `act.test.ts`; reset as before.)

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vitest run --project memory src/lib/tools/review.test.ts`
Expected: FAIL — 404 for `start_review`.

- [ ] **Step 3: Implement** — in `src/lib/tools/review.ts`, before `REVIEW_TOOLS`:

```ts
import * as api from '../api';
import { id } from './schemas';

const reviewTools = [
  tool({
    name: 'start_review',
    description: 'Start the weekly review (or get the one in progress). Then go through prepare_weekly_review step by step with the user.',
    capability: 'write',
    input: z.strictObject({}),
    run: () => api.openRun() ?? api.startReview(),
  }),
  tool({
    name: 'tick_step',
    description: 'Tick (on: true) or untick a step of the weekly review in progress — when the user says the step is done.',
    capability: 'write',
    input: z.strictObject({ step: id, on: z.boolean() }),
    run: ({ step, on }) => (on ? api.tickStep(step) : api.untickStep(step)),
  }),
  tool({
    name: 'set_review_notes',
    description: 'Add a line to the review\'s notes — a finding or decision worth keeping, optionally for a step.',
    capability: 'write',
    input: z.strictObject({ step: id.optional(), text: z.string().min(1).max(2000) }),
    run: ({ step, text }) => {
      const run = api.openRun();
      if (!run) throw new Error('set_review_notes: no review in progress');
      const label = step ? api.reviewSteps(run).find((s) => s.id === step)?.text : undefined;
      if (step && !label) throw new Error(`set_review_notes: unknown step ${step}`);
      const line = label ? `${label}: ${text}` : text;
      api.setReviewNotes(run.notes ? `${run.notes}\n${line}` : line);
    },
  }),
  tool({
    name: 'finish_review',
    description: 'Finish the weekly review in progress.',
    capability: 'write',
    input: z.strictObject({}),
    run: () => api.finishReview(),
  }),
  tool({
    name: 'undo',
    description: 'Undo a log entry (see get_activity) while nothing has touched its items since; refused with who changed them. An undo is itself an entry (undo it to redo).',
    capability: 'write',
    input: z.strictObject({ entry: id }),
    run: ({ entry }) => ({ undo_entry: api.undoActivity(entry) }),
  }),
];

export const REVIEW_TOOLS = [whoami, ...reviewTools];
```

(replace the earlier `export const REVIEW_TOOLS = [whoami];`.)

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/lib/tools && pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools
git commit -m "feat(mcp-3): review and trust tools — start, tick, notes, finish, undo"
```

---

### Task 8: The guided workflows — `GET /api/v1/prompts`

**Files:**
- Create: `src/lib/tools/prompts.ts`, `src/app/api/v1/prompts/route.ts`
- Test: `src/lib/tools/prompts.test.ts`

**Interfaces:**
- Produces: `export interface Prompt { name: string; title: string; description: string; text: string }`, `export const PROMPTS: Prompt[]` (seven, spec §6); `GET /api/v1/prompts` (any valid client) → `{ prompts: Prompt[] }`.

- [ ] **Step 1: Write the failing test** — `src/lib/tools/prompts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PROMPTS } from './prompts';
import { toolNamed } from './index';

describe('guided workflows', () => {
  it('seven workflows; every tool they name exists', () => {
    expect(PROMPTS.map((p) => p.name)).toEqual(['weekly_review', 'inbox_drafts', 'plan_my_day', 'what_now', 'who_owes_me', 'stalled_projects', 'meeting_notes']);
    for (const p of PROMPTS) {
      for (const [, name] of p.text.matchAll(/`([a-z_]+)`/g)) expect(toolNamed(name), `${p.name} names ${name}`).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm vitest run --project memory src/lib/tools/prompts.test.ts`
Expected: FAIL — cannot find `./prompts`.

- [ ] **Step 3: Implement `src/lib/tools/prompts.ts`**

```ts
// The guided workflows (spec §6): how the agent leads; the tools do the work. Decisions are
// recorded as they are made, so an interrupted workflow loses nothing. Tool names in backticks
// are checked by prompts.test.ts.
export interface Prompt {
  name: string;
  title: string;
  description: string;
  text: string;
}

const RULES = `Rules: the user decides; you prepare, ask one thing at a time and record what they decided right away. Use the contexts and buckets from \`get_settings\`. Never invent ids — read them from the tools. Answer briefly.`;

export const PROMPTS: Prompt[] = [
  {
    name: 'weekly_review',
    title: 'Weekly review with me',
    description: 'Lead the weekly review step by step and record each decision.',
    text: `Lead my weekly review. Call \`prepare_weekly_review\`, then \`start_review\` (it returns the run in progress if there is one; \`get_review_state\` tells you where we are). Go through the steps in order. For each: show the findings in two or three lines, ask me one question at a time (e.g. "Glaze tests has no next action — what is the next physical step, or park it?"), record each answer at once (\`add_action\`, \`promote\`, \`move_project\`, \`edit_waiting\`, \`follow_up\`, \`set_bucket\`, \`drop\`, \`clarify\` …), add a short line with \`set_review_notes\`, and \`tick_step\` when I say next. At the end \`finish_review\` and summarise what changed. ${RULES}`,
  },
  {
    name: 'inbox_drafts',
    title: 'Work through my inbox',
    description: 'Draft a clarify decision for every inbox item; the user files them in Clarify.',
    text: `Prepare my inbox for Clarify. For every item from \`list_inbox\` without a draft: \`get_item\` for its context, \`search\` its key words for related projects and items, then write a \`draft_clarification\`: the outcome rewritten by the GTD rules (verb first, concrete, done-when), whether it is a project (kind project with project.new) or belongs to an existing one, and context, priority, time and energy for an action — with a one-line reason. Never \`clarify\` here. End with "n drafts ready — open Clarify". ${RULES}`,
  },
  {
    name: 'plan_my_day',
    title: 'Plan my day',
    description: 'Focus picks and time blocks that fit the day.',
    text: `Plan my day. Read \`get_overview\`, \`get_calendar\` for today and \`find_free_time\` for today. Propose in chat up to three focus actions and time blocks that fit the free time and my energy (from \`list_next_actions\`); deadlines first. When I agree, \`set_focus\` and \`time_block\`. ${RULES}`,
  },
  {
    name: 'what_now',
    title: 'What should I do now?',
    description: 'One to three next actions for where I am, the time I have and my energy.',
    text: `Ask (unless I said it) where I am, how much time I have and my energy. Then \`list_next_actions\` with that context, max_minutes and energy, focus items first, and suggest one to three with a one-line reason each. When I pick one and finish it, \`complete\` it. ${RULES}`,
  },
  {
    name: 'who_owes_me',
    title: 'Who owes me what',
    description: 'Overdue waiting-fors, nudges, follow-ups.',
    text: `Show my overdue waiting-fors (\`list_waiting\` with overdue_only), one line each with who and since when. For each, ask: nudge now (draft the message in my mail tool — not here), move the date (\`edit_waiting\`), it came in (\`received\`), or chase it as an action (\`follow_up\`). ${RULES}`,
  },
  {
    name: 'stalled_projects',
    title: 'Stalled projects',
    description: 'Give every stalled project a next action, park it, or finish it.',
    text: `Go through my stalled projects (\`list_projects\` with stalled_only; \`get_project\` for the details). For each ask: what is the next physical step (\`add_action\`, or \`promote\` a later step), park it (\`move_project\` to someday), or is it done (\`move_project\` to completed)? Record each answer. ${RULES}`,
  },
  {
    name: 'meeting_notes',
    title: 'Meeting notes → inbox',
    description: 'Split notes into single captures; file the obvious ones with the user.',
    text: `Split the meeting notes I give you into single, self-contained lines and \`capture\` them in one call (shorthand allowed). Then, for the obvious ones — things I said I will do or am waiting for — ask me and \`file\` them directly; the rest stays in the inbox for Clarify. Check \`search\` first to avoid duplicates. ${RULES}`,
  },
];
```

`src/app/api/v1/prompts/route.ts`:

```ts
import { limiters } from '@/lib/capture-in';
import { authenticate } from '@/lib/clients';
import { PROMPTS } from '@/lib/tools/prompts';

/** GET /api/v1/prompts — the guided workflows, for the MCP binary to offer as prompts. */
export async function GET(req: Request) {
  const client = authenticate(req.headers.get('authorization'));
  if (!client) {
    if (!limiters.badToken.take()) return Response.json({ error: 'too many requests without a valid token' }, { status: 429 });
    return Response.json({ error: 'missing, wrong or revoked bearer token' }, { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
  }
  return Response.json({ prompts: PROMPTS });
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/lib/tools && pnpm typecheck && pnpm lint`
Expected: PASS (every backticked name is a tool; `get_settings`, `list_inbox`, … exist from Tasks 3–7).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools/prompts.ts src/lib/tools/prompts.test.ts src/app/api/v1/prompts
git commit -m "feat(mcp-3): the seven guided workflows at /api/v1/prompts"
```

---

### Task 9: Docs, curl check, stage check

**Files:**
- Modify: `docs/OPERATIONS.md`, `docs/handoff/SPEC.md`, `docs/superpowers/specs/2026-10-01-mcp-tools-design.md`

- [ ] **Step 1: OPERATIONS**
- New section "API for agents (`/api/v1`)": create a client (Settings → Clients, preset *assistant* for an agent), `GET /api/v1/tools` (what this client may call, JSON Schemas), `POST /api/v1/tools/<name>` with JSON arguments → `{ result, activity }`, `GET /api/v1/prompts`; status codes 400/401/403/404/413/422/429/500; 120 calls a minute; example:
  ```sh
  curl -s -H "Authorization: Bearer $TOKEN" https://gtd.example.com/api/v1/tools | jq '.tools[].name'
  curl -s -H "Authorization: Bearer $TOKEN" --json '{"context":"@calls","max_minutes":15}' \
       https://gtd.example.com/api/v1/tools/list_next_actions
  ```
- "Reachable from outside": add `^/api/v1/` to the Authelia bypass example (all methods: GET lists tools/prompts, POST runs them; every request needs a client token).

- [ ] **Step 2: SPEC** — §2 routes: `/api/v1/tools`, `/api/v1/tools/<name>`, `/api/v1/prompts` (no screen; for agents). §3.9 Clients: presets map to tools (capture: capture + tickler; read-only: read tools; assistant: all).

- [ ] **Step 3: Design doc** — remove the remaining ✦ marks (none of §5 is missing now); §2: the REST API exists; the binary's job is Stage 4.

- [ ] **Step 4: Live check** — build, start an isolated server (`STORE=memory`, no `CAL_*`, no mail), create an assistant client through the Settings page with playwright-core (as in Stage 1 Task 7), then with its token:
  1. `GET /api/v1/tools` lists 50 tools for an assistant; a capture client created the same way lists `add_tickler`, `capture`, `whoami`;
  2. `POST …/list_next_actions` with `{"context":"@calls"}` → 200 with items carrying `href`;
  3. `POST …/file` with a waiting-for decision → 200, `activity` has one id; /activity shows it under the client's name;
  4. `POST …/complete` with `{"ids":["nope"]}` → 422 with the reason;
  5. `GET /api/v1/prompts` → seven prompts.
  Expected: as described.

- [ ] **Step 5: Stage check and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test && STORE=memory CAL_WORK_URL= CAPTURE_MAIL_HOST= pnpm build && pnpm smoke`
Expected: all pass.

```bash
git add docs/OPERATIONS.md docs/handoff/SPEC.md docs/superpowers/specs/2026-10-01-mcp-tools-design.md
git commit -m "docs(mcp-3): the agent API in OPERATIONS and SPEC; Authelia bypass for /api/v1"
```

---

## Roadmap after this stage

**Stage 4 — The Go MCP binary.** `mcp/` (a Go module in this repo): `gtd-mcp` reads `GTD_URL` and `GTD_TOKEN`, fetches `/api/v1/tools` and `/api/v1/prompts` at start, registers them with the official Go MCP SDK (stdio transport), forwards `tools/call` to `POST /api/v1/tools/<name>` and turns `href` into absolute links; errors become MCP tool errors with the app's message. Release binaries for macOS (arm64, amd64) and Linux (amd64, arm64); setup notes for Claude Desktop, Claude Code, Codex and a server-side agent.
