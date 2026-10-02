# MCP Stage 2 — App operations and Clarify drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app operations the MCP tools need that do not exist yet — `file` (capture and clarify in one), `editWaiting`, `overview`, `freeTime`, `prepareWeeklyReview` — and Clarify drafts: an agent prefills an inbox item's decision, the human files it in Clarify.

**Architecture:** Everything is api functions in `src/lib/api.ts` (the only data access), logged by the Stage 1 activity log. `file` runs capture and clarify inside one outer store update; the store wrapper makes nested updates part of the outer one, so it is one atomic write and one log entry. A draft is a field on the inbox item (`Item.draft`), validated like a decision, cleared when the item leaves the inbox; Clarify reads it as its initial state.

**Tech Stack:** Next.js 16, TypeScript strict, Drizzle + better-sqlite3, vitest (memory and sqlite projects).

**Spec:** `docs/superpowers/specs/2026-10-01-mcp-tools-design.md` — §3.4 drafts, §5.1 `get_overview` and `find_free_time`, §5.3 `draft_clarification` and `file`, §5.5 `edit_waiting`, §5.7 `prepare_weekly_review`. Stage 1 (activity log, undo, clients) is merged on `main`.

## Global Constraints

- Read `node_modules/next/dist/docs/` before using a Next.js API not yet used in this repo (AGENTS.md).
- Writes from the UI only through server actions in `src/lib/actions.ts`; reads through `src/lib/api.ts`.
- Time from `api.now()` / `api.today()`; wall-clock conversions through `lib/clock.ts`.
- Colours only from tokens; `rg '#[0-9a-f]{6}' src --glob '!**/tokens.css'` stays empty.
- Public repo: no personal data, no secrets, no real host names (CLAUDE.md).
- Every change to items, projects and tickler notes is logged (Stage 1); a new operation adds no logging code of its own.
- Before every commit: `pnpm lint && pnpm typecheck && pnpm test`; `pnpm build` after UI tasks; app checks with `STORE=memory CAL_WORK_URL= CAPTURE_MAIL_HOST=`.
- Commit author `sebastian.hoehn@gmail.com`; never push; no release — the user cuts one after all app-changing stages.
- Spec values: drafts are **one per inbox item**, a newer one replaces the older, **never applied on their own**, gone when the item is filed or trashed, marked "drafted by <client> · <reason>" in Clarify and marked in the inbox list; `prepare_weekly_review` covers inbox and age, stalled projects, overdue waiting-fors, deadlines in **14 days**, someday items untouched **> 90 days**, last week's numbers, what clients did this week; `get_overview` shows deadlines in **7 days**.

## Review Focus

- `file` with a decision Clarify would refuse (unknown context, parked project with a next action) must leave nothing behind — no inbox item, no log entry — Task 2 test `a refused decision leaves no item and no entry`.
- `freeTime` must not offer time that has already passed today, or days before today — Task 5 test `today starts at now; earlier days have no free time`.
- A draft naming a project or context that disappears before filing must not break Clarify; the form falls back to an empty pick / the first context — Task 8 Step 5 check 5, and Task 7 test `a draft can't name a parked project as next action`.
- An agent drafting the same item twice must replace, not stack — Task 7 test `a newer draft replaces the older`.
- `editWaiting` on an item that is not a waiting-for must be refused with the app's reason, not silently ignored — Task 3 test `refused for anything that is not a waiting-for`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/store/index.ts` (modify) | nested updates join the outer one; tracked collections roll back on a throw |
| `src/lib/activity.ts` (modify) | `currentActor()`; phrases for created waiting-fors and for drafts |
| `src/lib/model.ts` (modify) | `Draft`, `Item.draft` |
| `src/lib/store/schema.ts`, `sqlite.ts` (modify), `drizzle/0007_item_draft.sql` (generated) | the `draft` column |
| `src/lib/api.ts` (modify) | `file`, `editWaiting`, `overview`, `freeTime`, `prepareWeeklyReview`, `setDraft`; clarify/trash clear drafts |
| `src/lib/actions.ts` (modify) | — (no new UI writes in this stage; drafts are written by clients in Stage 3) |
| `src/app/clarify/page.tsx`, `src/components/clarify/ClarifyForm.tsx` (modify) | prefill from a draft, the "drafted by" line |
| `src/app/inbox/page.tsx`, `src/components/inbox/InboxList.tsx`, `src/components/inbox/PhoneInbox.tsx` (modify) | the draft marker |
| Tests: `src/lib/agent-ops.test.ts`, `src/lib/drafts.test.ts` (create), `src/lib/activity-api.test.ts` (modify) | |
| `docs/handoff/SPEC.md`, `docs/superpowers/specs/2026-10-01-mcp-tools-design.md` (modify) | drafts and `file` in SPEC; the Go binary in the design |

---

### Task 1: Nested store updates are one write

**Files:**
- Modify: `src/lib/store/index.ts`
- Test: `src/lib/activity-api.test.ts`

**Interfaces:**
- Produces: inside a `store.update(fn)`, any further `store.update(g)` runs `g` on the same state at once — no own snapshot, no own log entry, no own write; the outer update logs the combined change once. If anything inside throws, items/projects/tickler are restored to the outer snapshot (also in the memory store) and the error propagates.

- [ ] **Step 1: Write the failing tests** — append to `src/lib/activity-api.test.ts`:

```ts
describe('nested updates (MCP stage 2)', () => {
  it('a capture inside an update is part of it: one entry for both changes', () => {
    const before = store.getState().activity.length;
    store.update(() => {
      api.capture('First');
      api.capture('Second');
    });
    expect(store.getState().activity.length).toBe(before + 1);
    expect(latest().summary).toBe('Captured “First”; Captured “Second”');
  });

  it('a throw inside rolls back everything the update did, in either store', () => {
    const items = store.getState().items.length;
    expect(() =>
      store.update(() => {
        api.capture('Never kept');
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(store.getState().items.length).toBe(items);
    expect(api.listInbox().some((i) => i.text === 'Never kept')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vitest run src/lib/activity-api.test.ts -t "nested"`
Expected: FAIL — two entries instead of one; in the memory project the item stays after the throw.

- [ ] **Step 3: Implement** — in `src/lib/store/index.ts`, replace the `update` of the exported `store`:

```ts
// Depth of store.update calls in progress: an update inside an update is part of the outer one.
let depth = 0;

export const store: Store = {
  getState: () => open().getState(),
  // Every change is logged with its actor in the same write (lib/activity.ts). An update made
  // while another runs (an api function calling others) joins it: one write, one entry.
  update: (fn) => {
    if (depth > 0) {
      fn(open().getState() as State);
      return;
    }
    depth++;
    try {
      open().update((s) => {
        const before = snapshot(s);
        try {
          fn(s);
        } catch (e) {
          Object.assign(s, before); // items, projects, tickler as they were (the memory store has no rollback)
          throw e;
        }
        record(s, before);
      });
    } finally {
      depth--;
    }
  },
  subscribe: (listener) => open().subscribe(listener),
};
```

(import `type { State, Store }` from `./types`.)

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/lib/activity-api.test.ts && pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS everywhere.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/index.ts src/lib/activity-api.test.ts
git commit -m "feat(mcp-2): an update inside an update is one write and one log entry"
```

---

### Task 2: `file(text, decision)` — capture and clarify in one

**Files:**
- Modify: `src/lib/api.ts`, `src/lib/activity.ts`
- Test: `src/lib/agent-ops.test.ts` (create)

**Interfaces:**
- Consumes: Task 1 nesting; `capture`, `clarify`, `Decision`, `ClarifyResult`.
- Produces: `export function file(text: string, decision: Decision): ClarifyResult;` — refuses an empty text with `file: text is empty`; any Clarify refusal propagates unchanged and nothing is kept.
- Produces (activity.ts): a created waiting-for reads `Added “X” to Waiting For (who)`.

- [ ] **Step 1: Write the failing tests** — `src/lib/agent-ops.test.ts`:

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
const PHONE = { kind: 'client', id: 'c1', name: 'Phone agent' } as const;

describe('file: capture and clarify in one', () => {
  it('"I am waiting on Alice for the video" lands in Waiting For as one entry by the client', () => {
    const before = store.getState().activity.length;
    const { itemId } = runAs(PHONE, () => api.file('Video from Alice', { kind: 'action', text: 'Video from Alice', route: { to: 'waiting', who: 'Alice' } }));
    expect(api.getItem(itemId)).toMatchObject({ status: 'waiting', source: 'typed', waiting: { who: 'Alice' } });
    expect(store.getState().activity.length).toBe(before + 1);
    expect(latest()).toMatchObject({ actorLabel: 'Phone agent', summary: 'Added “Video from Alice” to Waiting For (Alice)' });
  });

  it('a new project is born through file as through Clarify', () => {
    const { projectId, projectCreated } = api.file('Get quotes', { kind: 'action', text: 'Get quotes for the kiln', project: { newTitle: 'New kiln installed' }, route: { to: 'next', context: '@calls', priority: 'B', time: 30, energy: 'normal' } });
    expect(projectCreated).toBe(true);
    expect(api.getProject(projectId!)).toMatchObject({ title: 'New kiln installed', status: 'active' });
  });

  it('a refused decision leaves no item and no entry', () => {
    const items = store.getState().items.length;
    const entries = store.getState().activity.length;
    expect(() => api.file('Call Bob', { kind: 'action', text: 'Call Bob', route: { to: 'next', context: '@nowhere', priority: 'B', time: 15, energy: 'low' } })).toThrow('clarify: unknown context @nowhere');
    expect(store.getState().items.length).toBe(items);
    expect(store.getState().activity.length).toBe(entries);
  });

  it('an empty text is refused', () => {
    expect(() => api.file('  ', { kind: 'trash' })).toThrow('file: text is empty');
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vitest run --project memory src/lib/agent-ops.test.ts`
Expected: FAIL — `api.file is not a function`.

- [ ] **Step 3: Implement**

In `src/lib/api.ts`, after `clarify(...)`:

```ts
/**
 * Capture and clarify in one — "I'm waiting on Alice for the video, add it". One atomic write,
 * one log entry; a decision Clarify refuses leaves nothing behind. Projects can be born here as
 * in Clarify (step 3 `{ newTitle }`).
 */
export function file(text: string, decision: Decision): ClarifyResult {
  check(text.trim(), 'text is empty', 'file');
  let result: ClarifyResult | undefined;
  store.update(() => {
    const item = capture(text)!;
    result = clarify(item.id, decision);
  });
  return result!;
}
```

In `src/lib/activity.ts`, `phrase()` for a created item:

```ts
    if (!b) {
      if (a!.status === 'inbox') return `Captured “${a!.text}”`;
      return `Added “${a!.text}” to ${LIST[a!.status]}${a!.status === 'waiting' && a!.waiting ? ` (${a!.waiting.who})` : ''}`;
    }
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/lib/agent-ops.test.ts && pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS. (If `activity.test.ts` pins the old created-item wording for a non-waiting item, it is unchanged: only waiting-fors gain "(who)".)

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.ts src/lib/activity.ts src/lib/agent-ops.test.ts
git commit -m "feat(mcp-2): file — capture and clarify in one write"
```

---

### Task 3: `editWaiting(id, { who?, followUp? })`

**Files:**
- Modify: `src/lib/api.ts`
- Test: `src/lib/agent-ops.test.ts`

**Interfaces:**
- Produces: `export function editWaiting(id: string, edit: { who?: string; followUp?: string | null }): void;` — `followUp: null` removes the date; refusals `waiting: item X is not a waiting-for`, `waiting: who is empty`, `waiting: follow-up is not an ISO date`.

- [ ] **Step 1: Write the failing tests** — append to `src/lib/agent-ops.test.ts`:

```ts
describe('editWaiting', () => {
  const waitingId = () => store.getState().items.find((i) => i.status === 'waiting')!.id;

  it('moves the follow-up date ("she said next week") and renames who', () => {
    const id = waitingId();
    api.editWaiting(id, { followUp: '2026-10-09', who: ' Shop owner ' });
    expect(api.getItem(id)!.waiting).toMatchObject({ who: 'Shop owner', followUp: '2026-10-09' });
    api.editWaiting(id, { followUp: null });
    expect(api.getItem(id)!.waiting!.followUp).toBeUndefined();
  });

  it('refused for anything that is not a waiting-for, and for bad values', () => {
    expect(() => api.editWaiting('n1', { followUp: '2026-10-09' })).toThrow('waiting: item n1 is not a waiting-for');
    expect(() => api.editWaiting(waitingId(), { who: '  ' })).toThrow('waiting: who is empty');
    expect(() => api.editWaiting(waitingId(), { followUp: '09.10' })).toThrow('waiting: follow-up is not an ISO date');
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vitest run --project memory src/lib/agent-ops.test.ts -t editWaiting`
Expected: FAIL — `api.editWaiting is not a function`.

- [ ] **Step 3: Implement** — in `src/lib/api.ts`, next to `received`:

```ts
/** Change who a waiting-for is waiting on, or its follow-up date (`null` removes the date). */
export function editWaiting(id: string, edit: { who?: string; followUp?: string | null }): void {
  const item = getItem(id);
  check(item?.status === 'waiting' && item.waiting, `item ${id} is not a waiting-for`, 'waiting');
  if (edit.who !== undefined) check(edit.who.trim(), 'who is empty', 'waiting');
  if (edit.followUp) check(ISO_DATE.test(edit.followUp), 'follow-up is not an ISO date', 'waiting');
  store.update((s) => {
    const w = s.items.find((i) => i.id === id)!.waiting!;
    if (edit.who !== undefined) w.who = edit.who.trim();
    if (edit.followUp === null) delete w.followUp;
    else if (edit.followUp !== undefined) w.followUp = edit.followUp;
  });
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/lib/agent-ops.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.ts src/lib/agent-ops.test.ts
git commit -m "feat(mcp-2): editWaiting — who and follow-up date"
```

---

### Task 4: `overview()`

**Files:**
- Modify: `src/lib/api.ts`
- Test: `src/lib/agent-ops.test.ts`

**Interfaces:**
- Consumes: `listInbox`, `ageDays`, `focusToday`, `todayLandscape`, `listProjects`, `projectStalled`, `isOverdue`, `upcomingDeadlines`, `reviewBadge`, `now`, `today`.
- Produces:
  ```ts
  export interface Overview {
    now: string;            // ISO
    today: string;          // yyyy-mm-dd
    inbox: { count: number; oldest?: { id: string; text: string; days: number } };
    focus: { id: string; text: string; done: boolean }[];
    landscape: LandscapeEntry[];
    stalled: { id: string; title: string }[];
    waitingOverdue: { id: string; text: string; who: string; followUp: string }[];
    deadlines: UpcomingDeadline[];     // next 7 days
    review: 'due' | 'in progress' | { finishedAt: string };
  }
  export function overview(): Overview;
  ```

- [ ] **Step 1: Write the failing test** — append:

```ts
describe('overview', () => {
  it('the situation right now, from the lists', () => {
    const o = api.overview();
    expect(o.today).toBe('2026-09-26');
    expect(o.inbox.count).toBe(api.listInbox().length);
    expect(o.inbox.oldest).toMatchObject({ id: api.listInbox().at(-1)!.id });
    expect(o.stalled.map((p) => p.id)).toEqual(api.listProjects().filter(api.projectStalled).map((p) => p.id));
    expect(o.waitingOverdue.every((w) => w.followUp < o.today)).toBe(true);
    expect(o.deadlines.every((d) => d.day <= '2026-10-03')).toBe(true);
    expect(o.landscape).toEqual(api.todayLandscape());
    expect(['due', 'in progress']).toContain(typeof o.review === 'string' ? o.review : 'done');
  });

  it('an empty inbox has no oldest', () => {
    runSilently(() => store.update((s) => (s.items = s.items.filter((i) => i.status !== 'inbox'))));
    expect(api.overview().inbox).toEqual({ count: 0 });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm vitest run --project memory src/lib/agent-ops.test.ts -t overview`
Expected: FAIL — `api.overview is not a function`.

- [ ] **Step 3: Implement** — in `src/lib/api.ts`, after `health()`:

```ts
/** The situation now (MCP get_overview): what an agent reads first. */
export interface Overview {
  now: string;
  today: string;
  inbox: { count: number; oldest?: { id: string; text: string; days: number } };
  focus: { id: string; text: string; done: boolean }[];
  landscape: LandscapeEntry[];
  stalled: { id: string; title: string }[];
  waitingOverdue: { id: string; text: string; who: string; followUp: string }[];
  deadlines: UpcomingDeadline[];
  review: ReviewBadge;
}

export function overview(): Overview {
  const day = today();
  const inbox = listInbox();
  const oldest = inbox.at(-1);
  return {
    now: now().toISOString(),
    today: day,
    inbox: { count: inbox.length, ...(oldest && { oldest: { id: oldest.id, text: oldest.text, days: ageDays(oldest) } }) },
    focus: focusToday().map((i) => ({ id: i.id, text: i.text, done: i.status === 'done' })),
    landscape: todayLandscape(day),
    stalled: listProjects()
      .filter(projectStalled)
      .map((p) => ({ id: p.id, title: p.title })),
    waitingOverdue: store
      .getState()
      .items.filter((i) => isOverdue(i, day))
      .map((i) => ({ id: i.id, text: i.text, who: i.waiting!.who, followUp: i.waiting!.followUp! })),
    deadlines: upcomingDeadlines(7),
    review: reviewBadge(),
  };
}
```

(`UpcomingDeadline` and `ReviewBadge` are declared further down the file; TypeScript hoists types.)

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/lib/agent-ops.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.ts src/lib/agent-ops.test.ts
git commit -m "feat(mcp-2): overview — the situation now in one read"
```

---

### Task 5: `freeTime(from, to, minMinutes?, dayHours?)`

**Files:**
- Modify: `src/lib/api.ts`
- Test: `src/lib/agent-ops.test.ts`

**Interfaces:**
- Consumes: the private `landscape(from, to)`, `minutesOf`, `fromMinutes`, `addDays`, `today`, `minutesOfDay`.
- Produces:
  ```ts
  export interface FreeSlot { day: string; start: string; end: string; minutes: number }
  export function freeTime(from: string, to: string, minMinutes?: number, dayHours?: { start: string; end: string }): FreeSlot[];
  // defaults: minMinutes 30, dayHours 08:00–18:00; refusals 'freeTime: …'
  ```
- Busy: timed appointment parts and time blocks (also projected recurring ones). All-day entries do not block. Days before today have no free time; today starts at now, rounded up to the next 5 minutes.

- [ ] **Step 1: Write the failing tests** — append:

```ts
describe('freeTime', () => {
  const MON = '2026-09-28';
  const setDay = () =>
    runSilently(() =>
      store.update((s) => {
        for (const i of s.items) if (i.timeSlot?.start.startsWith(MON)) delete i.timeSlot;
        s.externalEvents = [
          { id: 'x1', calendar: 'Work', title: 'Studio meeting', start: `${MON}T09:00:00+02:00`, end: `${MON}T10:00:00+02:00`, allDay: false },
          { id: 'x2', calendar: 'Work', title: 'Holiday', start: MON, end: '2026-09-29', allDay: true },
        ];
        s.items.find((i) => i.id === 'n2')!.timeSlot = { start: `${MON}T13:00`, end: `${MON}T14:30` };
      }),
    );

  it('gaps between appointments and blocks within the day hours; all-day entries do not block', () => {
    setDay();
    expect(api.freeTime(MON, MON, 90)).toEqual([
      { day: MON, start: '10:00', end: '13:00', minutes: 180 },
      { day: MON, start: '14:30', end: '18:00', minutes: 210 },
    ]);
    expect(api.freeTime(MON, MON, 30, { start: '07:00', end: '09:00' })).toEqual([{ day: MON, start: '07:00', end: '09:00', minutes: 120 }]);
  });

  it('today starts at now; earlier days have no free time', () => {
    expect(api.freeTime('2026-09-20', '2026-09-25')).toEqual([]);
    const nowMin = api.minutesOfDay();
    for (const slot of api.freeTime('2026-09-26', '2026-09-26', 5, { start: '00:00', end: '23:59' })) {
      expect(Number(slot.start.slice(0, 2)) * 60 + Number(slot.start.slice(3))).toBeGreaterThanOrEqual(nowMin);
    }
  });

  it('refuses bad ranges and hours', () => {
    expect(() => api.freeTime('2026-09-30', '2026-09-28')).toThrow('freeTime: from is after to');
    expect(() => api.freeTime('2026-09-28', '2026-12-31')).toThrow('freeTime: at most 62 days');
    expect(() => api.freeTime('28.09', '2026-09-28')).toThrow('freeTime: dates are yyyy-mm-dd');
    expect(() => api.freeTime(MON, MON, 30, { start: '18:00', end: '08:00' })).toThrow('freeTime: day hours end before they start');
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vitest run --project memory src/lib/agent-ops.test.ts -t freeTime`
Expected: FAIL — `api.freeTime is not a function`.

- [ ] **Step 3: Implement** — in `src/lib/api.ts`, after `upcomingDeadlines`:

```ts
export interface FreeSlot {
  day: string;
  start: string; // hh:mm
  end: string;
  minutes: number;
}

const HH_MM_ANY = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Time with nothing on it (MCP find_free_time): gaps between timed appointments and time blocks
 * (projected recurring ones included) inside the day hours. All-day entries do not block. Days
 * before today have none; today starts at now, rounded up to the next 5 minutes.
 */
export function freeTime(from: string, to: string, minMinutes = 30, dayHours = { start: '08:00', end: '18:00' }): FreeSlot[] {
  check(ISO_DATE.test(from) && ISO_DATE.test(to), 'dates are yyyy-mm-dd', 'freeTime');
  check(from <= to, 'from is after to', 'freeTime');
  check(daysBetween(from, to) <= 62, 'at most 62 days', 'freeTime');
  check(HH_MM_ANY.test(dayHours.start) && HH_MM_ANY.test(dayHours.end), 'day hours are hh:mm', 'freeTime');
  check(dayHours.start < dayHours.end, 'day hours end before they start', 'freeTime');
  const busy = new Map<string, [number, number][]>();
  for (const e of landscape(from, to)) {
    if ((e.kind !== 'appointment' && e.kind !== 'timeblock') || !e.start || !e.end) continue;
    const list = busy.get(e.day) ?? [];
    list.push([minutesOf(e.start), e.end === '24:00' ? 24 * 60 : minutesOf(e.end)]);
    busy.set(e.day, list);
  }
  const first = today();
  const out: FreeSlot[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (day < first) continue;
    let cursor = minutesOf(dayHours.start);
    if (day === first) cursor = Math.max(cursor, Math.ceil(minutesOfDay() / 5) * 5);
    const end = minutesOf(dayHours.end);
    const blocks = (busy.get(day) ?? []).sort((a, b) => a[0] - b[0]);
    const gap = (a: number, b: number) => {
      if (b - a >= minMinutes) out.push({ day, start: fromMinutes(a), end: fromMinutes(b), minutes: b - a });
    };
    for (const [s, e] of blocks) {
      if (e <= cursor) continue;
      if (s >= end) break;
      gap(cursor, Math.min(s, end));
      cursor = Math.max(cursor, e);
    }
    if (cursor < end) gap(cursor, end);
  }
  return out;
}
```

Import `daysBetween` from `./format` (it exists there; `format.ts` imports only `./clock`, so no cycle): `import { daysBetween, fmtDate } from './format';`.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/lib/agent-ops.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.ts src/lib/agent-ops.test.ts
git commit -m "feat(mcp-2): freeTime — the gaps in the hard landscape"
```

---

### Task 6: `prepareWeeklyReview()`

**Files:**
- Modify: `src/lib/api.ts`
- Test: `src/lib/agent-ops.test.ts`

**Interfaces:**
- Consumes: `openRun`, `reviewSteps`, the private `ruleOf`, `listInbox`, `ageDays`, `listNext`, `isOverdue`, `listProjects`, `projectStalled`, `upcomingDeadlines`, `weekStats`, `listProjects`, `actorLabel`, `now`, `today`.
- Produces:
  ```ts
  export interface ReviewPrepStep { id: string; phaseId: string; text: string; findings: string[]; items: { id: string; text: string }[] }
  export interface ReviewPrep {
    open: boolean;                       // a run is in progress
    steps: ReviewPrepStep[];             // the open run's template, else the current one
    week: WeekStats;
    clients: { actor: string; changes: number; examples: string[] }[];   // last 7 days, actors other than you
  }
  export function prepareWeeklyReview(): ReviewPrep;
  ```
- Findings by rule (`ruleOf`): `inbox-zero` inbox count and oldest age; `next` count and actions older than 30 days; `past-cal` calendar items of the last 7 days not ticked; `future-cal` deadlines in 14 days; `waiting` overdue waiting-fors with who and date; `projects` stalled projects; `someday` items untouched > 90 days (last log entry about them, else capture); `areas` the active areas; anything else: none.

- [ ] **Step 1: Write the failing tests** — append:

```ts
describe('prepareWeeklyReview', () => {
  const step = (id: string) => api.prepareWeeklyReview().steps.find((s) => s.id === id)!;

  it('one entry per template step, findings from the lists the step links to', () => {
    const prep = api.prepareWeeklyReview();
    expect(prep.steps.map((s) => s.id)).toEqual(api.reviewSteps().map((s) => s.id));
    expect(step('inbox-zero').findings[0]).toMatch(new RegExp(`^${api.listInbox().length} in the inbox, oldest \\d+ days?$`));
    expect(step('projects').items.map((i) => i.id)).toEqual(api.listProjects().filter(api.projectStalled).map((p) => p.id));
    expect(step('waiting').items.every((i) => api.isOverdue(api.getItem(i.id)!))).toBe(true);
    expect(step('collect').findings).toEqual([]);
    expect(prep.week).toEqual(api.weekStats());
  });

  it('someday items untouched for 90 days are named; a recent log entry counts as a touch', () => {
    runSilently(() =>
      store.update((s) => {
        const it = s.items.find((i) => i.status === 'someday')!;
        it.capturedAt = '2026-05-01T10:00:00.000Z';
      }),
    );
    const old = store.getState().items.find((i) => i.capturedAt === '2026-05-01T10:00:00.000Z')!;
    expect(step('someday').items.map((i) => i.id)).toContain(old.id);
    api.setBucket(old.id, api.getSettings().buckets[1]);
    expect(step('someday').items.map((i) => i.id)).not.toContain(old.id);
  });

  it('what clients did this week, by client', () => {
    runAs(PHONE, () => {
      api.capture('Buy glaze');
      api.capture('Book the kiln');
    });
    api.capture('Typed by me');
    expect(api.prepareWeeklyReview().clients).toEqual([{ actor: 'Phone agent', changes: 2, examples: ['Captured “Book the kiln”', 'Captured “Buy glaze”'] }]);
  });
});
```

(`setBucket(id: string, bucket: string)` is in api.ts — any logged change to the item counts as a touch.)

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vitest run --project memory src/lib/agent-ops.test.ts -t prepareWeeklyReview`
Expected: FAIL — `api.prepareWeeklyReview is not a function`.

- [ ] **Step 3: Implement** — in `src/lib/api.ts`, after `weekStats()`:

```ts
export interface ReviewPrepStep {
  id: string;
  phaseId: string;
  text: string;
  findings: string[];
  items: { id: string; text: string }[];
}
export interface ReviewPrep {
  open: boolean;
  steps: ReviewPrepStep[];
  week: WeekStats;
  clients: { actor: string; changes: number; examples: string[] }[];
}

const UNTOUCHED_DAYS = 90;
const dayCount = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

/** When an item was last changed: its newest log entry, else its capture. */
function lastTouched(id: string): string {
  const log = store.getState().activity;
  for (let n = log.length - 1; n >= 0; n--) if (log[n].changes.some((c) => c.id === id)) return log[n].at;
  return getItem(id)!.capturedAt;
}

/** Findings per step of the weekly review (MCP prepare_weekly_review) — what to look at, not what to decide. */
export function prepareWeeklyReview(): ReviewPrep {
  const day = today();
  const t = now().getTime();
  const { items, activity } = store.getState();
  const ref = (i: { id: string; text: string }) => ({ id: i.id, text: i.text });
  const findings = (rule: string): Pick<ReviewPrepStep, 'findings' | 'items'> => {
    switch (rule) {
      case 'inbox-zero': {
        const inbox = listInbox();
        const oldest = inbox.at(-1);
        return { findings: [oldest ? `${inbox.length} in the inbox, oldest ${dayCount(ageDays(oldest))}` : 'the inbox is empty'], items: inbox.slice(0, 20).map(ref) };
      }
      case 'next': {
        const next = listNext();
        const old = next.filter((i) => ageDays(i) > 30);
        return { findings: [`${next.length} next actions`, ...(old.length ? [`${old.length} captured more than 30 days ago`] : [])], items: old.map(ref) };
      }
      case 'past-cal': {
        const open = items.filter((i) => i.status === 'calendar' && i.day && i.day < day && i.day >= addDays(day, -7));
        return { findings: open.length ? [`${open.length} calendar items of the last 7 days not ticked`] : [], items: open.map(ref) };
      }
      case 'future-cal': {
        const due = upcomingDeadlines(14);
        return { findings: due.map((d) => `${fmtDate(d.day)} ${d.text}`), items: due.map((d) => ({ id: d.id, text: d.text })) };
      }
      case 'waiting': {
        const over = items.filter((i) => isOverdue(i, day));
        return { findings: over.map((i) => `${i.text} — ${i.waiting!.who}, follow-up ${fmtDate(i.waiting!.followUp!)}`), items: over.map(ref) };
      }
      case 'projects': {
        const stalled = listProjects().filter(projectStalled);
        return { findings: stalled.map((p) => `${p.title} has no next action`), items: stalled.map((p) => ({ id: p.id, text: p.title })) };
      }
      case 'someday': {
        const stale = items.filter((i) => i.status === 'someday' && t - Date.parse(lastTouched(i.id)) > UNTOUCHED_DAYS * DAY_MS);
        return { findings: stale.length ? [`${stale.length} untouched for more than ${UNTOUCHED_DAYS} days`] : [], items: stale.map(ref) };
      }
      case 'areas': {
        const areas = [...new Set(listProjects().map((p) => p.area).filter((a): a is string => !!a))];
        return { findings: areas.length ? [`areas: ${areas.join(', ')}`] : [], items: [] };
      }
      default:
        return { findings: [], items: [] };
    }
  };
  const run = openRun();
  const byClient = new Map<string, { changes: number; examples: string[] }>();
  for (let n = activity.length - 1; n >= 0 && t - Date.parse(activity[n].at) <= 7 * DAY_MS; n--) {
    const e = activity[n];
    if (e.actor.kind === 'user') continue;
    const k = byClient.get(actorLabel(e.actor)) ?? { changes: 0, examples: [] };
    k.changes++;
    if (k.examples.length < 3) k.examples.push(e.summary);
    byClient.set(actorLabel(e.actor), k);
  }
  return {
    open: !!run,
    steps: reviewSteps(run).map((s) => ({ id: s.id, phaseId: s.phaseId, text: s.text, ...findings(ruleOf(s, s.id)) })),
    week: weekStats(),
    clients: [...byClient].map(([actor, v]) => ({ actor, ...v })),
  };
}
```

(`fmtDate` is imported from `./format` in Task 5; `ruleOf` is declared further down in the same file.)

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/lib/agent-ops.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.ts src/lib/agent-ops.test.ts
git commit -m "feat(mcp-2): prepareWeeklyReview — findings per step, the week, what clients did"
```

---

### Task 7: Drafts — model, storage, `setDraft`

**Files:**
- Modify: `src/lib/model.ts`, `src/lib/store/schema.ts`, `src/lib/store/sqlite.ts`, `src/lib/activity.ts`, `src/lib/api.ts`
- Create: `drizzle/0007_item_draft.sql` (via `pnpm db:generate --name item_draft`)
- Test: `src/lib/drafts.test.ts` (create)

**Interfaces:**
- Produces (model.ts):
  ```ts
  /** A proposed Clarify decision for an inbox item (MCP design §3.4). Never applied on its own. */
  export interface Draft {
    by: string;             // who drafted it: a client's name ('you' when typed in the app)
    at: string;             // ISO
    reason: string;         // one line, ≤ 280 characters
    kind: 'action' | 'project' | 'someday' | 'reference' | 'trash';
    text?: string;          // the outcome, rewritten (action / project: the first action)
    project?: { id: string } | { newTitle: string };   // 'project' requires { newTitle }
    next?: boolean;         // in a project: its next action (default: as Clarify would)
    route?: 'next' | 'waiting' | 'calendar' | 'done';
    context?: string;
    priority?: Priority;
    time?: TimeBucket;
    energy?: Energy;
    deadline?: string;
    who?: string;
    followUp?: string;
    day?: string;
  }
  // Item gains: draft?: Draft;   // inbox only
  ```
- Produces (api.ts): `export type DraftInput = Omit<Draft, 'by' | 'at'>; export function setDraft(itemId: string, draft: DraftInput | null): void;` — refusals prefixed `draft:`; `clarify` and `trash` remove an item's draft.
- Produces (activity.ts): `export function currentActor(): Actor;` and the phrases `Drafted “X”` / `Removed the draft of “X”`.

- [ ] **Step 1: Write the failing tests** — `src/lib/drafts.test.ts`:

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
const PHONE = { kind: 'client', id: 'c1', name: 'Phone agent' } as const;
const action = { kind: 'action', text: 'Call the dentist about the corrected invoice', route: 'next', context: '@calls', priority: 'B', time: 15, energy: 'low', reason: 'a call, two minutes once you have the number' } as const;

describe('drafts', () => {
  it('a client drafts an inbox item: stored with who and when, logged as a draft', () => {
    runAs(PHONE, () => api.setDraft('i1', action));
    expect(api.getItem('i1')!.draft).toMatchObject({ ...action, by: 'Phone agent', at: expect.any(String) });
    expect(api.listActivity({ limit: 1 })[0]).toMatchObject({ actorLabel: 'Phone agent', summary: 'Drafted “Call the dentist about the invoice”' });
  });

  it('a newer draft replaces the older; null removes it', () => {
    api.setDraft('i1', action);
    api.setDraft('i1', { kind: 'trash', reason: 'already paid' });
    expect(api.getItem('i1')!.draft).toMatchObject({ kind: 'trash', reason: 'already paid' });
    expect(api.getItem('i1')!.draft).not.toHaveProperty('context');
    api.setDraft('i1', null);
    expect(api.getItem('i1')!.draft).toBeUndefined();
    expect(api.listActivity({ limit: 1 })[0].summary).toBe('Removed the draft of “Call the dentist about the invoice”');
  });

  it('never applied on its own; gone when the item is filed or trashed', () => {
    api.setDraft('i1', action);
    expect(api.getItem('i1')!.status).toBe('inbox');
    api.clarify('i1', { kind: 'someday' });
    expect(api.getItem('i1')!.draft).toBeUndefined();
    api.setDraft('i2', action);
    api.trash(['i2']);
    expect(api.getItem('i2')!.draft).toBeUndefined();
  });

  it('only inbox items; checked like a decision', () => {
    expect(() => api.setDraft('n1', action)).toThrow('draft: item n1 is not in the inbox');
    expect(() => api.setDraft('i1', { ...action, context: '@nowhere' })).toThrow('draft: unknown context @nowhere');
    expect(() => api.setDraft('i1', { ...action, reason: '' })).toThrow('draft: a draft needs a reason');
    expect(() => api.setDraft('i1', { kind: 'project', text: 'Get quotes', reason: 'big' })).toThrow('draft: a project draft needs project.newTitle');
    expect(() => api.setDraft('i1', { ...action, project: { id: 'p-nope' } })).toThrow('draft: unknown project p-nope');
    expect(() => api.setDraft('i1', { ...action, deadline: '09.10' })).toThrow('draft: deadline is not an ISO date');
  });

  it("a draft can't name a parked project as next action", () => {
    api.moveProjectToSomeday('p-table');
    expect(() => api.setDraft('i1', { ...action, project: { id: 'p-table' }, next: true })).toThrow(/draft: project .* is on hold/);
    api.setDraft('i1', { ...action, project: { id: 'p-table' }, next: false });
    expect(api.getItem('i1')!.draft!.next).toBe(false);
  });

  it('is kept on the item in both stores', () => {
    api.setDraft('i1', action);
    expect(store.getState().items.find((i) => i.id === 'i1')!.draft!.reason).toBe(action.reason);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vitest run --project memory src/lib/drafts.test.ts`
Expected: FAIL — `api.setDraft is not a function`.

- [ ] **Step 3: Model and storage**

`src/lib/model.ts`: add the `Draft` interface from **Interfaces** (after `Reference`) and to `Item`: `draft?: Draft;             // inbox only: a proposed decision (MCP §3.4)`.

`src/lib/store/schema.ts`, in the `items` table after `trashedAt`: `draft: text({ mode: 'json' }).$type<Draft>(),` (import `Draft` from `../model`).

Run: `pnpm db:generate --name item_draft`
Expected: `drizzle/0007_item_draft.sql` with `ALTER TABLE \`items\` ADD \`draft\` text;`

`src/lib/store/sqlite.ts`, `itemRow`: `draft: i.draft ?? null,` (after `successorId`). `rowItem` needs nothing: `compact` drops a null draft and keeps the parsed object.

- [ ] **Step 4: Activity** — in `src/lib/activity.ts`:

```ts
/** Who is acting right now (outside any scope: the user). */
export function currentActor(): Actor {
  return scope.getStore()?.actor ?? USER;
}
```

In `phrase()`, for an existing item with the same status, before the generic field list:

```ts
    if (canon(a.draft) !== canon(b.draft) && ITEM_FIELDS.every(([f]) => canon(a[f]) === canon(b[f]))) {
      return a.draft ? `Drafted “${a.text}”` : `Removed the draft of “${a.text}”`;
    }
```

- [ ] **Step 5: `setDraft` and the clean-up** — in `src/lib/api.ts` (import `currentActor` from `./activity`, `Draft` from `./model`):

```ts
export type DraftInput = Omit<Draft, 'by' | 'at'>;
const DRAFT_KINDS = ['action', 'project', 'someday', 'reference', 'trash'];
const DRAFT_ROUTES = ['next', 'waiting', 'calendar', 'done'];

/** A proposed Clarify decision on an inbox item (MCP §3.4); `null` removes it. Never applied on its own. */
export function setDraft(itemId: string, draft: DraftInput | null): void {
  const item = getItem(itemId);
  check(item?.status === 'inbox', `item ${itemId} is not in the inbox`, 'draft');
  if (draft) {
    const s = store.getState();
    check(draft.reason?.trim(), 'a draft needs a reason', 'draft');
    check(draft.reason.length <= 280, 'a reason is one line (≤ 280 characters)', 'draft');
    check(DRAFT_KINDS.includes(draft.kind), `unknown kind ${draft.kind}`, 'draft');
    check(draft.kind !== 'project' || (draft.project && 'newTitle' in draft.project && draft.project.newTitle.trim()), 'a project draft needs project.newTitle', 'draft');
    const p = draft.project;
    if (p && 'id' in p) {
      const project = getProject(p.id);
      check(project && project.status !== 'completed', `unknown project ${p.id}`, 'draft');
      if (draft.next) check(project.status === 'active', `project "${project.title}" is on hold — a next action needs it active`, 'draft');
    }
    if (draft.route !== undefined) check(DRAFT_ROUTES.includes(draft.route), `unknown route ${draft.route}`, 'draft');
    if (draft.context !== undefined) check(s.contexts.includes(draft.context), `unknown context ${draft.context}`, 'draft');
    if (draft.priority !== undefined) check(['A', 'B', 'C'].includes(draft.priority), `unknown priority ${draft.priority}`, 'draft');
    if (draft.time !== undefined) check([15, 30, 60, 120].includes(draft.time), `unknown time ${draft.time}`, 'draft');
    if (draft.energy !== undefined) check(['focus', 'normal', 'low'].includes(draft.energy), `unknown energy ${draft.energy}`, 'draft');
    for (const f of ['deadline', 'followUp', 'day'] as const) {
      if (draft[f] !== undefined) check(ISO_DATE.test(draft[f]!), `${f === 'followUp' ? 'follow-up' : f} is not an ISO date`, 'draft');
    }
  }
  store.update((s) => {
    const it = s.items.find((i) => i.id === itemId)!;
    if (draft) it.draft = { ...structuredClone(draft), reason: draft.reason.trim(), by: actorLabel(currentActor()), at: now().toISOString() };
    else delete it.draft;
  });
}
```

In `clarify()`, in **both** `store.update` bodies right after the item is looked up (`const item = s.items.find((i) => i.id === itemId)!;`), add `delete item.draft;`. In `trash()`, inside the loop where `item.status = 'trash'` is set, add `delete item.draft;`.

Note: `actorLabel(currentActor())` gives "you" for the app itself and the client's name for a client.

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run src/lib/drafts.test.ts && pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS (both store projects).

- [ ] **Step 7: Commit**

```bash
git add src/lib/model.ts src/lib/store src/lib/activity.ts src/lib/api.ts src/lib/drafts.test.ts drizzle
git commit -m "feat(mcp-2): drafts on inbox items — setDraft, stored, logged, cleared when filed"
```

---

### Task 8: Clarify opens a draft; the inbox marks drafted items

**Files:**
- Modify: `src/app/clarify/page.tsx`, `src/components/clarify/ClarifyForm.tsx`, `src/app/inbox/page.tsx`, `src/components/inbox/InboxList.tsx`, `src/components/inbox/PhoneInbox.tsx`

**Interfaces:**
- Consumes: `Item.draft`, `Draft` (Task 7); `PickerProject` list already passed to `ClarifyForm`.

- [ ] **Step 1: Pass the draft** — `src/app/clarify/page.tsx`, in the `item={{ … }}` object: `draft: item.draft,`. `ClarifyItem` (ClarifyForm.tsx) gains `/** A proposed decision (MCP §3.4): the form starts from it. */ draft?: Draft;` (import `Draft` from `@/lib/model`).

- [ ] **Step 2: Initial state from the draft** — in `ClarifyForm`, right after the existing `const carried = projects.find(…)` line and before the `useState` calls that follow, compute what the form starts with; then use these values as the initial states (replace the existing initialisers named here):

```tsx
  const d = item.draft;
  // A draft's project only if it still exists (it may have been completed since).
  const draftProject: Picked = !d?.project
    ? null
    : 'newTitle' in d.project
      ? { newTitle: d.project.newTitle }
      : (() => {
          const p = projects.find((x) => x.id === (d.project as { id: string }).id);
          return p ? { id: p.id, title: p.title, nextActions: p.nextActions, active: p.active } : null;
        })();
  const startPicked: Picked = draftProject ?? (carried ? { id: carried.id, title: carried.title, nextActions: carried.nextActions, active: carried.active } : null);
  const startAnswer: Answer | null = !d ? null : d.kind === 'action' || d.kind === 'project' ? 'yes' : d.kind;
```

- `answer`: `useState<Answer | null>(startAnswer)`
- `text`: `useState(d?.text ?? item.text)`
- `picked`: `useState<Picked>(startPicked)` (replaces the carried-only initialiser)
- `asNext`: `useState(d?.next ?? (startPicked && 'id' in startPicked ? startPicked.active && startPicked.nextActions === 0 : true))`
- `routeTo`: `useState<RouteTo | null>(d?.route ?? (item.day ? 'calendar' : null))`
- `context`: `useState(d?.context && contexts.includes(d.context) ? d.context : (item.context ?? contexts[0]))`
- `priority`: `useState<Priority>(d?.priority ?? item.priority ?? 'B')`
- `time`: `useState<TimeBucket>(d?.time ?? 30)`
- `energy`: `useState<Energy>(d?.energy ?? 'normal')`
- `deadline`: `useState(d?.deadline ?? '')`
- `day`: `useState(d?.day ?? item.day ?? '')`
- `who`: `useState(d?.who ?? '')`
- `followUp`: `useState(d?.followUp ?? '')`

- [ ] **Step 3: Show who drafted it** — in the item card, after the reference block (before `</Card>`):

```tsx
          {item.draft && (
            <p className="m-0 font-mono text-meta text-accent">
              drafted by {item.draft.by} · {item.draft.reason}
            </p>
          )}
```

- [ ] **Step 4: Mark drafted items in the inbox** — `src/app/inbox/page.tsx` rows: `drafted: !!i.draft,`. `InboxRow` gains `drafted: boolean;`. In `InboxList.tsx`, after `{r.tags.map(…)}` inside the text cell: `{r.drafted && <Tag variant="accent">draft</Tag>}`; in `PhoneInbox.tsx`, after `<span>{r.text}</span>`: `{r.drafted && <span className="font-mono text-meta text-accent">draft ready</span>}`. Check `Tag`'s variants first (`src/components/ui/Tag.tsx`); if there is no `accent` variant, use the default `Tag` — do not add a variant (AGENTS.md: prefer existing primitives).

- [ ] **Step 5: Build and check in the browser**

Run: `pnpm lint && pnpm typecheck && pnpm test && STORE=memory CAL_WORK_URL= CAPTURE_MAIL_HOST= pnpm build`

Then, with a scratch database `D=<scratchpad>/drafts.db` (never `data/gtd.db`):

```bash
DATABASE_FILE=$D pnpm db:seed                    # demo data into the scratch file (creates and migrates it)
DATABASE_FILE=$D STORE=sqlite pnpm exec tsx -e "
  const api = await import('./src/lib/api.ts');
  api.setDraft('i1', { kind: 'action', text: 'Call the dentist about the corrected invoice', route: 'next', context: '@calls', priority: 'B', time: 15, energy: 'low', reason: 'a two-minute call' });
  api.setDraft('i2', { kind: 'project', text: 'Measure the alcove', project: { newTitle: 'Studio shelves built' }, reason: 'more than one step' });
  api.setDraft('i4', { kind: 'action', text: 'Note it for the blog', project: { id: 'p-blog' }, next: false, reason: 'belongs to the blog post' });
  api.completeProject('p-blog');"
```

(If `completeProject` refuses because p-blog has open steps, use `api.moveProjectToSomeday('p-blog')` and `api.dropProject('p-blog')` instead — the point is that the drafted project is no longer pickable.) Start the built server on `$D` (`STORE=sqlite DATABASE_FILE=$D CAL_WORK_URL= CAPTURE_MAIL_HOST= PORT=3110 node .next/standalone/server.js` after copying `.next/static` and `public` into `.next/standalone`) and check with playwright-core:

1. /inbox shows the draft marker on i1, i2 and i4 only.
2. /clarify?item=i1 opens with Yes pressed, the rewritten outcome, Defer → Next Actions with @calls · B · 15m · low, and "drafted by you · a two-minute call" (the script ran without a client scope).
3. *File it and next* files i1; /next lists it, and it is no longer in /inbox (its draft went with it).
4. /clarify?item=i2 opens with "+ New project: Studio shelves built" picked and the next-action box ticked.
5. /clarify?item=i4 opens with an empty project pick (p-blog is no longer pickable) and no console error.

Expected: as described. Delete `$D` (and `$D-wal`, `$D-shm`) afterwards.

- [ ] **Step 6: Commit**

```bash
git add src/app/clarify/page.tsx src/components/clarify/ClarifyForm.tsx src/app/inbox/page.tsx src/components/inbox/InboxList.tsx src/components/inbox/PhoneInbox.tsx
git commit -m "feat(mcp-2): Clarify opens an item's draft; drafted items are marked in the inbox"
```

---

### Task 9: Docs — SPEC, the design (Go binary), stage check

**Files:**
- Modify: `docs/handoff/SPEC.md`, `docs/superpowers/specs/2026-10-01-mcp-tools-design.md`

- [ ] **Step 1: SPEC**
- §3.2 Clarify: a bullet "Drafts (§3.12, MCP): an inbox item may carry one draft from a client — the decision prefilled, 'drafted by <client> · <reason>' under the item; filing it works as always, any change by the human wins; the draft goes when the item is filed or trashed. The inbox marks drafted items."
- §3.5 Waiting For: "the who and the follow-up date can be changed (api `editWaiting`; on screen as before)".
- §5 `Item`: `draft?: Draft` and the `Draft` interface from Task 7.
- §3.12 Activity: drafts appear as "Drafted “…”" / "Removed the draft of “…”".

- [ ] **Step 2: The design doc** — `docs/superpowers/specs/2026-10-01-mcp-tools-design.md` §2: the binary is **written in Go**: one static binary per OS/architecture, no Node needed on the machines that run an agent; built with the official Go MCP SDK; it fetches `/api/v1/tools` and forwards calls. In §5.1/§5.3/§5.5/§5.7 remove the ✦ from `get_overview`, `find_free_time`, `file`, `edit_waiting`, `prepare_weekly_review`, `draft_clarification` (they now exist in the app) and add a line under §4: "✦ marks what Stage 1–2 have not built yet."

- [ ] **Step 3: Stage check**

Run: `pnpm lint && pnpm typecheck && pnpm test && STORE=memory CAL_WORK_URL= CAPTURE_MAIL_HOST= pnpm build && pnpm smoke`
Expected: all pass; `rg '#[0-9a-f]{6}' src --glob '!**/tokens.css'` empty.

- [ ] **Step 4: Commit**

```bash
git add docs/handoff/SPEC.md docs/superpowers/specs/2026-10-01-mcp-tools-design.md
git commit -m "docs(mcp-2): drafts, file and editWaiting in SPEC; the MCP binary is Go"
```

---

## Roadmap after this stage

**Stage 3 — REST API `/api/v1`.** A tool registry (name, description, JSON schema, capability) served at `GET /api/v1/tools`; one route that dispatches a tool call (`POST /api/v1/tools/<name>`) with bearer auth (`authenticate` + `can`), the actor set with `runAs`, every write answered with its activity entry id, refusals passed through with their reason; `/api/capture` stays. OPERATIONS: the Authelia bypass for `/api/v1/*`.

**Stage 4 — The Go MCP binary and the workflows.** `cmd/gtd-mcp` in Go with the official Go MCP SDK: reads `GTD_URL` and `GTD_TOKEN`, fetches `/api/v1/tools`, registers each tool, forwards calls; the seven guided workflows as MCP prompts; release binaries for macOS (arm64, amd64) and Linux (amd64, arm64); setup notes for Claude Desktop, Claude Code, Codex and a server-side agent.
