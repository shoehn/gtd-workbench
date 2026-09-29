// Where appointments come from. Read-only by design: nothing is ever written to a source
// (SPEC §3.6). The seed stands in for a CalDAV / Exchange adapter with the same interface.
import type { ExternalEvent } from './model';
import type { ExternalCalendar, State } from './store/types';

export interface CalendarSource {
  calendars(): ExternalCalendar[];
  /** When the source last synced (ISO); `undefined` = never. */
  syncedAt(): string | undefined;
  /** Events starting on the days `from`…`to` (ISO dates, inclusive). */
  events(from: string, to: string): ExternalEvent[];
}

type SeedState = Readonly<Pick<State, 'externalCalendars' | 'externalSyncedAt' | 'externalEvents'>>;

/** The seed's `externalEvents`, read from the store on every call. */
export class SeedCalendarSource implements CalendarSource {
  private readonly state: () => SeedState;

  constructor(state: () => SeedState) {
    this.state = state;
  }

  calendars(): ExternalCalendar[] {
    return this.state().externalCalendars;
  }

  syncedAt(): string | undefined {
    return this.state().externalSyncedAt;
  }

  events(from: string, to: string): ExternalEvent[] {
    return this.state().externalEvents.filter((e) => e.start.slice(0, 10) >= from && e.start.slice(0, 10) <= to);
  }
}
