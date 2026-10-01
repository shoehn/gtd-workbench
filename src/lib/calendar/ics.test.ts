import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseIcs } from './ics';

const fixture = (name: string) => readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const window = { from: '2026-09-19', to: '2026-11-25', timeZone: 'Europe/Zurich', calendar: 'Work', sourceId: 'work' };
const brief = (events: ReturnType<typeof parseIcs>) => events.map((e) => [e.title, e.start, e.end, e.allDay]);

describe('ics parser', () => {
  it('simple: zones converted to the app zone, out-of-window dropped, nothing private kept', () => {
    const events = parseIcs(fixture('simple.ics'), window);
    expect(brief(events)).toEqual([
      ['Studio meeting', '2026-09-28T09:00:00+02:00', '2026-09-28T10:00:00+02:00', false],
      ['Lunch call', '2026-09-29T14:00:00+02:00', '2026-09-29T15:00:00+02:00', false],
      ['Call with a client abroad', '2026-09-30T15:00:00+02:00', '2026-09-30T15:30:00+02:00', false],
    ]);
    expect(events[0]).toEqual({
      id: 'work|simple-1|',
      calendar: 'Work',
      title: 'Studio meeting',
      start: '2026-09-28T09:00:00+02:00',
      end: '2026-09-28T10:00:00+02:00',
      allDay: false,
      location: 'Studio',
      sourceId: 'work',
    });
    expect(JSON.stringify(events)).not.toMatch(/private notes|someone@example/);
  });

  it('recurring: expanded in the window, EXDATE skipped, a moved occurrence moved, a cancelled one gone', () => {
    const events = parseIcs(fixture('recurring.ics'), { ...window, to: '2026-10-25' });
    expect(brief(events)).toEqual([
      ['Weekly sync', '2026-09-21T10:00:00+02:00', '2026-09-21T11:00:00+02:00', false],
      ['Weekly sync (moved)', '2026-09-28T14:00:00+02:00', '2026-09-28T15:00:00+02:00', false],
      ['Weekly sync', '2026-10-19T10:00:00+02:00', '2026-10-19T11:00:00+02:00', false],
    ]);
    // one id per occurrence: source | uid | recurrence id
    expect(new Set(events.map((e) => e.id)).size).toBe(3);
    // winter time after 25.10 keeps 10:00 on the wall clock
    const late = parseIcs(fixture('recurring.ics'), { ...window, from: '2026-10-26' });
    expect(late[0].start).toBe('2026-10-26T10:00:00+01:00');
  });

  it('all day and multi-day: dates with an exclusive end; an overnight event keeps both days', () => {
    expect(brief(parseIcs(fixture('allday.ics'), window))).toEqual([
      ['Bank holiday', '2026-09-30', '2026-10-01', true],
      ['Design fair', '2026-10-02', '2026-10-05', true],
      ['Night kiln firing', '2026-09-26T22:00:00+02:00', '2026-09-27T02:00:00+02:00', false],
    ].sort((a, b) => String(a[1]).localeCompare(String(b[1]))));
  });

  // Review P2 #5: two ways a valid series lost occurrences inside the window.
  const W = { ...window, to: '2026-10-25' };
  const vcal = (...events: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', ...events, 'END:VCALENDAR'].join('\r\n');
  const vevent = (...lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');

  it('an old daily series (started 2020, > 2000 occurrences before the window) still shows in the window', () => {
    const ics = vcal(vevent('UID:daily-2020', 'DTSTART:20200101T080000Z', 'DTEND:20200101T081500Z', 'RRULE:FREQ=DAILY', 'SUMMARY:Standup'));
    const events = parseIcs(ics, W);
    expect(events).toHaveLength(37); // 19.09 … 25.10
    expect(events[0].start).toBe('2026-09-19T10:00:00+02:00');
    expect(events.at(-1)!.start).toBe('2026-10-25T09:00:00+01:00'); // winter time from 25.10
  });

  it('a slot from years before the window, moved into it, still shows (the fast skip must not lose it)', () => {
    const ics = vcal(
      vevent('UID:daily-2020', 'DTSTART:20200101T080000Z', 'DTEND:20200101T081500Z', 'RRULE:FREQ=DAILY;UNTIL=20210101T000000Z', 'SUMMARY:Standup'),
      vevent('UID:daily-2020', 'RECURRENCE-ID:20200301T080000Z', 'DTSTART:20261001T120000Z', 'DTEND:20261001T121500Z', 'SUMMARY:Standup (moved years later)'),
    );
    expect(brief(parseIcs(ics, W))).toEqual([['Standup (moved years later)', '2026-10-01T14:00:00+02:00', '2026-10-01T14:15:00+02:00', false]]);
  });

  it('an occurrence moved past the window does not end the series; one moved into the window shows', () => {
    const ics = vcal(
      vevent('UID:wk', 'DTSTART;TZID=Europe/Zurich:20260921T100000', 'DTEND;TZID=Europe/Zurich:20260921T110000', 'RRULE:FREQ=WEEKLY;COUNT=10', 'SUMMARY:Weekly sync'),
      // 28.09 moved far beyond the window
      vevent('UID:wk', 'RECURRENCE-ID;TZID=Europe/Zurich:20260928T100000', 'DTSTART;TZID=Europe/Zurich:20261210T100000', 'DTEND;TZID=Europe/Zurich:20261210T110000', 'SUMMARY:Weekly sync (moved out)'),
      // 09.11 (after the window) moved into it, onto 22.10
      vevent('UID:wk', 'RECURRENCE-ID;TZID=Europe/Zurich:20261109T100000', 'DTSTART;TZID=Europe/Zurich:20261022T090000', 'DTEND;TZID=Europe/Zurich:20261022T100000', 'SUMMARY:Weekly sync (moved in)'),
    );
    expect(brief(parseIcs(ics, W)).map(([t, s]) => [t, s])).toEqual([
      ['Weekly sync', '2026-09-21T10:00:00+02:00'],
      ['Weekly sync', '2026-10-05T10:00:00+02:00'],
      ['Weekly sync', '2026-10-12T10:00:00+02:00'],
      ['Weekly sync', '2026-10-19T10:00:00+02:00'],
      ['Weekly sync (moved in)', '2026-10-22T09:00:00+02:00'],
    ]);
  });

  it('malformed input throws', () => {
    expect(() => parseIcs('this is not a calendar', window)).toThrow();
  });
});
