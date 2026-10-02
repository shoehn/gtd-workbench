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
