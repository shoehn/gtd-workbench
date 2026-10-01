// Calendar sync in the server process: once at start, then every 15 minutes. A single-user app
// runs one server, so a timer is enough; api.syncCalendars() already keeps runs from overlapping.
import * as api from '../api';
import { log } from '../log';
import { sourcesFromEnv } from './sources';

const EVERY_MS = 15 * 60_000;
const g = globalThis as typeof globalThis & { __wbCalendarSync?: ReturnType<typeof setInterval> };

async function runOnce() {
  try {
    for (const r of await api.syncCalendars()) {
      if (r.ok) log.debug(`calendar ${r.source}: ${r.events} events`);
      else log.warn(`calendar ${r.source}: sync failed — ${r.error}`);
    }
  } catch (e) {
    log.error(`calendar sync: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function startCalendarSync(): void {
  if (g.__wbCalendarSync) return;
  const { sources, invalid } = sourcesFromEnv();
  for (const name of invalid) log.warn(`calendar ${name}: CAL_…_URL is not a valid URL — skipped`);
  log.info(`calendar sync: ${sources.length ? sources.map((s) => `${s.name} (${s.kind}, ${s.host})`).join(', ') : 'no sources configured'}`);
  // Also with no sources: drops calendars that were configured before and are not any more.
  void runOnce();
  if (!sources.length) return;
  g.__wbCalendarSync = setInterval(() => void runOnce(), EVERY_MS);
  g.__wbCalendarSync.unref?.();
}
