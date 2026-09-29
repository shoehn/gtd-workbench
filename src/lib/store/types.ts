import type { ExternalEvent, Item, Project, ReviewRun, ReviewTemplate } from '../model';

/** Day-specific information (SPEC §3.6, kind 4). */
export interface TicklerEntry { day: string; text: string }

export interface State {
  /** Fixed "today" (ISO date) for the seed; absent means the real date. */
  today?: string;
  contexts: string[];
  buckets: string[];
  /** Areas counted as "work" or "home" by the Projects filter chips; others count as neither. */
  areaKinds: Record<string, 'work' | 'home'>;
  projects: Project[];
  items: Item[];
  tickler: TicklerEntry[];
  externalEvents: ExternalEvent[];
  reviewTemplate: ReviewTemplate;
  reviewRun?: ReviewRun;
}

/** The persistence seam: memory.ts now, sqlite.ts later. */
export interface Store {
  getState(): Readonly<State>;
  /** Mutate the single state in place; subscribers are notified afterwards. */
  update(fn: (state: State) => void): void;
  /** Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}
