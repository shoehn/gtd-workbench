import { beforeEach, describe, expect, it } from 'vitest';
import * as api from './api';
import { parseProjectFilter, projectsHref } from './project-filter';
import { demoSeed as seed } from './store/seed';
import { store } from './store';
import type { State } from './store/types';

const item = (id: string) => api.getItem(id)!;
const project = (id: string) => api.getProject(id)!;
const fields: api.NextFields = { context: '@home', priority: 'A', time: 30, energy: 'low' };

beforeEach(() => {
  store.update((s) => Object.assign(s, structuredClone(seed) as State));
});

describe('seed: p-table as drawn', () => {
  it('2 next actions, 3 later steps, 1 done, 1 waiting-for', () => {
    const items = api.projectItems('p-table');
    const of = (status: string) => items.filter((i) => i.status === status).map((i) => i.id);
    expect(of('next')).toEqual(['n1', 'n8']);
    expect(of('later')).toEqual(['l1', 'l2', 'l3']);
    expect(of('done')).toEqual(['d1']);
    expect(of('waiting')).toEqual(['w2']);
    expect(api.isFocused(item('n1'))).toBe(true);
    expect(project('p-table')).toMatchObject({ createdFrom: 'inbox', area: 'Home & garden', goal: 'Kitchen ready for guests by winter' });
  });

  it('work / home come from the area map', () => {
    expect(api.projectKind(project('p-table'))).toBe('home');
    expect(api.projectKind(project('p-funding'))).toBe('work');
  });
});

describe('demote and promote', () => {
  it('DoD: ↓ later on B4, then A1, stalls p-table everywhere', () => {
    api.demote('n8');
    expect(api.projectStalled(project('p-table'))).toBe(false);
    api.demote('n1');
    expect(api.projectStalled(project('p-table'))).toBe(true);
    expect(api.health().stalled).toBe(2);
    expect(item('n1')).toMatchObject({ status: 'later' });
    for (const key of ['context', 'priority', 'priorityNo', 'time', 'energy', 'focusOn'] as const) {
      expect(item('n1')[key]).toBeUndefined();
    }
    // A renumbers without the demoted A1.
    expect(item('n2').priorityNo).toBe(1);
  });

  it('DoD: ↑ next asks for the fields and puts the step on Next Actions', () => {
    api.promote('l1', fields);
    expect(item('l1')).toMatchObject({ status: 'next', context: '@home', priority: 'A', priorityNo: 4, time: 30, energy: 'low' });
    expect(api.listNext().map((i) => i.id)).toContain('l1');
  });

  it('refuses the wrong status or bad fields', () => {
    expect(() => api.demote('l1')).toThrow(/^demote:/);
    expect(() => api.promote('n1', fields)).toThrow(/^promote:/);
    expect(() => api.promote('l1', { ...fields, context: '@moon' })).toThrow(/^promote:/);
  });
});

describe('add action / step', () => {
  it('adds a numbered next action and a later step to the project', () => {
    const a = api.addAction('p-shelves', '  Print three baseplates ', { ...fields, priority: 'B' });
    expect(item(a.id)).toMatchObject({ status: 'next', projectId: 'p-shelves', text: 'Print three baseplates', priority: 'B', priorityNo: 6 });
    expect(api.projectStalled(project('p-shelves'))).toBe(false);
    const s = api.addStep('p-shelves', 'Label the drawers');
    expect(item(s.id)).toMatchObject({ status: 'later', projectId: 'p-shelves' });
    expect(() => api.addStep('p-shelves', ' ')).toThrow(/^addStep:/);
  });
});

describe('complete / someday / update', () => {
  it('complete is refused while next actions or later steps are open', () => {
    expect(api.openInProject('p-table')).toBe(5);
    expect(() => api.completeProject('p-table')).toThrow('completeProject: 5 open — finish, demote or drop them first');
    api.complete('n10');
    api.completeProject('p-blog');
    expect(project('p-blog').status).toBe('completed');
  });

  it('→ someday demotes the next actions; → active brings it back stalled', () => {
    api.moveProjectToSomeday('p-table');
    expect(project('p-table').status).toBe('someday');
    expect(api.listNext().some((i) => i.projectId === 'p-table')).toBe(false);
    expect(item('n1').status).toBe('later');
    api.activateProject('p-table');
    expect(api.projectStalled(project('p-table'))).toBe(true);
  });

  it('updates fields, keeps titles unique, clears empty optionals', () => {
    api.updateProject('p-table', { goal: '  ', notes: 'n', title: 'Table ordered' });
    expect(project('p-table')).toMatchObject({ title: 'Table ordered', notes: 'n' });
    expect(project('p-table').goal).toBeUndefined();
    expect(() => api.updateProject('p-table', { title: 'glaze test series fired' })).toThrow(/already exists/);
    expect(() => api.updateProject('p-table', { title: ' ' })).toThrow(/^updateProject:/);
  });
});

describe('filter param', () => {
  it('parses and writes hrefs', () => {
    expect(parseProjectFilter('stalled')).toBe('stalled');
    expect(parseProjectFilter('someday')).toBe('someday');
    expect(parseProjectFilter('nope')).toBe('active');
    expect(projectsHref('active')).toBe('/projects');
    expect(projectsHref('stalled', 'p-table')).toBe('/projects?filter=stalled&p=p-table');
  });
});

describe('a parked project takes no next action (review P2 #7)', () => {
  beforeEach(() => api.moveProjectToSomeday('p-table'));
  const route = { to: 'next', context: '@home', priority: 'B', time: 30, energy: 'low' } as const;

  it('promote, + action and moving a next action in are refused until it is activated', () => {
    expect(() => api.promote('l1', fields)).toThrow(/on hold.*activate it first/);
    expect(() => api.addAction('p-table', 'Measure the alcove', fields)).toThrow(/on hold/);
    expect(() => api.editNext('n2', { project: { id: 'p-table' } })).toThrow(/on hold/);
    expect(item('l1').status).toBe('later');
    api.activateProject('p-table');
    api.promote('l1', fields);
    expect(item('l1').status).toBe('next');
  });

  it('Clarify: a next action into it is refused; a later step is fine', () => {
    expect(() => api.clarify('i1', { kind: 'action', text: 'Ask about oak', project: { id: 'p-table' }, route })).toThrow(/on hold/);
    expect(item('i1').status).toBe('inbox');
    api.clarify('i1', { kind: 'later', text: 'Ask about oak', project: { id: 'p-table' } });
    expect(item('i1')).toMatchObject({ status: 'later', projectId: 'p-table' });
  });

  it('a completed project is refused the same way', () => {
    api.activateProject('p-table');
    store.update((s) => {
      s.projects.find((p) => p.id === 'p-table')!.status = 'completed';
    });
    expect(() => api.addAction('p-table', 'x', fields)).toThrow(/completed — activate it first/);
  });
});
