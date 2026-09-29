// The only module the UI imports. Reads return store data plus derived values;
// nothing derived is ever written back to the store.
import { parse } from './capture-syntax';
import type { Energy, Item, Priority, Project, Source, TimeBucket } from './model';
import { store } from './store/memory';
import { sameTitle } from './titles';

const DAY_MS = 86_400_000;

/** The seed's pinned date outside production; `undefined` means the real clock. Delete to unpin. */
const PINNED_DAY = process.env.NODE_ENV !== 'production' ? store.getState().today : undefined;

/**
 * The one clock. Everything time-dependent (ages, "today", focus, review due) reads this,
 * never `new Date()`. Pinned: the real time of day on the seed's date.
 */
export function now(): Date {
  const real = new Date();
  if (!PINNED_DAY) return real;
  const d = new Date(`${PINNED_DAY}T00:00:00`);
  d.setHours(real.getHours(), real.getMinutes(), real.getSeconds(), real.getMilliseconds());
  return d;
}

/** Today as a local ISO date (yyyy-mm-dd), from `now()`. */
export function today(): string {
  const d = now();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const byNewest = (a: Item, b: Item) => b.capturedAt.localeCompare(a.capturedAt);

export function listInbox(): Item[] {
  return store.getState().items.filter((i) => i.status === 'inbox').sort(byNewest);
}

export function listNext(): Item[] {
  return store.getState().items.filter((i) => i.status === 'next');
}

export function listProjects(status: Project['status'] = 'active'): Project[] {
  return store.getState().projects.filter((p) => p.status === status);
}

/** Stalled = active project with zero next actions (waiting-for does not count). */
export function projectStalled(project: Project): boolean {
  return project.status === 'active' && !listNext().some((i) => i.projectId === project.id);
}

/** Whole hours since capture. */
export function ageHours(item: Item): number {
  return Math.max(0, Math.floor((now().getTime() - Date.parse(item.capturedAt)) / 3_600_000));
}

/** Whole days since capture. */
export function ageDays(item: Item): number {
  return Math.floor(ageHours(item) / 24);
}

export type ReviewBadge = 'due' | 'in progress' | null;

/** Open run → in progress; no finished run in the last 7 days → due. */
export function reviewBadge(): ReviewBadge {
  const run = store.getState().reviewRun;
  if (run && !run.finishedAt && !run.outcome) return 'in progress';
  if (!run?.finishedAt) return 'due';
  return now().getTime() - Date.parse(run.finishedAt) >= 7 * DAY_MS ? 'due' : null;
}

export interface NavCounts {
  inbox: number;
  inboxAging: boolean; // any inbox item ≥ 3 d old
  next: number;
  calendar: number;
  waiting: number;
  projects: number;
  someday: number;
}

export function navCounts(): NavCounts {
  const { items } = store.getState();
  const count = (status: Item['status']) => items.filter((i) => i.status === status).length;
  const inbox = listInbox();
  return {
    inbox: inbox.length,
    inboxAging: inbox.some((i) => ageDays(i) >= 3),
    next: count('next'),
    calendar: count('calendar'),
    waiting: count('waiting'),
    projects: listProjects().length,
    someday: count('someday'),
  };
}

/**
 * Capture one line into the inbox. Never asks, never throws on input. Shorthand is parsed
 * best-effort; a `^date` is kept as `day` for Clarify to offer, not as a hard deadline.
 */
export function capture(line: string, source: Source = 'typed'): Item | null {
  if (!line.trim()) return null;
  const { text, tags, context, priority, date } = parse(line, today(), store.getState().contexts);
  const item: Item = {
    id: crypto.randomUUID(),
    text: text || line.trim(),
    captured: line,
    source,
    capturedAt: now().toISOString(),
    status: 'inbox',
    tags,
    ...(context && { context }),
    ...(priority && { priority }),
    ...(date && { day: date }),
  };
  store.update((s) => {
    s.items.push(item);
  });
  return item;
}

const TRASH_KEEP_DAYS = 30;

/**
 * Trash is a status, not a delete: items stay in the store until the weekly review empties
 * the trash or they have been there 30 days. Returns what moved, with the old status, for undo.
 */
export function trash(ids: string[]): { id: string; status: Item['status'] }[] {
  const moved: { id: string; status: Item['status'] }[] = [];
  const at = now().toISOString();
  store.update((s) => {
    for (const item of s.items) {
      if (ids.includes(item.id) && item.status !== 'trash') {
        moved.push({ id: item.id, status: item.status });
        item.status = 'trash';
        item.trashedAt = at;
      }
    }
  });
  purgeTrash(TRASH_KEEP_DAYS);
  return moved;
}

/** Undo for `trash`: put each item back to the status it had. Items no longer in trash are left alone. */
export function untrash(entries: { id: string; status: Item['status'] }[]): void {
  store.update((s) => {
    for (const { id, status } of entries) {
      const item = s.items.find((i) => i.id === id);
      if (item?.status === 'trash') {
        item.status = status;
        delete item.trashedAt;
      }
    }
  });
}

/**
 * Delete trashed items for good: all of them (the weekly review's implicit last step), or only
 * those trashed at least `olderThanDays` ago. Returns how many were removed.
 */
export function purgeTrash(olderThanDays?: number): number {
  const cutoff = olderThanDays === undefined ? undefined : now().getTime() - olderThanDays * DAY_MS;
  const purge = (i: Item) =>
    i.status === 'trash' && (cutoff === undefined || (!!i.trashedAt && Date.parse(i.trashedAt) <= cutoff));
  const count = store.getState().items.filter(purge).length;
  if (count) {
    store.update((s) => {
      s.items = s.items.filter((i) => !purge(i));
    });
  }
  return count;
}

// ── Clarify ────────────────────────────────────────────────────────────────

/** Inbox in processing order: oldest first. */
export function listInboxQueue(): Item[] {
  return listInbox().reverse();
}

export function getItem(id: string): Item | undefined {
  return store.getState().items.find((i) => i.id === id);
}

export function listContexts(): string[] {
  return store.getState().contexts;
}

/** Count of next actions in a project. */
export function nextActionCount(projectId: string): number {
  return listNext().filter((i) => i.projectId === projectId).length;
}

/** Step 3: an existing project, or a new one with this title. */
export type ProjectChoice = { id: string } | { newTitle: string };

/** Step 4 for a next action or a single action. */
export type Route =
  | { to: 'done' }
  | { to: 'waiting'; who: string; followUp?: string }
  | { to: 'next'; context: string; priority: Priority; time: TimeBucket; energy: Energy; deadline?: string }
  | { to: 'calendar'; day: string; start?: string; end?: string }; // start/end as `hh:mm`

/** Every way an inbox item can leave Clarify. */
export type Decision =
  /** Step 1 answered "No". */
  | { kind: 'trash' }
  | { kind: 'someday' }
  | { kind: 'reference' }
  /** Actionable, in a project, not its next action: a later step; step 4 is skipped. */
  | { kind: 'later'; text: string; project: ProjectChoice }
  /** Actionable: a single action (no project) or one more next action of the project. */
  | { kind: 'action'; text: string; project?: ProjectChoice; route: Route };

export interface ClarifyResult {
  itemId: string;
  /** Set when the decision put the item into a project. */
  projectId?: string;
  projectCreated: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM = /^\d{2}:\d{2}$/;

/** The next running number inside a priority; C carries none. */
function nextPriorityNo(items: Item[], priority: Priority): number | undefined {
  if (priority === 'C') return undefined;
  const nos = items.filter((i) => i.status === 'next' && i.priority === priority).map((i) => i.priorityNo ?? 0);
  return Math.max(0, ...nos) + 1;
}

/** File as a later step, without what only a next action carries (SPEC §3.4). */
function toLater(item: Item) {
  item.status = 'later';
  delete item.context;
  delete item.priority;
  delete item.priorityNo;
  delete item.time;
  delete item.energy;
  delete item.focusOn;
}

function check(ok: unknown, message: string, scope = 'clarify'): asserts ok {
  if (!ok) throw new Error(`${scope}: ${message}`);
}

/** Refuse an empty title or one an open project already has (no two open projects share a title). */
function checkNewTitle(state: Readonly<{ projects: Project[] }>, title: string, scope?: string) {
  check(title.trim(), 'new project title is empty', scope);
  const twin = state.projects.find((p) => p.status !== 'completed' && sameTitle(p.title, title));
  check(!twin, `project "${twin?.title}" already exists`, scope);
}

/** Create an active project in `s` and return its id. */
function addProject(s: { projects: Project[] }, title: string, from?: Project['createdFrom']): string {
  const id = `p-${crypto.randomUUID()}`;
  s.projects.push({ id, title: title.trim(), status: 'active', notes: '', createdAt: now().toISOString(), ...(from && { createdFrom: from }) });
  return id;
}

/**
 * Commit one Clarify decision atomically: validates everything first, then creates the project
 * if new and files the item. A new next action is added beside the project's existing ones;
 * Clarify never demotes anything (next ↔ later is set on Projects, SPEC §4).
 */
export function clarify(itemId: string, decision: Decision): ClarifyResult {
  const state = store.getState();
  const current = state.items.find((i) => i.id === itemId);
  check(current?.status === 'inbox', `item ${itemId} is not in the inbox`);

  if (decision.kind === 'trash' || decision.kind === 'someday' || decision.kind === 'reference') {
    store.update((s) => {
      const item = s.items.find((i) => i.id === itemId)!;
      item.status = decision.kind;
      if (decision.kind === 'trash') item.trashedAt = now().toISOString();
    });
    return { itemId, projectCreated: false };
  }

  const text = decision.text.trim();
  check(text, 'text is empty');
  const choice = decision.project;
  if (choice && 'id' in choice) {
    check(state.projects.some((p) => p.id === choice.id), `unknown project ${choice.id}`);
  }
  if (choice && 'newTitle' in choice) checkNewTitle(state, choice.newTitle);
  const route = decision.kind === 'action' ? decision.route : undefined;
  if (route?.to === 'waiting') {
    check(route.who.trim(), 'waiting for whom is empty');
    check(!route.followUp || ISO_DATE.test(route.followUp), 'follow-up is not an ISO date');
  }
  if (route?.to === 'next') {
    check(state.contexts.includes(route.context), `unknown context ${route.context}`);
    check(!route.deadline || ISO_DATE.test(route.deadline), 'deadline is not an ISO date');
  }
  if (route?.to === 'calendar') {
    check(ISO_DATE.test(route.day), 'calendar day is not an ISO date');
    check(!route.start === !route.end, 'time needs both from and to');
    check(!route.start || (HH_MM.test(route.start) && HH_MM.test(route.end!) && route.start < route.end!), 'time is not a valid from–to');
  }

  const result: ClarifyResult = { itemId, projectCreated: false };
  store.update((s) => {
    let projectId: string | undefined;
    if (choice && 'newTitle' in choice) {
      projectId = addProject(s, choice.newTitle, 'inbox');
      result.projectCreated = true;
    } else if (choice) {
      projectId = choice.id;
    }
    result.projectId = projectId;

    const item = s.items.find((i) => i.id === itemId)!;
    item.text = text;
    if (projectId) item.projectId = projectId;
    // The `^date` from capture was only an offer; Clarify decides where a day belongs.
    delete item.day;

    if (!route) {
      toLater(item);
      return;
    }
    switch (route.to) {
      case 'done':
        item.status = 'done';
        item.doneAt = now().toISOString();
        break;
      case 'waiting':
        item.status = 'waiting';
        item.waiting = { who: route.who.trim(), since: today(), ...(route.followUp && { followUp: route.followUp }) };
        break;
      case 'calendar':
        item.status = 'calendar';
        item.day = route.day;
        if (route.start && route.end) {
          item.timeSlot = { start: `${route.day}T${route.start}`, end: `${route.day}T${route.end}` };
        }
        break;
      case 'next': {
        item.status = 'next';
        item.context = route.context;
        item.priority = route.priority;
        item.time = route.time;
        item.energy = route.energy;
        const no = nextPriorityNo(s.items, route.priority);
        if (no === undefined) delete item.priorityNo;
        else item.priorityNo = no;
        if (route.deadline) item.deadline = route.deadline;
        break;
      }
    }
    // Only a next action keeps the planning fields from capture.
    if (route.to !== 'next') {
      delete item.context;
      delete item.priority;
    }
    renumberIn(s.items);
  });
  return result;
}

// ── Similar items ──────────────────────────────────────────────────────────

const STOPWORDS = new Set(
  'about after again also from have into just more need only over some than that them then there these they this what when where which will with your fwd'.split(' '),
);

/** Lower-case words of four letters or more, minus filler. */
function significantWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/\p{L}[\p{L}\p{N}'-]*/gu) ?? [];
  return new Set(words.filter((w) => w.length >= 4 && !STOPWORDS.has(w)));
}

export type Similar =
  | { kind: 'project'; id: string; title: string }
  | { kind: 'item'; id: string; title: string; status: Item['status']; context?: string };

/** Up to `limit` projects and filed items sharing ≥ 2 significant words with `text`, best first. */
export function similar(text: string, excludeId?: string, limit = 3): Similar[] {
  const words = significantWords(text);
  const shared = (other: string) => [...significantWords(other)].filter((w) => words.has(w)).length;
  const { projects, items } = store.getState();
  const found: { entry: Similar; score: number }[] = [
    ...projects
      .filter((p) => p.status !== 'completed')
      .map((p) => ({ entry: { kind: 'project' as const, id: p.id, title: p.title }, score: shared(p.title) })),
    ...items
      .filter((i) => i.id !== excludeId && i.status !== 'inbox' && i.status !== 'trash')
      .map((i) => ({
        entry: { kind: 'item' as const, id: i.id, title: i.text, status: i.status, context: i.context },
        score: shared(i.text),
      })),
  ];
  return found
    .filter((f) => f.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((f) => f.entry);
}

// ── Next Actions ───────────────────────────────────────────────────────────

/**
 * Close the gaps in the running numbers: A1, A2… and B1, B2… across the whole list, in their
 * current order (numberless ones last). C and everything that is not a next action carry none.
 */
function renumberIn(items: Item[]) {
  for (const priority of ['A', 'B'] as const) {
    items
      .filter((i) => i.status === 'next' && i.priority === priority)
      .sort((a, b) => (a.priorityNo ?? Infinity) - (b.priorityNo ?? Infinity) || a.capturedAt.localeCompare(b.capturedAt))
      .forEach((i, n) => {
        i.priorityNo = n + 1;
      });
  }
  for (const i of items) {
    if (i.status !== 'next' || i.priority === 'C' || !i.priority) delete i.priorityNo;
  }
}

/** Recompute the priority numbers. Every api change that touches next actions does this itself. */
export function renumber(): void {
  store.update((s) => renumberIn(s.items));
}

/** A star counts only on the day it was set for; older ones are ignored ("clears at midnight"). */
export function isFocused(item: Item, day = today()): boolean {
  return item.focusOn === day;
}

/** Set or clear the focus star of a next action for `day`. Returns whether it is now starred. */
export function toggleFocus(id: string, day = today()): boolean {
  const item = getItem(id);
  check(item?.status === 'next', `item ${id} is not a next action`, 'focus');
  const on = !isFocused(item, day);
  store.update((s) => {
    const it = s.items.find((i) => i.id === id)!;
    if (on) it.focusOn = day;
    else delete it.focusOn;
  });
  return on;
}

/** Everything starred for today, done ones first (by when they were done), then by priority. */
export function focusToday(): Item[] {
  const rank = (i: Item) => `${i.priority ?? 'D'}${String(i.priorityNo ?? 999).padStart(3, '0')}`;
  return store
    .getState()
    .items.filter((i) => (i.status === 'next' || i.status === 'done') && isFocused(i))
    .sort((a, b) =>
      a.status !== b.status
        ? a.status === 'done' ? -1 : 1
        : a.status === 'done'
          ? (a.doneAt ?? '').localeCompare(b.doneAt ?? '')
          : rank(a).localeCompare(rank(b)),
    );
}

/** What `uncomplete` needs to put a completed action back where it was. */
export interface Completed {
  id: string;
  status: Item['status'];
  priorityNo?: number;
}

/** Mark a next action (or a day-specific calendar action) done. A project may become stalled. */
export function complete(id: string): Completed {
  const item = getItem(id);
  check(item?.status === 'next' || item?.status === 'calendar', `item ${id} cannot be completed`, 'complete');
  const undo: Completed = { id, status: item.status, ...(item.priorityNo && { priorityNo: item.priorityNo }) };
  store.update((s) => {
    const it = s.items.find((i) => i.id === id)!;
    it.status = 'done';
    it.doneAt = now().toISOString();
    renumberIn(s.items);
  });
  return undo;
}

/** Undo for `complete`: back to its list, back to its old number. Left alone if no longer done. */
export function uncomplete(done: Completed): void {
  store.update((s) => {
    const it = s.items.find((i) => i.id === done.id);
    if (it?.status !== 'done') return;
    it.status = done.status;
    delete it.doneAt;
    // Half a step ahead of whoever took its number meanwhile; renumbering makes it whole again.
    if (done.priorityNo) it.priorityNo = done.priorityNo - 0.5;
    renumberIn(s.items);
  });
}

/**
 * Unticking a done item in the Focus card: back to Next Actions, still starred, numbered last
 * within its priority. (The footer undo uses `uncomplete` instead, which keeps the old number.)
 */
export function reopen(id: string): void {
  const item = getItem(id);
  check(item?.status === 'done', `item ${id} is not done`, 'reopen');
  store.update((s) => {
    const it = s.items.find((i) => i.id === id)!;
    it.status = 'next';
    delete it.doneAt;
    renumberIn(s.items);
  });
}

/** Inline edit on Next Actions: text, context, project (`null` = single action). */
export interface NextEdit {
  text?: string;
  context?: string;
  project?: ProjectChoice | null;
}

/** Apply an inline edit to a next action. A project named by a new title is created. */
export function editNext(id: string, edit: NextEdit): { projectId?: string } {
  const state = store.getState();
  const item = state.items.find((i) => i.id === id);
  check(item?.status === 'next', `item ${id} is not a next action`, 'edit');
  if (edit.text !== undefined) check(edit.text.trim(), 'text is empty', 'edit');
  if (edit.context !== undefined) check(state.contexts.includes(edit.context), `unknown context ${edit.context}`, 'edit');
  const choice = edit.project;
  if (choice && 'id' in choice) check(state.projects.some((p) => p.id === choice.id), `unknown project ${choice.id}`, 'edit');
  if (choice && 'newTitle' in choice) checkNewTitle(state, choice.newTitle, 'edit');

  let projectId = item.projectId;
  store.update((s) => {
    const it = s.items.find((i) => i.id === id)!;
    if (edit.text !== undefined) it.text = edit.text.trim();
    if (edit.context !== undefined) it.context = edit.context;
    if (choice === null) {
      delete it.projectId;
      projectId = undefined;
    } else if (choice) {
      projectId = 'id' in choice ? choice.id : addProject(s, choice.newTitle);
      it.projectId = projectId;
    }
    renumberIn(s.items);
  });
  return projectId ? { projectId } : {};
}

/** Projects the picker can offer (active first, then someday), with their next-action counts. */
export function listPickerProjects() {
  return listProjects('active')
    .concat(listProjects('someday'))
    .map((p) => ({ id: p.id, title: p.title, active: p.status === 'active', nextActions: nextActionCount(p.id) }));
}

/** One entry of today's hard landscape (SPEC §3.6). */
export interface LandscapeEntry {
  id: string;
  kind: 'appointment' | 'block' | 'day-action' | 'tickler' | 'deadline';
  /** `hh:mm`; absent = all day. */
  time?: string;
  text: string;
  /** Also a hard deadline due that day. */
  deadline: boolean;
  done: boolean;
}

/**
 * The hard landscape of one day: external appointments, time blocks, day-specific actions and
 * information, and hard deadlines due that day. Timed entries first, by time; then all-day ones.
 */
export function todayLandscape(day = today()): LandscapeEntry[] {
  const { items, projects, externalEvents, tickler } = store.getState();
  const entries: LandscapeEntry[] = [];
  for (const e of externalEvents) {
    if (e.start.slice(0, 10) !== day) continue;
    entries.push({ id: e.id, kind: 'appointment', ...(!e.allDay && { time: e.start.slice(11, 16) }), text: e.title, deadline: false, done: false });
  }
  for (const i of items) {
    if (i.status === 'trash') continue;
    const onDay = i.day === day && (i.status === 'calendar' || i.status === 'done');
    if (onDay) {
      entries.push({
        id: i.id,
        kind: i.timeSlot ? 'block' : 'day-action',
        ...(i.timeSlot && { time: i.timeSlot.start.slice(11, 16) }),
        text: i.text,
        deadline: i.deadline === day,
        done: i.status === 'done',
      });
    } else if (i.deadline === day && i.status !== 'done') {
      entries.push({ id: i.id, kind: 'deadline', text: i.text, deadline: true, done: false });
    }
  }
  for (const [n, t] of tickler.entries()) {
    if (t.day === day) entries.push({ id: `tickler-${n}`, kind: 'tickler', text: t.text, deadline: false, done: false });
  }
  for (const p of projects) {
    if (p.status === 'active' && p.deadline === day) entries.push({ id: p.id, kind: 'deadline', text: p.title, deadline: true, done: false });
  }
  return entries.sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'));
}

export interface Health {
  /** Active projects with no next action. */
  stalled: number;
  /** Waiting-for items whose follow-up date has passed. */
  waitingOverdue: number;
  /** Next actions captured more than 30 days ago. */
  oldActions: number;
}

export function health(): Health {
  const day = today();
  const { items } = store.getState();
  return {
    stalled: listProjects().filter(projectStalled).length,
    waitingOverdue: items.filter((i) => isOverdue(i, day)).length,
    oldActions: listNext().filter((i) => ageDays(i) > 30).length,
  };
}

// ── Projects ───────────────────────────────────────────────────────────────

export function getProject(id: string): Project | undefined {
  return store.getState().projects.find((p) => p.id === id);
}

/** "work" / "home" from the store's area map; `undefined` when the area is not mapped. */
export function projectKind(project: Project): 'work' | 'home' | undefined {
  return project.area ? store.getState().areaKinds[project.area] : undefined;
}

/** All items of a project, any status. */
export function projectItems(projectId: string): Item[] {
  return store.getState().items.filter((i) => i.projectId === projectId);
}

/** Next actions and later steps still open in a project: what blocks completing it. */
export function openInProject(projectId: string): number {
  return projectItems(projectId).filter((i) => i.status === 'next' || i.status === 'later').length;
}

/** Step-4 fields a next action carries (SPEC §3.2, Defer → Next Actions). */
export interface NextFields {
  context: string;
  priority: Priority;
  time: TimeBucket;
  energy: Energy;
}

function checkFields(fields: NextFields, scope: string) {
  check(store.getState().contexts.includes(fields.context), `unknown context ${fields.context}`, scope);
  check(['A', 'B', 'C'].includes(fields.priority), `unknown priority ${fields.priority}`, scope);
  check([15, 30, 60, 120].includes(fields.time), `unknown time ${fields.time}`, scope);
  check(['focus', 'normal', 'low'].includes(fields.energy), `unknown energy ${fields.energy}`, scope);
}

function applyFields(items: Item[], item: Item, fields: NextFields) {
  item.status = 'next';
  item.context = fields.context;
  item.priority = fields.priority;
  item.time = fields.time;
  item.energy = fields.energy;
  const no = nextPriorityNo(items, fields.priority);
  if (no === undefined) delete item.priorityNo;
  else item.priorityNo = no;
}

/** Next action → later step. Drops context/priority/time/energy/focus; may stall the project. */
export function demote(id: string): void {
  check(getItem(id)?.status === 'next', `item ${id} is not a next action`, 'demote');
  store.update((s) => {
    toLater(s.items.find((i) => i.id === id)!);
    renumberIn(s.items);
  });
}

/** Later step → next action, with the step-4 fields asked again. Numbered last in its priority. */
export function promote(id: string, fields: NextFields): void {
  check(getItem(id)?.status === 'later', `item ${id} is not a later step`, 'promote');
  checkFields(fields, 'promote');
  store.update((s) => {
    applyFields(s.items, s.items.find((i) => i.id === id)!, fields);
    renumberIn(s.items);
  });
}

function newProjectItem(projectId: string, text: string, scope: string): Item {
  check(getProject(projectId), `unknown project ${projectId}`, scope);
  check(text.trim(), 'text is empty', scope);
  return { id: crypto.randomUUID(), text: text.trim(), captured: text.trim(), source: 'typed', capturedAt: now().toISOString(), status: 'later', projectId, tags: [] };
}

/** "+ action" on a project: a new next action of it. */
export function addAction(projectId: string, text: string, fields: NextFields): Item {
  const item = newProjectItem(projectId, text, 'addAction');
  checkFields(fields, 'addAction');
  store.update((s) => {
    s.items.push(item);
    applyFields(s.items, item, fields);
    renumberIn(s.items);
  });
  return item;
}

/** "+ step" on a project: a new later step of it. */
export function addStep(projectId: string, text: string): Item {
  const item = newProjectItem(projectId, text, 'addStep');
  store.update((s) => {
    s.items.push(item);
  });
  return item;
}

/** Complete a project. Refused while it has open next actions or later steps (never auto-fixed). */
export function completeProject(id: string): void {
  check(getProject(id)?.status === 'active', `project ${id} is not active`, 'completeProject');
  const open = openInProject(id);
  check(open === 0, `${open} open — finish, demote or drop them first`, 'completeProject');
  store.update((s) => {
    s.projects.find((p) => p.id === id)!.status = 'completed';
  });
}

/** Park a project: its next actions become later steps, so nothing of it stays on Next Actions. */
export function moveProjectToSomeday(id: string): void {
  check(getProject(id)?.status === 'active', `project ${id} is not active`, 'moveProjectToSomeday');
  store.update((s) => {
    s.projects.find((p) => p.id === id)!.status = 'someday';
    for (const i of s.items) if (i.projectId === id && i.status === 'next') toLater(i);
    renumberIn(s.items);
  });
}

/** Back from someday: active again, and stalled until a step is promoted. */
export function activateProject(id: string): void {
  check(getProject(id)?.status === 'someday', `project ${id} is not someday`, 'activateProject');
  store.update((s) => {
    s.projects.find((p) => p.id === id)!.status = 'active';
  });
}

export type ProjectPatch = Partial<Pick<Project, 'title' | 'successfulWhen' | 'deadline' | 'area' | 'goal' | 'notes'>>;

/** Edit a project's own fields. Empty optional fields are removed; the title must stay unique. */
export function updateProject(id: string, patch: ProjectPatch): void {
  const state = store.getState();
  check(state.projects.some((p) => p.id === id), `unknown project ${id}`, 'updateProject');
  if (patch.title !== undefined) {
    check(patch.title.trim(), 'title is empty', 'updateProject');
    const twin = state.projects.find((p) => p.id !== id && p.status !== 'completed' && sameTitle(p.title, patch.title!));
    check(!twin, `project "${twin?.title}" already exists`, 'updateProject');
  }
  if (patch.deadline) check(ISO_DATE.test(patch.deadline), 'deadline is not an ISO date', 'updateProject');
  store.update((s) => {
    const p = s.projects.find((x) => x.id === id)!;
    for (const [key, value] of Object.entries(patch) as [keyof ProjectPatch, string | undefined][]) {
      if (value === undefined) continue;
      const v = key === 'notes' ? value : value.trim();
      if (v || key === 'notes' || key === 'title') p[key] = v;
      else delete p[key];
    }
  });
}

// ── Waiting For and Someday/Maybe ──────────────────────────────────────────

/** Past its follow-up date (a waiting-for without one is never overdue). */
export function isOverdue(item: Item, day = today()): boolean {
  return item.status === 'waiting' && !!item.waiting?.followUp && item.waiting.followUp < day;
}

/** Fixed order (SPEC §3.5): follow-up date ascending, undated last; ties by oldest `since`. */
export function listWaiting(): Item[] {
  const key = (i: Item) => i.waiting?.followUp ?? '9999-99-99';
  return store
    .getState()
    .items.filter((i) => i.status === 'waiting')
    .sort((a, b) => key(a).localeCompare(key(b)) || (a.waiting?.since ?? '').localeCompare(b.waiting?.since ?? ''));
}

/** `day` plus `n` days, as an ISO date. */
function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d + n);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Whoever answers by mail or ticket rather than by phone. */
const WRITES_BACK = /desk|support|committee/i;

/**
 * `f` on a waiting-for: a next action to chase it ("Follow up with <who>: <text>", @calls, or
 * @computer for desks and committees; B, 15 min, low), in the same project. The follow-up date
 * moves to a week from today.
 */
export function followUp(id: string): Item {
  const w = getItem(id);
  check(w?.status === 'waiting' && w.waiting, `item ${id} is not a waiting-for`, 'followUp');
  const who = w.waiting.who;
  const text = `Follow up with ${who}: ${w.text}`;
  const action: Item = {
    id: crypto.randomUUID(),
    text,
    captured: text,
    source: 'typed',
    capturedAt: now().toISOString(),
    status: 'next',
    tags: [],
    ...(w.projectId && { projectId: w.projectId }),
  };
  store.update((s) => {
    s.items.push(action);
    applyFields(s.items, action, { context: WRITES_BACK.test(who) ? '@computer' : '@calls', priority: 'B', time: 15, energy: 'low' });
    s.items.find((i) => i.id === id)!.waiting!.followUp = addDays(today(), 7);
    renumberIn(s.items);
  });
  return action;
}

/**
 * `x` on a waiting-for: it arrived, so it is done. Returns the undo token, and whether its
 * project is now active without a next action (the screen then asks for one).
 */
export function received(id: string): Completed & { askNextFor?: string } {
  const w = getItem(id);
  check(w?.status === 'waiting', `item ${id} is not a waiting-for`, 'received');
  store.update((s) => {
    const it = s.items.find((i) => i.id === id)!;
    it.status = 'done';
    it.doneAt = now().toISOString();
  });
  const project = w.projectId ? getProject(w.projectId) : undefined;
  return { id, status: 'waiting', ...(project && projectStalled(project) && { askNextFor: project.id }) };
}

/** Someday/Maybe in bucket order: the store's buckets first, unknown ones after, then none (""). */
export function listSomeday(): { bucket: string; items: Item[] }[] {
  const items = store.getState().items.filter((i) => i.status === 'someday');
  const order = [...store.getState().buckets];
  for (const i of items) if (!order.includes(i.bucket ?? '')) order.push(i.bucket ?? '');
  return order.map((bucket) => ({ bucket, items: items.filter((i) => (i.bucket ?? '') === bucket) })).filter((g) => g.items.length > 0);
}

export function listBuckets(): string[] {
  return store.getState().buckets;
}

/** Activate a someday item: back into the inbox (text and capture kept) to go through Clarify. */
export function activate(id: string): void {
  check(getItem(id)?.status === 'someday', `item ${id} is not someday`, 'activate');
  store.update((s) => {
    s.items.find((i) => i.id === id)!.status = 'inbox';
  });
}

/** Drop a someday item: to the trash, restorable with `untrash` like any trashed item. */
export function drop(id: string): { id: string; status: Item['status'] }[] {
  check(getItem(id)?.status === 'someday', `item ${id} is not someday`, 'drop');
  return trash([id]);
}

/** Move a someday item to another bucket ("" = none). */
export function setBucket(id: string, bucket: string): void {
  check(getItem(id)?.status === 'someday', `item ${id} is not someday`, 'setBucket');
  check(!bucket || store.getState().buckets.includes(bucket), `unknown bucket ${bucket}`, 'setBucket');
  store.update((s) => {
    const it = s.items.find((i) => i.id === id)!;
    if (bucket) it.bucket = bucket;
    else delete it.bucket;
  });
}

/** Drop a project on hold: completed, flagged as dropped; its later steps stay with it. */
export function dropProject(id: string): void {
  check(getProject(id)?.status === 'someday', `project ${id} is not someday`, 'dropProject');
  store.update((s) => {
    const p = s.projects.find((x) => x.id === id)!;
    p.status = 'completed';
    p.dropped = true;
  });
}

/** Undo for `dropProject`. */
export function undropProject(id: string): void {
  store.update((s) => {
    const p = s.projects.find((x) => x.id === id);
    if (p?.status !== 'completed' || !p.dropped) return;
    p.status = 'someday';
    delete p.dropped;
  });
}
