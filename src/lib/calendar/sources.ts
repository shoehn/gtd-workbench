// Where appointments come from (SPEC §3.6). Read-only by design: a source can only fetch;
// nothing is ever written back. Two real kinds — a published .ics URL and a CalDAV calendar —
// and a fixture source for tests. Credentials come from the environment only and are never
// stored or logged; what the app keeps and shows is the URL's host.
import type { ExternalEvent } from '../model';
import { parseIcs, type IcsWindow } from './ics';

export interface FetchWindow {
  /** ISO dates, inclusive. */
  from: string;
  to: string;
  /** The app's time zone (Settings.timezone, else TZ). */
  timeZone?: string;
}

export interface CalendarSource {
  /** Stable id, from the env name: `CAL_WORK_URL` → `work`. */
  readonly id: string;
  readonly name: string;
  /** `ics`, `CalDAV` or `fixture`: shown on Settings. */
  readonly kind: string;
  /** Host of the URL, never the credentials. */
  readonly host: string;
  fetchEvents(window: FetchWindow): Promise<ExternalEvent[]>;
}

type Fetch = typeof fetch;
const TIMEOUT_MS = 20_000;
/** A feed larger than this is refused rather than parsed. */
const MAX_BYTES = 10 * 1024 * 1024;

interface RemoteOptions {
  id: string;
  name: string;
  url: string;
  user?: string;
  pass?: string;
  fetch?: Fetch;
}

function basicAuth(user?: string, pass?: string): Record<string, string> {
  return user ? { authorization: `Basic ${Buffer.from(`${user}:${pass ?? ''}`).toString('base64')}` } : {};
}

async function readBody(res: Response, what: string): Promise<string> {
  if (res.status === 401 || res.status === 403) throw new Error(`${what}: not authorised (${res.status}) — check user and password`);
  if (!res.ok && res.status !== 207) throw new Error(`${what}: HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error(`${what}: feed larger than 10 MB`);
  return text;
}

/** A published calendar: GET an .ics (webcal:// works too); covers Outlook / Exchange / Google "publish" links. */
export class IcsUrlSource implements CalendarSource {
  readonly kind = 'ics';
  readonly id: string;
  readonly name: string;
  readonly host: string;
  private readonly url: string;
  private readonly headers: Record<string, string>;
  private readonly fetch: Fetch;

  constructor(o: RemoteOptions) {
    this.id = o.id;
    this.name = o.name;
    this.url = o.url.replace(/^webcals?:\/\//i, 'https://');
    this.host = new URL(this.url).host;
    this.headers = { accept: 'text/calendar', ...basicAuth(o.user, o.pass) };
    this.fetch = o.fetch ?? fetch;
  }

  async fetchEvents(w: FetchWindow): Promise<ExternalEvent[]> {
    const res = await this.fetch(this.url, { headers: this.headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return parseIcs(await readBody(res, this.name), { ...w, calendar: this.name, sourceId: this.id });
  }
}

const icalStamp = (day: string) => `${day.replaceAll('-', '')}T000000Z`;

/** The CalDAV query: VEVENTs touching the window, with their iCalendar data. */
function calendarQuery(w: FetchWindow, until: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><C:calendar-data/></D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${icalStamp(w.from)}" end="${icalStamp(until)}"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/** The iCalendar documents in a CalDAV multistatus response (any namespace prefix, CDATA or escaped). */
export function calendarDataOf(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<(?:[\w-]+:)?calendar-data\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?calendar-data>/g)) {
    const raw = m[1].trim();
    const cdata = raw.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
    out.push(
      cdata
        ? cdata[1]
        : raw.replace(/&(#x?[0-9a-f]+|\w+);/gi, (all, e: string) =>
            e[0] === '#' ? String.fromCodePoint(parseInt(e.slice(1).replace(/^x/i, ''), /^#x/i.test(e) ? 16 : 10)) : (ENTITIES[e] ?? all),
          ),
    );
  }
  return out;
}

/**
 * A CalDAV calendar collection (the calendar's own URL): one REPORT calendar-query with a
 * time range and basic auth; the server expands nothing, recurrence is expanded here.
 */
export class CalDavSource implements CalendarSource {
  readonly kind = 'CalDAV';
  readonly id: string;
  readonly name: string;
  readonly host: string;
  private readonly url: string;
  private readonly headers: Record<string, string>;
  private readonly fetch: Fetch;

  constructor(o: RemoteOptions) {
    this.id = o.id;
    this.name = o.name;
    this.url = o.url;
    this.host = new URL(o.url).host;
    this.headers = { depth: '1', 'content-type': 'application/xml; charset=utf-8', ...basicAuth(o.user, o.pass) };
    this.fetch = o.fetch ?? fetch;
  }

  async fetchEvents(w: FetchWindow): Promise<ExternalEvent[]> {
    const until = new Date(Date.parse(`${w.to}T00:00:00Z`) + 2 * 86_400_000).toISOString().slice(0, 10);
    const res = await this.fetch(this.url, {
      method: 'REPORT',
      headers: this.headers,
      body: calendarQuery(w, until),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const docs = calendarDataOf(await readBody(res, this.name));
    const win: IcsWindow = { ...w, calendar: this.name, sourceId: this.id };
    const seen = new Set<string>();
    return docs
      .flatMap((doc) => parseIcs(doc, win))
      .filter((e) => !seen.has(e.id) && !!seen.add(e.id))
      .sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  }
}

/** Fixed events, for tests (and as the shape of any future source). */
export class FixtureCalendarSource implements CalendarSource {
  readonly kind = 'fixture';
  readonly host = 'fixture';
  constructor(
    readonly id: string,
    readonly name: string,
    private readonly events: () => ExternalEvent[] | Promise<ExternalEvent[]>,
  ) {}

  async fetchEvents(): Promise<ExternalEvent[]> {
    return (await this.events()).map((e) => ({ ...e, sourceId: this.id, calendar: this.name }));
  }
}

/**
 * Sources configured in the environment: `CAL_<ID>_URL` (required), `CAL_<ID>_NAME` (default
 * the id in title case), `CAL_<ID>_KIND` (`ics` | `caldav`; default caldav when a user is set),
 * `CAL_<ID>_USER`, `CAL_<ID>_PASS`. A source with a bad URL is skipped (and named in the result).
 */
export function sourcesFromEnv(env: Record<string, string | undefined> = process.env, fetchImpl?: Fetch) {
  const sources: CalendarSource[] = [];
  const invalid: string[] = [];
  for (const key of Object.keys(env).sort()) {
    const m = key.match(/^CAL_([A-Z0-9_]+)_URL$/);
    if (!m || !env[key]) continue;
    const idPart = m[1];
    const get = (suffix: string) => env[`CAL_${idPart}_${suffix}`] || undefined;
    const name = get('NAME') ?? idPart.toLowerCase().replace(/(^|_)(\w)/g, (_, sep: string, c: string) => (sep ? ' ' : '') + c.toUpperCase());
    const user = get('USER');
    const kind = (get('KIND') ?? (user ? 'caldav' : 'ics')).toLowerCase();
    const options: RemoteOptions = { id: idPart.toLowerCase(), name, url: env[key]!, user, pass: get('PASS'), fetch: fetchImpl };
    try {
      sources.push(kind === 'caldav' ? new CalDavSource(options) : new IcsUrlSource(options));
    } catch {
      invalid.push(name);
    }
  }
  return { sources, invalid };
}
