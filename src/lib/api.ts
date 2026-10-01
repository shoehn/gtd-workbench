// The only module the UI imports. Reads return store data plus derived values;
// nothing derived is ever written back to the store.
import { parse } from './capture-syntax';
import type { Energy, ExternalEvent, Item, Priority, Project, Reference, ReviewCounters, ReviewRun, ReviewTemplate, Settings, Source, Theme, TimeBucket } from './model';
import { instantAt, isTimeZone, wallClock } from './clock';
import { URL_IN_TEXT, guessReference, referenceHost } from './reference';
import { sourcesFromEnv, type CalendarSource } from './calendar/sources';
import { liveLine, measuredNote, type CalendarFigures, type ListFacts, type LiveLine } from './review-notes';
import { baseSeed } from './store/seed';
import { STORE_KIND, createdThisBoot, store } from './store';
import type { ExternalCalendar, MailboxStatus, MailSeen, TicklerEntry } from './store/types';
import { sameTitle } from './titles';
import { addDays, compareStamps, isoWeek, weekDays } from './week';

const DAY_MS = 86_400_000;

/**
 * The demo's pinned date — only in tests and with DEMO_DATE=1 (`pnpm dev:demo`), never in
 * production; everywhere else, including plain `pnpm dev` with real calendars, the real clock.
 */
const pinnedDay = () =>
  process.env.NODE_ENV !== 'production' && (process.env.NODE_ENV === 'test' || process.env.DEMO_DATE === '1')
    ? store.getState().today
    : undefined;

/** The zone "today", midnight and overdue are counted in: Settings.timezone, else the server's TZ. */
export function timeZone(): string | undefined {
  return store.getState().timezone || undefined;
}

/**
 * The one clock. Everything time-dependent (ages, "today", focus, review due) reads this,
 * never `new Date()`. Pinned: the real time of day (in `timeZone()`) on the seed's date.
 */
export function now(): Date {
  const real = new Date();
  const day = pinnedDay();
  if (!day) return real;
  const w = wallClock(real, timeZone());
  return instantAt(day, w.hour, w.minute, w.second, real.getMilliseconds(), timeZone());
}

/** Minutes since midnight on the wall clock of `timeZone()` (the calendar's now line). */
export function minutesOfDay(at: Date = now()): number {
  const w = wallClock(at, timeZone());
  return w.hour * 60 + w.minute;
}

/** Which store answers, and how many items it holds (the health check). Throws if it cannot open. */
export function storeInfo(): { store: typeof STORE_KIND; items: number } {
  return { store: STORE_KIND, items: store.getState().items.length };
}

/** Today as an ISO date (yyyy-mm-dd) in `timeZone()`, from `now()`. */
export function today(): string {
  return wallClock(now(), timeZone()).day;
}

const byNewest = (a: Item, b: Item) => compareStamps(b.capturedAt, a.capturedAt);

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

export type ReviewBadge = 'due' | 'in progress' | { finishedAt: string };

/** Open run → in progress; else the last finished run if it is under 7 days old; else due. */
export function reviewBadge(): ReviewBadge {
  if (openRun()) return 'in progress';
  const last = lastFinishedRun();
  if (!last?.finishedAt || now().getTime() - Date.parse(last.finishedAt) >= 7 * DAY_MS) return 'due';
  return { finishedAt: last.finishedAt };
}

export interface NavCounts {
  inbox: number;
  inboxAging: boolean; // any inbox item ≥ 3 d old
  next: number;
  calendar: number;
  waiting: number;
  reference: number;
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
    reference: count('reference'),
    projects: listProjects().length,
    someday: count('someday'),
  };
}

/**
 * Capture one line into the inbox. Never asks, never throws on input. Shorthand is parsed
 * best-effort; a `^date` is kept as `day` for Clarify to offer, not as a hard deadline.
 */
export function capture(line: string, source: Source = 'typed', extra?: CaptureExtra): Item | null {
  const item = inboxItem(line, source, extra);
  if (!item) return null;
  store.update((s) => {
    s.items.push(item);
  });
  firstCaptureDone = true;
  return item;
}

/** What a channel other than the rapid log brings along (SPEC §3.1). */
export interface CaptureExtra {
  /** The original line when `line` was cleaned first (a mail subject without `Fwd:`). */
  captured?: string;
  /** Context that came with it: a shared URL, a mail's body. Kept on the item, not in its text. */
  reference?: Reference;
}

function inboxItem(line: string, source: Source, extra?: CaptureExtra): Item | null {
  if (!line.trim()) return null;
  const { text, tags, context, priority, date } = parse(line, today(), store.getState().contexts);
  return {
    id: crypto.randomUUID(),
    text: text || line.trim(),
    captured: extra?.captured ?? line,
    source,
    capturedAt: now().toISOString(),
    status: 'inbox',
    tags,
    ...(context && { context }),
    ...(priority && { priority }),
    ...(date && { day: date }),
    ...(extra?.reference && { reference: extra.reference }),
  };
}

// ── Mail-in ────────────────────────────────────────────────────────────────

/** One mail from the capture mailbox, already parsed (lib/mail/parse.ts). */
export interface MailIn {
  messageId: string;
  /** Cleaned: without `Fwd:` / `Re:` / `AW:` / `WG:`. */
  subject: string;
  /** The subject as it came. */
  captured: string;
  /** Start of the plain-text body, ≤ 2 KB; empty for none. */
  body: string;
}

export type MailOutcome = MailSeen['outcome'];

/** How a mail was handled before, or undefined for a new one. */
export function mailSeen(messageId: string): MailOutcome | undefined {
  return store.getState().mailSeen.find((m) => m.messageId === messageId)?.outcome;
}

/**
 * Capture a mail once: a Message-ID seen before is skipped; a mail with the same subject and
 * body as an email item still in the inbox (forwarded twice) is a duplicate. Item and record
 * are written together, so a crash can't capture it twice.
 */
export function captureMail(mail: MailIn): { outcome: MailOutcome | 'seen'; item?: Item } {
  if (mailSeen(mail.messageId)) return { outcome: 'seen' };
  const body = mail.body.trim();
  const twin = store
    .getState()
    .items.find((i) => i.status === 'inbox' && i.source === 'email' && i.captured === mail.captured && (i.reference?.body ?? '') === body);
  const item = twin ? null : inboxItem(mail.subject, 'email', { captured: mail.captured, ...(body && { reference: { kind: 'note', body } }) });
  const outcome: MailOutcome = item ? 'captured' : 'duplicate';
  store.update((s) => {
    if (item) s.items.push(item);
    s.mailSeen.push({ messageId: mail.messageId, at: now().toISOString(), outcome, ...(item && { itemId: item.id }) });
  });
  if (item) firstCaptureDone = true;
  return { outcome, ...(item && { item }) };
}

/** A mail from a sender not on CAPTURE_MAIL_FROM: counted once, never captured. */
export function ignoreMail(messageId: string): void {
  if (mailSeen(messageId)) return;
  store.update((s) => {
    s.mailSeen.push({ messageId, at: now().toISOString(), outcome: 'ignored' });
  });
}

/** After every poll: when, and why it failed (cleared by the next good one). */
export function recordMailPoll(error?: string): void {
  const at = now().toISOString();
  store.update((s) => {
    s.mailbox = { lastPollAt: at, ...(error && { lastError: error, lastErrorAt: at }) };
  });
}

/** The capture mailbox for Settings and /api/health. */
export function mailboxInfo(): MailboxStatus & { captured: number; duplicates: number; ignored: number } {
  const seen = store.getState().mailSeen;
  const count = (o: MailOutcome) => seen.filter((m) => m.outcome === o).length;
  return { ...store.getState().mailbox, captured: count('captured'), duplicates: count('duplicate'), ignored: count('ignored') };
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
  /** Optional: the kind (default guessed from the text) and a project it belongs to. */
  | { kind: 'reference'; reference?: Reference; project?: ProjectChoice }
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

/**
 * File as a later step, without what only a next action carries (SPEC §3.4): the step-4 fields,
 * its day, its time block and its focus star. Promotion asks for them again.
 */
function toLater(item: Item) {
  item.status = 'later';
  delete item.context;
  delete item.priority;
  delete item.priorityNo;
  delete item.time;
  delete item.energy;
  delete item.focusOn;
  delete item.day;
  delete item.timeSlot;
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

  if (decision.kind === 'reference') {
    const choice = decision.project;
    if (choice && 'id' in choice) check(state.projects.some((p) => p.id === choice.id), `unknown project ${choice.id}`);
    if (choice && 'newTitle' in choice) checkNewTitle(state, choice.newTitle);
    // A note keeps the context the item came with (a mail's body) unless the form gives one.
    const chosen = decision.reference ?? current.reference ?? guessReference(current.text);
    const reference = chosen.kind === 'note' && !chosen.body && current.reference?.body ? { ...chosen, body: current.reference.body } : chosen;
    checkReference(reference, 'clarify');
    const result: ClarifyResult = { itemId, projectCreated: false };
    store.update((s) => {
      const item = s.items.find((i) => i.id === itemId)!;
      item.status = 'reference';
      item.reference = cleanReference(reference);
      delete item.day;
      delete item.context;
      delete item.priority;
      if (choice) {
        item.projectId = 'id' in choice ? choice.id : addProject(s, choice.newTitle, 'inbox');
        result.projectId = item.projectId;
        result.projectCreated = 'newTitle' in choice;
      } else {
        delete item.projectId; // step 3 empty = loose, whatever the item carried in
      }
    });
    return result;
  }

  if (decision.kind === 'trash' || decision.kind === 'someday') {
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
    if (choice && 'id' in choice) checkTakesNextAction(choice.id, 'clarify');
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
    // Step 3 decides: a project, or none — an old one the item carried in does not survive.
    if (projectId) item.projectId = projectId;
    else delete item.projectId;
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
      .sort((a, b) => (a.priorityNo ?? Infinity) - (b.priorityNo ?? Infinity) || compareStamps(a.capturedAt, b.capturedAt))
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
          ? compareStamps(a.doneAt, b.doneAt)
          : rank(a).localeCompare(rank(b)),
    );
}

/** What `uncomplete` needs to put a completed action back where it was. */
export interface Completed {
  id: string;
  status: Item['status'];
  priorityNo?: number;
}

/**
 * Mark a next action (or a day-specific calendar action) done. A project may become stalled.
 * A weekly recurring calendar item leaves its next occurrence behind, a week later.
 */
export function complete(id: string): Completed {
  const item = getItem(id);
  check(item?.status === 'next' || item?.status === 'calendar', `item ${id} cannot be completed`, 'complete');
  const undo: Completed = { id, status: item.status, ...(item.priorityNo && { priorityNo: item.priorityNo }) };
  store.update((s) => {
    const it = s.items.find((i) => i.id === id)!;
    if (it.status === 'calendar' && isRecurring(it)) {
      const next = nextOccurrence(it);
      s.items.push(next);
      it.successorId = next.id; // undo takes back exactly this one, never a look-alike
    }
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
    // Take back the occurrence completing it created — by id, and only while it is still open
    // (done or trashed meanwhile, it stays). Items done before the link existed have none.
    if (it.successorId) {
      const successorId = it.successorId;
      s.items = s.items.filter((x) => !(x.id === successorId && x.status === 'calendar'));
      delete it.successorId;
    }
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
  if (choice && 'id' in choice) checkTakesNextAction(choice.id, 'edit');
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

/** One entry of today's hard landscape, for the Today card on Next Actions. */
export interface LandscapeEntry {
  id: string;
  kind: CalendarEntry['kind'];
  /** `hh:mm`; absent = all day. */
  time?: string;
  text: string;
  /** Also a hard deadline due that day. */
  deadline: boolean;
  done: boolean;
}

/** The calendar's entries for one day, flattened: timed ones first, by time; then all-day ones. */
export function todayLandscape(day = today()): LandscapeEntry[] {
  return landscape(day, day)
    .map((e) => ({
      id: e.id,
      kind: e.kind,
      ...('start' in e && e.start && { time: e.start }),
      text: e.text,
      deadline: e.kind === 'deadline' || (e.kind === 'dayaction' && e.deadline),
      done: 'done' in e && e.done,
    }))
    .sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'));
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

/**
 * Only an active project takes a next action (SPEC §3.4: nothing of a parked project stays on
 * Next Actions). A project on Someday/Maybe or completed is refused — activate it first.
 */
function checkTakesNextAction(projectId: string | undefined, scope: string) {
  if (!projectId) return;
  const p = getProject(projectId);
  check(!p || p.status === 'active', `project "${p?.title}" is ${p?.status === 'someday' ? 'on hold (Someday/Maybe)' : 'completed'} — activate it first`, scope);
}

/** Later step → next action, with the step-4 fields asked again. Numbered last in its priority. */
export function promote(id: string, fields: NextFields): void {
  check(getItem(id)?.status === 'later', `item ${id} is not a later step`, 'promote');
  checkTakesNextAction(getItem(id)!.projectId, 'promote');
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
  checkTakesNextAction(projectId, 'addAction');
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
    const p = s.projects.find((x) => x.id === id)!;
    p.status = 'completed';
    p.completedAt = now().toISOString();
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

/** Whoever answers by mail or ticket rather than by phone. */
const WRITES_BACK = /desk|support|committee/i;

/** @computer for desks and committees (when it exists), else the follow-up context from Settings. */
function followUpContext(s: { contexts: string[]; followUpContext: string }, who: string): string {
  if (WRITES_BACK.test(who) && s.contexts.includes('@computer')) return '@computer';
  return s.contexts.includes(s.followUpContext) ? s.followUpContext : s.contexts[0];
}

/**
 * `f` on a waiting-for: a next action to chase it ("Follow up with <who>: <text>"; in the
 * follow-up context from Settings, @calls by default, or @computer for desks and committees;
 * B, 15 min, low), in the same project. The follow-up date
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
    applyFields(s.items, action, { context: followUpContext(s, who), priority: 'B', time: 15, energy: 'low' });
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
    p.completedAt = now().toISOString();
  });
}

/** Undo for `dropProject`. */
export function undropProject(id: string): void {
  store.update((s) => {
    const p = s.projects.find((x) => x.id === id);
    if (p?.status !== 'completed' || !p.dropped) return;
    p.status = 'someday';
    delete p.dropped;
    delete p.completedAt;
  });
}

// ── Calendar ───────────────────────────────────────────────────────────────

export function listExternalCalendars(): ExternalCalendar[] {
  return store.getState().externalCalendars;
}

/** The latest successful sync of a configured calendar (else the demo's stamp). */
export function calendarSyncedAt(): string | undefined {
  const synced = store.getState().externalCalendars.map((c) => c.lastSyncAt).filter((t): t is string => !!t);
  return synced.sort(compareStamps).at(-1) ?? store.getState().externalSyncedAt;
}

/**
 * The pieces of an appointment per day in [from, to]: an all-day event on each of its days; a
 * timed event that runs past midnight as start–24:00, whole days in between, then 00:00–end.
 */
function appointmentDays(e: ExternalEvent, from: string, to: string): { day: string; start?: string; end?: string }[] {
  const first = e.start.slice(0, 10);
  const last = e.allDay ? addDays(e.end > first ? e.end : addDays(first, 1), -1) : e.end.slice(0, 10);
  const out: { day: string; start?: string; end?: string }[] = [];
  for (let day = first < from ? from : first; day <= last && day <= to; day = addDays(day, 1)) {
    if (e.allDay) out.push({ day });
    else if (first === last) out.push({ day, start: hhmm(e.start), end: hhmm(e.end) });
    else if (day === first) out.push({ day, start: hhmm(e.start), end: '24:00' });
    else if (day === last) {
      if (hhmm(e.end) > '00:00') out.push({ day, start: '00:00', end: hhmm(e.end) });
    } else out.push({ day });
  }
  return out;
}

const RECURRING_WEEKLY = 'recurring:weekly';
const SLOT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const DEFAULT_BLOCK_MIN = 60;

function isRecurring(item: Item): boolean {
  return item.tags.includes(RECURRING_WEEKLY);
}

/** The day an item sits on in the calendar: its slot's day, else its `day`. */
function calendarDay(item: Item): string | undefined {
  return item.timeSlot?.start.slice(0, 10) ?? item.day;
}

/** `2026-09-27T17:00…` moved by `n` days, time of day and anything after it kept. */
function shiftStamp(stamp: string, n: number): string {
  return addDays(stamp.slice(0, 10), n) + stamp.slice(10);
}

/** A recurring item's next occurrence: the same item a week later, open, with a new id. */
function nextOccurrence(item: Item): Item {
  const next: Item = {
    ...item,
    id: crypto.randomUUID(),
    status: 'calendar',
    capturedAt: now().toISOString(),
    tags: [...item.tags],
  };
  const day = calendarDay(item);
  if (day) next.day = addDays(day, 7);
  if (item.timeSlot) next.timeSlot = { start: shiftStamp(item.timeSlot.start, 7), end: shiftStamp(item.timeSlot.end, 7) };
  delete next.doneAt;
  delete next.focusOn;
  delete next.successorId;
  return next;
}

const hhmm = (stamp: string) => stamp.slice(11, 16);
const minutesOf = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const fromMinutes = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Where an item is looked after: its list, or its project. */
function ownerHref(item: Item): string | undefined {
  if (item.status === 'next') return `/next?highlight=${encodeURIComponent(item.id)}`;
  if (item.status === 'waiting') return '/waiting';
  if (item.projectId) return `/projects?p=${encodeURIComponent(item.projectId)}`;
  return undefined;
}

interface EntryBase {
  /** Unique per entry; a projected recurrence is `<item id>@<day>`. */
  id: string;
  day: string;
  text: string;
}

/** Item-backed entries: what the calendar can move, tick or open. */
interface ItemEntry extends EntryBase {
  itemId: string;
  status: Item['status'];
  done: boolean;
  recurring: boolean;
  /** A later occurrence of a recurring item, drawn but not stored; not interactive. */
  projected: boolean;
  /**
   * Done is set here (SPEC §4: Next Actions and Calendar): a calendar item, open or done —
   * not a next action's time block, whose done belongs to Next Actions. Never when projected.
   */
  tickable: boolean;
  href?: string;
}

/** The five kinds of the hard landscape (SPEC §3.6). Times are `hh:mm`. */
export type CalendarEntry =
  | (EntryBase & { kind: 'appointment'; calendar: string; start?: string; end?: string })
  | (ItemEntry & { kind: 'timeblock'; start: string; end: string })
  | (ItemEntry & { kind: 'dayaction'; deadline: boolean })
  | (EntryBase & { kind: 'info'; ticklerId: string })
  | (EntryBase & { kind: 'deadline'; href: string });

/**
 * Everything on the calendar between `from` and `to` (ISO dates, inclusive):
 * - appointments from the calendar source;
 * - time blocks: open or done next actions and calendar items with a `timeSlot`;
 * - day actions: calendar items (or done ones) with a `day` and no slot;
 * - info: tickler entries;
 * - deadlines of open items and active projects. A day action due the day it sits on is drawn
 *   once, as a day action flagged `deadline`; an item due with its project shows as the project.
 * Weekly recurring calendar items repeat on every later week, projected from their next date.
 */
function landscape(from: string, to: string): CalendarEntry[] {
  const { items, projects, tickler } = store.getState();
  const inRange = (day: string | undefined): day is string => !!day && day >= from && day <= to;
  const out: CalendarEntry[] = [];

  for (const e of store.getState().externalEvents) {
    for (const [n, part] of appointmentDays(e, from, to).entries()) {
      out.push({
        kind: 'appointment',
        id: n ? `${e.id}@${part.day}` : e.id,
        day: part.day,
        text: e.title,
        calendar: e.calendar,
        ...(part.start && { start: part.start, end: part.end }),
      });
    }
  }

  const projectDeadline = new Map(projects.filter((p) => p.status === 'active' && p.deadline).map((p) => [p.id, p.deadline]));
  for (const i of items) {
    const placed = i.timeSlot ? ['next', 'calendar', 'done'].includes(i.status) : ['calendar', 'done'].includes(i.status);
    const day = calendarDay(i);
    if (placed && day) {
      const days: [string, boolean][] = inRange(day) ? [[day, false]] : [];
      if (i.status === 'calendar' && isRecurring(i)) {
        for (let d = addDays(day, 7); d <= to; d = addDays(d, 7)) if (d >= from) days.push([d, true]);
      }
      // A next action always has a context, a calendar item never: so a done item's origin shows.
      const fromCalendar = i.status === 'calendar' || (i.status === 'done' && !i.context);
      for (const [d, projected] of days) {
        const base = {
          id: projected ? `${i.id}@${d}` : i.id,
          itemId: i.id,
          status: i.status,
          day: d,
          text: i.text,
          done: !projected && i.status === 'done',
          recurring: isRecurring(i),
          projected,
          tickable: fromCalendar && !projected,
          ...(ownerHref(i) && { href: ownerHref(i) }),
        };
        if (i.timeSlot) out.push({ ...base, kind: 'timeblock', start: hhmm(i.timeSlot.start), end: hhmm(i.timeSlot.end) });
        else out.push({ ...base, kind: 'dayaction', deadline: !projected && i.deadline === d });
      }
    }
    const open = ['next', 'later', 'waiting', 'calendar'].includes(i.status);
    const drawnAsDayAction = placed && !i.timeSlot && i.day === i.deadline;
    const coveredByProject = !!i.projectId && projectDeadline.get(i.projectId) === i.deadline;
    if (open && inRange(i.deadline) && !drawnAsDayAction && !coveredByProject) {
      out.push({
        kind: 'deadline',
        id: `deadline-${i.id}`,
        day: i.deadline,
        text: i.text,
        href: ownerHref(i) ?? `/calendar?week=${isoWeek(i.deadline)}`,
      });
    }
  }

  for (const t of tickler) {
    if (inRange(t.day)) out.push({ kind: 'info', id: t.id, ticklerId: t.id, day: t.day, text: t.text });
  }
  for (const p of projects) {
    if (p.status === 'active' && inRange(p.deadline)) {
      out.push({ kind: 'deadline', id: `deadline-${p.id}`, day: p.deadline, text: p.title, href: `/projects?p=${encodeURIComponent(p.id)}` });
    }
  }
  return out;
}

/** The hard landscape between two days (ISO dates, inclusive): the phone agenda. */
export function landscapeBetween(from: string, to: string): CalendarEntry[] {
  return landscape(from, to);
}

/** The hard landscape of an ISO week (`2026-W39`), Monday to Sunday. */
export function weekLandscape(week: string): CalendarEntry[] {
  const days = weekDays(week);
  return landscape(days[0], days[6]);
}

export interface UpcomingDeadline {
  id: string;
  day: string;
  text: string;
  href: string;
}

/** Hard deadlines after today, up to `days` ahead, soonest first. Today's are on the grid. */
export function upcomingDeadlines(days = 30): UpcomingDeadline[] {
  const from = addDays(today(), 1);
  const out: UpcomingDeadline[] = [];
  for (const e of landscape(from, addDays(today(), days))) {
    if (e.kind === 'deadline') out.push({ id: e.id, day: e.day, text: e.text, href: e.href });
    else if (e.kind === 'dayaction' && e.deadline && !e.done) {
      out.push({ id: e.id, day: e.day, text: e.text, href: e.href ?? `/calendar?week=${isoWeek(e.day)}` });
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * Give a next action or a calendar item a time slot (`yyyy-mm-ddThh:mm`). Without `end` the slot
 * lasts the action's time estimate (1 h when it has none). A calendar item moves to that day.
 * A next action blocked for today is starred for today; a block on any other day leaves stars alone.
 */
export function setTimeSlot(id: string, start: string, end?: string): void {
  const item = getItem(id);
  check(item?.status === 'next' || item?.status === 'calendar', `item ${id} cannot be time-blocked`, 'setTimeSlot');
  check(SLOT.test(start) && (!end || SLOT.test(end)), 'slot is not yyyy-mm-ddThh:mm', 'setTimeSlot');
  const day = start.slice(0, 10);
  const until = end ?? `${day}T${fromMinutes(Math.min(24 * 60 - 1, minutesOf(hhmm(start)) + (item.time ?? DEFAULT_BLOCK_MIN)))}`;
  check(until.slice(0, 10) === day && until > start, 'slot must end after it starts, on the same day', 'setTimeSlot');
  store.update((s) => {
    const it = s.items.find((i) => i.id === id)!;
    it.timeSlot = { start, end: until };
    if (it.status === 'calendar') {
      it.day = day;
    } else if (day === today()) {
      it.focusOn = day;
    }
  });
}

/** Remove a time block. Stars are never touched; a calendar item stays on its day. */
export function clearTimeSlot(id: string): void {
  const item = getItem(id);
  check(item?.timeSlot && (item.status === 'next' || item.status === 'calendar'), `item ${id} has no open time block`, 'clearTimeSlot');
  store.update((s) => {
    const it = s.items.find((i) => i.id === id)!;
    delete it.timeSlot;
  });
}

/** Put a calendar item on a day, any time: a day-specific action (its time slot, if any, goes). */
export function setDay(id: string, day: string): void {
  check(getItem(id)?.status === 'calendar', `item ${id} is not a calendar item`, 'setDay');
  check(ISO_DATE.test(day), 'day is not an ISO date', 'setDay');
  store.update((s) => {
    const it = s.items.find((i) => i.id === id)!;
    it.day = day;
    delete it.timeSlot;
  });
}

/** Day-specific information (tickler): a note on a day, nothing to do. */
export function addTickler(day: string, text: string): TicklerEntry {
  check(ISO_DATE.test(day), 'day is not an ISO date', 'addTickler');
  check(text.trim(), 'text is empty', 'addTickler');
  const entry: TicklerEntry = { id: `t-${crypto.randomUUID()}`, day, text: text.trim() };
  store.update((s) => {
    s.tickler.push(entry);
  });
  return entry;
}

export function updateTickler(id: string, text: string): void {
  check(store.getState().tickler.some((t) => t.id === id), `unknown tickler ${id}`, 'updateTickler');
  check(text.trim(), 'text is empty', 'updateTickler');
  store.update((s) => {
    s.tickler.find((t) => t.id === id)!.text = text.trim();
  });
}

export function deleteTickler(id: string): void {
  store.update((s) => {
    s.tickler = s.tickler.filter((t) => t.id !== id);
  });
}

// ── Weekly Review ──────────────────────────────────────────────────────────

const STALE_RUN_MS = 24 * 3_600_000;
const DEFAULT_TEMPLATE = baseSeed.reviewTemplate;

export interface ReviewStep {
  id: string;
  text: string;
  link?: string;
  phaseId: string;
}

export function reviewTemplate(): ReviewTemplate {
  return store.getState().reviewTemplate;
}

/** "Reset to GTD default": the template of the base seed. Runs keep their own copy. */
export function resetTemplate(): void {
  store.update((s) => {
    s.reviewTemplate = structuredClone(DEFAULT_TEMPLATE);
  });
}

/** The checklist a run follows: the copy taken when it started (older runs: the current one). */
export function runTemplate(run?: ReviewRun): ReviewTemplate {
  return run?.template ?? reviewTemplate();
}

/** The steps in order, across phases — of `run`'s own template, else the current template. */
export function reviewSteps(run?: ReviewRun): ReviewStep[] {
  return runTemplate(run).phases.flatMap((ph) => ph.steps.map((st) => ({ ...st, phaseId: ph.id })));
}

/** Where a step comes from in the note and live-figure rules: the shipped steps by id, added ones by link. */
const RULE_BY_LINK: Record<string, string> = {
  '/clarify': 'inbox-zero',
  '/inbox': 'inbox-zero',
  '/next': 'next',
  '/calendar': 'past-cal',
  '/waiting': 'waiting',
  '/projects': 'projects',
  '/waiting?tab=someday': 'someday',
};
function ruleOf(step: ReviewStep | undefined, stepId: string): string {
  if (!step || DEFAULT_TEMPLATE.phases.some((p) => p.steps.some((s) => s.id === stepId))) return stepId;
  return (step.link && RULE_BY_LINK[step.link]) || stepId;
}

/** An open run started 24 h ago or earlier: it reads as abandoned, whether or not that was written. */
function isStale(run: ReviewRun): boolean {
  return !run.outcome && Date.parse(run.startedAt) <= now().getTime() - STALE_RUN_MS;
}

/** The one run in progress (no outcome yet, not stale), if any. */
export function openRun(): ReviewRun | undefined {
  return store.getState().reviewRuns.find((r) => !r.outcome && !isStale(r));
}

export function lastFinishedRun(): ReviewRun | undefined {
  return store.getState().reviewRuns.findLast((r) => r.outcome === 'finished');
}

/** The newest run that is over, finished or abandoned (a stale open run counts as abandoned). */
export function lastClosedRun(): ReviewRun | undefined {
  const run = store.getState().reviewRuns.findLast((r) => !!r.outcome || isStale(r));
  return run && isStale(run) ? { ...run, outcome: 'abandoned' } : run;
}

/** Average length of finished runs in minutes (pauses excluded); `undefined` without any. */
export function usualReviewMinutes(): number | undefined {
  const done = store.getState().reviewRuns.filter((r) => r.outcome === 'finished' && r.finishedAt);
  if (!done.length) return undefined;
  return Math.round(done.reduce((sum, r) => sum + reviewElapsedMs(r), 0) / done.length / 60_000);
}

/** Time spent on a run: start to finish (or now), minus pauses. */
export function reviewElapsedMs(run: ReviewRun): number {
  const end = run.finishedAt ? Date.parse(run.finishedAt) : now().getTime();
  const paused = run.pausedMs + (run.pausedAt ? end - Date.parse(run.pausedAt) : 0);
  return Math.max(0, end - Date.parse(run.startedAt) - paused);
}

/** Steps ticked in a run: an abandoned run was "abandoned at step n". */
export function ticked(run: ReviewRun): number {
  return run.steps.filter((s) => s.doneAt).length;
}

/** The step to work on: the first unticked one in template order. */
export function currentStep(run: ReviewRun): string | undefined {
  return reviewSteps(run).find((st) => !run.steps.some((s) => s.stepId === st.id && s.doneAt))?.id;
}

/** Whole minutes a ticked step took: from becoming current (else the tick before it) to its tick. */
export function stepMinutes(run: ReviewRun, stepId: string): number | undefined {
  const entry = run.steps.find((s) => s.stepId === stepId);
  if (!entry?.doneAt) return undefined;
  const end = Date.parse(entry.doneAt);
  const before = run.steps.map((s) => (s.doneAt ? Date.parse(s.doneAt) : 0)).filter((t) => t < end);
  const start = entry.openedAt ? Date.parse(entry.openedAt) : Math.max(Date.parse(run.startedAt), ...before);
  const ms = end - start;
  return ms < 60_000 ? 0 : Math.round(ms / 60_000);
}

function reviewCounters(): ReviewCounters {
  const h = health();
  return {
    inbox: listInbox().length,
    someday: store.getState().items.filter((i) => i.status === 'someday').length,
    waitingOverdue: h.waitingOverdue,
    stalled: h.stalled,
  };
}

const CALENDAR_THINGS = new Set<CalendarEntry['kind']>(['appointment', 'timeblock', 'dayaction']);

function calendarFigures(): CalendarFigures {
  const day = today();
  const count = (from: string, to: string) =>
    landscape(from, to).filter((e) => CALENDAR_THINGS.has(e.kind) && !('projected' in e && e.projected)).length;
  return {
    past7: count(addDays(day, -6), day),
    next14: count(addDays(day, 1), addDays(day, 14)),
    deadlines14: upcomingDeadlines(14).map((d) => ({ text: d.text, day: d.day })),
  };
}

/** Numbers from the lists the review steps link to. */
export function reviewFacts(): ListFacts {
  const { items } = store.getState();
  const active = listProjects();
  const h = health();
  return {
    inbox: listInbox().length,
    next: listNext().length,
    waiting: items.filter((i) => i.status === 'waiting').length,
    waitingOverdue: h.waitingOverdue,
    projects: active.length,
    stalled: h.stalled,
    someday: items.filter((i) => i.status === 'someday').length,
    areas: [...new Set(active.map((p) => p.area).filter((a): a is string => !!a))],
    calendar: calendarFigures(),
  };
}

/** The live figure of an open step (of the open run's checklist, else the current one). */
export function reviewLiveLine(stepId: string): LiveLine | undefined {
  const step = reviewSteps(openRun()).find((s) => s.id === stepId);
  return liveLine(ruleOf(step, stepId), reviewFacts());
}

function requireOpenRun(scope: string): ReviewRun {
  const run = openRun();
  check(run, 'no review in progress', scope);
  return run;
}

function checkStep(stepId: string, scope: string, run?: ReviewRun) {
  check(reviewSteps(run).some((s) => s.id === stepId), `unknown step ${stepId}`, scope);
}

/** Mark a step current: remember when, and snapshot the counters its note will compare against. */
function openIn(run: ReviewRun, stepId: string) {
  let entry = run.steps.find((s) => s.stepId === stepId);
  if (!entry) run.steps.push((entry = { stepId }));
  if (entry.openedAt || entry.doneAt) return;
  entry.openedAt = now().toISOString();
  entry.snapshot = reviewCounters();
}

/** Start a review: one open run at a time; the first step becomes current. */
export function startReview(): ReviewRun {
  check(!openRun(), 'a review is already in progress', 'startReview');
  abandonStaleRuns(); // write down what reads already show
  const run: ReviewRun = {
    id: `r-${crypto.randomUUID()}`,
    startedAt: now().toISOString(),
    pausedMs: 0,
    steps: [],
    notes: '',
    // Its own copy: editing the template later never changes a review under way.
    template: structuredClone(reviewTemplate()),
  };
  const first = reviewSteps(run)[0];
  if (first) openIn(run, first.id);
  store.update((s) => {
    s.reviewRuns.push(run);
  });
  return run;
}

/** A step becomes current by moving to it or following its link. Idempotent. */
export function openStep(stepId: string): void {
  checkStep(stepId, 'openStep', requireOpenRun('openStep'));
  store.update(() => openIn(openRun()!, stepId));
}

/**
 * Tick a step and write its measured note: the delta since it became current (or since the
 * latest snapshot before, when it never did). The next unticked step becomes current.
 */
export function tickStep(stepId: string): void {
  const run = requireOpenRun('tickStep');
  checkStep(stepId, 'tickStep', run);
  check(!run.steps.some((s) => s.stepId === stepId && s.doneAt), `step ${stepId} is already ticked`, 'tickStep');
  const at = now();
  const own = run.steps.find((s) => s.stepId === stepId);
  const base = own?.snapshot
    ? own
    : run.steps.filter((s) => s.snapshot && s.openedAt).sort((a, b) => compareStamps(a.openedAt, b.openedAt)).at(-1);
  const since = Date.parse(base?.openedAt ?? run.startedAt);
  const { items } = store.getState();
  store.update(() => {
    const r = openRun()!;
    let entry = r.steps.find((s) => s.stepId === stepId);
    if (!entry) r.steps.push((entry = { stepId }));
    entry.doneAt = at.toISOString();
    entry.note = measuredNote({
      stepId: ruleOf(reviewSteps(r).find((s) => s.id === stepId), stepId),
      opened: base?.snapshot,
      now: reviewCounters(),
      captured: items.filter((i) => Date.parse(i.capturedAt) >= since).length,
      done: items.filter((i) => i.status === 'done' && i.doneAt && Date.parse(i.doneAt) >= since).length,
      calendar: calendarFigures(),
      minutes: stepMinutes(r, stepId) ?? 0,
    });
    const next = currentStep(r);
    if (next) openIn(r, next);
  });
}

/** Untick a step: its note goes; it keeps when it was opened. */
export function untickStep(stepId: string): void {
  requireOpenRun('untickStep');
  store.update(() => {
    const entry = openRun()!.steps.find((s) => s.stepId === stepId);
    if (!entry) return;
    delete entry.doneAt;
    delete entry.note;
  });
}

export function pauseReview(): void {
  check(!requireOpenRun('pauseReview').pausedAt, 'already paused', 'pauseReview');
  store.update(() => {
    openRun()!.pausedAt = now().toISOString();
  });
}

function resumeIn(run: ReviewRun) {
  if (!run.pausedAt) return;
  run.pausedMs += Math.max(0, now().getTime() - Date.parse(run.pausedAt));
  delete run.pausedAt;
}

export function resumeReview(): void {
  check(requireOpenRun('resumeReview').pausedAt, 'not paused', 'resumeReview');
  store.update(() => resumeIn(openRun()!));
}

export function setReviewNotes(notes: string): void {
  requireOpenRun('setReviewNotes');
  store.update(() => {
    openRun()!.notes = notes;
  });
}

/** Finish the review. Emptying the trash is its implicit last step. */
export function finishReview(): void {
  requireOpenRun('finishReview');
  store.update(() => {
    const run = openRun()!;
    resumeIn(run);
    run.finishedAt = now().toISOString();
    run.outcome = 'finished';
  });
  purgeTrash();
}

/**
 * Record open runs started 24 h ago or earlier as abandoned. Reads already treat them so
 * (`openRun`, `lastClosedRun`), so no job has to run at night; `startReview` calls this.
 */
export function abandonStaleRuns(): number {
  const stale = store.getState().reviewRuns.filter(isStale);
  if (stale.length) {
    store.update((s) => {
      for (const r of s.reviewRuns) if (isStale(r)) r.outcome = 'abandoned';
    });
  }
  return stale.length;
}

export interface WeekStats {
  done: number;
  captured: number;
  completedProjects: number;
  stalled: number;
}

/** "This week, so far": the last 7 days; stalled is the count right now. */
export function weekStats(): WeekStats {
  const since = now().getTime() - 7 * DAY_MS;
  const after = (iso?: string) => !!iso && Date.parse(iso) >= since;
  const { items, projects } = store.getState();
  return {
    done: items.filter((i) => i.status === 'done' && after(i.doneAt)).length,
    captured: items.filter((i) => after(i.capturedAt)).length,
    completedProjects: projects.filter((p) => p.status === 'completed' && !p.dropped && after(p.completedAt)).length,
    stalled: health().stalled,
  };
}

// ── Settings ───────────────────────────────────────────────────────────────

export function getSettings(): Settings {
  const s = store.getState();
  return {
    contexts: s.contexts,
    followUpContext: s.followUpContext,
    buckets: s.buckets,
    reviewTemplate: s.reviewTemplate,
    weekStart: s.weekStart,
    timezone: s.timezone,
    theme: s.theme,
  };
}

/** In the order the palette's "Toggle dark theme" cycles them. */
export const THEMES: readonly Theme[] = ['system', 'dark', 'light'];

/** The routes a review step may link to (the template editor's select). */
export const STEP_LINKS = ['/inbox', '/clarify', '/next', '/calendar', '/waiting', '/waiting?tab=someday', '/projects'] as const;

/** A template may change its steps, never its phases (their names drive warnings, SPEC §3.7). */
function checkTemplate(t: ReviewTemplate) {
  const fixed = DEFAULT_TEMPLATE.phases;
  check(
    t.phases.length === fixed.length && t.phases.every((p, n) => p.id === fixed[n].id && p.name === fixed[n].name),
    'the three phases are fixed',
    'settings',
  );
  const ids = t.phases.flatMap((p) => p.steps.map((s) => s.id));
  check(new Set(ids).size === ids.length && ids.every(Boolean), 'step ids must be unique', 'settings');
  for (const step of t.phases.flatMap((p) => p.steps)) {
    check(step.text.trim(), 'a step needs text', 'settings');
    check(!step.link || (STEP_LINKS as readonly string[]).includes(step.link), `unknown link ${step.link}`, 'settings');
  }
}

/**
 * Change the review template, the time zone or the week start. Contexts and buckets change
 * through the list operations below, which also update the items that use them.
 */
export function updateSettings(
  patch: Partial<Pick<Settings, 'reviewTemplate' | 'timezone' | 'weekStart' | 'followUpContext' | 'theme'>>,
): void {
  if (patch.reviewTemplate) checkTemplate(patch.reviewTemplate);
  if (patch.followUpContext !== undefined) {
    check(store.getState().contexts.includes(patch.followUpContext), `unknown context ${patch.followUpContext}`, 'settings');
  }
  if (patch.timezone !== undefined) check(!patch.timezone || isTimeZone(patch.timezone), `unknown time zone ${patch.timezone}`, 'settings');
  if (patch.theme !== undefined) check(THEMES.includes(patch.theme), `unknown theme ${patch.theme}`, 'settings');
  if (patch.weekStart !== undefined) check(patch.weekStart === 'mon', 'the week starts on Monday', 'settings');
  store.update((s) => {
    if (patch.reviewTemplate) s.reviewTemplate = structuredClone(patch.reviewTemplate);
    if (patch.timezone !== undefined) s.timezone = patch.timezone;
    if (patch.weekStart) s.weekStart = patch.weekStart;
    if (patch.followUpContext) s.followUpContext = patch.followUpContext;
    if (patch.theme) s.theme = patch.theme;
  });
}

/** Contexts and Someday buckets: ordered lists of names that items point to. */
export type SettingsList = 'context' | 'bucket';

const LISTS = {
  context: {
    key: 'contexts',
    field: 'context',
    /** Open items still pointing here keep a delete from happening. */
    open: (i: Item) => i.status !== 'done' && i.status !== 'trash',
    noun: (n: number) => (n === 1 ? 'action uses' : 'actions use'),
    valid: (name: string) => /^@[\p{L}\p{N}_-]+$/u.test(name),
    rule: 'a context is @ and one word, e.g. @calls',
  },
  bucket: {
    key: 'buckets',
    field: 'bucket',
    open: (i: Item) => i.status === 'someday',
    noun: (n: number) => (n === 1 ? 'someday item uses' : 'someday items use'),
    valid: (name: string) => name.length > 0 && name.length <= 40,
    rule: 'a bucket name is 1–40 characters',
  },
} as const;

/** Items that keep `name` from being deleted. */
export function listUsage(list: SettingsList, name: string): number {
  const l = LISTS[list];
  return store.getState().items.filter((i) => l.open(i) && i[l.field] === name).length;
}

function checkName(list: SettingsList, name: string, except?: string) {
  const l = LISTS[list];
  check(l.valid(name), l.rule, 'settings');
  const taken = store.getState()[l.key].some((n) => n !== except && n.toLowerCase() === name.toLowerCase());
  check(!taken, `${name} already exists`, 'settings');
}

/** Add an entry, at the end or at `at`. */
export function addListEntry(list: SettingsList, raw: string, at?: number): void {
  const name = raw.trim();
  checkName(list, name);
  store.update((s) => {
    const names = s[LISTS[list].key];
    names.splice(at === undefined ? names.length : Math.max(0, Math.min(at, names.length)), 0, name);
  });
}

/** Rename an entry and every item that uses it, in one transaction. */
export function renameListEntry(list: SettingsList, from: string, raw: string): void {
  const to = raw.trim();
  const l = LISTS[list];
  check(store.getState()[l.key].includes(from), `unknown ${list} ${from}`, 'settings');
  if (to === from) return;
  checkName(list, to, from);
  store.update((s) => {
    const names = s[l.key];
    names[names.indexOf(from)] = to;
    for (const i of s.items) if (i[l.field] === from) i[l.field] = to;
    if (list === 'context' && s.followUpContext === from) s.followUpContext = to;
  });
}

/** Delete an entry — refused while open items use it ("3 actions use @office — move them first"). */
export function deleteListEntry(list: SettingsList, name: string): void {
  const l = LISTS[list];
  check(store.getState()[l.key].includes(name), `unknown ${list} ${name}`, 'settings');
  const used = listUsage(list, name);
  check(used === 0, `${used} ${l.noun(used)} ${name} — move them first`, 'settings');
  check(
    list !== 'context' || store.getState().followUpContext !== name,
    `${name} is where follow-ups go — choose another context for them first`,
    'settings',
  );
  store.update((s) => {
    s[l.key].splice(s[l.key].indexOf(name), 1);
  });
}

/** Move an entry to position `to` (the display order of contexts on Next Actions). */
export function moveListEntry(list: SettingsList, name: string, to: number): void {
  const l = LISTS[list];
  check(store.getState()[l.key].includes(name), `unknown ${list} ${name}`, 'settings');
  store.update((s) => {
    const names = s[l.key];
    names.splice(names.indexOf(name), 1);
    names.splice(Math.max(0, Math.min(to, names.length)), 0, name);
  });
}

/** The Inbox's one-time welcome: a database created at this boot that nobody has captured into yet. */
export function firstRun(): boolean {
  return !firstCaptureDone && createdThisBoot() && store.getState().items.length === 0;
}
let firstCaptureDone = false;

// ── Calendar sync ──────────────────────────────────────────────────────────

/** Days fetched around today: a week back (for the review of the past week), two months ahead. */
const SYNC_DAYS_BACK = 7;
const SYNC_DAYS_AHEAD = 60;

export interface SyncResult {
  source: string;
  ok: boolean;
  events?: number;
  error?: string;
}

/** The sources configured in the environment (`CAL_<ID>_URL` …). */
export function configuredSources(): CalendarSource[] {
  return sourcesFromEnv().sources;
}

/** Write one source's outcome: its events replace the earlier ones; a failure keeps them. */
function applySync(src: CalendarSource, at: string, events: ExternalEvent[] | null, error?: string) {
  store.update((s) => {
    let cal = s.externalCalendars.find((c) => c.sourceId === src.id);
    if (!cal) {
      cal = { name: src.name, via: src.kind, sourceId: src.id, host: src.host };
      s.externalCalendars.push(cal);
    }
    Object.assign(cal, { name: src.name, via: src.kind, host: src.host });
    if (events) {
      cal.lastSyncAt = at;
      delete cal.lastError;
      delete cal.lastErrorAt;
      // Keyed by (source, uid, recurrence id): unchanged rows stay, gone ones go.
      s.externalEvents = s.externalEvents.filter((e) => e.sourceId !== src.id).concat(events);
    } else {
      cal.lastError = error;
      cal.lastErrorAt = at;
    }
  });
}

let running: Promise<SyncResult[]> | null = null;

/**
 * Pull every source for today −7 … +60 days. Sources are read only — nothing is written
 * back. Overlapping calls share one run. Called without `sources`, it syncs the configured ones
 * and drops calendars (and their events) that are no longer configured.
 */
export function syncCalendars(sources?: CalendarSource[]): Promise<SyncResult[]> {
  running ??= (async () => {
    const list = sources ?? configuredSources();
    const day = today();
    const window = { from: addDays(day, -SYNC_DAYS_BACK), to: addDays(day, SYNC_DAYS_AHEAD), timeZone: timeZone() };
    const results: SyncResult[] = [];
    for (const src of list) {
      const at = now().toISOString();
      try {
        const events = await src.fetchEvents(window);
        applySync(src, at, events);
        results.push({ source: src.name, ok: true, events: events.length });
      } catch (e) {
        const error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
        applySync(src, at, null, error);
        results.push({ source: src.name, ok: false, error });
      }
    }
    if (!sources) {
      const ids = new Set(list.map((s) => s.id));
      const gone = store.getState().externalCalendars.filter((c) => c.sourceId && !ids.has(c.sourceId));
      if (gone.length) {
        store.update((s) => {
          s.externalCalendars = s.externalCalendars.filter((c) => !c.sourceId || ids.has(c.sourceId));
          s.externalEvents = s.externalEvents.filter((e) => !e.sourceId || ids.has(e.sourceId));
        });
      }
    }
    return results;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Calendars whose last sync failed, for the calendar footer: "Work: sync failed 3 h ago". */
export function calendarFailures(): { name: string; hoursAgo: number; error: string }[] {
  const nowMs = now().getTime();
  return store
    .getState()
    .externalCalendars.filter((c) => c.lastError && c.lastErrorAt)
    .map((c) => ({ name: c.name, hoursAgo: Math.max(0, Math.floor((nowMs - Date.parse(c.lastErrorAt!)) / 3_600_000)), error: c.lastError! }));
}

/** Hours of the week grid: 08–18, widened to whole hours around anything timed outside it. */
export function weekHours(entries: CalendarEntry[]): [number, number] {
  let first = 8;
  let last = 18;
  for (const e of entries) {
    if (!('start' in e) || !e.start || !e.end) continue;
    first = Math.min(first, Math.floor(minutesOf(e.start) / 60));
    last = Math.max(last, Math.ceil(minutesOf(e.end) / 60));
  }
  return [Math.max(0, first), Math.min(24, last)];
}

// ── Command palette ────────────────────────────────────────────────────────

export interface PaletteItem {
  id: string;
  /** What the row says. */
  text: string;
  /** The list it is on, shown as its tag. */
  list: string;
  /** Searched too: who, project, context. */
  detail: string;
  href: string;
}

export interface PaletteData {
  today: string;
  contexts: { name: string; open: number }[];
  projects: { id: string; title: string; status: Project['status']; href: string }[];
  items: PaletteItem[];
  reviewOpen: boolean;
  canSync: boolean;
}

const PALETTE_LISTS: Partial<Record<Item['status'], string>> = {
  inbox: 'Inbox',
  next: 'Next Actions',
  waiting: 'Waiting For',
  someday: 'Someday / Maybe',
  later: 'Later steps',
  calendar: 'Calendar',
  done: 'Done',
  reference: 'Reference',
};

/** Where an item is opened from the palette: its row on its screen. */
function paletteHref(i: Item): string | undefined {
  const id = encodeURIComponent(i.id);
  switch (i.status) {
    case 'inbox':
      return `/clarify?item=${id}`;
    case 'next':
      return `/next?highlight=${id}`;
    case 'waiting':
      return `/waiting?highlight=${id}`;
    case 'someday':
      return `/waiting?tab=someday&highlight=${id}`;
    case 'later':
    case 'done':
      return i.projectId ? `/projects?p=${encodeURIComponent(i.projectId)}` : undefined;
    case 'calendar': {
      const day = i.timeSlot?.start.slice(0, 10) ?? i.day;
      return day ? `/calendar?week=${isoWeek(day)}` : undefined;
    }
    case 'reference':
      return `/reference?highlight=${id}`;
    default:
      return undefined; // trash
  }
}

/** Everything the palette searches, small and local, so opening it waits for nothing. */
export function paletteData(): PaletteData {
  const { items, projects, contexts } = store.getState();
  const title = new Map(projects.map((p) => [p.id, p.title]));
  const next = listNext();
  return {
    today: today(),
    contexts: contexts.map((name) => ({ name, open: next.filter((i) => i.context === name).length })),
    projects: projects.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      href: p.status === 'completed' ? `/projects?filter=completed&p=${encodeURIComponent(p.id)}` : `/projects?p=${encodeURIComponent(p.id)}`,
    })),
    items: items.flatMap((i) => {
      const href = paletteHref(i);
      const list = PALETTE_LISTS[i.status];
      if (!href || !list) return [];
      const detail = [i.waiting?.who, i.projectId && title.get(i.projectId), i.context].filter(Boolean).join(' · ');
      return [{ id: i.id, text: i.text, list, detail, href }];
    }),
    reviewOpen: !!openRun(),
    canSync: configuredSources().length > 0,
  };
}

// ── Reference ──────────────────────────────────────────────────────────────

export { guessReference, referenceHost, referenceLine } from './reference';

/** Reference entries, newest first. */
export function listReference(): Item[] {
  return store.getState().items.filter((i) => i.status === 'reference').sort(byNewest);
}

/** Does every word of `query` occur in the entry's text, body, URL (host too), tags or project? */
export function matchesReference(i: Item, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const r = i.reference;
  const project = i.projectId ? getProject(i.projectId)?.title : '';
  const hay = [i.text, r?.body, r?.url, r?.url && referenceHost(r.url), i.tags.join(' '), project].join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
}

function checkReference(r: Reference, scope: string) {
  check(['note', 'link', 'file'].includes(r.kind), `unknown kind ${r.kind}`, scope);
  if (r.kind === 'link') check(r.url && URL_IN_TEXT.test(r.url), 'a link needs a URL with a scheme (https://, obsidian://, …)', scope);
  if (r.kind === 'file') check(r.body?.trim(), 'a file needs a path or file name', scope);
}

function cleanReference(r: Reference): Reference {
  return {
    kind: r.kind,
    ...(r.kind === 'link' && r.url && { url: r.url.trim() }),
    ...(r.kind !== 'link' && r.body?.trim() && { body: r.body.trim() }),
  };
}

/** "+ reference" on a project (a note), or any entry made in place. */
export function addReference(text: string, reference: Reference, projectId?: string): Item {
  check(text.trim(), 'text is empty', 'addReference');
  checkReference(reference, 'addReference');
  if (projectId) check(getProject(projectId), `unknown project ${projectId}`, 'addReference');
  const item: Item = {
    id: crypto.randomUUID(),
    text: text.trim(),
    captured: text.trim(),
    source: 'typed',
    capturedAt: now().toISOString(),
    status: 'reference',
    reference: cleanReference(reference),
    tags: [],
    ...(projectId && { projectId }),
  };
  store.update((s) => {
    s.items.push(item);
  });
  return item;
}

export interface ReferenceEdit {
  text?: string;
  reference?: Reference;
  /** `null` = loose (no project). */
  project?: ProjectChoice | null;
}

/** Edit an entry in place: its text, kind and URL / body, or its project. */
export function editReference(id: string, edit: ReferenceEdit): void {
  const state = store.getState();
  check(state.items.find((i) => i.id === id)?.status === 'reference', `item ${id} is not a reference entry`, 'editReference');
  if (edit.text !== undefined) check(edit.text.trim(), 'text is empty', 'editReference');
  if (edit.reference) checkReference(edit.reference, 'editReference');
  const choice = edit.project;
  if (choice && 'id' in choice) check(state.projects.some((p) => p.id === choice.id), `unknown project ${choice.id}`, 'editReference');
  if (choice && 'newTitle' in choice) checkNewTitle(state, choice.newTitle, 'editReference');
  store.update((s) => {
    const it = s.items.find((i) => i.id === id)!;
    if (edit.text !== undefined) it.text = edit.text.trim();
    if (edit.reference) it.reference = cleanReference(edit.reference);
    if (choice === null) delete it.projectId;
    else if (choice) it.projectId = 'id' in choice ? choice.id : addProject(s, choice.newTitle);
  });
}

/** Someday → Reference: kept, no longer an idea to activate. Its bucket stays for the way back. */
export function toReference(id: string): void {
  check(getItem(id)?.status === 'someday', `item ${id} is not someday`, 'toReference');
  store.update((s) => {
    const it = s.items.find((i) => i.id === id)!;
    it.status = 'reference';
    it.reference ??= guessReference(it.text);
  });
}

/** Reference → Someday: an idea again. What it pointed to stays on the item. */
export function toSomeday(id: string): void {
  check(getItem(id)?.status === 'reference', `item ${id} is not a reference entry`, 'toSomeday');
  store.update((s) => {
    s.items.find((i) => i.id === id)!.status = 'someday';
  });
}
