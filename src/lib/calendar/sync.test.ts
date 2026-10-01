import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import * as api from '../api';
import type { ExternalEvent } from '../model';
import { store } from '../store';
import { demoSeed as seed } from '../store/seed';
import type { State } from '../store/types';
import { CalDavSource, FixtureCalendarSource, IcsUrlSource, calendarDataOf, sourcesFromEnv } from './sources';

const fixture = (name: string) => readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

beforeEach(() => {
  store.update((s) => Object.assign(s, structuredClone(seed) as State));
});

const ev = (uid: string, start: string, title = uid): ExternalEvent => ({
  id: `x|${uid}|`,
  calendar: 'X',
  title,
  start,
  end: start.replace('T10', 'T11'),
  allDay: false,
});

describe('sync', () => {
  it('upserts by (source, uid, recurrence), deletes what vanished, keeps other calendars', async () => {
    let feed = [ev('a', '2026-09-28T10:00:00+02:00'), ev('b', '2026-09-29T10:00:00+02:00')];
    const src = new FixtureCalendarSource('x', 'Studio', () => feed);
    const demo = store.getState().externalEvents.length;

    expect(await api.syncCalendars([src])).toEqual([{ source: 'Studio', ok: true, events: 2 }]);
    expect(store.getState().externalEvents).toHaveLength(demo + 2);
    expect(api.listExternalCalendars().find((c) => c.sourceId === 'x')).toMatchObject({ name: 'Studio', via: 'fixture' });
    expect(api.weekLandscape('2026-W40').filter((e) => e.kind === 'appointment').map((e) => e.text)).toEqual(['a', 'b']);

    feed = [ev('a', '2026-09-28T10:00:00+02:00', 'a, moved title')];
    await api.syncCalendars([src]);
    const mine = store.getState().externalEvents.filter((e) => e.sourceId === 'x');
    expect(mine.map((e) => e.title)).toEqual(['a, moved title']);
    expect(store.getState().externalEvents).toHaveLength(demo + 1);
  });

  it('a failure keeps the last events and is shown as "sync failed"', async () => {
    let fail = false;
    const src = new FixtureCalendarSource('x', 'Studio', () => {
      if (fail) throw new Error('Studio: not authorised (401) — check user and password');
      return [ev('a', '2026-09-28T10:00:00+02:00')];
    });
    await api.syncCalendars([src]);
    fail = true;
    expect(await api.syncCalendars([src])).toMatchObject([{ ok: false, error: /not authorised/ }]);
    expect(store.getState().externalEvents.some((e) => e.sourceId === 'x')).toBe(true);
    expect(api.calendarFailures()).toEqual([{ name: 'Studio', hoursAgo: 0, error: expect.stringMatching(/401/) }]);
    fail = false;
    await api.syncCalendars([src]);
    expect(api.calendarFailures()).toEqual([]);
  });

  it('overlapping runs share one', async () => {
    let calls = 0;
    const src = new FixtureCalendarSource('x', 'Studio', async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return [];
    });
    await Promise.all([api.syncCalendars([src]), api.syncCalendars([src])]);
    expect(calls).toBe(1);
  });

  it('a multi-day all-day event spans its days; an overnight one is split at midnight', async () => {
    const src = new FixtureCalendarSource('x', 'Studio', () => [
      { id: 'x|fair|', calendar: 'X', title: 'Design fair', start: '2026-10-02', end: '2026-10-05', allDay: true },
      { id: 'x|kiln|', calendar: 'X', title: 'Night kiln firing', start: '2026-09-30T22:00:00+02:00', end: '2026-10-01T02:00:00+02:00', allDay: false },
    ]);
    await api.syncCalendars([src]);
    const mine = api.weekLandscape('2026-W40').filter((e) => e.kind === 'appointment');
    expect(mine.map((e) => [e.day, e.text, 'start' in e ? e.start ?? '' : '', 'end' in e ? e.end ?? '' : '']).sort()).toEqual([
      ['2026-09-30', 'Night kiln firing', '22:00', '24:00'],
      ['2026-10-01', 'Night kiln firing', '00:00', '02:00'],
      ['2026-10-02', 'Design fair', '', ''],
      ['2026-10-03', 'Design fair', '', ''],
      ['2026-10-04', 'Design fair', '', ''],
    ]);
  });
});

describe('week grid hours', () => {
  it('08–18 unless something timed starts earlier or ends later', async () => {
    expect(api.weekHours(api.weekLandscape('2026-W39'))).toEqual([8, 18]);
    await api.syncCalendars([
      new FixtureCalendarSource('x', 'Studio', () => [
        { id: 'x|early|', calendar: 'X', title: 'Early train', start: '2026-09-22T06:30:00+02:00', end: '2026-09-22T07:15:00+02:00', allDay: false },
        { id: 'x|late|', calendar: 'X', title: 'Concert', start: '2026-09-24T19:00:00+02:00', end: '2026-09-24T21:30:00+02:00', allDay: false },
      ]),
    ]);
    expect(api.weekHours(api.weekLandscape('2026-W39'))).toEqual([6, 22]);
  });
});

describe('sources', () => {
  it('ics: GET with basic auth, webcal becomes https, parsed for the window', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const src = new IcsUrlSource({
      id: 'work',
      name: 'Work',
      url: 'webcal://calendar.example.com/feed.ics',
      user: 'me',
      pass: 'pw',
      fetch: (async (url: string, init?: RequestInit) => {
        calls.push([url, init]);
        return new Response(fixture('simple.ics'));
      }) as typeof fetch,
    });
    const events = await src.fetchEvents({ from: '2026-09-19', to: '2026-11-25', timeZone: 'Europe/Zurich' });
    expect(calls[0][0]).toBe('https://calendar.example.com/feed.ics');
    expect((calls[0][1]!.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from('me:pw').toString('base64')}`);
    expect(src.host).toBe('calendar.example.com');
    expect(events.map((e) => e.title)).toEqual(['Studio meeting', 'Lunch call', 'Call with a client abroad']);
  });

  it('caldav: one REPORT with a time range; calendar-data in any namespace, escaped or CDATA', async () => {
    const escaped = fixture('recurring.ics').replaceAll('&', '&amp;').replaceAll('<', '&lt;');
    const xml = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
      <d:response><d:href>/cal/1.ics</d:href><d:propstat><d:prop><cal:calendar-data>${escaped}</cal:calendar-data></d:prop></d:propstat></d:response>
      <d:response><d:href>/cal/2.ics</d:href><d:propstat><d:prop><cal:calendar-data><![CDATA[${fixture('allday.ics')}]]></cal:calendar-data></d:prop></d:propstat></d:response>
    </d:multistatus>`;
    let request: RequestInit | undefined;
    const src = new CalDavSource({
      id: 'home',
      name: 'Home',
      url: 'https://dav.example.com/calendars/me/home/',
      user: 'me',
      pass: 'pw',
      fetch: (async (_url: string, init?: RequestInit) => {
        request = init;
        return new Response(xml, { status: 207 });
      }) as typeof fetch,
    });
    const events = await src.fetchEvents({ from: '2026-09-19', to: '2026-10-25', timeZone: 'Europe/Zurich' });
    expect(request!.method).toBe('REPORT');
    expect(String(request!.body)).toContain('<C:time-range start="20260919T000000Z" end="20261027T000000Z"/>');
    expect(events.map((e) => e.title)).toEqual([
      'Weekly sync',
      'Night kiln firing',
      'Weekly sync (moved)',
      'Bank holiday',
      'Design fair',
      'Weekly sync',
    ]);
    expect(calendarDataOf('<x:calendar-data>a &lt;b&gt; &#38; c</x:calendar-data>')).toEqual(['a <b> & c']);
  });

  it('a wrong password is an error, not an empty calendar', async () => {
    const src = new CalDavSource({
      id: 'home',
      name: 'Home',
      url: 'https://dav.example.com/cal/',
      fetch: (async () => new Response('', { status: 401 })) as typeof fetch,
    });
    await expect(src.fetchEvents({ from: '2026-09-19', to: '2026-10-25' })).rejects.toThrow(/Home: not authorised \(401\)/);
  });

  it('reads the configuration from the environment, without exposing credentials', () => {
    const { sources, invalid } = sourcesFromEnv({
      CAL_WORK_URL: 'https://calendar.example.com/work.ics',
      CAL_PRIVATE_HOME_URL: 'https://dav.example.com/cal/',
      CAL_PRIVATE_HOME_USER: 'me',
      CAL_PRIVATE_HOME_PASS: 'secret',
      CAL_TEAM_URL: 'https://dav.example.com/team/',
      CAL_TEAM_KIND: 'caldav',
      CAL_TEAM_NAME: 'Team calendar',
      CAL_BROKEN_URL: 'not a url',
      OTHER: 'x',
    });
    expect(sources.map((s) => [s.id, s.name, s.kind, s.host])).toEqual([
      ['private_home', 'Private Home', 'CalDAV', 'dav.example.com'],
      ['team', 'Team calendar', 'CalDAV', 'dav.example.com'],
      ['work', 'Work', 'ics', 'calendar.example.com'],
    ]);
    expect(invalid).toEqual(['Broken']);
    expect(JSON.stringify(sources.map((s) => ({ ...s })))).not.toContain('secret');
  });
});
