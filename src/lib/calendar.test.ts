import { beforeEach, describe, expect, it } from 'vitest';
import * as api from './api';
import { demoSeed as seed } from './store/seed';
import { store } from './store';
import type { State } from './store/types';
import { compareStamps, isoWeek, parseWeek, shiftWeek, weekDays } from './week';

const item = (id: string) => api.getItem(id)!;
const W39 = '2026-W39';

beforeEach(() => {
  store.update((s) => Object.assign(s, structuredClone(seed) as State));
});

describe('iso weeks', () => {
  it('names and lists weeks Monday to Sunday', () => {
    expect(isoWeek('2026-09-26')).toBe(W39);
    expect(weekDays(W39)).toEqual(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27']);
    expect(isoWeek('2027-01-01')).toBe('2026-W53');
    expect(isoWeek('2026-01-01')).toBe('2026-W01');
    expect(shiftWeek(W39, 1)).toBe('2026-W40');
    expect(shiftWeek('2026-W01', -1)).toBe('2025-W52');
  });

  it('orders timestamps as instants, whatever their offset', () => {
    // 06:29Z is 08:29 in Bern: before 08:30+02:00, though it sorts after it as a string.
    expect(compareStamps('2026-09-26T06:29:00.000Z', '2026-09-26T08:30:00+02:00')).toBeLessThan(0);
    expect(compareStamps(undefined, '2026-09-26T08:30:00+02:00')).toBeLessThan(0);
    expect(compareStamps('2026-09-26T08:30:00+02:00', '2026-09-26T06:30:00Z')).toBe(0);
  });

  it('rejects weeks that do not exist', () => {
    expect(parseWeek('2026-W53')).toBe('2026-W53');
    expect(parseWeek('2025-W53')).toBeUndefined();
    expect(parseWeek('2026-W00')).toBeUndefined();
    expect(parseWeek('39')).toBeUndefined();
    expect(parseWeek(['2026-W39'])).toBeUndefined();
  });
});

describe('week landscape', () => {
  it('DoD: week 39 of the seed, as the mockup draws it', () => {
    const at = (day: string) =>
      api
        .weekLandscape(W39)
        .filter((e) => e.day === day)
        .map((e) => `${e.kind}: ${e.text}${'start' in e && e.start ? ` ${e.start}` : ''}${'done' in e && e.done ? ' (done)' : ''}`)
        .sort();
    expect(at('2026-09-21')).toEqual(['appointment: Client session 09:00']);
    expect(at('2026-09-22')).toEqual(['appointment: Studio meeting 13:00', 'dayaction: Hand in the project brief (done)']);
    expect(at('2026-09-23')).toEqual(['dayaction: Pay the printer invoice (done)']);
    expect(at('2026-09-24')).toEqual(['appointment: Office hours 16:00']);
    expect(at('2026-09-25')).toEqual(['info: Table offer arrives · decide by 03.10', 'timeblock: Deep work: welcome checklist 10:00']);
    expect(at('2026-09-26')).toEqual([
      'appointment: Call with team lead — funding report 14:00',
      'appointment: Dentist 10:00',
      'dayaction: Submit fair application',
    ]);
    expect(at('2026-09-27')).toEqual(['info: Bins out · paper', 'timeblock: Weekly review 17:00']);
  });

  it('a day action due that day is one entry, flagged deadline', () => {
    const c1 = api.weekLandscape(W39).find((e) => e.id === 'c1');
    expect(c1).toMatchObject({ kind: 'dayaction', deadline: true, done: false });
  });

  it('DoD: upcoming deadlines are the table offer, the reviewer comments and the conference', () => {
    expect(api.upcomingDeadlines().map((d) => [d.day, d.text, d.href])).toEqual([
      ['2026-10-03', 'Dining table decided and ordered', '/projects?p=p-table'],
      ['2026-10-12', 'Jury comments on the fair application', '/waiting'],
      ['2026-10-14', 'Design fair trip organised', '/projects?p=p-fair'],
    ]);
  });

  it('an action due without its project is its own deadline, linking to its row', () => {
    api.updateProject('p-table', { deadline: '' });
    expect(api.upcomingDeadlines()[0]).toMatchObject({ day: '2026-10-03', text: item('n1').text, href: '/next?highlight=n1' });
  });
});

describe('recurring', () => {
  it('repeats on every later week, marked projected', () => {
    const w41 = api.weekLandscape('2026-W41').filter((e) => e.kind === 'timeblock');
    expect(w41).toMatchObject([{ id: 'c5@2026-10-11', itemId: 'c5', day: '2026-10-11', start: '17:00', recurring: true, projected: true }]);
    expect(api.weekLandscape('2026-W38').some((e) => e.id.startsWith('c5'))).toBe(false);
  });

  it('completing one stores the next occurrence; undo takes it back', () => {
    const done = api.complete('c5');
    const next = store.getState().items.filter((i) => i.status === 'calendar' && i.text === 'Weekly review');
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ day: '2026-10-04', timeSlot: { start: '2026-10-04T17:00:00+02:00', end: '2026-10-04T18:00:00+02:00' }, tags: ['recurring:weekly'] });
    expect(api.weekLandscape('2026-W40').filter((e) => e.text === 'Weekly review').map((e) => 'projected' in e && e.projected)).toEqual([false]);
    expect(api.weekLandscape(W39).find((e) => e.id === 'c5')).toMatchObject({ done: true });

    api.uncomplete(done);
    expect(item('c5').status).toBe('calendar');
    expect(store.getState().items.filter((i) => i.text === 'Weekly review')).toHaveLength(1);
  });

  it('undo takes back only the occurrence completing created — a twin with the same title and day stays', () => {
    // A separate recurring checklist that happens to share title and day with c5's next occurrence.
    const twin = { ...structuredClone(item('c5')), id: 'twin', day: '2026-10-04', timeSlot: undefined, capturedAt: '2026-09-20T08:00:00+02:00' };
    delete twin.timeSlot;
    store.update((s) => {
      s.items.push(twin);
    });
    const done = api.complete('c5');
    api.uncomplete(done);
    expect(item('twin')).toMatchObject({ status: 'calendar', day: '2026-10-04' });
    expect(store.getState().items.filter((i) => i.text === 'Weekly review' && i.status === 'calendar').map((i) => i.id).sort()).toEqual(['c5', 'twin']);
  });

  it('unticking later (Calendar checkbox, no undo payload) also takes back exactly that occurrence', () => {
    api.complete('c5');
    const successor = store.getState().items.find((i) => i.status === 'calendar' && i.text === 'Weekly review')!;
    api.uncomplete({ id: 'c5', status: 'calendar' });
    expect(api.getItem(successor.id)).toBeUndefined();
    expect(item('c5')).toMatchObject({ status: 'calendar' });
    expect(item('c5').successorId).toBeUndefined();
  });

  it('a next occurrence that was done or trashed meanwhile is left alone', () => {
    api.complete('c5');
    const successor = store.getState().items.find((i) => i.status === 'calendar' && i.text === 'Weekly review')!;
    api.complete(successor.id);
    api.uncomplete({ id: 'c5', status: 'calendar' });
    expect(api.getItem(successor.id)?.status).toBe('done');
  });
});

describe('ticking in the Calendar (review P2 #6)', () => {
  const entry = (week: string, id: string) => api.weekLandscape(week).find((e) => e.id === id) as { tickable?: boolean; kind: string } | undefined;

  it("a calendar item's time block is tickable; a next action's block is not (its done belongs to Next)", () => {
    api.setTimeSlot('n2', '2026-09-21T09:00');
    expect(entry(W39, 'c5')).toMatchObject({ kind: 'timeblock', tickable: true });
    expect(entry(W39, 'n2')).toMatchObject({ kind: 'timeblock', tickable: false });
  });

  it('done stays tickable for a calendar item (untick), not for a next action; projected never', () => {
    expect(api.weekLandscape('2026-W41').find((e) => e.id.startsWith('c5@'))).toMatchObject({ tickable: false, projected: true });
    api.setTimeSlot('n2', '2026-09-21T09:00');
    api.complete('n2');
    api.complete('c5');
    expect(entry(W39, 'c5')).toMatchObject({ tickable: true });
    expect(entry(W39, 'n2')).toMatchObject({ tickable: false });
  });
});

describe('time blocks', () => {
  it('DoD: dropping n2 on Mon 09:00 blocks its hour; n2 stays starred', () => {
    api.setTimeSlot('n2', '2026-09-21T09:00');
    expect(item('n2')).toMatchObject({ status: 'next', timeSlot: { start: '2026-09-21T09:00', end: '2026-09-21T10:00' } });
    expect(api.weekLandscape(W39).find((e) => e.id === 'n2')).toMatchObject({ kind: 'timeblock', day: '2026-09-21', start: '09:00', href: '/next?highlight=n2' });
    expect(api.isFocused(item('n2'))).toBe(true);
  });

  it('a block on today stars the action; a block on another day leaves stars alone', () => {
    api.setTimeSlot('n3', '2026-09-26T15:00');
    expect(item('n3')).toMatchObject({ focusOn: '2026-09-26', timeSlot: { end: '2026-09-26T15:15' } });
    expect(api.focusToday().map((i) => i.id)).toContain('n3');
    expect(api.todayLandscape().map((e) => [e.kind, e.time])).toContainEqual(['timeblock', '15:00']);

    api.setTimeSlot('n4', '2026-09-28T09:00', '2026-09-28T09:30');
    expect(item('n4').focusOn).toBeUndefined();
    // Moving a starred action to another day keeps today's star.
    api.setTimeSlot('n3', '2026-09-28T10:00');
    expect(item('n3').focusOn).toBe('2026-09-26');
  });

  it('removing a block never touches the star', () => {
    api.setTimeSlot('n3', '2026-09-26T15:00');
    api.clearTimeSlot('n3');
    expect(item('n3').timeSlot).toBeUndefined();
    expect(api.isFocused(item('n3'))).toBe(true);
    api.setTimeSlot('n2', '2026-09-26T09:00');
    api.clearTimeSlot('n2');
    expect(api.isFocused(item('n2'))).toBe(true);
  });

  it('demoting drops the block, the day and the star; promotion starts clean', () => {
    api.setTimeSlot('n5', '2026-09-26T15:00');
    store.update((s) => {
      s.items.find((i) => i.id === 'n5')!.day = '2026-09-28';
    });
    api.demote('n5');
    expect(item('n5')).toMatchObject({ status: 'later' });
    for (const key of ['timeSlot', 'day', 'focusOn', 'context', 'priority', 'time', 'energy'] as const) {
      expect(item('n5')[key]).toBeUndefined();
    }
    api.promote('n5', { context: '@home', priority: 'C', time: 15, energy: 'low' });
    expect(item('n5')).toMatchObject({ status: 'next', context: '@home' });
    expect(item('n5').timeSlot).toBeUndefined();
    expect(item('n5').day).toBeUndefined();
    expect(api.isFocused(item('n5'))).toBe(false);
  });

  it('a calendar item moves with its slot, and back to its day without one', () => {
    api.setTimeSlot('c4', '2026-09-24T08:00', '2026-09-24T09:00');
    expect(item('c4')).toMatchObject({ day: '2026-09-24', timeSlot: { start: '2026-09-24T08:00' } });
    expect(item('c4').focusOn).toBeUndefined();
    api.clearTimeSlot('c4');
    expect(api.weekLandscape(W39).find((e) => e.id === 'c4')).toMatchObject({ kind: 'dayaction', day: '2026-09-24' });
    api.setDay('c4', '2026-09-23');
    expect(item('c4').day).toBe('2026-09-23');
  });

  it('refuses what cannot be blocked', () => {
    expect(() => api.setTimeSlot('l1', '2026-09-21T09:00')).toThrow(/^setTimeSlot:/);
    expect(() => api.setTimeSlot('n2', '2026-09-21 09:00')).toThrow(/^setTimeSlot:/);
    expect(() => api.setTimeSlot('n2', '2026-09-21T10:00', '2026-09-21T09:00')).toThrow(/^setTimeSlot:/);
    expect(() => api.clearTimeSlot('n1')).toThrow(/^clearTimeSlot:/);
    expect(() => api.setDay('n1', '2026-09-21')).toThrow(/^setDay:/);
  });
});

describe('tickler', () => {
  it('adds, edits and deletes day-specific information', () => {
    const t = api.addTickler('2026-09-24', '  Parcel at the post office ');
    expect(api.weekLandscape(W39).find((e) => e.id === t.id)).toMatchObject({ kind: 'info', day: '2026-09-24', text: 'Parcel at the post office' });
    api.updateTickler(t.id, 'Parcel at the kiosk');
    expect(store.getState().tickler.find((x) => x.id === t.id)?.text).toBe('Parcel at the kiosk');
    expect(() => api.updateTickler(t.id, ' ')).toThrow(/^updateTickler:/);
    api.deleteTickler(t.id);
    expect(store.getState().tickler.map((x) => x.id)).toEqual(['t1', 't2']);
  });
});
