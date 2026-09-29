import { beforeEach, describe, expect, it } from 'vitest';
import * as api from './api';
import seed from './store/seed.json';
import { store } from './store';
import type { State } from './store/types';

const item = (id: string) => api.getItem(id)!;
const project = (id: string) => store.getState().projects.find((p) => p.id === id);
const nextOf = (projectId: string) => api.listNext().filter((i) => i.projectId === projectId).map((i) => i.id);

beforeEach(() => {
  store.update((s) => Object.assign(s, structuredClone(seed) as State));
});

describe('clarify — not actionable', () => {
  it.each(['trash', 'someday', 'reference'] as const)('moves the item to %s and leaves its text alone', (kind) => {
    const before = api.navCounts().inbox;
    const res = api.clarify('i9', { kind });
    expect(res).toEqual({ itemId: 'i9', projectCreated: false });
    expect(item('i9')).toMatchObject({ status: kind, text: 'Maybe learn to solder SMD by hand' });
    expect(api.navCounts().inbox).toBe(before - 1);
  });
});

describe('clarify — single action', () => {
  it('do it now: done with doneAt', () => {
    api.clarify('i1', { kind: 'action', text: 'Call the dentist about the invoice', route: { to: 'done' } });
    expect(item('i1').status).toBe('done');
    expect(item('i1').doneAt).toMatch(/^2026-09-26T/);
    expect(item('i1').projectId).toBeUndefined();
  });

  it('delegate: waiting for whom, since today, optional follow-up', () => {
    api.clarify('i8', {
      kind: 'action',
      text: 'Annex needed for the grant report?',
      route: { to: 'waiting', who: ' Marc ', followUp: '2026-10-01' },
    });
    expect(item('i8')).toMatchObject({
      status: 'waiting',
      text: 'Annex needed for the grant report?',
      captured: 'Ask Marc whether the grant report needs the annex',
      waiting: { who: 'Marc', since: '2026-09-26', followUp: '2026-10-01' },
    });
  });

  it('defer to next actions: running number inside the priority, C has none', () => {
    api.clarify('i4', {
      kind: 'action',
      text: 'Replace the kitchen tap cartridge',
      route: { to: 'next', context: '@home', priority: 'A', time: 60, energy: 'normal' },
    });
    expect(item('i4')).toMatchObject({ status: 'next', context: '@home', priority: 'A', priorityNo: 4, time: 60 });
    expect(item('i4').deadline).toBeUndefined();

    api.clarify('i5', {
      kind: 'action',
      text: 'Read Anna\'s notes on Deep Work ch. 3',
      route: { to: 'next', context: '@home', priority: 'C', time: 30, energy: 'low' },
    });
    expect(item('i5').priority).toBe('C');
    expect(item('i5').priorityNo).toBeUndefined();
  });

  it('defer to calendar: day, optional time slot, no context or priority', () => {
    api.capture('Pick up the parcel @errands !B ^fri');
    const id = api.listInbox()[0].id;
    api.clarify(id, { kind: 'action', text: 'Pick up the parcel', route: { to: 'calendar', day: '2026-10-02', start: '10:00', end: '10:30' } });
    const i = item(id);
    expect(i).toMatchObject({ status: 'calendar', day: '2026-10-02', timeSlot: { start: '2026-10-02T10:00', end: '2026-10-02T10:30' } });
    expect(i.context).toBeUndefined();
    expect(i.priority).toBeUndefined();
  });
});

describe('clarify — projects', () => {
  it('DoD walk: i4 into "Home maintenance 2026", box unticked, becomes a later step', () => {
    const before = api.navCounts();
    const res = api.clarify('i4', { kind: 'later', text: 'Replace the kitchen tap cartridge', project: { id: 'p-home' } });
    expect(res).toEqual({ itemId: 'i4', projectId: 'p-home', projectCreated: false });
    expect(item('i4')).toMatchObject({ status: 'later', projectId: 'p-home', text: 'Replace the kitchen tap cartridge' });
    expect(nextOf('p-home')).toEqual(['n9']);
    expect(api.navCounts()).toMatchObject({ inbox: before.inbox - 1, next: before.next, projects: before.projects });
  });

  it('new project + next action', () => {
    const before = api.navCounts();
    const res = api.clarify('i2', {
      kind: 'action',
      text: 'Draft the silent-brainstorm prompt cards',
      project: { newTitle: 'Module retrospective run as a silent brainstorm' },
      route: { to: 'next', context: '@computer', priority: 'A', time: 30, energy: 'focus', deadline: '2026-10-03' },
    });
    expect(res.projectCreated).toBe(true);
    expect(project(res.projectId!)).toMatchObject({ title: 'Module retrospective run as a silent brainstorm', status: 'active' });
    expect(item('i2')).toMatchObject({
      status: 'next',
      projectId: res.projectId,
      text: 'Draft the silent-brainstorm prompt cards',
      captured: 'Idea: run the module retrospective as a silent brainstorm',
      context: '@computer',
      priority: 'A',
      priorityNo: 4,
      time: 30,
      energy: 'focus',
      deadline: '2026-10-03',
    });
    expect(api.projectStalled(project(res.projectId!)!)).toBe(false);
    expect(api.navCounts()).toMatchObject({ inbox: before.inbox - 1, next: before.next + 1, projects: before.projects + 1 });
  });

  it('refuses a new project whose title already exists', () => {
    expect(() =>
      api.clarify('i2', { kind: 'later', text: 'x', project: { newTitle: '  workshop BENCH decided  and ordered ' } }),
    ).toThrow('clarify: project "Workshop bench decided and ordered" already exists');
  });

  it('existing project + later step: no step 4, capture fields dropped, next actions untouched', () => {
    api.capture('Order the bench legs @computer !A');
    const id = api.listInbox()[0].id;
    const res = api.clarify(id, { kind: 'later', text: 'Order the bench legs', project: { id: 'p-bench' } });
    expect(res).toEqual({ itemId: id, projectId: 'p-bench', projectCreated: false });
    const i = item(id);
    expect(i).toMatchObject({ status: 'later', projectId: 'p-bench' });
    expect(i.context).toBeUndefined();
    expect(i.priority).toBeUndefined();
    expect(nextOf('p-bench')).toEqual(['n1', 'n8']);
  });

  it('later step into a new project leaves it stalled — flagged, not fixed', () => {
    const res = api.clarify('i6', { kind: 'later', text: 'Book train for the Zurich conference', project: { newTitle: 'Zurich trip' } });
    expect(api.projectStalled(project(res.projectId!)!)).toBe(true);
  });

  it('a next action in a project that has some adds another, demoting nothing', () => {
    api.clarify('i6', {
      kind: 'action',
      text: 'Book train Bern → Zurich for 14.10',
      project: { id: 'p-conf' },
      route: { to: 'next', context: '@computer', priority: 'B', time: 15, energy: 'low' },
    });
    expect(nextOf('p-conf').sort()).toEqual(['i6', 'n4']);
    expect(item('n4')).toMatchObject({ status: 'next', context: '@computer', priority: 'B', priorityNo: 2 });
  });

  it('new next action in a stalled project un-stalls it', () => {
    const p = project('p-gridfinity')!;
    expect(api.projectStalled(p)).toBe(true);
    api.clarify('i9', {
      kind: 'action',
      text: 'Print the first 3×3 Gridfinity base',
      project: { id: 'p-gridfinity' },
      route: { to: 'next', context: '@workshop', priority: 'C', time: 120, energy: 'normal' },
    });
    expect(api.projectStalled(p)).toBe(false);
  });
});

describe('clarify — validation leaves the store untouched', () => {
  const snapshot = () => JSON.stringify(store.getState());

  it.each([
    ['not in inbox', 'n1', { kind: 'trash' }],
    ['empty text', 'i1', { kind: 'action', text: '  ', route: { to: 'done' } }],
    ['unknown project', 'i1', { kind: 'later', text: 'x', project: { id: 'nope' } }],
    ['no one to wait for', 'i1', { kind: 'action', text: 'x', route: { to: 'waiting', who: '' } }],
    ['bad deadline', 'i1', { kind: 'action', text: 'x', route: { to: 'next', context: '@calls', priority: 'A', time: 15, energy: 'low', deadline: '03.10' } }],
    ['half a time slot', 'i1', { kind: 'action', text: 'x', route: { to: 'calendar', day: '2026-10-02', start: '10:00' } }],
  ] as [string, string, api.Decision][])('%s', (_name, id, decision) => {
    const before = snapshot();
    expect(() => api.clarify(id, decision)).toThrow(/^clarify:/);
    expect(snapshot()).toBe(before);
  });
});

describe('similar', () => {
  it('finds list entries sharing two significant words', () => {
    expect(api.similar('Fwd: Offer for the new workshop bench — decide by Oct 3')).toEqual([
      { kind: 'project', id: 'p-bench', title: 'Workshop bench decided and ordered' },
    ]);
  });

  it('finds items across lists but never inbox items', () => {
    expect(api.similar('Call the dentist about the invoice', 'i1').map((s) => s.id)).toEqual(['n7']);
  });

  it('ignores single-word overlaps', () => {
    expect(api.similar('Replace the kitchen tap cartridge', 'i4')).toEqual([]);
  });
});
