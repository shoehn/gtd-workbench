import { beforeEach, describe, expect, it } from 'vitest';
import { runSilently } from '../activity';
import * as api from '../api';
import { store } from '../store';
import { demoSeed as seed } from '../store/seed';
import type { State } from '../store/types';
import { runTool } from './index';

beforeEach(() =>
  runSilently(() =>
    store.update((s) => {
      for (const key of Object.keys(s) as (keyof State)[]) delete s[key];
      Object.assign(s, structuredClone(seed));
    }),
  ),
);
const run = (name: string, args: unknown) => runTool({ id: 'c1', name: 'Phone agent', preset: 'assistant' }, name, args);

describe('do and waiting tools', () => {
  it('complete refuses unknown ids before changing anything', () => {
    expect(run('complete', { ids: ['n2', 'nope'] })).toMatchObject({ status: 422, body: { error: 'complete: item nope cannot be completed' } });
    expect(api.getItem('n2')!.status).toBe('next');
    expect(run('complete', { ids: ['n2', 'n3'] })).toMatchObject({ status: 200 });
    expect(['n2', 'n3'].map((i) => api.getItem(i)!.status)).toEqual(['done', 'done']);
  });

  it('set_focus sets, never toggles', () => {
    run('set_focus', { ids: ['n2'], on: true });
    run('set_focus', { ids: ['n2'], on: true });
    expect(api.isFocused(api.getItem('n2')!)).toBe(true);
    run('set_focus', { ids: ['n2'], on: false });
    expect(api.isFocused(api.getItem('n2')!)).toBe(false);
  });

  it('edit_next_action: fields, deadline null removes, project null = single action', () => {
    run('edit_next_action', { id: 'n2', priority: 'A', time: 60, deadline: '2026-10-09' });
    expect(api.getItem('n2')).toMatchObject({ priority: 'A', time: 60, deadline: '2026-10-09' });
    run('edit_next_action', { id: 'n2', deadline: null, project: null });
    expect(api.getItem('n2')!.deadline).toBeUndefined();
    expect(api.getItem('n2')!.projectId).toBeUndefined();
  });

  it('time_block and clear_time_block', () => {
    run('time_block', { id: 'n2', start: '2026-09-28T09:00', end: '2026-09-28T10:30' });
    expect(api.getItem('n2')!.timeSlot).toEqual({ start: '2026-09-28T09:00', end: '2026-09-28T10:30' });
    run('clear_time_block', { id: 'n2' });
    expect(api.getItem('n2')!.timeSlot).toBeUndefined();
  });

  it('trash through the API: the purge is still the app’s', () => {
    runSilently(() =>
      store.update((s) => {
        const i = s.items.find((x) => x.id === 'i2')!;
        i.status = 'trash';
        i.trashedAt = '2026-07-01T10:00:00.000Z';
      }),
    );
    const r = run('trash', { ids: ['i1'] }) as { body: { activity: string[] } };
    const entries = r.body.activity.map((a) => store.getState().activity.find((e) => e.id === a)!);
    expect(entries.map((e) => e.actor.kind)).toEqual(['client', 'system']);
  });

  it('waiting: follow_up, edit_waiting, received', () => {
    const w = api.listWaiting()[0].id;
    expect(run('edit_waiting', { id: w, follow_up: '2026-10-09' })).toMatchObject({ status: 200 });
    expect(api.getItem(w)!.waiting!.followUp).toBe('2026-10-09');
    expect((run('follow_up', { id: w }) as { body: { result: { list: string } } }).body.result.list).toBe('Next Actions');
    expect(run('received', { id: w })).toMatchObject({ status: 200 });
    expect(api.getItem(w)!.status).toBe('done');
  });
});

describe('project, someday and reference tools', () => {
  const fields = { context: '@home', priority: 'B', time: 30, energy: 'low' } as const;

  it('add_action, add_step, promote, demote', () => {
    const a = (run('add_action', { project: 'p-table', text: 'Measure the alcove', ...fields }) as { body: { result: { id: string; list: string } } }).body.result;
    expect(a.list).toBe('Next Actions');
    const s = (run('add_step', { project: 'p-table', text: 'Book the van' }) as { body: { result: { id: string } } }).body.result;
    expect(run('promote', { id: s.id, ...fields })).toMatchObject({ status: 200 });
    expect(run('demote', { id: s.id })).toMatchObject({ status: 200 });
    expect(api.getItem(s.id)!.status).toBe('later');
  });

  it('update_project and move_project (someday, active, completed with its refusal)', () => {
    run('update_project', { id: 'p-table', deadline: '2026-10-20', successful_when: 'table delivered' });
    expect(api.getProject('p-table')).toMatchObject({ deadline: '2026-10-20', successfulWhen: 'table delivered' });
    run('move_project', { id: 'p-table', to: 'someday' });
    expect(api.getProject('p-table')!.status).toBe('someday');
    run('move_project', { id: 'p-table', to: 'active' });
    expect(run('move_project', { id: 'p-table', to: 'completed' })).toMatchObject({ status: 422, body: { error: expect.stringMatching(/open/) } });
  });

  it('someday: set_bucket, activate (back to the inbox), drop', () => {
    const [g] = api.listSomeday();
    const item = g.items[0].id;
    const other = api.listBuckets().find((b) => b !== g.bucket)!;
    run('set_bucket', { id: item, bucket: other });
    expect(api.getItem(item)!.bucket).toBe(other);
    run('activate', { id: item });
    expect(api.getItem(item)!.status).toBe('inbox');
    const next = api.listSomeday()[0].items[0].id;
    run('drop', { id: next });
    expect(api.getItem(next)!.status).toBe('trash');
  });

  it('reference: add_reference to a project, edit_reference', () => {
    const r = (run('add_reference', { text: 'Oak samples', kind: 'link', url: 'https://example.com/oak', project: 'p-table' }) as { body: { result: { id: string; list: string } } }).body.result;
    expect(r.list).toBe('Reference');
    run('edit_reference', { id: r.id, text: 'Oak and ash samples', project: null });
    expect(api.getItem(r.id)).toMatchObject({ text: 'Oak and ash samples' });
    expect(api.getItem(r.id)!.projectId).toBeUndefined();
  });
});

describe('nothing is dropped silently (review)', () => {
  it('edit_reference with url but no kind is refused, not ignored', () => {
    const r = api.listReference()[0];
    const res = run('edit_reference', { id: r.id, url: 'https://example.com/new' });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/kind/);
  });

  it('a reference decision with url or body but no reference_kind is refused', () => {
    const res = run('clarify', { item: 'i1', decision: { kind: 'reference', url: 'https://example.com/x' } });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/reference_kind/);
  });
});
