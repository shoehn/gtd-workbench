// The only module the UI imports. Reads return store data plus derived values;
// nothing derived is ever written back to the store.
import { parse } from './capture-syntax';
import type { Item, Project, Source } from './model';
import { store } from './store/memory';

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
