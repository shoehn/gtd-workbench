import { beforeEach, describe, expect, it } from 'vitest';
import { runSilently } from '../activity';
import * as api from '../api';
import type { ClientIdentity } from '../clients';
import { store } from '../store';
import { demoSeed as seed } from '../store/seed';
import type { State } from '../store/types';
import { listToolsFor, runTool } from './index';

beforeEach(() =>
  runSilently(() =>
    store.update((s) => {
      for (const key of Object.keys(s) as (keyof State)[]) delete s[key];
      Object.assign(s, structuredClone(seed));
    }),
  ),
);
const as = (preset: ClientIdentity['preset']) => (name: string, args: unknown) => runTool({ id: 'c1', name: 'Phone agent', preset }, name, args);

describe('collect and clarify tools', () => {
  const assistant = as('assistant');
  const capture = as('capture');

  it('the capture preset may capture and add tickler notes, nothing else', () => {
    expect(listToolsFor({ id: 'c1', name: 'x', preset: 'capture' }).map((t) => t.name).sort()).toEqual(['add_tickler', 'capture', 'whoami']);
    const r = capture('capture', { items: [{ text: 'Buy clay @errands' }, { text: 'Read the glaze article', url: 'https://example.com/glaze' }] }) as { status: 200; body: { result: { text: string }[]; activity: string[] } };
    expect(r.body.result.map((i) => i.text)).toEqual(['Buy clay', 'Read the glaze article']);
    expect(r.body.activity).toHaveLength(2);
    expect(capture('add_tickler', { day: '2026-09-29', text: 'Tiles fired' })).toMatchObject({ status: 200 });
    expect(capture('clarify', { item: 'i1', decision: { kind: 'trash' } })).toMatchObject({ status: 403 });
  });

  it('clarify with the four steps as one value; a new project is { new: title }', () => {
    const r = assistant('clarify', { item: 'i1', decision: { kind: 'action', text: 'Get three quotes', project: { new: 'New kiln installed' }, route: { to: 'next', context: '@calls', priority: 'B', time: 30, energy: 'normal' } } }) as { status: 200; body: { result: { projectId: string; projectCreated: boolean } } };
    expect(r.body.result.projectCreated).toBe(true);
    expect(api.getItem('i1')).toMatchObject({ status: 'next', text: 'Get three quotes' });
  });

  it('someday with a bucket files and sorts in one entry', () => {
    const bucket = api.listBuckets()[0];
    const r = assistant('clarify', { item: 'i2', decision: { kind: 'someday', bucket } }) as { body: { activity: string[] } };
    expect(api.getItem('i2')).toMatchObject({ status: 'someday', bucket });
    expect(r.body.activity).toHaveLength(1);
  });

  it('file: "waiting on Alice for the video" in one call', () => {
    const r = assistant('file', { text: 'Video from Alice', decision: { kind: 'action', text: 'Video from Alice', route: { to: 'waiting', who: 'Alice', follow_up: '2026-10-05' } } }) as { status: 200; body: { result: { itemId: string } } };
    expect(api.getItem(r.body.result.itemId)!.waiting).toMatchObject({ who: 'Alice', followUp: '2026-10-05' });
  });

  it('draft_clarification stores a draft by the client; null removes it', () => {
    assistant('draft_clarification', { item: 'i1', draft: { kind: 'action', text: 'Call the dentist', route: 'next', context: '@calls', priority: 'B', time: 15, energy: 'low' }, reason: 'a short call' });
    expect(api.getItem('i1')!.draft).toMatchObject({ by: 'Phone agent', reason: 'a short call' });
    assistant('draft_clarification', { item: 'i1', draft: null, reason: 'withdrawn' });
    expect(api.getItem('i1')!.draft).toBeUndefined();
  });

  it('refusals keep their reason; a parked project refuses a next action', () => {
    api.moveProjectToSomeday('p-table');
    expect(assistant('clarify', { item: 'i1', decision: { kind: 'action', text: 'x', project: { id: 'p-table' }, route: { to: 'next', context: '@calls', priority: 'B', time: 15, energy: 'low' } } })).toMatchObject({ status: 422, body: { error: expect.stringMatching(/on hold/) } });
  });

  it('tickler notes: edit and delete', () => {
    const t = (assistant('add_tickler', { day: '2026-09-29', text: 'Tiles fired' }) as { body: { result: { id: string } } }).body.result;
    expect(assistant('edit_tickler', { id: t.id, text: 'Tiles out of the kiln' })).toMatchObject({ status: 200 });
    expect(assistant('delete_tickler', { id: t.id })).toMatchObject({ status: 200 });
  });
});
