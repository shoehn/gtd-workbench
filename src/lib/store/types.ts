import type { ExternalEvent, Item, Project, ReviewRun, ReviewTemplate, Settings } from '../model';

/** Day-specific information (SPEC §3.6, kind 4). */
export interface TicklerEntry { id: string; day: string; text: string }

/** An external calendar the appointments are synced from, e.g. `Work` via `ics`. */
export interface ExternalCalendar {
  name: string;
  /** How it is read: `ics`, `CalDAV` (demo calendars name their server, e.g. `Exchange`). */
  via: string;
  /** Configured sources only (env `CAL_<ID>_URL`); absent = demo data, never synced. */
  sourceId?: string;
  /** Host of the URL, shown on Settings; never the credentials. */
  host?: string;
  lastSyncAt?: string;
  lastError?: string;
  lastErrorAt?: string;
}

export interface State {
  /** Fixed "today" (ISO date) for the seed; absent means the real date. */
  today?: string;
  contexts: string[];
  buckets: string[];
  /** One of `contexts`: where a follow-up on a waiting-for lands. */
  followUpContext: string;
  weekStart: Settings['weekStart'];
  /** IANA time zone for "today", midnight and overdue; empty = the server's (TZ). */
  timezone: string;
  /** Areas counted as "work" or "home" by the Projects filter chips; others count as neither. */
  areaKinds: Record<string, 'work' | 'home'>;
  projects: Project[];
  items: Item[];
  tickler: TicklerEntry[];
  externalCalendars: ExternalCalendar[];
  /** ISO; when the external calendars last synced. */
  externalSyncedAt?: string;
  externalEvents: ExternalEvent[];
  reviewTemplate: ReviewTemplate;
  /** All review runs, oldest first; at most one is open (no `outcome`). */
  reviewRuns: ReviewRun[];
}

/** The persistence seam: memory.ts now, sqlite.ts later. */
export interface Store {
  getState(): Readonly<State>;
  /** Mutate the single state in place; subscribers are notified afterwards. */
  update(fn: (state: State) => void): void;
  /** Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}
