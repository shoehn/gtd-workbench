// The only module the UI imports. Reads return store data plus derived values;
// nothing derived is ever written back to the store.
import type { Item, Project, Source } from './model';
import { store } from './store/memory';

const DAY_MS = 86_400_000;

/** Today as an ISO date (yyyy-mm-dd). The seed pins it; otherwise the real date. */
export function today(): string {
  return store.getState().today ?? new Date().toISOString().slice(0, 10);
}

/** "Now" consistent with today(): the real clock time on the (possibly pinned) date. */
function now(): Date {
  const real = new Date();
  const pinned = store.getState().today;
  if (!pinned) return real;
  const d = new Date(`${pinned}T00:00:00`);
  d.setHours(real.getHours(), real.getMinutes(), real.getSeconds());
  return d;
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

/** Whole days since capture. */
export function ageDays(item: Item): number {
  return Math.max(0, Math.floor((now().getTime() - Date.parse(item.capturedAt)) / DAY_MS));
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

/** Capture one line into the inbox. Never asks, never throws on input. */
export function capture(line: string, source: Source = 'typed'): Item | null {
  const text = line.trim();
  if (!text) return null;
  const item: Item = {
    id: crypto.randomUUID(),
    text,
    captured: line,
    source,
    capturedAt: new Date().toISOString(),
    status: 'inbox',
    tags: [],
  };
  store.update((s) => {
    s.items.push(item);
  });
  return item;
}
