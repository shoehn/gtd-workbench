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

describe('review and trust tools', () => {
  it('walk a review: start, tick, notes, finish', () => {
    expect(run('start_review', {})).toMatchObject({ status: 200 });
    const before = api.openRun()!.notes; // the demo's review in progress already has notes
    const first = api.reviewSteps(api.openRun())[0].id;
    run('tick_step', { step: first, on: true });
    expect(run('get_review_state', {})).toMatchObject({ body: { result: { open: true } } });
    run('set_review_notes', { step: first, text: 'two loose papers left' });
    run('set_review_notes', { text: 'good week' });
    const added = `${api.reviewSteps(api.openRun())[0].text}: two loose papers left\ngood week`;
    expect(api.openRun()!.notes).toBe(before ? `${before}\n${added}` : added);
    run('tick_step', { step: first, on: false });
    expect(run('finish_review', {})).toMatchObject({ status: 200 });
    expect(api.openRun()).toBeUndefined();
  });

  it('undo through the API: refused with the reason once something changed since', () => {
    const r = run('capture', { items: [{ text: 'Buy clay' }] }) as { body: { activity: string[]; result: { id: string }[] } };
    const entry = r.body.activity[0];
    expect(run('undo', { entry })).toMatchObject({ status: 200 });
    expect(api.getItem(r.body.result[0].id)).toBeUndefined();
    expect(run('undo', { entry })).toMatchObject({ status: 422, body: { error: 'undo: changed since by Phone agent' } });
  });
});
