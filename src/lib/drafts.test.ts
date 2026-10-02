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
const PHONE = { kind: 'client', id: 'c1', name: 'Phone agent' } as const;
const action = { kind: 'action', text: 'Call the dentist about the corrected invoice', route: 'next', context: '@calls', priority: 'B', time: 15, energy: 'low', reason: 'a call, two minutes once you have the number' } as const;

describe('drafts', () => {
  it('a client drafts an inbox item: stored with who and when, logged as a draft', () => {
    runAs(PHONE, () => api.setDraft('i1', action));
    expect(api.getItem('i1')!.draft).toMatchObject({ ...action, by: 'Phone agent', at: expect.any(String) });
    expect(api.listActivity({ limit: 1 })[0]).toMatchObject({ actorLabel: 'Phone agent', summary: 'Drafted “Call the dentist about the invoice”' });
  });

  it('a newer draft replaces the older; null removes it', () => {
    api.setDraft('i1', action);
    api.setDraft('i1', { kind: 'trash', reason: 'already paid' });
    expect(api.getItem('i1')!.draft).toMatchObject({ kind: 'trash', reason: 'already paid' });
    expect(api.getItem('i1')!.draft).not.toHaveProperty('context');
    api.setDraft('i1', null);
    expect(api.getItem('i1')!.draft).toBeUndefined();
    expect(api.listActivity({ limit: 1 })[0].summary).toBe('Removed the draft of “Call the dentist about the invoice”');
  });

  it('never applied on its own; gone when the item is filed or trashed', () => {
    api.setDraft('i1', action);
    expect(api.getItem('i1')!.status).toBe('inbox');
    api.clarify('i1', { kind: 'someday' });
    expect(api.getItem('i1')!.draft).toBeUndefined();
    api.setDraft('i2', action);
    api.trash(['i2']);
    expect(api.getItem('i2')!.draft).toBeUndefined();
  });

  it('only inbox items; checked like a decision', () => {
    expect(() => api.setDraft('n1', action)).toThrow('draft: item n1 is not in the inbox');
    expect(() => api.setDraft('i1', { ...action, context: '@nowhere' })).toThrow('draft: unknown context @nowhere');
    expect(() => api.setDraft('i1', { ...action, reason: '' })).toThrow('draft: a draft needs a reason');
    expect(() => api.setDraft('i1', { kind: 'project', text: 'Get quotes', reason: 'big' })).toThrow('draft: a project draft needs project.newTitle');
    expect(() => api.setDraft('i1', { ...action, project: { id: 'p-nope' } })).toThrow('draft: unknown project p-nope');
    expect(() => api.setDraft('i1', { ...action, deadline: '09.10' })).toThrow('draft: deadline is not an ISO date');
  });

  it("a draft can't name a parked project as next action", () => {
    api.moveProjectToSomeday('p-table');
    expect(() => api.setDraft('i1', { ...action, project: { id: 'p-table' }, next: true })).toThrow(/draft: project .* is on hold/);
    api.setDraft('i1', { ...action, project: { id: 'p-table' }, next: false });
    expect(api.getItem('i1')!.draft!.next).toBe(false);
  });

  it('is kept on the item in both stores', () => {
    api.setDraft('i1', action);
    expect(store.getState().items.find((i) => i.id === 'i1')!.draft!.reason).toBe(action.reason);
  });
});

describe('drafts go with every way of filing (review)', () => {
  it('filed as a next action, a later step or a waiting-for, the item keeps no draft', () => {
    api.setDraft('i1', action);
    api.clarify('i1', { kind: 'action', text: 'Call the dentist', route: { to: 'next', context: '@calls', priority: 'B', time: 15, energy: 'low' } });
    expect(api.getItem('i1')!.draft).toBeUndefined();
    api.setDraft('i2', action);
    api.clarify('i2', { kind: 'later', text: 'Run the retro', project: { id: 'p-table' } });
    expect(api.getItem('i2')!.draft).toBeUndefined();
    api.setDraft('i4', action);
    api.clarify('i4', { kind: 'action', text: 'Ask the plumber', route: { to: 'waiting', who: 'Plumber' } });
    expect(api.getItem('i4')!.draft).toBeUndefined();
  });
});
