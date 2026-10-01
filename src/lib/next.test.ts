import { beforeEach, describe, expect, it } from 'vitest';
import * as api from './api';
import { filterQuery, groupByContext, matches, parseFilter } from './next-filter';
import { demoSeed as seed } from './store/seed';
import { store } from './store';
import type { State } from './store/types';

const item = (id: string) => api.getItem(id)!;
const label = (id: string) => `${item(id).priority}${item(id).priorityNo ?? ''}`;
const contexts = seed.contexts;

beforeEach(() => {
  store.update((s) => Object.assign(s, structuredClone(seed) as State));
});

describe('filters in the URL', () => {
  it('reads the mockup state and writes it back readable', () => {
    const f = parseFilter({ ctx: '@computer,@calls', time: '60' }, contexts);
    expect(f).toEqual({ contexts: ['@computer', '@calls'], time: 60 });
    expect(filterQuery(f)).toBe('?ctx=@computer,@calls&time=60');
  });

  it('drops unknown values instead of failing', () => {
    expect(parseFilter({ ctx: '@nowhere,@calls', time: '45', energy: 'max' }, contexts)).toEqual({ contexts: ['@calls'] });
    expect(filterQuery({ contexts: [] })).toBe('');
  });

  it('mockup filter: two groups, 6 + 3 rows, 1 hidden', () => {
    const f = parseFilter({ ctx: '@computer,@calls', time: '60' }, contexts);
    const shown = api.listNext().filter((i) => matches(i, f));
    const groups = groupByContext(shown, contexts);
    expect(groups.map((g) => [g.context, g.items.length])).toEqual([['@computer', 6], ['@calls', 3]]);
    expect(groups[0].items.map((i) => label(i.id))).toEqual(['A1', 'A2', 'B1', 'B2', 'B3', 'C']);
    expect(api.listNext().length - shown.length).toBe(1);
  });

  it('time filter means time ≤ bucket', () => {
    const f = parseFilter({ time: '15' }, contexts);
    expect(api.listNext().filter((i) => matches(i, f)).every((i) => i.time! <= 15)).toBe(true);
  });
});

describe('focus', () => {
  it('seed: A1 and A2 starred; Focus card 3 picked · 1 done', () => {
    expect(api.listNext().filter((i) => api.isFocused(i)).map((i) => label(i.id))).toEqual(['A1', 'A2']);
    const focus = api.focusToday();
    expect(focus.map((i) => i.id)).toEqual(['d1', 'n1', 'n2']);
    expect(focus.filter((i) => i.status === 'done')).toHaveLength(1);
  });

  it('toggles for today, and a star from yesterday counts for nothing', () => {
    expect(api.toggleFocus('n3')).toBe(true);
    expect(item('n3').focusOn).toBe('2026-09-26');
    expect(api.toggleFocus('n3')).toBe(false);
    expect(item('n3').focusOn).toBeUndefined();

    store.update((s) => {
      s.items.find((i) => i.id === 'n3')!.focusOn = '2026-09-25';
    });
    expect(api.isFocused(item('n3'))).toBe(false);
    expect(api.focusToday().map((i) => i.id)).not.toContain('n3');
    expect(api.toggleFocus('n3')).toBe(true); // re-starring an old star sets it for today
  });

  it('only next actions can be starred', () => {
    expect(() => api.toggleFocus('l1')).toThrow(/^focus:/);
  });
});

describe('complete and renumber', () => {
  it('DoD: A1 done keeps the table project green, B4 done stalls it', () => {
    const table = store.getState().projects.find((p) => p.id === 'p-table')!;
    expect(api.health()).toEqual({ stalled: 1, waitingOverdue: 1, oldActions: 1 });

    api.complete('n1');
    expect(item('n1')).toMatchObject({ status: 'done' });
    expect(api.projectStalled(table)).toBe(false);
    expect(api.health().stalled).toBe(1);
    // A renumbers across the whole list; B is untouched.
    expect([label('n2'), label('n7'), label('n8')]).toEqual(['A1', 'A2', 'B4']);
    // Still starred for today, now counted as done.
    expect(api.focusToday().filter((i) => i.status === 'done').map((i) => i.id)).toEqual(['d1', 'n1']);

    api.complete('n8');
    expect(api.projectStalled(table)).toBe(true);
    expect(api.health().stalled).toBe(2);
  });

  it('undo puts the action back under its old number', () => {
    const done = api.complete('n1');
    expect(done).toEqual({ id: 'n1', status: 'next', priorityNo: 1 });
    api.uncomplete(done);
    expect(item('n1')).toMatchObject({ status: 'next', priorityNo: 1 });
    expect(item('n1').doneAt).toBeUndefined();
    expect([label('n2'), label('n7')]).toEqual(['A2', 'A3']);
  });

  it('reopen from the Focus card: next again, starred, numbered last', () => {
    api.complete('n1');
    api.reopen('n1');
    expect(item('n1')).toMatchObject({ status: 'next', focusOn: '2026-09-26' });
    expect(item('n1').doneAt).toBeUndefined();
    expect([label('n2'), label('n7'), label('n1')]).toEqual(['A1', 'A2', 'A3']);
    api.reopen('d1'); // a seed item done before this session
    expect(item('d1').status).toBe('next');
    expect(() => api.reopen('n2')).toThrow(/^reopen:/);
  });

  it('renumber closes gaps and clears numbers on C', () => {
    store.update((s) => {
      s.items.find((i) => i.id === 'n2')!.priorityNo = 7;
      s.items.find((i) => i.id === 'n6')!.priorityNo = 4;
    });
    api.renumber();
    expect([label('n1'), label('n7'), label('n2'), label('n6')]).toEqual(['A1', 'A2', 'A3', 'C']);
  });

  it('refuses what is not a next or calendar action', () => {
    expect(() => api.complete('w1')).toThrow(/^complete:/);
  });
});

describe('inline edit', () => {
  it('changes text and context', () => {
    api.editNext('n6', { text: '  Tidy the shared drive  ', context: '@office' });
    expect(item('n6')).toMatchObject({ text: 'Tidy the shared drive', context: '@office' });
  });

  it('moves between projects, to none, and into a new one', () => {
    api.editNext('n8', { project: null });
    expect(item('n8').projectId).toBeUndefined();
    api.editNext('n8', { project: { id: 'p-shelves' } });
    expect(item('n8').projectId).toBe('p-shelves');
    const { projectId } = api.editNext('n6', { project: { newTitle: 'Shared drive tidy' } });
    expect(store.getState().projects.find((p) => p.id === projectId)?.title).toBe('Shared drive tidy');
  });

  it('refuses bad input without changing anything', () => {
    expect(() => api.editNext('n6', { text: ' ' })).toThrow(/^edit:/);
    expect(() => api.editNext('n6', { context: '@moon' })).toThrow(/^edit:/);
    expect(() => api.editNext('n6', { project: { newTitle: 'glaze test series fired' } })).toThrow(/already exists/);
    expect(() => api.editNext('l1', { text: 'x' })).toThrow(/^edit:/);
    expect(item('n6').text).toBe('Clean up the shared drive folder for last quarter');
  });
});

describe('today and health', () => {
  it('hard landscape: appointments by time, then the all-day deadline', () => {
    expect(api.todayLandscape().map((e) => [e.time ?? 'all day', e.text, e.deadline])).toEqual([
      ['10:00', 'Dentist', false],
      ['14:00', 'Call with team lead — funding report', false],
      ['all day', 'Submit fair application', true],
    ]);
  });

  it('includes tickler info and deadlines owned by lists; an action due with its project shows once', () => {
    const day = '2026-10-03';
    expect(api.todayLandscape(day).map((e) => [e.kind, e.text])).toEqual([
      ['deadline', 'Dining table decided and ordered'],
    ]);
    expect(api.todayLandscape('2026-09-27').map((e) => e.kind)).toEqual(['timeblock', 'info']);
  });
});

describe('inline edit of the step-4 fields (review P2 #9, SPEC §4)', () => {
  it('priority: re-numbered last in the new priority; the old one closes the gap', () => {
    const lastA = Math.max(...store.getState().items.filter((i) => i.status === 'next' && i.priority === 'A').map((i) => i.priorityNo ?? 0));
    api.editNext('n3', { priority: 'A' });
    expect(api.getItem('n3')).toMatchObject({ priority: 'A', priorityNo: lastA + 1 });
    const bs = store.getState().items.filter((i) => i.status === 'next' && i.priority === 'B').map((i) => i.priorityNo).sort();
    expect(bs).toEqual(bs.map((_, n) => n + 1));
    api.editNext('n3', { priority: 'C' });
    expect(api.getItem('n3')!.priorityNo).toBeUndefined();
  });

  it('time, energy and deadline; null clears the deadline', () => {
    api.editNext('n3', { time: 120, energy: 'focus', deadline: '2026-10-09' });
    expect(api.getItem('n3')).toMatchObject({ time: 120, energy: 'focus', deadline: '2026-10-09' });
    api.editNext('n3', { deadline: null });
    expect(api.getItem('n3')!.deadline).toBeUndefined();
  });

  it('refuses values outside the lists', () => {
    expect(() => api.editNext('n3', { priority: 'D' as never })).toThrow(/priority/);
    expect(() => api.editNext('n3', { time: 45 as never })).toThrow(/time/);
    expect(() => api.editNext('n3', { energy: 'high' as never })).toThrow(/energy/);
    expect(() => api.editNext('n3', { deadline: '09.10' })).toThrow(/deadline/);
  });
});
