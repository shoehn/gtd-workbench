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
