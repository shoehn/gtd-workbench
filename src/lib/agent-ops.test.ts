import { beforeEach, describe, expect, it } from 'vitest';
import { runAs, runSilently } from './activity';
import * as api from './api';
import { store } from './store';
import { demoSeed as seed } from './store/seed';
import type { State } from './store/types';

beforeEach(() =>
  runSilently(() =>
    store.update((s) => {
      for (const key of Object.keys(s) as (keyof State)[]) delete s[key];
      Object.assign(s, structuredClone(seed));
    }),
  ),
);
const latest = () => api.listActivity({ limit: 1 })[0];
const PHONE = { kind: 'client', id: 'c1', name: 'Phone agent' } as const;

describe('file: capture and clarify in one', () => {
  it('"I am waiting on Alice for the video" lands in Waiting For as one entry by the client', () => {
    const before = store.getState().activity.length;
    const { itemId } = runAs(PHONE, () => api.file('Video from Alice', { kind: 'action', text: 'Video from Alice', route: { to: 'waiting', who: 'Alice' } }));
    expect(api.getItem(itemId)).toMatchObject({ status: 'waiting', source: 'typed', waiting: { who: 'Alice' } });
    expect(store.getState().activity.length).toBe(before + 1);
    expect(latest()).toMatchObject({ actorLabel: 'Phone agent', summary: 'Added “Video from Alice” to Waiting For (Alice)' });
  });

  it('a new project is born through file as through Clarify', () => {
    const { projectId, projectCreated } = api.file('Get quotes', { kind: 'action', text: 'Get quotes for the kiln', project: { newTitle: 'New kiln installed' }, route: { to: 'next', context: '@calls', priority: 'B', time: 30, energy: 'normal' } });
    expect(projectCreated).toBe(true);
    expect(api.getProject(projectId!)).toMatchObject({ title: 'New kiln installed', status: 'active' });
  });

  it('a refused decision leaves no item and no entry', () => {
    const items = store.getState().items.length;
    const entries = store.getState().activity.length;
    expect(() => api.file('Call Bob', { kind: 'action', text: 'Call Bob', route: { to: 'next', context: '@nowhere', priority: 'B', time: 15, energy: 'low' } })).toThrow('clarify: unknown context @nowhere');
    expect(store.getState().items.length).toBe(items);
    expect(store.getState().activity.length).toBe(entries);
  });

  it('an empty text is refused', () => {
    expect(() => api.file('  ', { kind: 'trash' })).toThrow('file: text is empty');
  });
});

describe('editWaiting', () => {
  const waitingId = () => store.getState().items.find((i) => i.status === 'waiting')!.id;

  it('moves the follow-up date ("she said next week") and renames who', () => {
    const id = waitingId();
    api.editWaiting(id, { followUp: '2026-10-09', who: ' Shop owner ' });
    expect(api.getItem(id)!.waiting).toMatchObject({ who: 'Shop owner', followUp: '2026-10-09' });
    api.editWaiting(id, { followUp: null });
    expect(api.getItem(id)!.waiting!.followUp).toBeUndefined();
  });

  it('refused for anything that is not a waiting-for, and for bad values', () => {
    expect(() => api.editWaiting('n1', { followUp: '2026-10-09' })).toThrow('waiting: item n1 is not a waiting-for');
    expect(() => api.editWaiting(waitingId(), { who: '  ' })).toThrow('waiting: who is empty');
    expect(() => api.editWaiting(waitingId(), { followUp: '09.10' })).toThrow('waiting: follow-up is not an ISO date');
  });
});

describe('overview', () => {
  it('the situation right now, from the lists', () => {
    const o = api.overview();
    expect(o.today).toBe('2026-09-26');
    expect(o.inbox.count).toBe(api.listInbox().length);
    expect(o.inbox.oldest).toMatchObject({ id: api.listInbox().at(-1)!.id });
    expect(o.stalled.map((p) => p.id)).toEqual(api.listProjects().filter(api.projectStalled).map((p) => p.id));
    expect(o.waitingOverdue.every((w) => w.followUp < o.today)).toBe(true);
    expect(o.deadlines.every((d) => d.day <= '2026-10-03')).toBe(true);
    expect(o.landscape).toEqual(api.todayLandscape());
    expect(['due', 'in progress']).toContain(typeof o.review === 'string' ? o.review : 'done');
  });

  it('an empty inbox has no oldest', () => {
    runSilently(() => store.update((s) => (s.items = s.items.filter((i) => i.status !== 'inbox'))));
    expect(api.overview().inbox).toEqual({ count: 0 });
  });
});

describe('freeTime', () => {
  const MON = '2026-09-28';
  const setDay = () =>
    runSilently(() =>
      store.update((s) => {
        for (const i of s.items) if (i.timeSlot?.start.startsWith(MON)) delete i.timeSlot;
        s.externalEvents = [
          { id: 'x1', calendar: 'Work', title: 'Studio meeting', start: `${MON}T09:00:00+02:00`, end: `${MON}T10:00:00+02:00`, allDay: false },
          { id: 'x2', calendar: 'Work', title: 'Holiday', start: MON, end: '2026-09-29', allDay: true },
        ];
        s.items.find((i) => i.id === 'n2')!.timeSlot = { start: `${MON}T13:00`, end: `${MON}T14:30` };
      }),
    );

  it('gaps between appointments and blocks within the day hours; all-day entries do not block', () => {
    setDay();
    expect(api.freeTime(MON, MON, 90)).toEqual([
      { day: MON, start: '10:00', end: '13:00', minutes: 180 },
      { day: MON, start: '14:30', end: '18:00', minutes: 210 },
    ]);
    expect(api.freeTime(MON, MON, 30, { start: '07:00', end: '09:00' })).toEqual([{ day: MON, start: '07:00', end: '09:00', minutes: 120 }]);
  });

  it('today starts at now; earlier days have no free time', () => {
    expect(api.freeTime('2026-09-20', '2026-09-25')).toEqual([]);
    const nowMin = api.minutesOfDay();
    for (const slot of api.freeTime('2026-09-26', '2026-09-26', 5, { start: '00:00', end: '23:59' })) {
      expect(Number(slot.start.slice(0, 2)) * 60 + Number(slot.start.slice(3))).toBeGreaterThanOrEqual(nowMin);
    }
  });

  it('refuses bad ranges and hours', () => {
    expect(() => api.freeTime('2026-09-30', '2026-09-28')).toThrow('freeTime: from is after to');
    expect(() => api.freeTime('2026-09-28', '2026-12-31')).toThrow('freeTime: at most 62 days');
    expect(() => api.freeTime('28.09', '2026-09-28')).toThrow('freeTime: dates are yyyy-mm-dd');
    expect(() => api.freeTime(MON, MON, 30, { start: '18:00', end: '08:00' })).toThrow('freeTime: day hours end before they start');
  });
});
