import { beforeEach, describe, expect, it } from 'vitest';
import { runSilently } from '../activity';
import * as api from '../api';
import { store } from '../store';
import { demoSeed as seed } from '../store/seed';
import type { State } from '../store/types';
import { listToolsFor, runTool, toolNamed } from './index';

beforeEach(() =>
  runSilently(() =>
    store.update((s) => {
      for (const key of Object.keys(s) as (keyof State)[]) delete s[key];
      Object.assign(s, structuredClone(seed));
    }),
  ),
);
const run = (name: string, args: unknown = {}) => runTool({ id: 'c1', name: 'Test', preset: 'read-only' }, name, args);

describe('read tools', () => {
  it('get_overview', () => {
    const r = run('get_overview');
    expect(r.status).toBe(200);
    expect((r.body as { result: { today: string } }).result.today).toBe('2026-09-26');
  });

  it('search finds items and projects by words, with links', () => {
    const r = run('search', { query: 'dining table' }) as { status: 200; body: { result: { items: { href?: string }[]; projects: { id: string }[] } } };
    expect(r.body.result.projects.map((p) => p.id)).toContain('p-table');
    expect(r.body.result.items.every((i) => i.href)).toBe(true);
  });

  it('get_item: the full item; an unknown id is a 422 with the reason', () => {
    expect(run('get_item', { id: 'n1' })).toMatchObject({ status: 200, body: { result: { id: 'n1', list: 'Next Actions' } } });
    expect(run('get_item', { id: 'nope' })).toEqual({ status: 422, body: { error: 'get_item: unknown item nope' } });
  });

  it('list_next_actions filters by context, time and energy', () => {
    const r = run('list_next_actions', { context: '@calls', max_minutes: 15, energy: 'low' }) as { status: 200; body: { result: { context: string; time: number; energy: string }[] } };
    expect(r.body.result.length).toBeGreaterThan(0);
    expect(r.body.result.every((i) => i.context === '@calls' && i.time <= 15 && i.energy === 'low')).toBe(true);
  });

  it('list_inbox, list_waiting(overdue_only), list_someday(bucket), list_reference(query)', () => {
    expect((run('list_inbox') as { body: { result: unknown[] } }).body.result.length).toBe(8);
    const overdue = (run('list_waiting', { overdue_only: true }) as { body: { result: { waiting: { followUp: string } }[] } }).body.result;
    expect(overdue.every((w) => w.waiting.followUp < '2026-09-26')).toBe(true);
    expect(run('list_someday', { bucket: 'Nope' })).toMatchObject({ status: 422 });
    expect((run('list_reference', { query: 'quote' }) as { body: { result: { text: string }[] } }).body.result.length).toBeGreaterThan(0);
  });

  it('list_projects(stalled_only) and get_project with its items by list', () => {
    expect(run('list_projects', { stalled_only: true })).toMatchObject({ status: 200 });
    const p = run('get_project', { id: 'p-table' }) as { body: { result: { project: { id: string }; next: unknown[]; later: unknown[] } } };
    expect(p.body.result.project.id).toBe('p-table');
    expect(p.body.result.next.length).toBe(2);
    expect(p.body.result.later.length).toBe(3);
  });

  it('get_calendar and find_free_time take a range; ranges over 62 days are refused', () => {
    expect(run('get_calendar', { from: '2026-09-21', to: '2026-09-27' })).toMatchObject({ status: 200 });
    expect(run('get_calendar', { from: '2026-09-01', to: '2026-12-31' })).toMatchObject({ status: 422 });
    expect(run('find_free_time', { from: '2026-09-28', to: '2026-09-28', min_minutes: 60 })).toMatchObject({ status: 200 });
    expect(run('find_free_time', { from: '28.09', to: '2026-09-28' })).toMatchObject({ status: 400 });
  });

  it('get_settings, get_activity, get_review_state, prepare_weekly_review', () => {
    expect((run('get_settings') as { body: { result: { contexts: string[] } } }).body.result.contexts).toContain('@calls');
    expect(run('get_activity', { limit: 5 })).toMatchObject({ status: 200 });
    expect(run('get_review_state')).toMatchObject({ status: 200, body: { result: { open: !!api.openRun() } } });
    expect(run('prepare_weekly_review')).toMatchObject({ status: 200 });
  });

  it('a read-only client sees every read tool and none that write', () => {
    const names = listToolsFor({ id: 'c1', name: 'Test', preset: 'read-only' }).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['get_overview', 'search', 'get_activity', 'whoami']));
    expect(names.every((n) => toolNamed(n)!.capability === 'read' || toolNamed(n)!.capability === 'any')).toBe(true);
  });
});
