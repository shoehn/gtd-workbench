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

  it('malformed input throws', () => {
    expect(() => parseIcs('this is not a calendar', window)).toThrow();
  });
});
