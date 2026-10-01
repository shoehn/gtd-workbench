// iCalendar → ExternalEvent[] for a window of days. Recurring events are expanded inside the
// window only (RRULE, EXDATE, RECURRENCE-ID exceptions, cancelled occurrences). Only title,
// start, end, all-day and location are kept — no description, no attendees (SPEC §3.6).
import ICAL from 'ical.js';
import { instantAt, isTimeZone, zonedIso } from '../clock';
import type { ExternalEvent } from '../model';
import { addDays } from '../week';

export interface IcsWindow {
  /** ISO dates, inclusive. */
  from: string;
  to: string;
  /** The app's zone: where times are written to and floating times are read in. */
  timeZone?: string;
  calendar: string;
  sourceId: string;
}

/** Stop expanding a rule after this many occurrences (a daily rule over 70 days needs 70). */
const MAX_OCCURRENCES = 2000;

type Time = InstanceType<typeof ICAL.Time>;

const pad = (n: number) => String(n).padStart(2, '0');
const dayOf = (t: Time) => `${t.year}-${pad(t.month)}-${pad(t.day)}`;

/** The instant a non-date ICAL.Time stands for. */
function instantOf(t: Time, timeZone?: string): Date {
  // `timezone` is the TZID as written; ical.js sets it at runtime (not in its typings) when the
  // feed has no VTIMEZONE for it.
  const tzid = (t as Time & { timezone?: string }).timezone || t.zone?.tzid;
  if (tzid === 'Z' || tzid === 'UTC' || t.zone === ICAL.Timezone.utcTimezone) return new Date(t.toUnixTime() * 1000);
  if (tzid && isTimeZone(tzid)) return instantAt(dayOf(t), t.hour, t.minute, t.second, 0, tzid);
  // A zone only defined by the feed's own VTIMEZONE (e.g. Windows names): ical.js knows it.
  if (tzid && t.zone && t.zone !== ICAL.Timezone.localTimezone) return new Date(t.toUnixTime() * 1000);
  return instantAt(dayOf(t), t.hour, t.minute, t.second, 0, timeZone); // floating
}

interface Span {
  start: string;
  end: string;
  allDay: boolean;
}

function span(start: Time, end: Time | null, timeZone?: string): Span {
  if (start.isDate) {
    const from = dayOf(start);
    const until = end?.isDate ? dayOf(end) : addDays(from, 1);
    return { start: from, end: until > from ? until : addDays(from, 1), allDay: true };
  }
  const s = instantOf(start, timeZone);
  const e = end ? instantOf(end, timeZone) : s;
  return { start: zonedIso(s, timeZone), end: zonedIso(e.getTime() >= s.getTime() ? e : s, timeZone), allDay: false };
}

/** Does a span touch the window? All day: dates; timed: its wall-clock days in the app's zone. */
function inWindow(sp: Span, w: IcsWindow): boolean {
  const first = sp.start.slice(0, 10);
  const last = sp.allDay ? addDays(sp.end, -1) : sp.end.slice(0, 10);
  return first <= w.to && last >= w.from;
}

function cancelled(c: InstanceType<typeof ICAL.Component>): boolean {
  return String(c.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED';
}

function eventOf(w: IcsWindow, uid: string, recurrence: string, title: string, location: string | null, sp: Span): ExternalEvent {
  return {
    id: `${w.sourceId}|${uid}|${recurrence}`,
    calendar: w.calendar,
    title: title || '(no title)',
    start: sp.start,
    end: sp.end,
    allDay: sp.allDay,
    ...(location && { location }),
    sourceId: w.sourceId,
  };
}

/** Parse one iCalendar document. Malformed input throws (the source records the error). */
export function parseIcs(text: string, w: IcsWindow): ExternalEvent[] {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(tz);

  const vevents = root.getAllSubcomponents('vevent');
  const masters = new Set(vevents.filter((c) => !c.hasProperty('recurrence-id')).map((c) => String(c.getFirstPropertyValue('uid'))));
  const windowEnd = instantAt(addDays(w.to, 1), 0, 0, 0, 0, w.timeZone).getTime();
  const out: ExternalEvent[] = [];

  for (const comp of vevents) {
    const uid = String(comp.getFirstPropertyValue('uid') ?? '');
    const isException = comp.hasProperty('recurrence-id');
    // Exceptions are handled through their master; an orphan exception counts as a single event.
    if (isException && masters.has(uid)) continue;
    const event = new ICAL.Event(comp);
    if (!event.isRecurring()) {
      if (cancelled(comp)) continue;
      const sp = span(event.startDate, event.endDate, w.timeZone);
      if (inWindow(sp, w)) out.push(eventOf(w, uid, isException ? event.recurrenceId.toString() : '', event.summary, event.location, sp));
      continue;
    }
    const it = event.iterator();
    for (let n = 0; n < MAX_OCCURRENCES; n++) {
      const next = it.next();
      if (!next) break;
      const details = event.getOccurrenceDetails(next);
      const start = details.startDate;
      if (!start.isDate && instantOf(start, w.timeZone).getTime() >= windowEnd) break;
      if (start.isDate && dayOf(start) > w.to) break;
      if (cancelled(details.item.component)) continue;
      const sp = span(start, details.endDate, w.timeZone);
      if (!inWindow(sp, w)) continue;
      out.push(eventOf(w, uid, details.recurrenceId.toString(), details.item.summary, details.item.location, sp));
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
}
