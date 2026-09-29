import { beforeEach, describe, expect, it } from 'vitest';
import * as api from './api';
import seed from './store/seed.json';
import { store } from './store/memory';
import type { State } from './store/types';

const item = (id: string) => api.getItem(id)!;
const project = (id: string) => api.getProject(id)!;

beforeEach(() => {
  store.update((s) => Object.assign(s, structuredClone(seed) as State));
});

describe('waiting for', () => {
  it('seed: 7 rows by follow-up, undated last; only w1 overdue', () => {
    expect(api.listWaiting().map((i) => i.id)).toEqual(['w1', 'w2', 'w3', 'w4', 'w6', 'w5', 'w7']);
    expect(api.listWaiting().filter((i) => api.isOverdue(i)).map((i) => i.id)).toEqual(['w1']);
    expect(api.health().waitingOverdue).toBe(1);
  });

  it('DoD: f on w1 creates the @calls action and moves the follow-up a week', () => {
    const a = api.followUp('w1');
    expect(item(a.id)).toMatchObject({
      status: 'next',
      text: 'Follow up with Marc: Annex decision for the grant report',
      context: '@calls',
      priority: 'B',
      time: 15,
      energy: 'low',
      projectId: 'p-grant',
    });
    expect(api.listNext().map((i) => i.id)).toContain(a.id);
    expect(item('w1').waiting!.followUp).toBe('2026-10-03');
    expect(api.isOverdue(item('w1'))).toBe(false);
  });

  it('desks, support and committees get @computer; no project stays single', () => {
    expect(item(api.followUp('w3').id).context).toBe('@computer');
    const a = item(api.followUp('w7').id);
    expect(a.context).toBe('@calls');
    expect(a.projectId).toBeUndefined();
    expect(item('w7').waiting!.followUp).toBe('2026-10-03');
  });

  it('received closes it, asks for a next action only when the project stalls, and undoes', () => {
    expect(api.received('w2')).toEqual({ id: 'w2', status: 'waiting' }); // bench still has n1, n8
    expect(item('w2').status).toBe('done');

    api.demote('n3');
    expect(api.received('w1')).toEqual({ id: 'w1', status: 'waiting', askNextFor: 'p-grant' });

    api.uncomplete({ id: 'w1', status: 'waiting' });
    expect(item('w1')).toMatchObject({ status: 'waiting' });
    expect(item('w1').doneAt).toBeUndefined();
  });
});

describe('someday / maybe', () => {
  it('groups by bucket in store order', () => {
    expect(api.listSomeday().map((g) => [g.bucket, g.items.length])).toEqual([
      ['Workshop & electronics', 3],
      ['Teaching & research', 2],
      ['Home & travel', 2],
    ]);
  });

  it('DoD: activate puts s1 into the inbox with its text for Clarify', () => {
    api.activate('s1');
    expect(item('s1')).toMatchObject({ status: 'inbox', text: 'Learn to solder SMD by hand' });
    expect(api.listInboxQueue().map((i) => i.id)).toContain('s1');
  });

  it('DoD: drop + undo restores the row', () => {
    const moved = api.drop('s2');
    expect(item('s2').status).toBe('trash');
    api.untrash(moved);
    expect(item('s2').status).toBe('someday');
  });

  it('moves between buckets, refuses unknown ones', () => {
    api.setBucket('s1', 'Home & travel');
    expect(item('s1').bucket).toBe('Home & travel');
    api.setBucket('s1', '');
    expect(item('s1').bucket).toBeUndefined();
    expect(api.listSomeday().at(-1)?.bucket).toBe('');
    expect(() => api.setBucket('s1', 'Moon')).toThrow(/^setBucket:/);
  });
});

describe('projects on hold', () => {
  it('drop marks it completed + dropped, undo brings it back on hold', () => {
    api.moveProjectToSomeday('p-blog');
    api.dropProject('p-blog');
    expect(project('p-blog')).toMatchObject({ status: 'completed', dropped: true });
    expect(api.projectItems('p-blog').find((i) => i.id === 'n10')?.status).toBe('later');
    api.undropProject('p-blog');
    expect(project('p-blog').status).toBe('someday');
    expect(project('p-blog').dropped).toBeUndefined();
  });

  it('only a project on hold can be dropped', () => {
    expect(() => api.dropProject('p-bench')).toThrow(/^dropProject:/);
  });
});
