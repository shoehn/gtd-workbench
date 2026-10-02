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

/** A mail the poller has handled once (SPEC §3.1): never captured twice. */
export interface MailSeen {
  /** The Message-ID header, or `sha256:<hash of the source>` for a mail without one. */
  messageId: string;
  at: string;
  /** captured → an inbox item; duplicate → the same mail is still in the inbox; ignored → sender not allowed. */
  outcome: 'captured' | 'duplicate' | 'ignored';
  itemId?: string;
}

/** The capture mailbox's last poll, shown on Settings and /api/health. */
export interface MailboxStatus {
  lastPollAt?: string;
  lastError?: string;
  lastErrorAt?: string;
}

/** Who made a change (MCP design §3.2). */
export type Actor =
  | { kind: 'user' }
  | { kind: 'client'; id: string; name: string }
  | { kind: 'mail' }
  | { kind: 'share' }
  | { kind: 'system' };

/** One entity a change touched, as it was before and after (`null`: did not exist). */
export interface ActivityChange {
  kind: 'item' | 'project' | 'tickler';
  id: string;
  before: Item | Project | TicklerEntry | null;
  after: Item | Project | TicklerEntry | null;
}

export interface ActivityEntry {
  id: string;
  /** ISO, UTC. */
  at: string;
  actor: Actor;
  /** In words: "“Call Alice”: Inbox → Waiting For (Alice)". */
  summary: string;
  changes: ActivityChange[];
  /** This entry undid that one. */
  undoOf?: string;
}

/** An API client (MCP, scripts); only the SHA-256 of its token is kept. */
export interface StoredClient {
  id: string;
  name: string;
  preset: 'capture' | 'read-only' | 'assistant';
  tokenHash: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
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
  /** Colour theme; `system` follows the OS (prefers-color-scheme). */
  theme: Settings['theme'];
  /** Areas counted as "work" or "home" by the Projects filter chips; others count as neither. */
  areaKinds: Record<string, 'work' | 'home'>;
  projects: Project[];
  items: Item[];
  tickler: TicklerEntry[];
  externalCalendars: ExternalCalendar[];
  /** ISO; when the external calendars last synced. */
  externalSyncedAt?: string;
  externalEvents: ExternalEvent[];
  mailSeen: MailSeen[];
  mailbox?: MailboxStatus;
  /** Every change to items, projects and tickler notes, oldest first (kept 365 days). */
  activity: ActivityEntry[];
  /** API clients (MCP, scripts): a name, a preset and the hash of their token. */
  clients: StoredClient[];
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
